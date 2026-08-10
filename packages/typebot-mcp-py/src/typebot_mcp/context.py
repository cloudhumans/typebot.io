"""Typed application context yielded by the FastMCP lifespan.

Tools in this package do **not** take a FastMCP ``Context`` parameter —
that path doesn't survive ``mcp.call_tool()`` from tests. Each tool
module exposes a ``register(mcp, app)`` function and the inner tool
closes over ``app`` directly::

    def register(mcp: FastMCP, app: AppContext) -> None:
        @mcp.tool()
        async def my_tool() -> dict[str, Any]:
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
