# CLAUDE.md — typebot-mcp (Python)

Guidance for Claude Code when working inside `packages/typebot-mcp-py/`.

## What this is

Python MCP server that proxies Typebot's viewer REST API as MCP tools. Built on the official `mcp[cli]` SDK (FastMCP). Independent of the TS `/api/mcp` endpoint — talks straight to `/api/v1/...`.

## Layout

```
packages/typebot-mcp-py/
├── pyproject.toml          hatchling build, ruff/pyright/pytest config
├── README.md               public-facing docs
├── .env.example            runtime env template
├── .venv/                  local virtualenv (uv-managed, gitignored)
├── src/typebot_mcp/
│   ├── __init__.py         re-exports (Settings, TypebotClient, build_server, exceptions)
│   ├── __main__.py         CLI entry — `typebot-mcp` script + `python -m typebot_mcp`
│   ├── config.py           Settings via pydantic-settings, env prefix TYPEBOT_
│   ├── client.py           TypebotClient (async httpx wrapper)
│   ├── server.py           build_server() — FastMCP + tool definitions
│   └── exceptions.py       TypebotError / TypebotHTTPError
└── tests/
    ├── conftest.py                   settings + settings_writable fixtures
    ├── test_client.py                chat respx tests
    ├── test_client_management.py     management/results respx tests
    └── test_server.py                FastMCP tool registration + invocation tests
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

## MCP tools exposed

The catalog is split by host:

- **Chat tools** target the **viewer** (`TYPEBOT_API_BASE_URL`, e.g. `http://localhost:3003`). Wired through `self._chat` in `client.py`.
- **Management/results/analytics tools** target the **builder** (`TYPEBOT_BUILDER_BASE_URL`, e.g. `http://localhost:3002`). Wired through `self._builder` in `client.py`. `builder_url_str` falls back to `base_url_str` when the env var is unset.

### Always registered (13)

Chat (3): `start_chat`, `continue_chat`, `start_chat_preview`.
Read (10): `list_typebots`, `get_typebot`, `get_published_typebot`, `list_results`, `get_result`, `get_result_logs`, `get_analytics_stats`, `list_folders`, `list_workspaces`, `list_credentials`.

### Gated behind `TYPEBOT_ALLOW_WRITES=true` (6)

`create_typebot`, `update_typebot`, `publish_typebot`, `unpublish_typebot`, `delete_typebot`, `delete_results`. Registration is a plain `if cfg.allow_writes:` block in `build_server()`.

### Adding a new tool

1. Add the HTTP method to `client.py`. Pick `self._chat` or `self._builder` for the underlying client. Use the shared `_request(client, method, path, payload=?, params=?)` helper — it handles snake_case → camelCase conversion, drops `None`s, error mapping, and JSON parsing (lists wrap into `{"items": [...]}`).
2. Decorate a new `@mcp.tool()` function inside `build_server()` in `server.py`.
3. If the tool is mutating, place it inside the `if cfg.allow_writes:` block.
4. Wrap the call in `_call(operation, fn)` so `TypebotHTTPError` becomes a structured `{"ok": False, ...}` payload.
5. Write a `respx`-mocked unit test in `tests/test_client.py` (chat) or `tests/test_client_management.py` (builder) and a tool-invocation test in `tests/test_server.py`. Update the `ALWAYS_ON_TOOLS`/`WRITE_TOOLS` sets there.

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

- **Async only.** Every public method on `TypebotClient` is async; tools are async too. Do not introduce blocking IO.
- **No mutable default args.** Use `None` and substitute inside.
- **EAFP error handling.** Catch specific httpx errors → raise `TypebotHTTPError`. Don't bare-except.
- **Type hints everywhere.** `pyright` runs in standard mode and is expected to stay at 0 errors.
- **Comments are rare.** Only when *why* is non-obvious. Don't narrate.
- **Tests are hermetic.** Always mock HTTP via `respx`. No live API calls.
- **Snake_case in Python, camelCase on the wire.** Conversion happens in `client.py` payloads — keep it there, do not push it into the MCP tool signatures.

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

## When stuck

- Schema source of truth lives in TS at `packages/schemas/features/chat/schema.ts` (`startChatInputSchema`, `continueChatResponseSchema`). Mirror field names there.
- The TS reference handler is `apps/builder/src/pages/api/mcp.ts` — useful for header semantics (`x-tenant`, `X-Include-Drafts`) and JSON-RPC error shapes if a tool ever needs to mimic them.
- Official Python SDK docs: <https://modelcontextprotocol.github.io/python-sdk/>.
