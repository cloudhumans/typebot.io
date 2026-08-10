"""Analytics endpoints (builder) — aggregate stats per typebot."""

from __future__ import annotations

from typing import Any

import httpx

from typebot_mcp.transport import request


async def get_analytics_stats(
    builder: httpx.AsyncClient,
    typebot_id: str,
    *,
    time_filter: str | None = None,
    time_zone: str | None = None,
) -> dict[str, Any]:
    """Wraps ``GET /api/v1/typebots/{typebotId}/analytics/stats``."""
    params = {"timeFilter": time_filter, "timeZone": time_zone}
    return await request(
        builder,
        "GET",
        f"/api/v1/typebots/{typebot_id}/analytics/stats",
        params=params,
    )
