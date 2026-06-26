#!/usr/bin/env node
'use strict';
/*
 * Migração Typebot — instância 2 (database `postgres2`) -> instância 1 (`postgres`).
 *
 * DRY-RUN POR PADRÃO: lê os dois bancos, monta o plano de merge e imprime
 * EXATAMENTE o que faria — SEM ESCREVER NADA. Full read-only.
 *
 * Execução real só com `--apply` — escreve dentro de transação por workspace,
 * idempotente (ON CONFLICT DO NOTHING). Rollback automático em qualquer erro.
 *
 * Segurança (defesa em profundidade):
 *   1. No dry-run toda conexão abre com `SET default_transaction_read_only = on`.
 *   2. No dry-run a fase `applyWorkspace` NÃO é chamada — código inalcançável.
 *   3. `--apply` é a única forma de habilitar escrita (e exige `--i-am-sure`).
 *
 * Uso (via kubectl exec num pod typebot-builder da inst1):
 *   POD=$(kubectl get pods -n typebot -o name | grep builder | head -1)
 *   kubectl exec -i -n typebot ${POD#pod/} -c typebot-builder -- \
 *     sh -lc 'BASE_URL="$DATABASE_URL" node -' < merge.js            # dry-run
 *     sh -lc 'BASE_URL="$DATABASE_URL" node - --apply --i-am-sure'   # executa
 *
 * O DATABASE_URL do pod aponta para o destino (`postgres`). A origem (`postgres2`)
 * é derivada trocando o database no mesmo host (mesma credencial).
 */

const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const SURE = process.argv.includes('--i-am-sure');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1]; // ex: --only=getrak

// ---- Workspaces a migrar ----
// dstOverride: força um workspace destino existente (merge) quando canon é ambíguo.
// createAs:    traz a origem AS-IS num workspace NOVO com esse nome (preserva o cuid
//              da origem). Evita colisão de nome no destino e dá rollback trivial
//              (apaga o workspace + reverte eddieInstance/eddieProjectName). Os bots
//              do destino que colidem em publicId são despublicados (publicId é unique
//              global) — a origem vence as-is.
const TARGETS = [
  { src: 'shopee',          createAs: 'shopee-prod' }, // as-is; inst1 tem Shopee+shopee (colisão de nome)
  { src: 'getrak',          createAs: 'getrak-prod' }, // as-is; uniformidade + mata a pendência dos zumbis

  { src: 'getrakteste',     dstOverride: null },
  { src: 'claudia_project', dstOverride: null },
];

// canon(name) = lower + trim + colapsa espaços/underscores. Identidade de workspace.
const canon = (n) => (n || '').toLowerCase().trim().replace(/[\s_]+/g, ' ');

// Colunas cujo valor é uma FK que precisa ser remapeada na cópia.
const REMAP = {
  workspaceId: 'ws',     // -> id do workspace destino
  userId: 'user',        // -> userMap[srcUserId]
  ownerId: 'user',       // ApiToken.ownerId também é um userId
  createdById: 'userOrNull', // Credentials.createdById: membro deduplicado tem id diferente
  typebotId: 'bot',      // -> botMap[srcBotId]
};

// ---------------------------------------------------------------------------
// Conexões
// ---------------------------------------------------------------------------
function deriveUrls(base) {
  if (!base) throw new Error('BASE_URL/DATABASE_URL não definido no ambiente do pod');
  const dstUrl = base;
  if (new URL(dstUrl).pathname.replace('/', '') !== 'postgres')
    throw new Error(`Esperava destino database=postgres, veio ${new URL(dstUrl).pathname}`);
  const u = new URL(base);
  u.pathname = '/postgres2';
  return { srcUrl: u.toString(), dstUrl };
}

async function connect(url, { readOnly }) {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  if (readOnly) await c.query('SET default_transaction_read_only = on');
  await c.query("SET statement_timeout = '300s'");
  return c;
}

const loadWorkspaces = (c) => c.query(`SELECT id, name FROM "Workspace"`).then(r => r.rows);

async function traffic(client, typebotId) {
  return parseInt((await client.query(
    `SELECT count(*) n FROM "Result" WHERE "typebotId"=$1 AND "createdAt" > now() - interval '30 days'`,
    [typebotId])).rows[0].n);
}

// colunas json/jsonb de uma tabela (cache) — precisam de JSON.stringify na cópia
const _jsonbCache = {};
async function jsonbCols(client, table) {
  if (!_jsonbCache[table]) {
    const r = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND data_type IN ('json','jsonb')`, [table]);
    _jsonbCache[table] = new Set(r.rows.map(x => x.column_name));
  }
  return _jsonbCache[table];
}

// ---------------------------------------------------------------------------
// PLAN (read-only) — estrutura de ações determinística, sem executar nada
// ---------------------------------------------------------------------------
async function buildPlan(src, dst, target, srcWss, dstWss) {
  const k = canon(target.src);

  const srcWs = srcWss.find(w => canon(w.name) === k);
  if (!srcWs) throw new Error(`workspace origem '${target.src}' não encontrado em postgres2`);

  // destino
  let dest;
  if (target.createAs) {
    dest = { mode: 'create', id: srcWs.id, name: target.createAs, note: 'as-is, workspace novo' };
  } else if (target.dstOverride) {
    const w = dstWss.find(w => w.id === target.dstOverride);
    if (!w) throw new Error(`dstOverride ${target.dstOverride} não existe na inst1`);
    dest = { mode: 'merge', id: w.id, name: w.name, note: 'override (canon ambíguo)' };
  } else {
    const cands = dstWss.filter(w => canon(w.name) === k);
    if (cands.length === 0)      dest = { mode: 'create', id: srcWs.id, name: target.src, note: 'preserva cuid' };
    else if (cands.length === 1) dest = { mode: 'merge', id: cands[0].id, name: cands[0].name };
    else throw new Error(`destino AMBÍGUO p/ '${target.src}': ${cands.map(c => `${c.name}(${c.id})`).join(', ')} — defina dstOverride`);
  }

  // USERS — dedup por email. userMap: srcUserId -> id final (reusado existente ou preservado).
  const members = (await src.query(`
    SELECT u.id, lower(u.email) email FROM "MemberInWorkspace" m
    JOIN "User" u ON u.id = m."userId" WHERE m."workspaceId"=$1 AND u.email IS NOT NULL`, [srcWs.id])).rows;
  const emails = members.map(m => m.email);
  const existingRows = emails.length ? (await dst.query(
    `SELECT id, lower(email) email FROM "User" WHERE lower(email) = ANY($1)`, [emails])).rows : [];
  const existingByEmail = Object.fromEntries(existingRows.map(r => [r.email, r.id]));
  const userMap = {};
  const usersReuse = [], usersCreate = [];
  for (const m of members) {
    if (existingByEmail[m.email]) { userMap[m.id] = existingByEmail[m.email]; usersReuse.push(m); }
    else { userMap[m.id] = m.id; usersCreate.push(m); }       // novo: preserva o cuid de origem
  }

  // BOTS — clean / overwrite / skip. botMap: srcBotId -> id final.
  const srcBots = (await src.query(`
    SELECT t.id, t."publicId" pid, t."updatedAt" upd, md5(t.groups::text) h
    FROM "Typebot" t WHERE t."workspaceId"=$1 AND t."publicId" IS NOT NULL`, [srcWs.id])).rows;
  const pids = srcBots.map(b => b.pid);
  const dstByPid = {};
  if (pids.length) for (const r of (await dst.query(`
    SELECT t.id, t."publicId" pid, t."updatedAt" upd, md5(t.groups::text) h
    FROM "Typebot" t WHERE t."publicId" = ANY($1)`, [pids])).rows) dstByPid[r.pid] = r;

  const botMap = {};
  const botsClean = [], botsOverwrite = [], botsSkip = [], conflictLog = [];
  const freePublicIds = [];   // (createAs) bots do destino cujo publicId será liberado (despublicado)

  if (target.createAs) {
    // AS-IS: copia TODOS os bots da origem (inclui rascunhos), preservando cuid.
    const allIds = (await src.query(`SELECT id FROM "Typebot" WHERE "workspaceId"=$1`, [srcWs.id])).rows.map(r => r.id);
    for (const id of allIds) { botsClean.push(id); botMap[id] = id; }
    // bots publicados do destino que colidem em publicId -> despublicar (origem vence as-is)
    for (const b of srcBots) {
      const d = dstByPid[b.pid];
      if (d) freePublicIds.push({ id: d.id, pid: b.pid, trafficDst: await traffic(dst, d.id) });
    }
  } else {
    for (const b of srcBots) {
      const d = dstByPid[b.pid];
      if (!d) { botsClean.push(b.id); botMap[b.id] = b.id; continue; }   // sem colisão: copia preservando cuid
      if (b.h === d.h) { botsSkip.push({ srcId: b.id, dstId: d.id }); botMap[b.id] = d.id; conflictLog.push({ pid: b.pid, action: 'no-op (idêntico)' }); continue; }
      const tSrc = await traffic(src, b.id);
      const tDst = await traffic(dst, d.id);
      let winner;
      if (tSrc > 0 && tDst === 0) winner = 'inst2';
      else if (tDst > 0 && tSrc === 0) winner = 'inst1';
      else winner = new Date(b.upd) >= new Date(d.upd) ? 'inst2' : 'inst1';
      if (winner === 'inst2') { botsOverwrite.push({ srcId: b.id, dstId: d.id }); botMap[b.id] = d.id; }
      else { botsSkip.push({ srcId: b.id, dstId: d.id }); botMap[b.id] = d.id; }   // inst1 vence: usa o do destino
      conflictLog.push({ pid: b.pid, winner, trafficSrc: tSrc, trafficDst: tDst,
        action: winner === 'inst2' ? 'SOBRESCREVE destino' : 'mantém destino (inst1)' });
    }
  }

  return { target, srcWs, dest, members, usersReuse, usersCreate, userMap,
           srcBots, botsClean, botsOverwrite, botsSkip, botMap, conflictLog, freePublicIds };
}

function printPlan(p) {
  console.log(`\n========== ${p.target.src}  (origem ws ${p.srcWs.id}) ==========`);
  console.log(`  DESTINO: ${p.dest.mode.toUpperCase()} -> "${p.dest.name}" (${p.dest.id})${p.dest.note ? '  [' + p.dest.note + ']' : ''}`);
  console.log(`  USERS:   ${p.members.length} members  ->  reusa ${p.usersReuse.length} existentes, cria ${p.usersCreate.length} novos (+ Account/Session)`);
  if (p.target.createAs) {
    console.log(`  BOTS:    ${p.botsClean.length} copiados as-is (todos), ${p.srcBots.length} publicados`);
    if (p.freePublicIds.length) {
      console.log(`  LIBERA:  despublica ${p.freePublicIds.length} bot(s) do destino que colidem em publicId:`);
      for (const f of p.freePublicIds)
        console.log(`     - ${f.pid.padEnd(46)} despublica dst ${f.id}  [tráfego dst=${f.trafficDst} res/30d]`);
    }
  } else {
    console.log(`  BOTS:    ${p.srcBots.length} com publicId  ->  ${p.botsClean.length} limpos, ${p.botsOverwrite.length} sobrescreve, ${p.botsSkip.length} skip`);
    for (const c of p.conflictLog) {
      const extra = c.winner ? `  [tráfego src=${c.trafficSrc} dst=${c.trafficDst} (res/30d) -> vence ${c.winner}]` : '';
      console.log(`     - ${c.pid.padEnd(46)} ${c.action}${extra}`);
    }
  }
}

// ---------------------------------------------------------------------------
// APPLY (write) — executa o plano numa transação por workspace
// ---------------------------------------------------------------------------

// Copia uma row (objeto JS lido do src) para o destino, remapeando FKs conhecidas
// e serializando colunas jsonb. Idempotente via ON CONFLICT DO NOTHING.
async function insertRow(dst, table, row, ctx, jcols) {
  const data = { ...row };
  for (const [col, kind] of Object.entries(REMAP)) {
    if (!(col in data) || data[col] == null) continue;
    if (kind === 'ws')   data[col] = ctx.dstWsId;
    if (kind === 'user') data[col] = ctx.userMap[data[col]] ?? data[col];
    // criador não-membro não é migrado -> null (FK é ON DELETE SET NULL)
    if (kind === 'userOrNull') data[col] = ctx.userMap[data[col]] ?? null;
    if (kind === 'bot')  data[col] = ctx.botMap[data[col]] ?? data[col];
  }
  const cols = Object.keys(data);
  const vals = cols.map(c => (jcols.has(c) && data[c] != null) ? JSON.stringify(data[c]) : data[c]);
  const ph = cols.map((_, i) => `$${i + 1}`).join(',');
  const q = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${ph}) ON CONFLICT DO NOTHING`;
  await dst.query(q, vals);
}

// Lê rows do src por uma lista de ids e copia para o destino.
async function copyByIds(src, dst, table, idCol, ids, ctx) {
  if (!ids.length) return;
  const jcols = await jsonbCols(dst, table);
  const rows = (await src.query(`SELECT * FROM "${table}" WHERE "${idCol}" = ANY($1)`, [ids])).rows;
  for (const r of rows) await insertRow(dst, table, r, ctx, jcols);
}

// Lê rows do src por uma FK (ex: workspaceId) e copia.
async function copyByFk(src, dst, table, fkCol, fkVal, ctx) {
  const jcols = await jsonbCols(dst, table);
  const rows = (await src.query(`SELECT * FROM "${table}" WHERE "${fkCol}" = $1`, [fkVal])).rows;
  for (const r of rows) await insertRow(dst, table, r, ctx, jcols);
}

// Copia as pastas (DashboardFolder) do workspace. Necessário ANTES dos Typebot:
// Typebot.folderId referencia DashboardFolder.id. O self-ref parentFolderId não é
// deferível -> 2 passes (insere sem pai, depois seta). Preserva o id da pasta;
// workspaceId é remapeado p/ o destino via insertRow.
async function copyFolders(src, dst, srcWsId, ctx) {
  const jcols = await jsonbCols(dst, 'DashboardFolder');
  const rows = (await src.query(`SELECT * FROM "DashboardFolder" WHERE "workspaceId"=$1`, [srcWsId])).rows;
  for (const r of rows) await insertRow(dst, 'DashboardFolder', { ...r, parentFolderId: null }, ctx, jcols);
  for (const r of rows) if (r.parentFolderId != null)
    await dst.query(`UPDATE "DashboardFolder" SET "parentFolderId"=$1 WHERE id=$2`, [r.parentFolderId, r.id]);
}

// Sobrescreve o conteúdo de um bot do destino com o do src (inst2 vence),
// preservando id/workspaceId/publicId/createdAt do destino. Substitui o PublicTypebot.
async function overwriteBot(src, dst, srcBotId, dstBotId, ctx) {
  const keep = new Set(['id', 'workspaceId', 'publicId', 'createdAt']);
  const jcols = await jsonbCols(dst, 'Typebot');
  const row = (await src.query(`SELECT * FROM "Typebot" WHERE id=$1`, [srcBotId])).rows[0];
  if (!row) return;
  const cols = Object.keys(row).filter(c => !keep.has(c));
  const vals = cols.map(c => (jcols.has(c) && row[c] != null) ? JSON.stringify(row[c]) : row[c]);
  const set = cols.map((c, i) => `"${c}"=$${i + 1}`).join(',');
  vals.push(dstBotId);
  await dst.query(`UPDATE "Typebot" SET ${set} WHERE id=$${cols.length + 1}`, vals);

  // PublicTypebot: substitui a versão publicada do destino pela da origem (typebotId -> dstBotId)
  await dst.query(`DELETE FROM "PublicTypebot" WHERE "typebotId"=$1`, [dstBotId]);
  await copyByFk(src, dst, 'PublicTypebot', 'typebotId', srcBotId, { ...ctx, botMap: { [srcBotId]: dstBotId } });
}

async function applyWorkspace(src, dst, p) {
  const ctx = { dstWsId: p.dest.id, userMap: p.userMap, botMap: p.botMap };
  await dst.query('BEGIN');
  try {
    // 0) (createAs) libera os publicId colididos: despublica os bots do destino
    //    (publicId -> NULL + remove PublicTypebot). Roda ANTES de copiar os bots limpos,
    //    que reusam esses publicId. publicId é unique global.
    if (p.freePublicIds && p.freePublicIds.length) {
      const ids = p.freePublicIds.map(f => f.id);
      await dst.query(`DELETE FROM "PublicTypebot" WHERE "typebotId" = ANY($1)`, [ids]);
      await dst.query(`UPDATE "Typebot" SET "publicId" = NULL WHERE id = ANY($1)`, [ids]);
    }

    // 1) Workspace (só no create — preserva cuid; renomeia se createAs)
    if (p.dest.mode === 'create') {
      await copyByIds(src, dst, 'Workspace', 'id', [p.srcWs.id], ctx);
      if (p.target.createAs)
        await dst.query(`UPDATE "Workspace" SET name=$1 WHERE id=$2`, [p.target.createAs, p.dest.id]);
    }

    // 2) Users novos + Account + Session (reusados já existem; não tocar)
    const newUserIds = p.usersCreate.map(u => u.id);
    await copyByIds(src, dst, 'User', 'id', newUserIds, ctx);
    for (const uid of newUserIds) {
      await copyByFk(src, dst, 'Account', 'userId', uid, ctx);
      await copyByFk(src, dst, 'Session', 'userId', uid, ctx);
    }

    // 3) MemberInWorkspace (userId remapeado, workspaceId -> destino)
    await copyByFk(src, dst, 'MemberInWorkspace', 'workspaceId', p.srcWs.id, ctx);

    // 3.5) DashboardFolder (antes dos Typebot — Typebot.folderId -> DashboardFolder.id)
    await copyFolders(src, dst, p.srcWs.id, ctx);

    // 4) Bots limpos: Typebot + PublicTypebot (preserva cuid, workspaceId -> destino)
    await copyByIds(src, dst, 'Typebot', 'id', p.botsClean, ctx);
    for (const id of p.botsClean)
      await copyByFk(src, dst, 'PublicTypebot', 'typebotId', id, ctx);

    // 5) Bots em conflito (inst2 vence): UPDATE + substitui PublicTypebot
    for (const { srcId, dstId } of p.botsOverwrite)
      await overwriteBot(src, dst, srcId, dstId, ctx);

    // 6) Credentials do workspace (descriptografam — mesmo ENCRYPTION_SECRET)
    await copyByFk(src, dst, 'Credentials', 'workspaceId', p.srcWs.id, ctx);

    // 7) Collaborators dos bots (userId + typebotId remapeados)
    //    createAs copia todos os bots (botsClean); merge usa os publicados (srcBots).
    const allBotSrcIds = p.target.createAs ? p.botsClean : p.srcBots.map(b => b.id);
    if (allBotSrcIds.length)
      await copyByIds(src, dst, 'CollaboratorsOnTypebots', 'typebotId', allBotSrcIds, ctx);

    // 8) ApiToken dos members (ownerId remapeado) — necessário p/ integrações que usam o token
    const memberSrcIds = p.members.map(m => m.id);
    await copyByIds(src, dst, 'ApiToken', 'ownerId', memberSrcIds, ctx);

    await dst.query('COMMIT');
    console.log(`  ✔ APLICADO (commit) — ${p.target.src}`);
  } catch (e) {
    await dst.query('ROLLBACK');
    console.log(`  ✖ ROLLBACK — ${p.target.src}: ${e.message}`);
    throw e;
  }
}

// Conferência pós-merge: conta no destino o que era esperado.
async function reconcile(dst, p) {
  const wsId = p.dest.id;
  const bots = parseInt((await dst.query(`SELECT count(*) n FROM "Typebot" WHERE "workspaceId"=$1`, [wsId])).rows[0].n);
  const members = parseInt((await dst.query(`SELECT count(*) n FROM "MemberInWorkspace" WHERE "workspaceId"=$1`, [wsId])).rows[0].n);
  console.log(`  RECONCILE destino: ${bots} bots, ${members} members no workspace ${wsId}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
(async () => {
  const { srcUrl, dstUrl } = deriveUrls(process.env.BASE_URL || process.env.DATABASE_URL);
  if (APPLY && !SURE) throw new Error('--apply exige também --i-am-sure (trava de segurança)');
  console.log(`MODO: ${APPLY ? '⚠️  APPLY — VAI ESCREVER NO DESTINO (postgres)' : 'DRY-RUN (read-only, não escreve nada)'}`);

  const src = await connect(srcUrl, { readOnly: true });           // origem SEMPRE read-only
  const dst = await connect(dstUrl, { readOnly: !APPLY });          // destino write só com --apply
  const [srcWss, dstWss] = await Promise.all([loadWorkspaces(src), loadWorkspaces(dst)]);

  const targets = ONLY ? TARGETS.filter(t => t.src === ONLY) : TARGETS;
  for (const t of targets) {
    let p;
    try { p = await buildPlan(src, dst, t, srcWss, dstWss); printPlan(p); }
    catch (e) { console.log(`\n========== ${t.src} ==========\n  ERRO no plano: ${e.message}`); continue; }
    if (APPLY) { await applyWorkspace(src, dst, p); await reconcile(dst, p); }
  }

  await src.end(); await dst.end();
  console.log(APPLY ? '\nAPPLY concluído.' : '\nDRY-RUN concluído. Nada foi escrito.');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
