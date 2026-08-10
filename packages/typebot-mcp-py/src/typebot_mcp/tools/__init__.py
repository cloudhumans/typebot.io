"""MCP tool registration. ``register_all`` wires every domain module."""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from typebot_mcp.config import Settings
from typebot_mcp.context import AppContext
from typebot_mcp.tools import (
    analytics,
    chat,
    folders,
    results_read,
    results_write,
    typebots_read,
    typebots_write,
    workspaces,
)


def register_all(mcp: FastMCP, cfg: Settings, app: AppContext) -> None:
    """Register every always-on tool, plus write tools when allowed."""
    chat.register(mcp, app)
    typebots_read.register(mcp, app)
    results_read.register(mcp, app)
    analytics.register(mcp, app)
    folders.register(mcp, app)
    workspaces.register(mcp, app)
    if cfg.allow_writes:
        typebots_write.register(mcp, app)
        results_write.register(mcp, app)


__all__ = ["register_all"]
