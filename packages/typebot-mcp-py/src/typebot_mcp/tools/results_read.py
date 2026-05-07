"""Read-only MCP tools for chat session results."""
# pyright: reportUnusedFunction=false

from __future__ import annotations

from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

from typebot_mcp.context import AppContext
from typebot_mcp.errors import http_errors_as_tool_errors
from typebot_mcp.services import results as results_service

READ_ANNOTATIONS = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
)


def register(mcp: FastMCP, app: AppContext) -> None:
    """Register the always-on result read tools."""

    @mcp.tool(annotations=READ_ANNOTATIONS)
    async def list_results(
        typebot_id: Annotated[
            str,
            Field(description="Internal typebot ID whose chat results to list."),
        ],
        limit: Annotated[
            int | None,
            Field(
                default=None,
                ge=1,
                le=200,
                description=(
                    "Max items in this page (1-200). None lets the server pick its "
                    "default. Use together with `cursor` to walk all results."
                ),
            ),
        ] = None,
        cursor: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    "Opaque pagination cursor copied from the prior response's "
                    "`nextCursor`. None for the first page."
                ),
            ),
        ] = None,
    ) -> dict[str, Any]:
        """List recorded results (one per chat session) for a typebot, paginated.

        Each result represents a single user run-through of the bot — collected
        answers, completion state, timestamps. Use this to enumerate sessions
        for a bot, then drill in with `get_result` (user answers) or
        `get_result_logs` (block-level execution trace).

        For aggregate metrics (total starts, completions, drop-off) use
        `get_analytics_stats` instead — this endpoint is per-session.
        """
        async with http_errors_as_tool_errors("list_results"):
            return await results_service.list_results(
                app.builder, typebot_id, limit=limit, cursor=cursor
            )

    @mcp.tool(annotations=READ_ANNOTATIONS)
    async def get_result(
        typebot_id: Annotated[
            str,
            Field(description="Internal typebot ID owning the result."),
        ],
        result_id: Annotated[
            str,
            Field(
                description=(
                    "Result ID — obtain from `list_results` or from the `resultId` "
                    "field returned by `start_chat` / `start_chat_preview`."
                )
            ),
        ],
    ) -> dict[str, Any]:
        """Fetch a single chat result (one user's session) including all collected answers.

        Returns the variables and answers the user supplied during their run,
        plus completion metadata. Use this to inspect what a SPECIFIC user
        answered.

        WHEN TO USE THIS vs `get_result_logs`:
        - `get_result` — user-facing answers (what they said).
        - `get_result_logs` — bot-side execution trace (what the bot did,
          which blocks ran, integration call results, errors).
        """
        async with http_errors_as_tool_errors("get_result"):
            return await results_service.get_result(app.builder, typebot_id, result_id)

    @mcp.tool(annotations=READ_ANNOTATIONS)
    async def get_result_logs(
        typebot_id: Annotated[
            str,
            Field(description="Internal typebot ID owning the result."),
        ],
        result_id: Annotated[
            str,
            Field(description="Result ID whose execution log to fetch."),
        ],
    ) -> dict[str, Any]:
        """Fetch the block-by-block execution log for a single result.

        Returns ordered log entries describing what the bot did during that
        session — block executions, integration/webhook calls, errors. Use
        for debugging WHY a session ended where it did or which integration
        failed.

        For the user's collected answers (the data side of the same session),
        call `get_result` instead.
        """
        async with http_errors_as_tool_errors("get_result_logs"):
            return await results_service.get_result_logs(app.builder, typebot_id, result_id)
