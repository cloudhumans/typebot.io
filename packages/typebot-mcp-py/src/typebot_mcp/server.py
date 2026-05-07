"""FastMCP server factory.

Wires upstream HTTP clients to the modular tool registry. Every tool
definition lives under :mod:`typebot_mcp.tools`; this file only assembles
the FastMCP instance and arranges client cleanup on shutdown.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from mcp.server.fastmcp import FastMCP

from typebot_mcp.config import Settings
from typebot_mcp.lifespan import open_clients
from typebot_mcp.tools import register_all


def build_server(
    settings: Settings | None = None,
    *,
    name: str = "typebot-mcp",
    stateless_http: bool = True,
    json_response: bool = True,
) -> FastMCP:
    """Create a configured FastMCP server.

    Always registers chat + read tools. Mutating tools
    (create/update/delete/publish/unpublish) are only registered when
    ``settings.allow_writes`` is ``True``.

    The upstream HTTP clients are constructed eagerly and shared across
    every tool call. FastMCP's lifespan closes them on shutdown.
    """
    cfg = settings or Settings()
    app = open_clients(cfg)

    @asynccontextmanager
    async def lifespan(_: FastMCP) -> AsyncIterator[None]:
        try:
            yield
        finally:
            await app.viewer.aclose()
            await app.builder.aclose()

    mcp = FastMCP(
        name,
        stateless_http=stateless_http,
        json_response=json_response,
        lifespan=lifespan,
    )
    register_all(mcp, cfg, app)
    return mcp
