# typebot-mcp

> A small Python server that teaches your AI assistant how to talk to [Typebot](https://typebot.io) — without learning tRPC, OAuth dances, or any of the dialects [Typebot's own backend](https://github.com/baptisteArno/typebot.io) speaks fluently.

```
        +-----------+     stdio / HTTP      +---------------+      HTTPS      +----------+
        | your IDE  | <-------------------> |  typebot-mcp  | <-------------> | Typebot  |
        +-----------+        MCP            +---------------+    REST + JWT   +----------+
        Claude Code,                         (this package)                   viewer +
        Cursor, Zed,                                                          builder
        VS Code, Codex,
        Claude Desktop
```

If your editor speaks **MCP**, this package gives it 19 tools to drive Typebot like a human would: start chats, walk through flows, pull results, peek at analytics, and (if you're brave enough to flip a flag) create / edit / publish / delete typebots.

It is **not** a fork of `apps/builder/src/pages/api/mcp.ts`. That one is a Next.js handler bolted onto Prisma. This is plain HTTP-over-REST, written in async Python, and depends on **nothing** from the TS monorepo at runtime.

---

## Built on the boring, reliable stuff

- [`mcp[cli]`](https://pypi.org/project/mcp/) — the official Python SDK with FastMCP. Speaks both `stdio` and Streamable HTTP. Every MCP host targets it first, so we don't fight the protocol.
- [`httpx`](https://www.python-httpx.org) — async HTTP. Concurrent calls, no thread-pool tricks.
- [`pydantic`](https://docs.pydantic.dev) + [`pydantic-settings`](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) — env-driven 12-factor config with real validation.
- [`respx`](https://lundberg.github.io/respx/) — HTTPX mocks for hermetic tests. The CI never calls a real Typebot. Neither should `pytest` on your laptop.

No framework drama, no hand-rolled JSON-RPC, no clever metaclasses.

---

## What you get (19 tools — 13 always on, 6 gated)

The catalog is split by which Typebot host the tool talks to:

- **Chat tools** hit the **viewer** at `TYPEBOT_API_BASE_URL`.
- **Management / results / analytics** tools hit the **builder** at `TYPEBOT_BUILDER_BASE_URL` (or fall back to the viewer host when unset, which is what single-host reverse-proxy deployments want).

Every request carries `Authorization: Bearer …` and `x-tenant: …`, mirroring the auth surface of the existing TS `/api/mcp` endpoint.

### Chat — always registered (3)

| MCP tool | Wraps |
|---|---|
| `start_chat(public_id, message?, prefilled_variables?, …)` | `POST /api/v1/typebots/{publicId}/startChat` |
| `continue_chat(session_id, message?, …)` | `POST /api/v1/sessions/{sessionId}/continueChat` |
| `start_chat_preview(typebot_id, message?, …)` | `POST /api/v1/typebots/{typebotId}/preview/startChat` |

### Read — always registered (10)

| MCP tool | Wraps |
|---|---|
| `list_typebots(workspace_id?, folder_id?)` | `GET /api/v1/typebots` |
| `get_typebot(typebot_id)` | `GET /api/v1/typebots/{typebotId}` |
| `get_published_typebot(typebot_id)` | `GET /api/v1/typebots/{typebotId}/publishedTypebot` |
| `list_results(typebot_id, limit?, cursor?)` | `GET /api/v1/typebots/{typebotId}/results` |
| `get_result(typebot_id, result_id)` | `GET /api/v1/typebots/{typebotId}/results/{resultId}` |
| `get_result_logs(typebot_id, result_id)` | `GET /api/v1/typebots/{typebotId}/results/{resultId}/logs` |
| `get_analytics_stats(typebot_id, time_filter?, time_zone?)` | `GET /api/v1/typebots/{typebotId}/analytics/stats` |
| `list_folders(workspace_id, parent_folder_id?)` | `GET /api/v1/folders` |
| `list_workspaces()` | `GET /api/v1/workspaces` |
| `list_credentials(workspace_id, credential_type)` | `GET /api/v1/credentials` |

> `list_typebots` filters drafts client-side when `TYPEBOT_INCLUDE_DRAFTS=false` (the default). The upstream REST route ignores `X-Include-Drafts` — only the TS `/api/mcp` handler honours it — so we drop unpublished entries here. Set `TYPEBOT_INCLUDE_DRAFTS=true` to see everything.

### Write — only when `TYPEBOT_ALLOW_WRITES=true` (6)

| MCP tool | Wraps |
|---|---|
| `create_typebot(workspace_id, typebot)` | `POST /api/v1/typebots` |
| `update_typebot(typebot_id, typebot)` | `PATCH /api/v1/typebots/{typebotId}` |
| `publish_typebot(typebot_id)` | `POST /api/v1/typebots/{typebotId}/publish` |
| `unpublish_typebot(typebot_id)` | `POST /api/v1/typebots/{typebotId}/unpublish` |
| `delete_typebot(typebot_id)` | `DELETE /api/v1/typebots/{typebotId}` |
| `delete_results(typebot_id, result_ids?)` | `DELETE /api/v1/typebots/{typebotId}/results` |

The flag defaults to `false`. Mutations stay un-armed unless you opt in. Future you, three months from now, in production, will thank present you.

---

## Install

```bash
# pip
pip install -e .[dev]

# uv (faster, recommended)
uv pip install -e .[dev]
```

Python 3.10+ at runtime. The dev `.venv` uses 3.12.

---

## Configure

All settings come from environment variables (or a local `.env`). No surprise lookups, no hidden files.

```bash
export TYPEBOT_API_BASE_URL="http://localhost:3003"     # viewer host (chat)
export TYPEBOT_BUILDER_BASE_URL="http://localhost:3002" # builder host (mgmt) — optional
export TYPEBOT_API_TOKEN="<api token>"
export TYPEBOT_TENANT="acme-inc"
export TYPEBOT_INCLUDE_DRAFTS="false"                   # opt-in to drafts
export TYPEBOT_ALLOW_WRITES="false"                     # opt-in to mutations
export TYPEBOT_TIMEOUT_SECONDS="30"
```

| Var | Default | What it does |
|---|---|---|
| `TYPEBOT_API_BASE_URL` | `http://localhost:3003` | Viewer host; chat tools target it. Override for any non-local Typebot. |
| `TYPEBOT_BUILDER_BASE_URL` | falls back to `TYPEBOT_API_BASE_URL` | Builder host; management/results/analytics tools target it. |
| `TYPEBOT_API_TOKEN` | _empty_ | Bearer token. Empty means anonymous. |
| `TYPEBOT_TENANT` | _empty_ | Sent as `x-tenant`. Required for multi-tenant Typebot deployments. |
| `TYPEBOT_INCLUDE_DRAFTS` | `false` | Include unpublished typebots in `list_typebots`. |
| `TYPEBOT_ALLOW_WRITES` | `false` | Register the 6 mutating tools. Off by default for shared MCP deployments. |
| `TYPEBOT_TIMEOUT_SECONDS` | `30` | httpx request timeout. |

---

## Run it standalone

```bash
# stdio — for Claude Desktop, IDEs, Claude Code, Cursor, etc.
typebot-mcp --transport stdio

# Streamable HTTP — for remote / production
typebot-mcp --transport streamable-http --host 0.0.0.0 --port 8000
```

Defaults for HTTP (`stateless_http=True`, `json_response=True`) follow the official Python SDK guidance for production: stateless servers scale horizontally, JSON skips SSE framing for plain request/response tools.

---

## Wire it up to your editor

Each host stores its MCP config in a slightly different place with a slightly different shape — because of course it does. Pick yours.

In every example below, replace the `env` block with values that point at your actual Typebot deployment. The viewer host (`TYPEBOT_API_BASE_URL`) is the only one strictly required; everything else falls back to a sensible default.

If you're running directly from a checkout (no global install), swap `"command": "typebot-mcp"` for the `uv` form:

```json
"command": "uv",
"args": ["run", "--directory", "/absolute/path/to/typebot-mcp-py", "typebot-mcp", "--transport", "stdio"]
```

`uv run` re-resolves the source on every spawn, so you don't need to re-install on each edit.

### Claude Code CLI

The `claude` CLI ships a wizard. Stdio servers use a `--` separator: everything after `--` is the launch command.

```bash
# user scope (available in every project on this machine)
claude mcp add typebot -s user \
  -e TYPEBOT_API_BASE_URL=http://localhost:3003 \
  -e TYPEBOT_BUILDER_BASE_URL=http://localhost:3002 \
  -e TYPEBOT_API_TOKEN=xxx \
  -e TYPEBOT_TENANT=acme-inc \
  -- typebot-mcp --transport stdio

# project scope (writes to ./.mcp.json so the team shares it)
claude mcp add typebot -s project -- typebot-mcp --transport stdio
```

Or edit `.mcp.json` (project) / `~/.claude.json` (user) directly:

```json
{
  "mcpServers": {
    "typebot": {
      "type": "stdio",
      "command": "typebot-mcp",
      "args": ["--transport", "stdio"],
      "env": {
        "TYPEBOT_API_BASE_URL": "http://localhost:3003",
        "TYPEBOT_BUILDER_BASE_URL": "http://localhost:3002",
        "TYPEBOT_API_TOKEN": "xxx",
        "TYPEBOT_TENANT": "acme-inc",
        "TYPEBOT_INCLUDE_DRAFTS": "false",
        "TYPEBOT_ALLOW_WRITES": "false"
      }
    }
  }
}
```

Verify with `claude mcp list` — `typebot` should report `connected`.

### Claude Desktop

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Open it from inside the app via **Settings → Developer → Edit Config**.

```json
{
  "mcpServers": {
    "typebot": {
      "command": "typebot-mcp",
      "args": ["--transport", "stdio"],
      "env": {
        "TYPEBOT_API_BASE_URL": "http://localhost:3003",
        "TYPEBOT_BUILDER_BASE_URL": "http://localhost:3002",
        "TYPEBOT_API_TOKEN": "xxx",
        "TYPEBOT_TENANT": "acme-inc"
      }
    }
  }
}
```

Quit and relaunch Claude Desktop — MCP servers only load at startup. Claude Desktop only supports stdio, so the `streamable-http` transport is not an option here.

### Cursor

Project scope: `.cursor/mcp.json` in the repo root.
Global scope: `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "typebot": {
      "command": "typebot-mcp",
      "args": ["--transport", "stdio"],
      "env": {
        "TYPEBOT_API_BASE_URL": "http://localhost:3003",
        "TYPEBOT_BUILDER_BASE_URL": "http://localhost:3002",
        "TYPEBOT_API_TOKEN": "xxx",
        "TYPEBOT_TENANT": "acme-inc"
      }
    }
  }
}
```

Project config wins over global if both define the same server. Fully quit and reopen Cursor after editing — servers only load at startup, and a single misplaced comma will break the entire file.

### VS Code (with GitHub Copilot)

VS Code uses a **different root key** than Cursor: `servers`, not `mcpServers`. It also wants an explicit `"type": "stdio"`.

User scope: open the Command Palette and run **MCP: Open User Configuration**.
Workspace scope: `.vscode/mcp.json` in the repo root.

```json
{
  "servers": {
    "typebot": {
      "type": "stdio",
      "command": "typebot-mcp",
      "args": ["--transport", "stdio"],
      "env": {
        "TYPEBOT_API_BASE_URL": "http://localhost:3003",
        "TYPEBOT_BUILDER_BASE_URL": "http://localhost:3002",
        "TYPEBOT_API_TOKEN": "xxx",
        "TYPEBOT_TENANT": "acme-inc"
      }
    }
  }
}
```

If you're running the server in Docker, do **not** pass `-d` — VS Code needs the process in the foreground to communicate over stdin/stdout.

### Zed

Zed calls them **context servers** (not MCP servers) and stores them under `context_servers` in `~/.config/zed/settings.json`. Saving the file restarts the child process automatically — no editor restart needed.

```json
{
  "context_servers": {
    "typebot": {
      "source": "custom",
      "command": "typebot-mcp",
      "args": ["--transport", "stdio"],
      "env": {
        "TYPEBOT_API_BASE_URL": "http://localhost:3003",
        "TYPEBOT_BUILDER_BASE_URL": "http://localhost:3002",
        "TYPEBOT_API_TOKEN": "xxx",
        "TYPEBOT_TENANT": "acme-inc"
      }
    }
  }
}
```

### OpenAI Codex CLI

Codex stores MCP config in **TOML**, not JSON. User scope: `~/.codex/config.toml`. Project scope: `.codex/config.toml` in a trusted project.

```toml
[mcp_servers.typebot]
command = "typebot-mcp"
args = ["--transport", "stdio"]
env = { TYPEBOT_API_BASE_URL = "http://localhost:3003", TYPEBOT_BUILDER_BASE_URL = "http://localhost:3002", TYPEBOT_API_TOKEN = "xxx", TYPEBOT_TENANT = "acme-inc" }
```

Or interactively: `codex mcp` walks you through it.

### Quick reference

| Host | File | Root key | Transport hint |
|---|---|---|---|
| Claude Code CLI | `.mcp.json` (project) / `~/.claude.json` (user) | `mcpServers` | `"type": "stdio"` (optional) |
| Claude Desktop | `claude_desktop_config.json` | `mcpServers` | stdio only |
| Cursor | `.cursor/mcp.json` | `mcpServers` | inferred from `command` |
| VS Code | `.vscode/mcp.json` | `servers` | `"type": "stdio"` (required) |
| Zed | `settings.json` | `context_servers` | inferred (`source: "custom"`) |
| Codex CLI | `~/.codex/config.toml` | `[mcp_servers.<name>]` | inferred |

---

## Programmatic use

If you'd rather skip MCP entirely and call the underlying client from Python:

```python
import asyncio

from typebot_mcp import Settings, TypebotClient

async def main() -> None:
    async with TypebotClient(Settings()) as client:
        result = await client.start_chat(
            "my-public-id",
            message="hello",
            prefilled_variables={"Name": "Ada"},
        )
        print(result["sessionId"])

asyncio.run(main())
```

`TypebotClient` is fully async, raises `TypebotHTTPError` on non-2xx, and otherwise returns the parsed JSON body verbatim.

---

## Tests

```bash
pytest
```

All tests are hermetic — `respx` intercepts every HTTP call. No live Typebot instance required, no flakiness from network blips, and CI runs in roughly the time it takes to read this sentence.

---

## Layout

```
src/typebot_mcp/
├── __init__.py        re-exports
├── __main__.py        CLI entry
├── config.py          Settings (pydantic-settings)
├── client.py          TypebotClient (httpx)
├── server.py          FastMCP server + tools
└── exceptions.py      TypebotError hierarchy
tests/
├── conftest.py
├── test_client.py
├── test_client_management.py
└── test_server.py
```

---

## Why this design (the short version)

- **Proxy, not re-export of `/api/mcp`.** That endpoint is a Node-only Next.js handler that talks to Prisma directly. Reimplementing the chat surface as plain REST keeps this package independent of the TS monorepo and avoids tunnel-through-tunnel JSON-RPC.
- **FastMCP over hand-rolled JSON-RPC.** `mcp[cli]` already speaks both transports, validates tool schemas from type hints, and handles the lifecycle handshake. We write zero protocol code.
- **Async all the way down.** Typebot tools can be slow (LLM calls, integrations). Blocking I/O would serialize concurrent agent turns.
- **Stateless HTTP by default.** Recommended by the SDK for production. Any state that exists lives inside Typebot itself (the `sessionId`).
- **Writes off by default.** Because letting an agent freely `delete_typebot` on first contact is one of those decisions you'd un-make in a heartbeat.

---

## License

AGPL-3.0-or-later, same as the rest of the Typebot fork (and as declared in `pyproject.toml`).
