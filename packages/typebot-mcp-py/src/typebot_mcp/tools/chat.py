"""MCP chat tools — start, continue, preview chat sessions."""
# pyright: reportUnusedFunction=false

from __future__ import annotations

from typing import Annotated, Any, Literal

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

from typebot_mcp.context import AppContext
from typebot_mcp.errors import http_errors_as_tool_errors
from typebot_mcp.services import chat as chat_service


def register(mcp: FastMCP, app: AppContext) -> None:
    """Register the always-on chat tools."""

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
        ),
    )
    async def start_chat(
        public_id: Annotated[
            str,
            Field(
                description=(
                    "Public ID (slug) of the PUBLISHED typebot — the human-readable URL "
                    "identifier (e.g. 'support-bot-7x8'), NOT the internal database ID. "
                    "Discover via `list_typebots` then read each item's public id field."
                )
            ),
        ],
        message: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    "Initial user message. ONLY meaningful when the flow's first block "
                    "is an input block awaiting user text. Leave None otherwise — has no "
                    "effect on non-input opening blocks."
                ),
            ),
        ] = None,
        prefilled_variables: Annotated[
            dict[str, Any] | None,
            Field(
                default=None,
                description=(
                    "Map of variable name → value used to populate flow variables BEFORE "
                    "the bot runs (e.g. {'userName': 'Alex', 'plan': 'pro'}). Names must "
                    "match variables declared in the typebot."
                ),
            ),
        ] = None,
        result_id: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    "When set, the new run overwrites the existing result with this ID "
                    "instead of creating a fresh one. Use to resume / replace a specific "
                    "session record. Leave None for a new result."
                ),
            ),
        ] = None,
        is_only_registering: Annotated[
            bool,
            Field(
                default=False,
                description=(
                    "If True, only registers the session row in storage without executing "
                    "any blocks. Use for analytics / pre-creation flows. The returned "
                    "session will not contain bot messages."
                ),
            ),
        ] = False,
        text_bubble_content_format: Annotated[
            Literal["richText", "markdown"],
            Field(
                default="markdown",
                description=(
                    "Output shape for bot text bubbles. 'markdown' = plain string with "
                    "inline markdown. 'richText' = Tiptap-style structured JSON. Pick to "
                    "match how your client renders chat bubbles."
                ),
            ),
        ] = "markdown",
    ) -> dict[str, Any]:
        """Start a new chat session with a PUBLISHED typebot using its public ID.

        Use for live/production conversations against a typebot that has been
        published via `publish_typebot`. Returns `sessionId` (required for any
        subsequent `continue_chat` calls), the first batch of bot `messages`,
        any pending `input` block awaiting a user reply, and any
        `clientSideActions` the client must run.

        WHEN TO USE THIS vs alternatives:
        - `start_chat_preview` — for DRAFT (unpublished) bots by internal ID.
        - `continue_chat` — for every reply AFTER this initial start.

        Hits the viewer host (`TYPEBOT_API_BASE_URL`). Will fail if the bot
        was never published or if the public ID is wrong.
        """
        async with http_errors_as_tool_errors("start_chat"):
            return await chat_service.start_chat(
                app.viewer,
                public_id,
                message=message,
                prefilled_variables=prefilled_variables,
                result_id=result_id,
                is_only_registering=is_only_registering,
                text_bubble_content_format=text_bubble_content_format,
            )

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
        ),
    )
    async def continue_chat(
        session_id: Annotated[
            str,
            Field(
                description=(
                    "Opaque session ID returned by a prior `start_chat` or "
                    "`start_chat_preview` call (the `sessionId` field in their response). "
                    "Cannot be derived from a result_id or public_id."
                )
            ),
        ],
        message: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    "User reply to the current input block. Omit (None) when the flow is "
                    "advancing through non-input blocks (e.g. logic/redirect) and you "
                    "only want to drive it forward without sending a user answer."
                ),
            ),
        ] = None,
        text_bubble_content_format: Annotated[
            Literal["richText", "markdown"],
            Field(
                default="markdown",
                description=(
                    "Output shape for bot text bubbles. 'markdown' = plain string with "
                    "inline markdown. 'richText' = Tiptap-style structured JSON."
                ),
            ),
        ] = "markdown",
    ) -> dict[str, Any]:
        """Send the next reply in an existing chat session and advance the flow.

        Requires a session previously created by `start_chat` (published bots)
        or `start_chat_preview` (draft bots). Returns the next batch of bot
        `messages`, the next `input` block (if any), and `clientSideActions`.

        Do NOT call this without first opening a session — there is no
        implicit session creation. Repeated calls with the same `session_id`
        walk the conversation forward step by step until the flow ends.
        """
        async with http_errors_as_tool_errors("continue_chat"):
            return await chat_service.continue_chat(
                app.viewer,
                session_id,
                message=message,
                text_bubble_content_format=text_bubble_content_format,
            )

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
        ),
    )
    async def start_chat_preview(
        typebot_id: Annotated[
            str,
            Field(
                description=(
                    "Internal typebot ID (NOT the public slug). Find via "
                    "`list_typebots` and read each item's `id` field. Targets the draft "
                    "version, so works on bots that have never been published."
                )
            ),
        ],
        message: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    "Initial user message. Only meaningful when the flow's first block "
                    "is an input block awaiting user text."
                ),
            ),
        ] = None,
        prefilled_variables: Annotated[
            dict[str, Any] | None,
            Field(
                default=None,
                description=(
                    "Map of variable name → value to populate before the flow runs. "
                    "Names must match variables declared in the typebot."
                ),
            ),
        ] = None,
        text_bubble_content_format: Annotated[
            Literal["richText", "markdown"],
            Field(
                default="markdown",
                description=(
                    "Output shape for bot text bubbles. 'markdown' = plain string with "
                    "inline markdown. 'richText' = Tiptap-style structured JSON."
                ),
            ),
        ] = "markdown",
    ) -> dict[str, Any]:
        """Start a PREVIEW chat session against a DRAFT typebot by internal ID.

        Use during flow authoring/testing to exercise the in-progress draft
        without publishing. Skips public visibility checks and does not
        require `publicId` or any prior publish. Returns the same shape as
        `start_chat` (sessionId + messages + input + clientSideActions); use
        `continue_chat` to advance.

        WHEN TO USE THIS vs `start_chat`: pick this for draft/preview
        testing by internal ID; pick `start_chat` for live published flows
        addressed by public slug.
        """
        async with http_errors_as_tool_errors("start_chat_preview"):
            return await chat_service.start_chat_preview(
                app.viewer,
                typebot_id,
                message=message,
                prefilled_variables=prefilled_variables,
                text_bubble_content_format=text_bubble_content_format,
            )
