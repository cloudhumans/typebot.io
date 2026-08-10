"""Folders endpoint (builder)."""

from __future__ import annotations

from typing import Any

import httpx

from typebot_mcp.transport import request


async def list_folders(
    builder: httpx.AsyncClient,
    *,
    workspace_id: str,
    parent_folder_id: str | None = None,
) -> dict[str, Any]:
    """Wraps ``GET /api/v1/folders``."""
    params = {"workspaceId": workspace_id, "parentFolderId": parent_folder_id}
    return await request(builder, "GET", "/api/v1/folders", params=params)
