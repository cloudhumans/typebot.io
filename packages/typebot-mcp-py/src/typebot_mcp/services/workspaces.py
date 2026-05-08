"""Workspaces + credentials endpoints (builder)."""

from __future__ import annotations

from typing import Any

import httpx

from typebot_mcp.transport import request


async def list_workspaces(builder: httpx.AsyncClient) -> dict[str, Any]:
    """Wraps ``GET /api/v1/workspaces``."""
    return await request(builder, "GET", "/api/v1/workspaces")


async def list_credentials(
    builder: httpx.AsyncClient,
    *,
    workspace_id: str,
    credential_type: str,
) -> dict[str, Any]:
    """Wraps ``GET /api/v1/credentials``.

    Returns ``{credentials: [{id, name}]}`` only — secret material is
    never exposed by the upstream endpoint.
    """
    params = {"workspaceId": workspace_id, "type": credential_type}
    return await request(builder, "GET", "/api/v1/credentials", params=params)
