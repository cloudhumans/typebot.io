"""Adapt internal HTTP failures to MCP-protocol tool errors.

FastMCP's ``ToolError`` is the protocol-correct way to fail a tool call —
the framework converts it to a JSON-RPC response with ``isError: true``.
``{"ok": False, ...}`` envelopes return as success at the protocol layer,
which clients keying on ``isError`` cannot detect.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from mcp.server.fastmcp.exceptions import ToolError

from typebot_mcp.exceptions import TypebotHTTPError


@asynccontextmanager
async def http_errors_as_tool_errors(operation: str) -> AsyncGenerator[None]:
    """Translate :class:`TypebotHTTPError` into an MCP :class:`ToolError`.

    Body is truncated to keep tool error messages bounded — full detail
    stays in the original exception chained via ``__cause__``.
    """
    try:
        yield
    except TypebotHTTPError as exc:
        body = (exc.body or "")[:500]
        raise ToolError(f"{operation} failed: HTTP {exc.status_code} {exc} body={body!r}") from exc
