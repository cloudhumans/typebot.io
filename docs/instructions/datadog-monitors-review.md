# Datadog monitor impact review

The Datadog monitors for this repository live as Terraform in `monitoring/datadog/*.tf`. There are three today, all in `monitoring/datadog/monitors_webhook.tf`, and all three read the structured log lines that the HTTP Request block (webhook) emits in `packages/bot-engine/blocks/integrations/webhook/executeWebhookBlock.ts`. No monitor reads traces, custom metrics or span metrics.

| Address | Query (abridged) | Window and threshold |
|---|---|---|
| `datadog_monitor.webhook_request_loop` | `service:typebot-viewer "HTTP Request Executed"`, grouped by `@workflow.name,@workspace.name,@workflow.execution_id,@workflow.id` | 5m, > 55 |
| `datadog_monitor.webhook_request_loop_solides` | same literal plus `@workspace.name:*solides*`, grouped by `@workspace.name,@workflow.name,@workflow.execution_id` | 5m, > 30 (warning 25) |
| `datadog_monitor.shopee_webhook_integration_errors` | `service:typebot-viewer @workspace.name:shopee-prod ("HTTP Request Error" OR "HTTP Request Failed" OR @http.status_code:>=400 OR @http.duration:>20000)`, grouped by `@workflow.name,@workflow.id,@http.url` | 1h, > 200 |

A code change can affect a monitor in two ways:

- It can **blind** the monitor. When the signal disappears, the query sees no data. Most monitors then stay green for good; one with `notify_no_data = true` or `on_missing_data = "show_and_notify_no_data"` fires a no-data alert instead. Either way it stops measuring what it says, so check that setting before describing the effect. It can also **split** a monitor: when a group-by attribute is renamed, the groups change and a counter that used to reach the threshold now stays under it.
- It can ship a **failure mode that no monitor watches**.

Check every pull request for both, using the rules below. Section D adds the checks for PRs that edit `monitoring/datadog/` itself.

## How to comment

- Write in Brazilian Portuguese (pt-BR).
- Post **at most one comment per PR** for everything in this document. Anchor it on the line that changes the signal, and merge all findings into that one comment.
- The default is silence. Comment only when you can name one of these:
  - the monitor address and the query fragment that goes blind (sections A and C);
  - the concrete failure that nobody would see (section B);
  - the monitor block and the rule it breaks (section D).
- You cannot see Datadog. Never claim that a threshold is wrong, that a signal has data, or that a monitor fired. When that matters, ask the author for evidence.
- Severity:
  - a blinded or split monitor (A, items 1-5) is **P1**;
  - a failure moved out of a monitor's view, or a monitor polluted by a new signal (A, items 6-8) is **P2**;
  - a monitor left behind by removed code (C) is **P1**;
  - a suggested new monitor (B) is **P2**;
  - a composite change whose apply fails with a 400 (C) is **P1**;
  - a monitor that sends log content to Slack (D) is **P1**; any other finding in D is **P2**.

## How code signals appear in monitor queries

Before deciding, search `monitoring/datadog/*.tf` for the exact literal that the diff changes. Also search for its prefix and for wildcards such as `@workspace.name:*solides*`.

Match against the `query` only. The `message` texts cite attributes (`{{[@workflow.name].name}}`) that mirror the query's group-by, but changing a value the message alone cites blinds nothing.

| Code signal | How the query reads it | Example |
|---|---|---|
| Log line text | `packages/lib/logger.ts` is a winston logger. The line is `` `${workspaceLogLabel(logContext?.workspace)} - HTTP Request Executed` `` (`executeWebhookBlock.ts:464`; also `HTTP Request Error` at 515, `HTTP Request Timeout` at 549, `HTTP Request Failed` at 585). The monitors match the quoted suffix as a phrase and ignore the workspace prefix, so changing only `workspaceLogLabel` (`packages/bot-engine/workspaceLogLabel.ts`) blinds nothing. Rewording, dropping or splitting the suffix does. | `"HTTP Request Executed"` in both loop monitors |
| Structured attributes | The second argument of `logger.info/warn/error` is spread into the JSON line, so nested keys become `@workflow.name`, `@workflow.id`, `@workflow.execution_id`, `@workspace.name`, `@http.url`, `@http.status_code`, `@http.duration`. They come from `logContext` (`executeWebhookBlock.ts:168-180`) and the `http: {...}` object next to each log call. Renaming or dropping a key blinds a filter or splits a group-by. | `execution_id` is the loop monitors' per-session counter; `@http.url` is the Shopee monitor's group-by |
| Attribute values | `workspace.name` is the workspace's real name (`startSession.ts:389-396`, `executeTypebotLink.ts:248,279`), falling back to `'unknown'` (`executeWebhookBlock.ts:167`). The Solides monitor filters `@workspace.name:*solides*` and the Shopee monitor `@workspace.name:shopee-prod`. A change that stops populating the name, or normalizes it, blinds them. `execution_id` falls back to `'preview'` when there is no `sessionId` (line 177), which merges every preview run into one group. | the two client-specific monitors |
| Which fields exist on which line | Only `HTTP Request Executed` and `HTTP Request Error` carry `http.status_code`. `HTTP Request Timeout` carries `http.timeout_ms` and `http.duration`; `HTTP Request Failed` carries `http.duration` and `error`. The Shopee monitor therefore sees a timeout only when its `duration` exceeds 20000. | `@http.status_code:>=400` |
| Log format | `logger.ts` emits JSON only when `DD_LOGS_ENABLED === 'true'`; otherwise it prints `message + JSON.stringify(rest)`, which Datadog does not parse into attributes. It only runs in the server in production; elsewhere `logger` is a `console` shim. `console.*` is redirected into the logger, so a stray `console.log` containing a monitored literal is counted too. | a change to `prettyEnabled` or `baseFormats` |
| Log level | No monitor filters `status:` today. `Executed` is `info`, `Error` is `warn`, `Timeout` and `Failed` are `error`. Check the query before saying a level change matters. | |
| Datadog service | `service:` on logs comes from `logger.ts` `defaultMeta.service`: `process.env.DD_SERVICE ?? 'typebot-runner'`. `DD_SERVICE` is set per deployment in the `cloudhumans/typebot.io-manifests` repo, which you cannot see: `typebot-viewer`, `typebot-builder` and `typebot-migration-job` in production. The tracer defaults in `packages/lib/trpc/datadogInit.ts` (`typebot-app`) and the explicit `ensureDatadogInitialized({ service })` calls in `apps/viewer/instrumentation.ts` and `apps/builder/instrumentation.ts` apply to traces, not to the log `service`. | all three monitors read `service:typebot-viewer` only |

Traces, StatsD and span metrics: the repo initializes `dd-trace` (`datadogInit.ts`, `createDatadogLoggerMiddleware.ts`) but a `git grep` finds no custom metric, `dogstatsd` client or span metric, and no monitor reads traces. Do not invent a row for them.

### Signals with no emitter here

- The log `service` value and `DD_LOGS_ENABLED` come from the manifests repo. A `git grep` for `typebot-viewer` finds only image and gitops names, so that does not mean the monitors are orphaned.
- Datadog-side log pipelines and facets (`@http.status_code`, `@http.duration` as numbers) are configured outside this repo.

A diff can still change what produces them, and then section A applies as usual.

### The builder is not watched

All three monitors read `service:typebot-viewer`. The bot-engine code is shared: the builder's WhatsApp preview runs the same webhook code (`apps/builder/src/features/whatsapp/startWhatsAppPreview.ts` calls `startSession`, which reaches `startBotFlow`, `executeGroup` and `executeIntegration` at `executeGroup.ts:227`, then `executeWebhookBlock`). Those lines log under the builder's `DD_SERVICE` and no monitor sees them. A PR that moves real traffic to execute webhooks from the builder, or changes which app runs the flow, takes it out of the monitors' view.

## A. The change blinds or misleads a monitor

**Trigger.** The diff renames, removes, moves or rewrites a signal from the table, and a query in `monitoring/datadog/*.tf` still reads the old value. This includes:

1. Rewording or removing the `HTTP Request Executed`, `HTTP Request Error` or `HTTP Request Failed` literal, or splitting it so the phrase no longer appears contiguous.
2. Renaming or dropping an attribute key that a query filters or groups on: `workflow.name`, `workflow.id`, `workflow.execution_id`, `workspace.name`, `http.url`, `http.status_code`, `http.duration`. A flat key (`executionId`, `http_url`) is a different attribute.
3. Changing how `workspace.name` is filled (`startSession.ts`, `executeTypebotLink.ts`) or the `'unknown'` fallback, so the `*solides*` or `shopee-prod` filter stops matching.
4. Changing the `DD_SERVICE` default or the `defaultMeta.service` in `logger.ts`, or the logger format so attributes stop being parsed.
5. Sending requests that used to log through a path that does not log: executing a webhook block on the client (`isExecutedOnClient`, `executeWebhookBlock.ts:155`), or a new early `return` before the request (compare 110-114, 127-131, 146-150, which already return a `ChatLog` error without any `logger` call).
6. Loop protection that changes the arithmetic. `enforceBlockVisitLimit.ts` ends a session after `MAX_BLOCK_VISITS_PER_SESSION` visits of one block (default 500, `packages/env/env.ts:89`). Lowering that default, or making the engine stop a looping session earlier than 55 requests in 5 minutes (30 for Solides), means the loop monitors can never reach their threshold. Ask for the monitor threshold to be revisited in the same PR.
7. A `catch` that turns a webhook failure into a success-looking result, or logs it under a different literal, so `HTTP Request Error` or `Failed` no longer fires for it.
8. A new log line that reuses a monitored literal on a path the monitor is not about. For example, a second `HTTP Request Executed` log in a retry wrapper doubles the count per execution, so the loop monitors fire at half the real volume. Ask for a distinct literal.

**The comment must include:**

- the monitor address (`datadog_monitor.<name>`) and its file;
- the quoted query fragment;
- the diff line that changes the signal.

**Ask.** Update the query **in the same PR** with the `ch-engineering:change-datadog-monitor` skill. Old pods keep emitting the old value until the rollout ends, so during the transition the query must accept both values, for example `("HTTP Request Executed" OR "HTTP Request Done")`. A later PR drops the old value, once rolling back to the previous version is no longer an option. For a renamed attribute, both loop monitors need it (and the Shopee monitor, when it is `workflow.name`, `workflow.id` or `http.url`), and the group-by in the `message` placeholders must follow.

**Stay silent when:**

- the PR already changes that monitor's query so it reads the new value (check the query itself, not just that the `.tf` file changed);
- the old literal or key is still emitted on the same path (`git grep` it), so the series survives;
- the change only touches tests, fixtures, TSDoc or comments;
- the change is letter case only. Datadog documents full-text search as case insensitive, so `HTTP request executed` still matches `"HTTP Request Executed"`. A change in wording, spacing, hyphenation or attribute keys (attributes are case sensitive) is not case only;
- the query matches a different string that merely looks alike (`Block Executed` in `executeGroup.ts` is not `HTTP Request Executed`).

## B. The change ships a failure that nobody would see (P2)

Suggest a monitor only when **all three** hold:

1. The PR adds one of the triggers below.
2. You can name the failure: what breaks, and who notices, if anyone.
3. No existing monitor covers that failure. Read the current queries in `monitoring/datadog/*.tf` before deciding.

**Triggers:**

- **A new integration path in `executeIntegration.ts` (or a new forged block) that makes an outbound call without going through `executeWebhookBlock`.** It emits no `HTTP Request ...` line, so the loop monitors and the Shopee monitor never see it. Today the Chatwoot block logs a bare `logger.error(error)` (`executeChatwootBlock.ts:44`) and Google Sheets `updateRow.ts:73` the same, with no stable key.
- **A new failure branch inside `executeWebhookBlock` that returns without a structured log.** The three early returns for an unresolved credential, unparsable attributes and a rejected URL already do. Their failure reaches the flow as a `ChatLog` only, so for `shopee-prod` the monitor counts none of them. A new branch like that is a trigger.
- **A `catch` that swallows a webhook or integration failure with no `logger` call, or only a free-text one.** A failure that is logged with one of the monitored literals is covered.
- **A loop-protection or retry change** (section A, item 6) that removes a limit without a replacement signal. Today the `Block visit warning threshold reached` and `Block visit limit exceeded` lines (`enforceBlockVisitLimit.ts:109,117`) are read by no monitor.
- **A new tenant-critical flow path** (a client with its own channel, like Solides or Shopee) that depends on an HTTP integration. The Shopee monitor is scoped to `shopee-prod` only.

Code that is not wired to any production path yet is not a trigger: a block nobody can add, or a flag that defaults off with no rollout in the PR. The PR that wires it in is the trigger.

**Precondition.** If the failure path emits no signal, the first ask is to emit one. That can be a `logger` line with a stable literal and the same `...logContext` attributes the webhook lines use. A monitor needs a signal to read.

**The suggestion contains:**

- the signal and a query sketch;
- why it matters;
- the instruction to create the monitor with `ch-engineering:create-datadog-monitor`. A signal with no history starts in calibration mode: `priority = "4"`, tags `notify:none` and `expires:<today + 14 days>`, plus `team:` and `service:`. A new monitor never starts as P1;
- that the thresholds come from the skill's backtest. Never propose a number.

Say where the monitor goes. When this PR creates the signal, the monitor goes in this PR: a separate PR could reach `main` before the signal and start blind. When the signal is already on `main`, a follow-up PR is fine.

## C. Code removed, monitor left behind (P1)

When the PR deletes the only emitter of a signal that a monitor reads, that monitor goes blind for good. A literal that is missing from the source does not trigger this section by itself: the PR must delete or replace what produces the signal. Removing the HTTP Request block's logging, or the block type, is the case here. The monitor must be deleted or retargeted with the `ch-engineering:change-datadog-monitor` skill. Deleting it means three things:

- delete the `datadog_monitor` block;
- delete the `import` block that targets it in `imports.tf`, if one exists, because otherwise the plan fails;
- add the PR label `allow-monitor-delete`.

None of the three monitors is a composite today. If one is added (another query contains `${datadog_monitor.<name>.id}`), a PR that deletes a member in the same apply in which a surviving composite stops referencing it fails with a 400 that a rerun does not fix: split it into two PRs, or delete the member together with every composite that cites it.

## D. PRs that edit `monitoring/datadog/`

CI already blocks the following, so do not repeat them:

- missing `managed_by`/`team`/`service` tags;
- a missing handle or `notify:none`;
- a missing `prevent_destroy`;
- a replace;
- a delete without the label;
- a resource type other than `datadog_monitor`, `datadog_synthetics_test` and `datadog_spans_metric`;
- `provider`, `terraform` or `module` outside `providers.tf`, and any `data`, `check` or `output` block;
- `fmt`, `tflint` and file-layout errors.

Check only these:

- **Renaming a resource address** needs a `moved {}` block to a free address. It also needs the `import` block and every `${datadog_monitor.<old>.id}` reference retargeted. Without `moved`, the monitor is destroyed and recreated with a new ID, and it loses its history.
- **A new monitor** starts as P4 in calibration mode (`notify:none`, `expires:`) unless the PR body shows the `calibrate.py` backtest of 15 days of the same query with no sustained episode on a normal day. Then it can start as P2 or P3.
  - It never starts as P1. Promotion comes after two weeks as P2.
  - It never gets an `import {}` block.
  - If its signal is neither on the base branch nor in this diff, it starts blind: ask where the signal comes from.
- **A promotion to P1** (`priority` changes to `"1"`) needs:
  - `@pagerduty-<pager>` on its own line, outside any `{{#...}}` block;
  - `renotify_interval = 30`, `renotify_occurrences = 2` and `renotify_statuses = ["alert"]`;
  - an `Ação:` line;
  - a PR body that shows two weeks as P2 with no false positive.
- **The message:**
  - it needs a `{{#is_warning}}` block when there is a warning threshold;
  - it must not contain `@word` in the text, because Datadog treats that as a notification handle;
  - its numbers and windows must match the query, and the `{{[@attr].name}}` placeholders must match the query's group-by.
- **An error rate** comes from `trace.*` metrics: `errors / hits`, or `hits` filtered by `http.status_code` when the code turns the failure into a 4xx. Never from counting spans. Error spans are retained preferentially, so a span count overstates the rate many times over.
- **Drift.** Any merge to `monitoring/` applies the whole stack and reverts edits made in the Datadog UI. If the PR touches a monitor that someone may have edited in the UI, ask the author to confirm which value should win.

### Team standard for a monitor the PR adds or edits

This subsection applies only to a `datadog_monitor` block that the diff adds or changes. The three monitors here predate the standard, so never apply it to a monitor the diff does not touch. Sections A and C still apply to every monitor, touched or not.

A monitor that the PR edits must come out of the PR in the standard, as the `ch-engineering:change-datadog-monitor` skill requires. Point out the parts that are off:

- **Log content in Slack (P1).** `{{log.message}}` in the message, or `enable_logs_sample = true`, sends customer data to the channel. Ask to remove it and to link the Log Explorer instead.
- **Route.**
  - A P2 or P3 message ends with the owners as `<@MEMBER_ID>` inside `{{^is_recovery}}...{{/is_recovery}}`, then `@slack-murphys-law-cloud-humans` in exactly that spelling. A P1 also ends with `@pagerduty-<pager>`. A P4 (`notify:none`) has no handle.
  - Flag `<@U0AS86CELA0>`: it is a bot and notifies nobody.
  - Flag `@pagerduty-...` on a monitor that is not P1: only P1 wakes someone up.
  - Flag a team channel (`@slack-alerts-typebot`, `@slack-alerts-suporte`) or `@team-...`: the standard routes everything through the one channel and the owner mentions. The Solides and Shopee monitors also notify client-facing channels (`@slack-ch-solides`, `@slack-ch-shopee`, `@slack-alerts-shopee`); when the PR edits one of them, ask the author to confirm that routing is intended instead of asking to remove it.
  - Flag a placeholder such as `@slack-CANAL-AQUI` or a bare `@slack-`. Datadog accepts a handle that does not exist without an error, and nobody is notified.
  - `@slack-CloudHumans-murphys-law-cloud-humans` reaches the same channel, but the standard uses only the first spelling. Ask for it without saying that nobody is notified.
- **Name and tags.**
  - The `name` is `[<service>] <symptom in pt-BR>`, with the value of the `service:` tag. It has no `(P1)`, no `{{variable}}` and no `[DEPRECATED]`: a monitor in code is deleted once its replacement notifies, not renamed.
  - The tags include `env:` and a `service:` that matches the emitter (`typebot-viewer` for these log lines).
- **Message.**
  - It says what happened, why it matters and, in P1 and P2, an `Ação:` line.
  - `{{#is_no_data}}` appears only when the monitor notifies on missing data.
  - Calibration numbers (normal, p99.5, maximum, episodes) go in the PR body, not in the message.
- **Evaluation.**
  - A continuous metric has a `critical_recovery`.
  - A sparse count (a log or an `.as_count()` query) has `on_missing_data = "resolve"`.
  - There is no `by {...}` on a high-cardinality tag (conversation, message, user, `@email`): each group is a billed series and an alert. `@workflow.execution_id` is deliberate in the loop monitors, because the loop is per session; do not flag it there.
  - A comparison with the previous week (`pct_change`, `week_before`) needs a written reason.
  - Every member of a composite groups by the same tag. A sub-monitor has the `sub_` address prefix, a `[<service>][sub]` name, the tags `role:sub` and `notify:none`, and no `priority`.

## Do not comment on

- A new block or API endpoint with no failure mode of its own that does not touch the webhook path.
- Cause-based alerts (CPU, memory, token counts) when the user-facing symptom is already covered.
- A monitor that duplicates an existing one with a different scope. Suggest widening the existing query instead.
- Docs-only, test-only, i18n-only, UI-only or version-bump PRs, and changes to other blocks (Google Sheets, Chatwoot, OpenAI and similar) that do not change what the webhook lines or `logger.ts` emit.
- For section B only: a PR whose description already plans the monitor for the new failure. For sections A and C the description is not enough; the diff must change the query.

## Comment templates

Blinded monitor:

```
**Monitor do Datadog fica cego.** `datadog_monitor.<name>` (`monitoring/datadog/<file>.tf`) lê `<fragmento da query>`. Este PR <renomeia/remove> esse sinal em `<arquivo:linha>`; sem dado, o monitor nunca mais alerta. Atualize a query neste PR com a skill `ch-engineering:change-datadog-monitor` e, durante o rollout, aceite os dois valores: `<antigo OR novo>`.
```

Failure with no monitor:

```
**Falha sem monitor.** Se `<bloco/chamada>` falhar, <consequência> e nenhum monitor atual percebe: `<monitor existente>` só cobre <escopo>. Sugestão: emitir um log com literal estável e os mesmos atributos (`...logContext`) no caminho de falha e criar um monitor em calibração com a skill `ch-engineering:create-datadog-monitor` (P4, `notify:none`, `expires:` +14 dias). Como o sinal nasce neste PR, o monitor vai neste PR.
```

When the signal is already on `main`, end the second template with "Pode ser neste PR ou num seguinte." instead of the last sentence.
