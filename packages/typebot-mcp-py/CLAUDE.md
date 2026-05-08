# CLAUDE.md — typebot-mcp (Python)

Guidance for Claude Code when working inside `packages/typebot-mcp-py/`.

## Keep docs in sync

**Whenever you change layout, tools, env vars, conventions, or workflow — update BOTH `CLAUDE.md` and `README.md` in the same change.** They are the two sources of truth (one for Claude Code, one for humans). Drift between them costs more than the edit.

## What this is

Python MCP server that proxies Typebot's viewer + builder REST APIs as MCP tools. Built on the official `mcp[cli]` SDK (FastMCP). Independent of the TS `/api/mcp` endpoint — talks straight to `/api/v1/...`.

## Layout

```
packages/typebot-mcp-py/
├── pyproject.toml                hatchling build, ruff/pyright/pytest config
├── README.md                     public-facing docs
├── .env.example                  runtime env template
├── .venv/                        local virtualenv (uv-managed, gitignored)
├── src/typebot_mcp/
│   ├── __init__.py               re-exports (Settings, build_server, exceptions)
│   ├── __main__.py               CLI entry — `typebot-mcp` script + `python -m typebot_mcp`
│   ├── config.py                 Settings via pydantic-settings, env prefix TYPEBOT_
│   ├── context.py                AppContext dataclass (settings + viewer + builder)
│   ├── lifespan.py               open_clients(settings) + app_lifespan async cm
│   ├── transport.py              build_headers + pure async request() helper
│   ├── errors.py                 http_errors_as_tool_errors → mcp.ToolError adapter
│   ├── exceptions.py             TypebotError / TypebotHTTPError
│   ├── server.py                 build_server() — assembles FastMCP, lifespan, register_all
│   ├── services/                 stateless domain wrappers around the REST API
│   │   ├── __init__.py
│   │   ├── chat.py               start/continue/preview chat
│   │   ├── typebots.py           list/get/create/update/publish/unpublish/delete
│   │   ├── results.py            list/get/get_logs/delete results
│   │   ├── analytics.py          get_analytics_stats
│   │   ├── folders.py            list_folders
│   │   └── workspaces.py         list_workspaces / list_credentials
│   └── tools/                    MCP tool definitions, one module per domain
│       ├── __init__.py           register_all(mcp, cfg, app)
│       ├── chat.py               always-on chat tools
│       ├── typebots_read.py      always-on typebot reads
│       ├── typebots_write.py     gated by allow_writes
│       ├── results_read.py       always-on result reads
│       ├── results_write.py      gated by allow_writes
│       ├── analytics.py          always-on
│       ├── folders.py            always-on
│       └── workspaces.py         always-on
└── tests/
    ├── conftest.py                       settings + settings_writable fixtures
    ├── test_services_chat.py             chat respx tests
    ├── test_services_management.py       management/results/analytics/folders/workspaces respx tests
    ├── test_lifespan.py                  open + close of both upstream clients
    ├── test_errors.py                    TypebotHTTPError → ToolError + protocol-correct isError
    ├── test_annotations.py               readOnly/destructive/idempotent hints per tool
    └── test_server.py                    FastMCP tool registration + invocation tests
```

## Stack (locked-in choices, do not swap without reason)

- `mcp[cli]>=1.12` — official Python SDK, both stdio + Streamable HTTP transports.
- `httpx>=0.27` — async HTTP client.
- `pydantic>=2.6` + `pydantic-settings>=2.2` — env-driven config.
- `respx>=0.21` — HTTPX mocking for hermetic tests.
- `pytest>=8` + `pytest-asyncio` (auto mode).
- `ruff>=0.5` — lint + format.
- `pyright>=1.1.380` — type checker (configured to use `.venv`).

Python: 3.10+ at runtime; `.venv` uses 3.12 locally. Do not introduce 3.11+-only syntax in `src/` (the `pyproject` declares `requires-python = ">=3.10"`).

## Workflow

```bash
# create venv + install (run inside the package dir)
uv venv --python 3.12 --clear .venv
uv pip install --python .venv/bin/python -e ".[dev]"

# lint + format
.venv/bin/ruff check --fix src tests
.venv/bin/ruff format src tests

# type check
.venv/bin/pyright

# tests
.venv/bin/pytest
```

Always run all four (`ruff check`, `ruff format`, `pyright`, `pytest`) before reporting work complete. CI must stay green on all four.

## Architecture

Three layers, in dependency order:

1. **`transport.py`** — pure async HTTP helper. Takes a configured `httpx.AsyncClient`, returns parsed JSON. Raises `TypebotHTTPError` on every failure mode.
2. **`services/*.py`** — stateless domain wrappers. Each function takes the appropriate `httpx.AsyncClient` (viewer or builder) plus its inputs, returns a dict. Snake_case → camelCase conversion happens here.
3. **`tools/*.py`** — MCP tool definitions. Each domain has a `register(mcp, app)` function. Tools close over the shared `AppContext` and call services. Errors are wrapped via `http_errors_as_tool_errors` so `TypebotHTTPError` becomes `mcp.ToolError` (protocol-correct `isError: true`).

`server.py` glues everything together: opens both `httpx.AsyncClient`s eagerly into an `AppContext`, registers a FastMCP `lifespan` to close them on shutdown, calls `register_all(mcp, cfg, app)`.

## MCP tools exposed

The catalog is split by host:

- **Chat tools** target the **viewer** (`TYPEBOT_API_BASE_URL`, e.g. `http://localhost:3003`). Wired via `app.viewer`.
- **Management/results/analytics tools** target the **builder** (`TYPEBOT_BUILDER_BASE_URL`, e.g. `http://localhost:3002`). Wired via `app.builder`. `builder_url_str` falls back to `base_url_str` when the env var is unset.

### Always registered (13)

Chat (3): `start_chat`, `continue_chat`, `start_chat_preview`.
Read (10): `list_typebots`, `get_typebot`, `get_published_typebot`, `list_results`, `get_result`, `get_result_logs`, `get_analytics_stats`, `list_folders`, `list_workspaces`, `list_credentials`.

### Gated behind `TYPEBOT_ALLOW_WRITES=true` (6)

`create_typebot`, `update_typebot`, `publish_typebot`, `unpublish_typebot`, `delete_typebot`, `delete_results`. Registration is `if cfg.allow_writes:` inside `register_all` (`tools/__init__.py`).

### Tool annotations

Every tool declares `ToolAnnotations(readOnlyHint, destructiveHint, idempotentHint)`. Reads → `readOnlyHint=True, idempotentHint=True`. `unpublish_typebot`, `delete_typebot`, `delete_results` → `destructiveHint=True`. `tests/test_annotations.py` is the single source of truth for the table — update it whenever a tool's semantics change.

### Adding a new tool

1. **Service**: add an async function to the matching `services/<domain>.py`. Take an `httpx.AsyncClient` as the first positional arg. Use `transport.request(client, method, path, payload=?, params=?)` — it drops `None`s, raises `TypebotHTTPError` on failure, wraps list responses as `{"items": [...]}`. Snake_case → camelCase mapping lives in this layer; do not push it into MCP signatures.
2. **Tool**: add an async function inside the matching `tools/<domain>.py` `register(mcp, app)`. Decorate with `@mcp.tool(annotations=ToolAnnotations(...))`. Wrap the service call in `async with http_errors_as_tool_errors("operation_name"): ...`. Close over `app.viewer` or `app.builder`. Tools do **not** take a `Context` parameter — they capture `app` via closure so they remain testable through `mcp.call_tool()` directly.
3. **Mutating tools**: place them in a `_write.py` module (e.g. `typebots_write.py`). Registration is gated by `cfg.allow_writes` in `tools/__init__.py:register_all`. Mark `destructiveHint=True` if the operation cannot be reversed.
4. **Tests**: write a `respx`-mocked unit test in `tests/test_services_<domain>.py` (service layer) and a tool-invocation test in `tests/test_server.py` (covers registration + arg routing). Update `ALWAYS_ON_TOOLS` / `WRITE_TOOLS` in `tests/test_server.py`. Add a row to `EXPECTED` in `tests/test_annotations.py`.

## Configuration

All runtime config flows through `Settings` (pydantic-settings, prefix `TYPEBOT_`). Never read `os.environ` directly inside code — always plumb through a `Settings` instance.

Env vars:
- `TYPEBOT_API_BASE_URL` — viewer host
- `TYPEBOT_BUILDER_BASE_URL` — builder host (optional, falls back to viewer)
- `TYPEBOT_API_TOKEN` — bearer (optional)
- `TYPEBOT_TENANT` — `x-tenant` header (optional)
- `TYPEBOT_TIMEOUT_SECONDS` — httpx timeout
- `TYPEBOT_INCLUDE_DRAFTS` — opt-in `X-Include-Drafts: true`
- `TYPEBOT_ALLOW_WRITES` — opt-in to mutating tools

## Conventions

- **Async only.** Every service function is async; tools are async too. Do not introduce blocking IO.
- **No mutable default args.** Use `None` and substitute inside.
- **EAFP error handling.** Catch specific httpx errors → raise `TypebotHTTPError`. Don't bare-except.
- **Type hints everywhere.** `pyright` runs in standard mode and is expected to stay at 0 errors.
- **Comments are rare.** Only when *why* is non-obvious. Don't narrate.
- **Tests are hermetic.** Always mock HTTP via `respx`. No live API calls.
- **Snake_case in Python, camelCase on the wire.** Conversion happens in `services/*.py` payloads — keep it there, do not push it into MCP tool signatures.
- **Errors via `ToolError`, not envelopes.** Service layer raises `TypebotHTTPError`; tool layer wraps in `http_errors_as_tool_errors` so FastMCP emits a JSON-RPC response with `isError: true`. Never return a custom `{"ok": False, ...}` payload — clients keying on `isError` cannot detect it.
- **Tools own no state.** Closure-captured `AppContext` only. No module-level mutables. No `Context: Context` parameter — that path doesn't survive `mcp.call_tool()` from tests.

## Auth surface

Bearer token + `x-tenant` header (matches the existing TS `/api/mcp` endpoint). `X-Include-Drafts: true` is opt-in via `TYPEBOT_INCLUDE_DRAFTS=true`. Cognito JWT is **not** supported here — use the TS endpoint for embedded mode.

## Transports

- `stdio` — default, for Claude Desktop / IDE clients.
- `streamable-http` — production HTTP, `stateless_http=True` + `json_response=True` by default (SDK guidance).
- `sse` — supported as a fallback; deprecated upstream, do not document for new users.

## Don't

- Don't reimplement the `/api/mcp` JSON-RPC handler in Python — this package proxies the REST surface, not the MCP-over-Prisma path.
- Don't add Prisma/DB access. The package is HTTP-only on purpose.
- Don't skip the four-check pipeline (`ruff check`, `ruff format`, `pyright`, `pytest`). All must be green.
- Don't bypass `Settings`. No direct env reads.
- Don't introduce sync HTTP. Async all the way down.
- Don't reintroduce a `TypebotClient` class. Services are module-level async functions, not methods on a stateful object.
- Don't return `{"ok": False, ...}` envelopes from tools. Raise `ToolError` (via the `http_errors_as_tool_errors` adapter).
- Don't take `Context` as a tool parameter. Closure-capture `AppContext` from `register(mcp, app)` instead — `Context.request_context.lifespan_context` is unavailable when tests call `mcp.call_tool()` directly.
- Don't update only one of `CLAUDE.md` / `README.md`. They drift fast — touch both in the same change.

## When stuck

- Schema source of truth lives in TS at `packages/schemas/features/chat/schema.ts` (`startChatInputSchema`, `continueChatResponseSchema`). Mirror field names there.
- The TS reference handler is `apps/builder/src/pages/api/mcp.ts` — useful for header semantics (`x-tenant`, `X-Include-Drafts`) and JSON-RPC error shapes if a tool ever needs to mimic them.
- Official Python SDK docs: <https://modelcontextprotocol.github.io/python-sdk/>.
- FastMCP tool error contract: <https://gofastmcp.com/clients/tools>. `mcp.server.fastmcp.exceptions.ToolError` is the protocol-correct way to fail a tool call.
