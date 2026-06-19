#!/usr/bin/env node
'use strict';
/*
 * Migração Typebot — instância 2 (database `postgres2`) -> instância 1 (`postgres`).
 *
 * DRY-RUN POR PADRÃO: lê os dois bancos, monta o plano de merge e imprime
 * EXATAMENTE o que faria — SEM ESCREVER NADA. Full read-only.
 *
 * Execução real só com `--apply` (e ainda assim dentro de transação por workspace).
 *
 * Segurança (defesa em profundidade):
 *   1. Toda conexão abre com `SET default_transaction_read_only = on` no dry-run.
 *   2. No dry-run a fase `apply` NÃO é chamada — o código de escrita é inalcançável.
 *   3. `--apply` é a única forma de habilitar escrita. Sem DDL, sem temp objects.
 *
 * Uso (via kubectl exec num pod typebot-builder da inst1):
 *   POD=$(kubectl get pods -n typebot -o name | grep builder | head -1)
 *   kubectl exec -i -n typebot ${POD#pod/} -c typebot-builder -- \
 *     sh -lc 'BASE_URL="$DATABASE_URL" node -' < merge.js
 *
 * O DATABASE_URL do pod aponta para o destino (`postgres`). A origem (`postgres2`)
 * é derivada trocando o database no mesmo host (mesma credencial).
 */

const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1]; // ex: --only=getrak

// ---- Workspaces a migrar e override de destino (quando canon é ambíguo) ----
// dstOverride: id do workspace destino na inst1 quando há >1 candidato por canon.
// shopee tem 2 candidatos (Shopee=conversa, shopee=tools) -> forçamos o de conversa.
const TARGETS = [
  { src: 'shopee',          dstOverride: 'cm6pjhh1d00ixmc8qv2c69w9b' }, // Shopee (maiúsculo, conversa)
  { src: 'getrak',          dstOverride: null },
  { src: 'getrakteste',     dstOverride: null },
  { src: 'claudia_project', dstOverride: null },
];

// canon(name) = lower + trim + colapsa espaços/underscores. Identidade de workspace.
const canon = (n) => (n || '').toLowerCase().trim().replace(/[\s_]+/g, ' ');

// ---------------------------------------------------------------------------
// Conexões (read-only no dry-run)
// ---------------------------------------------------------------------------
function deriveUrls(base) {
  if (!base) throw new Error('BASE_URL/DATABASE_URL não definido no ambiente do pod');
  const dstUrl = base;                                   // destino = postgres (do pod inst1)
  if (new URL(dstUrl).pathname.replace('/', '') !== 'postgres')
    throw new Error(`Esperava destino database=postgres, veio ${new URL(dstUrl).pathname}`);
  const u = new URL(base);
  u.pathname = '/postgres2';                             // origem = postgres2 (mesmo host/credencial)
  return { srcUrl: u.toString(), dstUrl };
}

async function connect(url, { readOnly }) {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  if (readOnly) await c.query('SET default_transaction_read_only = on');
  await c.query("SET statement_timeout = '120s'");
  return c;
}

const loadWorkspaces = (c) => c.query(`SELECT id, name FROM "Workspace"`).then(r => r.rows);

// tráfego (Result) recente de um bot — critério primário do desempate de conflito
async function traffic(client, typebotId) {
  return parseInt((await client.query(
    `SELECT count(*) n FROM "Result" WHERE "typebotId"=$1 AND "createdAt" > now() - interval '30 days'`,
    [typebotId])).rows[0].n);
}

// ---------------------------------------------------------------------------
// PLAN (read-only) — produz a estrutura de ações sem executar nada
// ---------------------------------------------------------------------------
async function planWorkspace(src, dst, target, srcWss, dstWss) {
  const k = canon(target.src);

  // 1) workspace de origem (por canon)
  const srcWs = srcWss.find(w => canon(w.name) === k);
  if (!srcWs) throw new Error(`workspace origem '${target.src}' não encontrado em postgres2`);

  // 2) resolução do destino
  let dest;
  if (target.dstOverride) {
    const w = dstWss.find(w => w.id === target.dstOverride);
    if (!w) throw new Error(`dstOverride ${target.dstOverride} não existe na inst1`);
    dest = { mode: 'merge', id: w.id, name: w.name, note: 'override (canon ambíguo)' };
  } else {
    const cands = dstWss.filter(w => canon(w.name) === k);
    if (cands.length === 0)      dest = { mode: 'create', id: srcWs.id, name: target.src, note: 'preserva cuid' };
    else if (cands.length === 1) dest = { mode: 'merge', id: cands[0].id, name: cands[0].name };
    else throw new Error(`destino AMBÍGUO p/ '${target.src}': ${cands.map(c => `${c.name}(${c.id})`).join(', ')} — defina dstOverride`);
  }

  // 3) USERS — dedup por email
  const members = (await src.query(`
    SELECT u.id, lower(u.email) email FROM "MemberInWorkspace" m
    JOIN "User" u ON u.id = m."userId" WHERE m."workspaceId"=$1 AND u.email IS NOT NULL`, [srcWs.id])).rows;
  const emails = members.map(m => m.email);
  const existing = emails.length ? new Set((await dst.query(
    `SELECT lower(email) email FROM "User" WHERE lower(email) = ANY($1)`, [emails])).rows.map(r => r.email)) : new Set();
  const usersReuse = members.filter(m => existing.has(m.email)).length;
  const usersNew = members.length - usersReuse;

  // 4) BOTS — copia limpa vs conflito por publicId
  const srcBots = (await src.query(`
    SELECT t.id, t."publicId" pid, t."updatedAt" upd, md5(t.groups::text) h
    FROM "Typebot" t WHERE t."workspaceId"=$1 AND t."publicId" IS NOT NULL`, [srcWs.id])).rows;
  const pids = srcBots.map(b => b.pid);
  const dstByPid = {};
  if (pids.length) for (const r of (await dst.query(`
    SELECT t.id, t."publicId" pid, t."updatedAt" upd, md5(t.groups::text) h
    FROM "Typebot" t WHERE t."publicId" = ANY($1)`, [pids])).rows) dstByPid[r.pid] = r;

  const conflicting = srcBots.filter(b => dstByPid[b.pid]);
  const clean = srcBots.length - conflicting.length;

  const decisions = [];
  for (const b of conflicting) {
    const d = dstByPid[b.pid];
    if (b.h === d.h) { decisions.push({ pid: b.pid, action: 'no-op (idêntico)' }); continue; }
    const tSrc = await traffic(src, b.id);
    const tDst = await traffic(dst, d.id);
    let winner;
    if (tSrc > 0 && tDst === 0) winner = 'inst2';
    else if (tDst > 0 && tSrc === 0) winner = 'inst1';
    else winner = new Date(b.upd) >= new Date(d.upd) ? 'inst2' : 'inst1'; // empate de tráfego -> updatedAt
    decisions.push({
      pid: b.pid, winner, trafficSrc: tSrc, trafficDst: tDst,
      action: winner === 'inst2' ? 'SOBRESCREVE destino' : 'mantém destino (inst1)',
    });
  }

  return { srcName: target.src, srcWs, dest, members: members.length, usersReuse, usersNew,
           botsTotal: srcBots.length, botsClean: clean, conflicts: decisions };
}

// ---------------------------------------------------------------------------
// PRINT (o "exatamente o que aconteceria")
// ---------------------------------------------------------------------------
function printPlan(p) {
  console.log(`\n========== ${p.srcName}  (origem ws ${p.srcWs.id}) ==========`);
  console.log(`  DESTINO: ${p.dest.mode.toUpperCase()} -> "${p.dest.name}" (${p.dest.id})${p.dest.note ? '  [' + p.dest.note + ']' : ''}`);
  console.log(`  USERS:   ${p.members} members  ->  reusa ${p.usersReuse} existentes, cria ${p.usersNew} novos (+ Account/Session)`);
  console.log(`  BOTS:    ${p.botsTotal} com publicId  ->  ${p.botsClean} entram limpos, ${p.conflicts.length} em conflito`);
  for (const c of p.conflicts) {
    const extra = c.winner ? `  [tráfego src=${c.trafficSrc} dst=${c.trafficDst} (res/30d) -> vence ${c.winner}]` : '';
    console.log(`     - ${c.pid.padEnd(46)} ${c.action}${extra}`);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
(async () => {
  const { srcUrl, dstUrl } = deriveUrls(process.env.BASE_URL || process.env.DATABASE_URL);
  console.log(`MODO: ${APPLY ? '⚠️  APPLY (ESCREVE)' : 'DRY-RUN (read-only, não escreve nada)'}`);
  if (APPLY) throw new Error('apply ainda não implementado — esta versão é dry-run only');

  const src = await connect(srcUrl, { readOnly: true });
  const dst = await connect(dstUrl, { readOnly: true });
  const [srcWss, dstWss] = await Promise.all([loadWorkspaces(src), loadWorkspaces(dst)]);

  const targets = ONLY ? TARGETS.filter(t => t.src === ONLY) : TARGETS;
  for (const t of targets) {
    try { printPlan(await planWorkspace(src, dst, t, srcWss, dstWss)); }
    catch (e) { console.log(`\n========== ${t.src} ==========\n  ERRO: ${e.message}`); }
  }

  await src.end(); await dst.end();
  console.log('\nDRY-RUN concluído. Nada foi escrito.');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
