"""Mutating MCP tools for chat session results (gated by allow_writes)."""
# pyright: reportUnusedFunction=false

from __future__ import annotations

from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

from typebot_mcp.context import AppContext
from typebot_mcp.errors import http_errors_as_tool_errors
from typebot_mcp.services import results as results_service


def register(mcp: FastMCP, app: AppContext) -> None:
    """Register results mutating tools (only called when allow_writes=True)."""

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=True,
            idempotentHint=True,
        ),
    )
    async def delete_results(
        typebot_id: Annotated[
            str,
            Field(description="Internal typebot ID whose results will be deleted."),
        ],
        result_ids: Annotated[
            list[str] | None,
            Field(
                default=None,
                description=(
                    "Specific result IDs to delete. None (default) deletes EVERY "
                    "result for the bot — caller is opting in to bulk delete. "
                    "An empty list `[]` is treated as a no-op (returns `{}` "
                    "without hitting the API) to avoid an ambiguous mass-delete."
                ),
            ),
        ] = None,
    ) -> dict[str, Any]:
        """Delete chat results (recorded sessions) for a typebot. IRREVERSIBLE.

        With `result_ids=None`, deletes EVERY result for the bot. With a
        non-empty list, deletes only those specific results. Empty list
        `[]` is intentionally a no-op so callers do not accidentally
        wipe an entire result history through an empty filter.

        The typebot definition itself is unaffected — only the result
        history is removed. Use `delete_typebot` to remove the bot too.
        """
        async with http_errors_as_tool_errors("delete_results"):
            return await results_service.delete_results(
                app.builder, typebot_id, result_ids=result_ids
            )
