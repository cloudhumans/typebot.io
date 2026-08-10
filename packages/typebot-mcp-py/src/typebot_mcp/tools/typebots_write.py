"""Mutating MCP tools for typebot definitions (gated by allow_writes)."""
# pyright: reportUnusedFunction=false

from __future__ import annotations

from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

from typebot_mcp.context import AppContext
from typebot_mcp.errors import http_errors_as_tool_errors
from typebot_mcp.services import typebots as typebot_service


def register(mcp: FastMCP, app: AppContext) -> None:
    """Register typebot mutating tools (only called when allow_writes=True)."""

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
        ),
    )
    async def create_typebot(
        workspace_id: Annotated[
            str,
            Field(description="Workspace ID where the new bot will be created."),
        ],
        typebot: Annotated[
            dict[str, Any],
            Field(
                description=(
                    "Full flow JSON — groups, blocks, edges, theme, settings, "
                    "variables. When unsure of the shape, fetch an existing bot "
                    "with `get_typebot` and mirror its structure."
                )
            ),
        ],
    ) -> dict[str, Any]:
        """Create a new typebot (chatbot flow) inside a workspace from a full definition.

        Returns the new typebot record (with its assigned `id`) on success.
        The bot is created as a DRAFT — call `publish_typebot` afterwards
        to make it reachable via `start_chat`.

        PAYLOAD GOTCHAS (carried over from the TS builder):
        - `outgoingEdgeId` is required on every block.
        - `publicId` must be set if you ever intend to publish.
        - Script blocks need a specific code shape — copy from an existing bot.
        - Array param values inside option blocks must be stringified.
        """
        async with http_errors_as_tool_errors("create_typebot"):
            return await typebot_service.create_typebot(
                app.builder, workspace_id=workspace_id, typebot=typebot
            )

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=True,
        ),
    )
    async def update_typebot(
        typebot_id: Annotated[
            str,
            Field(description="Internal ID of the typebot to patch."),
        ],
        typebot: Annotated[
            dict[str, Any],
            Field(
                description=(
                    "Partial flow JSON — only the keys you include are overwritten. "
                    "Read the current state with `get_typebot` first to avoid "
                    "clobbering unrelated edits."
                )
            ),
        ],
    ) -> dict[str, Any]:
        """Patch an existing typebot's DRAFT definition by ID.

        Only the fields included in the `typebot` payload are replaced —
        this is a merge-style patch on the draft, not a full replace.
        Editing the draft does NOT affect the live published version
        until you call `publish_typebot`.

        Same payload gotchas as `create_typebot` (`outgoingEdgeId` per
        block, `publicId`, Script block shape, stringified arrays).
        """
        async with http_errors_as_tool_errors("update_typebot"):
            return await typebot_service.update_typebot(app.builder, typebot_id, typebot=typebot)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=True,
        ),
    )
    async def publish_typebot(
        typebot_id: Annotated[
            str,
            Field(description="Internal ID of the typebot to publish."),
        ],
    ) -> dict[str, Any]:
        """Publish the current draft of a typebot, making it the live version.

        Snapshots the draft into the published version. After this,
        `get_published_typebot` reflects the new state and the bot is
        reachable via its public id by `start_chat`. The draft itself
        stays editable — subsequent `update_typebot` calls do NOT affect
        the live version until you publish again.

        Requires `publicId` to be set on the typebot. Inverse:
        `unpublish_typebot`.
        """
        async with http_errors_as_tool_errors("publish_typebot"):
            return await typebot_service.publish_typebot(app.builder, typebot_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=True,
            idempotentHint=True,
        ),
    )
    async def unpublish_typebot(
        typebot_id: Annotated[
            str,
            Field(description="Internal ID of the typebot to take offline."),
        ],
    ) -> dict[str, Any]:
        """Take a typebot offline by removing its published version.

        After this, `start_chat` against the bot's public id will fail
        and the bot is no longer reachable by end users. The draft and
        all historical results stay intact — only the live snapshot is
        removed. Inverse of `publish_typebot`.

        Use this (not `delete_typebot`) when you only want the bot to
        stop accepting traffic.
        """
        async with http_errors_as_tool_errors("unpublish_typebot"):
            return await typebot_service.unpublish_typebot(app.builder, typebot_id)

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=True,
            idempotentHint=True,
        ),
    )
    async def delete_typebot(
        typebot_id: Annotated[
            str,
            Field(description="Internal ID of the typebot to delete permanently."),
        ],
    ) -> dict[str, Any]:
        """Permanently delete a typebot by ID. IRREVERSIBLE.

        Removes the bot itself, its draft, the published version, AND all
        historical results in one shot. There is no soft-delete or undo.

        Use `unpublish_typebot` instead when you only want the bot to
        stop accepting traffic but want to keep the flow + its result
        history.
        """
        async with http_errors_as_tool_errors("delete_typebot"):
            return await typebot_service.delete_typebot(app.builder, typebot_id)
