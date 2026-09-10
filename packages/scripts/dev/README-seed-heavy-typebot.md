# Repro local: `AnswerV2_resultId_idx` + dedup do `deleteTypebot`

Runbook do PLAN v2 (`personal-docs/bugs/eddie-delete-typebot-cascade/PLAN.md`, §6), com os
ajustes de `REVIEW-2.md` (N2, N3, N5, N7) aplicados. Todos os comandos abaixo usam os nomes,
portas e credenciais reais do composezao (`docker-compose.yml` na raiz do repo
`composezao-da-massa`), verificados nesta sessão.

**`seed-heavy-typebot.sql` é dev-only.** Gera ~1,2M linhas de lastro sintético (`AnswerV2`) num
banco local. Nunca rodar contra um banco que não seja o `typebot` do composezao local. O script é
idempotente (guarda por `ON CONFLICT DO NOTHING` no `Typebot` + checagem `EXISTS` antes de gerar
`Result`/`AnswerV2`/`Log`) — rodar de novo sem teardown é seguro e não duplica linhas, mas também
não é um "reset": para recomeçar do zero, use o teardown (§6.6) ou `DROP DATABASE typebot`.

Fatos do ambiente (conferidos em `docker-compose.yml` e `packages/prisma/postgresql/schema.prisma`
nesta sessão):

- Postgres compartilhado: container `cloudchat-postgres` (`postgres:16.8`), superuser
  `postgres`/`postgres`, porta host `5434` → `5432` no container. Database `typebot` é criado pelo
  serviço `typebot-init` (não existe por padrão nesse Postgres, que também hospeda o `chatwoot`).
- `typebot-migrate` builda com `target: builder` (não tem `./node_modules/.bin/prisma` — esse bin
  só é copiado no stage `runner` do `Dockerfile`) e **não tem bind mount** do repo (copia no build):
  qualquer migration nova exige `--build`.
- `typebot-builder` builda com `target: dev`, tem bind mount (`./typebot.io:/app`) e roda
  `pnpm install && pnpm turbo build --filter=@typebot.io/env && pnpm turbo run dev --filter=builder...`
  como comando — REST em `http://localhost:3002/api/v1/typebots/{id}`.
- `packages/scripts/seed.sql` (já rodado pelo serviço `typebot-seed`) cria o workspace
  `claudia-workspace-id` (nome `claudia_project`), o usuário `claudia-user-id` e o `ApiToken`
  `dummy-token` — é o que os comandos REST abaixo usam via `Authorization: Bearer dummy-token`.
- A migration do índice já existe neste branch:
  `packages/prisma/postgresql/migrations/20260908120000_add_answerv2_resultid_index/migration.sql`
  (`CREATE INDEX CONCURRENTLY "AnswerV2_resultId_idx" ON "AnswerV2"("resultId");`, statement único).
  `schema.prisma` já tem `@@index([resultId])` em `AnswerV2`. O dedup (advisory lock +
  `TypebotButton.tsx` + i18n) também já está implementado neste branch — este runbook só
  reproduz o "antes/depois" e valida.

Nota (N5, `REVIEW-2.md`): se precisar regenerar/alterar a migration (`pnpm --filter
@typebot.io/prisma migrate:dev`, usado no §4 do PLAN — fora do escopo deste runbook), esse script
usa `dotenv -e ./.env -e ../../.env`; `packages/prisma/.env` e o `.env` da raiz do `typebot.io` não
são versionados. Crie-os vazios (`touch packages/prisma/.env .env`) antes de rodar `migrate:dev`,
ou prefira `pnpm --filter @typebot.io/prisma exec prisma migrate dev --create-only --schema
postgresql/schema.prisma --name <nome>` com `DATABASE_URL` no ambiente, que não passa pelo wrapper
`dotenv-cli`. O §6.3 abaixo já usa esse padrão `exec prisma`, então não é afetado.

Nota (N4, `REVIEW-2.md`): o baseline do `migrate diff` (§4 do PLAN, fora deste runbook) não deve
usar `git stash -u` (stasheia `seed-heavy-typebot.sql` e qualquer outro untracked, e falha calada
se o `pop` conflitar) — usar um worktree descartável (`git worktree add /tmp/tb-baseline
origin/main` → rodar o diff lá → `git worktree remove /tmp/tb-baseline`).

Nota: `typebot-builder` roda Next em modo dev — os tempos HTTP (§6.4) não são comparáveis a prod;
o que importa ali é a distribuição de status codes e o `pg_stat_activity`. Os tempos de banco
(§6.2/§6.3) são comparáveis em ordem de grandeza (×8–9 para estimar prod).

## 6.0 Subir o stack do typebot

A partir da raiz do composezao:

```bash
cd /home/gustavo/shared_files/trampo/repos/composezao-da-massa1
docker compose up -d --build typebot-init typebot-migrate typebot-builder typebot-seed
docker exec cloudchat-postgres psql -U postgres -d typebot -c \
  'select migration_name, finished_at, rolled_back_at from "_prisma_migrations" order by started_at desc limit 3'
```

Gotcha: `packages/prisma/scripts/executeCommand.ts` (rodado por `packages/prisma/scripts/migrate-deploy.ts`,
que o `pnpm db:migrate` da raiz chama via `cd packages/prisma && pnpm run db:migrate`, dentro do
`typebot-migrate`) engole erros do `exec` e sai `0`, então `service_completed_successfully` do
`typebot-migrate` **não prova** que a migration foi aplicada — sempre conferir `_prisma_migrations`
como acima. Qualquer migration nova exige `--build` (sem bind mount nesse serviço).

Opcional, para espelhar o `connection_limit=5` de prod: adicionar `?connection_limit=5` no
`DATABASE_URL` do `typebot-builder` (não commitar). `DATABASE_URL` é variável de ambiente, não
entra na imagem — `--build` **não** basta e nem é necessário; o container precisa ser recriado:

```bash
docker compose up -d --force-recreate typebot-builder
```

## 6.0.1 Bloqueios de ambiente (execução de 2026-09-08)

Encontrados ao executar este runbook de verdade; todos precisam de contorno hoje.

**Build quebrado (`bullseye-security`).** `docker compose ... --build` falha em
`apt-get update`: o `Release` de `deb.debian.org/debian-security bullseye-security` está expirado
e os `.deb` saíram do pool (404). `Acquire::Check-Valid-Until=false` não resolve (404 no arquivo),
`archive.debian.org/debian-security` também dá 404 no `Release`, e remover o repo de security
quebra o stage `dev` (`libc6-dev : Depends: libc6 (= 2.31-13+deb11u11) but ...u13 is to be
installed`). Contorno usado: construir a imagem fora do compose, a partir de uma cópia patchada do
`Dockerfile` (fora do worktree), alvo **`base`** — `python3/make/g++` do stage `dev` só são
necessários em arm64 — e apontar `image:` num override:

```bash
# copia o Dockerfile do worktree e insere a remoção do repo de security no stage base
sed "s|^WORKDIR /app$|WORKDIR /app\nRUN sed -i '/debian-security/d' /etc/apt/sources.list|" \
  <worktree>/Dockerfile > /tmp/Dockerfile.patched
docker build --target base --build-arg SCOPE=builder -t typebot-repro:dev \
  -f /tmp/Dockerfile.patched <worktree>
```

No override, `typebot-builder` e `typebot-migrate` recebem `image: typebot-repro:dev` (com a
imagem já presente, `docker compose up -d` sem `--build` não tenta reconstruir).

**`typebot-migrate` não builda** (stage `builder`, mesmo motivo). Contorno: stubar o serviço no
override e aplicar as migrations de dentro do `typebot-builder` com o comando do §6.3 — é
exatamente o mesmo `prisma migrate deploy`.

**`P3005` no `migrate deploy`.** Se o database `typebot` já existe com as tabelas mas **sem**
`_prisma_migrations` (estado deixado por um `prisma db push` antigo), o deploy aborta com
"The database schema is not empty". Recriar:

```bash
docker exec cloudchat-postgres psql -U postgres -c 'DROP DATABASE typebot WITH (FORCE);'
docker exec cloudchat-postgres psql -U postgres -c 'CREATE DATABASE typebot;'
```

## 6.0.2 Simular o estado de prod (sem o índice)

Rodando o `migrate` a partir deste branch, a migration nova entra junto — e aí não há "antes" para
medir. Depois de aplicar todas as migrations, derrubar só o índice:

```bash
docker exec cloudchat-postgres psql -U postgres -d typebot \
  -c 'DROP INDEX "AnswerV2_resultId_idx";' \
  -c "DELETE FROM _prisma_migrations WHERE migration_name='20260908120000_add_answerv2_resultid_index';"
```

O §6.3 depois reaplica a migration exatamente como em prod (`migrate deploy` encontra 1 pendente).

## 6.1 Seed de volume

```bash
cd /home/gustavo/shared_files/trampo/repos/composezao-da-massa1
docker exec -i cloudchat-postgres psql -U postgres -d typebot -v ON_ERROR_STOP=1 \
  < typebot.io/packages/scripts/dev/seed-heavy-typebot.sql
```

Gera:

- `heavy-ballast`: 20 000 `Result` × 50 `AnswerV2` = 1 000 000 `AnswerV2` (lastro, fica intacto até
  o teardown).
- `heavy-victim-a`, `heavy-victim-b`, `heavy-victim-c`: 2 000 `Result` × 50 `AnswerV2` = 100 000
  `AnswerV2` cada — alvos de delete para não esperar horas no "antes do índice".
- `Log`: 1 linha por `Result` em cada um dos 4 typebots (24 000 no total).
- Total: `Result` 26 000 / `AnswerV2` **1 300 000** linhas / 171 MB (medido) (extrapolar ×8–9 para o tamanho de prod, ~9M
  linhas / 1,5 GB).

O `SELECT` final do script mostra `n_live_tup` e o tamanho de `Result`/`AnswerV2`/`Log` — confira
que bate com o esperado acima antes de seguir.

## 6.2 (a) Antes do índice: plano e tempo

`auto_explain` com `log_nested_statements` mostra o `DELETE` interno que o trigger de FK executa.
Só funciona aqui porque o usuário é superuser e a imagem do Postgres traz o `contrib` —
**não reproduzir em RDS com o usuário da aplicação**.

```bash
docker exec -i cloudchat-postgres psql -U postgres -d typebot <<'SQL'
LOAD 'auto_explain';
SET auto_explain.log_min_duration = 0;
SET auto_explain.log_analyze = on;
SET auto_explain.log_nested_statements = on;
SET client_min_messages = log;

SELECT seq_scan, seq_tup_read FROM pg_stat_user_tables WHERE relname = 'AnswerV2';

BEGIN;
DELETE FROM "Typebot" WHERE id = 'heavy-victim-a';
ROLLBACK;

SELECT pg_sleep(1);
SELECT seq_scan, seq_tup_read FROM pg_stat_user_tables WHERE relname = 'AnswerV2';
SQL
docker logs cloudchat-postgres --since 2m | grep -i "duration\|Seq Scan on \"AnswerV2\""
```

Esperado: minutos; log com `Seq Scan on "AnswerV2"` dentro de um
`DELETE FROM ONLY "public"."AnswerV2" WHERE $1 OPERATOR(pg_catalog.=) "resultId"` aninhado;
`seq_scan` sobe em ~2000 (uma por `Result` apagado), `seq_tup_read` sobe em bilhões de linhas
(assinatura do incidente). O `ROLLBACK` preserva `heavy-victim-a` para o passo seguinte.

Evidência pontual (um único `Result`, sem afetar o resto do seed):

```bash
docker exec -i cloudchat-postgres psql -U postgres -d typebot <<'SQL'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS) DELETE FROM "AnswerV2" WHERE "resultId" = 'heavy-victim-a-r1';
ROLLBACK;
SQL
```

## 6.3 (b) Aplicar a migration e repetir

Dentro do container de dev não existe `./node_modules/.bin/prisma` (só é copiado no stage
`runner` do `Dockerfile`). Usar o padrão que o CI (`typebot-gitops.yaml`) já usa para `prisma`
via `pnpm --filter @typebot.io/prisma exec`:

O `sh` da imagem (`node:20-bullseye-slim`) é `dash`: não tem `time` como keyword e o binário
`/usr/bin/time` não vem no slim (`sh: time: not found`). Usar `bash -c` e medir com `date +%s%N`:

```bash
docker exec typebot-builder bash -c \
  'cd /app/packages/prisma && S=$(date +%s%N); \
   DATABASE_URL=postgresql://postgres:postgres@cloudchat-postgres:5432/typebot \
   pnpm exec prisma migrate deploy --schema postgresql/schema.prisma; \
   echo "elapsed_ms=$(( ($(date +%s%N)-S)/1000000 ))"'

docker exec cloudchat-postgres psql -U postgres -d typebot -Atc \
  'select indexrelid::regclass, indisvalid from pg_index where indrelid = '"'"'"AnswerV2"'"'"'::regclass'
```

Alternativa equivalente: `docker compose up --build typebot-migrate` (reaplica via o serviço
oficial; `DATABASE_URL` já está no `docker-compose.yml`).

O `elapsed_ms` acima é a base da estimativa de prod (×8–9). Medido nesta repro: **2 654 ms**
com 1,2 M linhas em `AnswerV2`. Repetir o §6.2 (ou o "evidência pontual"):
esperado `Index Scan using "AnswerV2_resultId_idx"`, delta de `seq_scan` em `AnswerV2` = 0, delete
de `heavy-victim-a` completo em segundos (não minutos).

```bash
docker exec -i cloudchat-postgres psql -U postgres -d typebot <<'SQL'
SELECT seq_scan FROM pg_stat_user_tables WHERE relname = 'AnswerV2';
\timing on
DELETE FROM "Typebot" WHERE id = 'heavy-victim-a';
SELECT seq_scan FROM pg_stat_user_tables WHERE relname = 'AnswerV2';
SQL
```

## 6.4 (c) Dedup: 8 deletes concorrentes + cenário de controle

Rodar **antes** do §6.3 (cascade ainda lento, janela observável) contra `heavy-victim-b`. Se for
rodar **depois** do índice, o delete de 100 k `AnswerV2` cai para ~0,15 s e a janela some: gerar um
alvo maior reusando a função do seed (que continua criada no banco), p.ex.
`SELECT seed_heavy_typebot('heavy-victim-d', 20000, 50);` (1 M `AnswerV2`, vencedor em ~1 s). Auth REST
via `Authorization: Bearer dummy-token` (`packages/scripts/seed.sql`, token do `claudia-user-id`,
`ADMIN` em `claudia-workspace-id`).

Ajuste N2 (`REVIEW-2.md`): o `-w` do `curl` escreve no *stdout* do próprio `curl`; um `>/dev/null`
no fim do `sh -c` redireciona esse stdout e descarta exatamente os status codes que o passo existe
para coletar. Removido abaixo — o `-o /dev/null` já descarta o corpo da resposta, que era o
objetivo original.

```bash
TB=heavy-victim-b
seq 8 | xargs -P8 -n1 sh -c \
  'curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" -X DELETE \
     -H "Authorization: Bearer dummy-token" \
     http://localhost:3002/api/v1/typebots/'"$TB"'' _
```

Em paralelo, numa segunda janela:

```bash
watch -n1 'docker exec cloudchat-postgres psql -U postgres -d typebot -Atc "
  select pid, state, wait_event_type, now()-xact_start as tx_age, left(query,60)
  from pg_stat_activity where datname='"'"'typebot'"'"' and state <> '"'"'idle'"'"' and pid <> pg_backend_pid()"'
```

Esperado (código deste branch): 1×`200` após N s; 7×`409` em < 1 s; no máximo 1 tx ativa em
`DELETE` durante a janela dos 8 concorrentes, nenhuma delas em `wait_event_type = Lock` (ajuste N7
abaixo — este critério é escopado aos 8 concorrentes, não é absoluto). Confira também
`docker compose logs typebot-builder | grep "deleteTypebot: concurrent deletion blocked"` — deve
aparecer 7 vezes (uma por `409`), evidência de que o `logger.warn` do dedup está ativo.

**Cenário de controle** (B1 — falso 409 por tráfego concorrente que não é outro delete): com
`heavy-victim-c` (já seedado no §6.1), abrir uma sessão `psql` que segura lock na linha de
`Result`/`Typebot` sem ser um delete:

```bash
docker exec -it cloudchat-postgres psql -U postgres -d typebot
```
```sql
BEGIN;
INSERT INTO "Result" (id, "typebotId", variables, "isCompleted", "hasStarted")
VALUES ('heavy-victim-c-live', 'heavy-victim-c', '[]'::jsonb, false, true);
```

(sem `COMMIT`) e, em outro terminal, disparar **uma única** request:

```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" -X DELETE \
  -H "Authorization: Bearer dummy-token" \
  http://localhost:3002/api/v1/typebots/heavy-victim-c
```

Esperado: a request **não** recebe `409`; ela fica com `wait_event_type = Lock` (visível no
`watch` acima) até o `COMMIT`/`ROLLBACK` da sessão `psql`, e só então completa com `200`. Repetir
trocando o `INSERT` por `UPDATE "Typebot" SET name = 'x' WHERE id = 'heavy-victim-c';` na mesma
sessão em aberto — mesmo resultado esperado. (Com o mecanismo antigo, `FOR UPDATE NOWAIT`, os dois
casos dariam `409` falso — é exatamente o que este cenário prova que não acontece mais.)

## 6.5 UI

`http://localhost:3002`, workspace `claudia_project`: deletar `heavy-victim-a` (ou o que sobrar
dele após os passos acima) — botão em spinner até a resposta, lista atualiza sem o item. Em outra
aba, disparar o delete do mesmo typebot durante o spinner da primeira: toast `info`
("já em exclusão" / `folders.typebotButton.deleteInProgress`) e lista igualmente atualizada.

## 6.6 Teardown

Antes de qualquer coisa, **fechar a sessão `psql` do cenário de controle** (§6.4): se ela ficou em
`BEGIN` sem `COMMIT`/`ROLLBACK`, o `DELETE FROM "Typebot"` do teardown fica preso em `Lock` e o
`VACUUM (FULL)` não consegue o `AccessExclusiveLock`. Dar `ROLLBACK;` + `\q` na sessão (ou usar o
padrão `BEGIN; ...; SELECT pg_sleep(N); ROLLBACK;` num heredoc, que se fecha sozinho) e conferir:

```bash
docker exec cloudchat-postgres psql -U postgres -d typebot -Atc \
  "select count(*) from pg_stat_activity where datname='typebot' and state='idle in transaction'"
```

O banco `typebot` vive no mesmo Postgres do `chatwoot` (`cloudchat-postgres`), então limpar os
~200 MB de seed antes de encerrar a sessão de repro.

Ajuste N3 (`REVIEW-2.md`): `psql -c 'A; B; VACUUM ...; C'` manda tudo como uma única *simple
query*, que o Postgres embrulha em transação implícita — `VACUUM` não roda dentro de bloco de
transação (`ERROR: VACUUM cannot run inside a transaction block`, reproduzido nesta sessão contra
`cloudchat-postgres`). Cada `-c` abaixo é uma conexão/query própria, sem esse problema:

```bash
docker exec cloudchat-postgres psql -U postgres -d typebot \
  -c 'DELETE FROM "Typebot" WHERE id LIKE '"'"'heavy-%'"'"';' \
  -c 'DROP FUNCTION IF EXISTS seed_heavy_typebot(text,int,int);' \
  -c 'VACUUM (FULL, ANALYZE) "AnswerV2";' \
  -c 'VACUUM (FULL, ANALYZE) "Result";' \
  -c 'VACUUM (FULL, ANALYZE) "Log";'
```

Alternativa mais simples se o banco `typebot` não precisar sobreviver à sessão: apagar tudo e
refazer o §6.0 (`typebot-init` recria o database):

```bash
docker exec cloudchat-postgres psql -U postgres -c 'DROP DATABASE typebot;'
```

## Checklist de evidências para `REPRO-EVIDENCE.md`

- [ ] Saída de `pg_stat_user_tables` do §6.1 (contagens/tamanho pós-seed).
- [ ] Log do `auto_explain` do §6.2 com `Seq Scan on "AnswerV2"` + `seq_scan`/`seq_tup_read`
      antes/depois (ou o `EXPLAIN (ANALYZE, BUFFERS)` pontual).
- [ ] Saída do `time` do §6.3 (duração do `migrate deploy`) e do `indisvalid`/`Index Scan` pós-índice.
- [ ] Tempo do `DELETE` de `heavy-victim-a` antes (§6.2, minutos) vs depois (§6.3, segundos).
- [ ] Saída completa dos 8 `curl` do §6.4 (1×200 + 7×409, com os `time_total`).
- [ ] Trecho do `docker compose logs typebot-builder` mostrando as 7 linhas
      `deleteTypebot: concurrent deletion blocked`.
- [ ] Captura do `watch pg_stat_activity` durante os 8 concorrentes (no máx. 1 tx ativa, nenhuma
      em `Lock`).
- [ ] Resultado do cenário de controle (`heavy-victim-c`): request presa em `wait_event_type =
      Lock` até o commit/rollback manual, sem `409`, para o `INSERT` e para o `UPDATE`.
- [ ] Screenshot ou descrição do comportamento na UI (§6.5): spinner, toast `info`, lista
      atualizada.
- [ ] Confirmação do teardown (§6.6) — `SELECT count(*) FROM "Typebot" WHERE id LIKE 'heavy-%'` = 0.
