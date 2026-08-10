"""Results endpoints (builder) — list / fetch / delete chat session results."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

import httpx

from typebot_mcp.transport import request


async def list_results(
    builder: httpx.AsyncClient,
    typebot_id: str,
    *,
    limit: int | None = None,
    cursor: str | None = None,
) -> dict[str, Any]:
    """Wraps ``GET /api/v1/typebots/{typebotId}/results``."""
    params = {"limit": limit, "cursor": cursor}
    return await request(
        builder,
        "GET",
        f"/api/v1/typebots/{typebot_id}/results",
        params=params,
    )


async def get_result(builder: httpx.AsyncClient, typebot_id: str, result_id: str) -> dict[str, Any]:
    """Wraps ``GET /api/v1/typebots/{typebotId}/results/{resultId}``."""
    return await request(
        builder,
        "GET",
        f"/api/v1/typebots/{typebot_id}/results/{result_id}",
    )


async def get_result_logs(
    builder: httpx.AsyncClient, typebot_id: str, result_id: str
) -> dict[str, Any]:
    """Wraps ``GET /api/v1/typebots/{typebotId}/results/{resultId}/logs``."""
    return await request(
        builder,
        "GET",
        f"/api/v1/typebots/{typebot_id}/results/{result_id}/logs",
    )


async def delete_results(
    builder: httpx.AsyncClient,
    typebot_id: str,
    *,
    result_ids: Iterable[str] | None = None,
) -> dict[str, Any]:
    """Wraps ``DELETE /api/v1/typebots/{typebotId}/results``.

    ``result_ids=None`` deletes every result for the typebot. An empty
    list short-circuits to a no-op so callers never accidentally wipe
    history through an empty filter.
    """
    ids = list(result_ids) if result_ids is not None else None
    if ids is not None and not ids:
        return {}
    params = {"resultIds": ",".join(ids)} if ids is not None else None
    return await request(
        builder,
        "DELETE",
        f"/api/v1/typebots/{typebot_id}/results",
        params=params,
    )
