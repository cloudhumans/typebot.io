"""Typebot management (builder) endpoints — list / get / create / update / publish."""

from __future__ import annotations

from typing import Any

import httpx

from typebot_mcp.transport import request


async def list_typebots(
    builder: httpx.AsyncClient,
    *,
    workspace_id: str | None = None,
    folder_id: str | None = None,
    include_drafts: bool = False,
) -> dict[str, Any]:
    """Wraps ``GET /api/v1/typebots``.

    The upstream REST endpoint ignores the ``X-Include-Drafts`` header
    (only the TS ``/api/mcp`` handler honours it), so the draft filter
    runs client-side after the call.
    """
    params = {"workspaceId": workspace_id, "folderId": folder_id}
    data = await request(builder, "GET", "/api/v1/typebots", params=params)
    if not include_drafts:
        typebots = data.get("typebots")
        if isinstance(typebots, list):
            data["typebots"] = [
                tb for tb in typebots if isinstance(tb, dict) and tb.get("publishedTypebotId")
            ]
    return data


async def get_typebot(builder: httpx.AsyncClient, typebot_id: str) -> dict[str, Any]:
    """Wraps ``GET /api/v1/typebots/{typebotId}``."""
    return await request(builder, "GET", f"/api/v1/typebots/{typebot_id}")


async def get_published_typebot(builder: httpx.AsyncClient, typebot_id: str) -> dict[str, Any]:
    """Wraps ``GET /api/v1/typebots/{typebotId}/publishedTypebot``."""
    return await request(
        builder,
        "GET",
        f"/api/v1/typebots/{typebot_id}/publishedTypebot",
    )


async def create_typebot(
    builder: httpx.AsyncClient,
    *,
    workspace_id: str,
    typebot: dict[str, Any],
) -> dict[str, Any]:
    """Wraps ``POST /api/v1/typebots``."""
    payload = {"workspaceId": workspace_id, "typebot": typebot}
    return await request(builder, "POST", "/api/v1/typebots", payload=payload)


async def update_typebot(
    builder: httpx.AsyncClient,
    typebot_id: str,
    *,
    typebot: dict[str, Any],
) -> dict[str, Any]:
    """Wraps ``PATCH /api/v1/typebots/{typebotId}``."""
    return await request(
        builder,
        "PATCH",
        f"/api/v1/typebots/{typebot_id}",
        payload={"typebot": typebot},
    )


async def publish_typebot(builder: httpx.AsyncClient, typebot_id: str) -> dict[str, Any]:
    """Wraps ``POST /api/v1/typebots/{typebotId}/publish``."""
    return await request(builder, "POST", f"/api/v1/typebots/{typebot_id}/publish")


async def unpublish_typebot(builder: httpx.AsyncClient, typebot_id: str) -> dict[str, Any]:
    """Wraps ``POST /api/v1/typebots/{typebotId}/unpublish``."""
    return await request(builder, "POST", f"/api/v1/typebots/{typebot_id}/unpublish")


async def delete_typebot(builder: httpx.AsyncClient, typebot_id: str) -> dict[str, Any]:
    """Wraps ``DELETE /api/v1/typebots/{typebotId}``."""
    return await request(builder, "DELETE", f"/api/v1/typebots/{typebot_id}")
