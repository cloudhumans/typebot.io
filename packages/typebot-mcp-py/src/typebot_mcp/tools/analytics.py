"""Analytics MCP tools."""
# pyright: reportUnusedFunction=false

from __future__ import annotations

from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

from typebot_mcp.context import AppContext
from typebot_mcp.errors import http_errors_as_tool_errors
from typebot_mcp.services import analytics as analytics_service


def register(mcp: FastMCP, app: AppContext) -> None:
    """Register the always-on analytics tools."""

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
        ),
    )
    async def get_analytics_stats(
        typebot_id: Annotated[
            str,
            Field(description="Internal typebot ID whose analytics to fetch."),
        ],
        time_filter: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    "Preset time window. Typical values: 'today', 'last7Days', "
                    "'lastMonth', 'lastYear'. None returns all-time stats."
                ),
            ),
        ] = None,
        time_zone: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    "IANA time zone (e.g. 'America/Sao_Paulo', 'Europe/Berlin') used "
                    "to bucket day boundaries. None means UTC."
                ),
            ),
        ] = None,
    ) -> dict[str, Any]:
        """Fetch AGGREGATE analytics for a typebot (totals, not per-session detail).

        Returns headline counters — total views, starts, completions, plus
        per-block drop-off counts — over the requested window. Use for
        dashboards and 'how is this bot performing overall' questions.

        WHEN TO USE THIS vs `list_results` + `get_result`:
        - `get_analytics_stats` — aggregated metrics, no per-user data.
        - `list_results` / `get_result` — per-session inspection of who
          answered what.
        """
        async with http_errors_as_tool_errors("get_analytics_stats"):
            return await analytics_service.get_analytics_stats(
                app.builder, typebot_id, time_filter=time_filter, time_zone=time_zone
            )
