"""Typed application context yielded by the FastMCP lifespan.

Tools reach the active :class:`AppContext` through the FastMCP
``Context`` parameter::

    @mcp.tool()
    async def my_tool(ctx: Context) -> dict[str, Any]:
        app: AppContext = ctx.request_context.lifespan_context
        return await some_service.do(app.viewer)
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from typebot_mcp.config import Settings


@dataclass(frozen=True)
class AppContext:
    """Shared resources available to every MCP tool call.

    Both clients are owned by the FastMCP lifespan and closed on shutdown.
    """

    settings: Settings
    viewer: httpx.AsyncClient
    builder: httpx.AsyncClient
