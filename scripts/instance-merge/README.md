# Instance merge — unificação instância 2 → instância 1

Script de migração que consolida os workspaces ativos da **instância 2** do Typebot
(database `postgres2`) dentro da **instância 1** (`postgres`). As duas instâncias
compartilham o **mesmo RDS** — são apenas dois databases lógicos.

Motivação: as tools agênticas da Shopee vivem na instância 2, que não é acessível
via OAP / estrutura agêntica. Unificar na instância 1 resolve o acesso e elimina a
necessidade de manter duas instâncias (criadas por isolamento de performance, hoje
desnecessário).

> Contexto e estratégia completos: ADO **#6796** e o spec de design em
> `composezao-da-massa/docs/superpowers/specs/2026-06-19-typebot-instance-unification-design.md`.

## Segurança — dry-run é full read-only

**Por padrão o script é DRY-RUN e não escreve absolutamente nada.** Defesa em profundidade:

1. Toda conexão abre com `SET default_transaction_read_only = on`.
2. No dry-run a fase de escrita (`apply`) **nunca é chamada** — é código inalcançável.
3. `--apply` é a única forma de habilitar escrita (ainda **não implementado** nesta versão).

## O que o dry-run faz

Lê os dois bancos e imprime **exatamente o que a migração faria**, por workspace:

- **Destino** — resolve por nome canônico (`lower + trim + colapsa espaço/underscore`).
  `create` (não existe na inst1, preserva o `cuid`) ou `merge` (entra num existente).
  Quando o canon é ambíguo (ex: `Shopee` conversa vs `shopee` tools), exige `dstOverride`.
- **Users** — dedup por email: reusa os que já existem na inst1, cria os novos.
- **Bots** — por `publicId`: entram limpos (sem colisão) ou em conflito. Conflito divergente
  é resolvido por **tráfego** (`Result` recente; sem tráfego = última prioridade) e, em
  empate, por `updatedAt`. Conteúdo idêntico (`md5(groups)`) é no-op.

## Como rodar (dry-run)

Roda de dentro de um pod `typebot-builder` da instância 1 — o `DATABASE_URL` do pod
aponta para `postgres` (destino); a origem `postgres2` é derivada no mesmo host.

```bash
POD=$(kubectl get pods -n typebot -o name | grep builder | head -1)
kubectl exec -i -n typebot ${POD#pod/} -c typebot-builder -- \
  sh -lc 'BASE_URL="$DATABASE_URL" node -' < scripts/instance-merge/merge.js

# só um workspace:
#   ... node - --only=getrak' < scripts/instance-merge/merge.js
```

## Escopo

Migram apenas os workspaces ativos: `shopee`, `getrak`, `getrakteste`, `claudia_project`.
Migra **configuração** (workspaces, users, bots, credentials) — **não** histórico
(`Result`, `ChatSession`, `Log`, etc). Os demais workspaces da instância 2 somem com o
`DROP DATABASE postgres2` no fim do cutover.

## Pendente

- Fase `apply` (escrita, em transação, via `postgres_fdw`).
- Reconciliação pós-merge (contagem origem vs destino).
- Testes da lógica de plano com fixtures no composezao local antes de qualquer prod.
