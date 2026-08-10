"""Read-only MCP tools for typebot definitions."""
# pyright: reportUnusedFunction=false

from __future__ import annotations

from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

from typebot_mcp.context import AppContext
from typebot_mcp.errors import http_errors_as_tool_errors
from typebot_mcp.services import typebots as typebot_service

READ_ANNOTATIONS = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
)


def register(mcp: FastMCP, app: AppContext) -> None:
    """Register the always-on typebot read tools."""

    @mcp.tool(annotations=READ_ANNOTATIONS)
    async def list_typebots(
        workspace_id: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    "Restrict to a single workspace. None returns bots across every "
                    "workspace the authenticated caller can read. Discover IDs via "
                    "`list_workspaces`."
                ),
            ),
        ] = None,
        folder_id: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    "Restrict to a single folder. None ignores folder grouping (does "
                    "NOT mean 'root only'). Discover IDs via `list_folders`."
                ),
            ),
        ] = None,
    ) -> dict[str, Any]:
        """List typebots visible to the authenticated caller (index, not full flows).

        Returns the typebot directory — id, name, publication state, public id —
        for every bot the caller can read. Use this to discover IDs/slugs to
        feed into other tools, then call `get_typebot` (draft) or
        `get_published_typebot` (live) for full flow definitions.

        Drafts: by default, this server filters OUT unpublished bots so the
        listing matches what end users can chat with. Set the env var
        `TYPEBOT_INCLUDE_DRAFTS=true` to include drafts as well.
        """
        async with http_errors_as_tool_errors("list_typebots"):
            return await typebot_service.list_typebots(
                app.builder,
                workspace_id=workspace_id,
                folder_id=folder_id,
                include_drafts=app.settings.include_drafts,
            )

    @mcp.tool(annotations=READ_ANNOTATIONS)
    async def get_typebot(
        typebot_id: Annotated[
            str,
            Field(
                description=(
                    "Internal typebot ID (the `id` field from `list_typebots`). NOT the "
                    "public slug — use `start_chat` if you only have the public id."
                )
            ),
        ],
    ) -> dict[str, Any]:
        """Fetch a typebot's CURRENT DRAFT (editable) definition by internal ID.

        Returns the full working copy — groups, blocks, edges, theme, settings,
        variables — including any unpublished edits. This is the version a
        flow author sees in the builder.

        WHEN TO USE THIS vs `get_published_typebot`:
        - `get_typebot` — the editable draft, may diverge from what users hit.
        - `get_published_typebot` — the live snapshot end users actually run.
        Use this one for read-modify-write workflows with `update_typebot`.
        """
        async with http_errors_as_tool_errors("get_typebot"):
            return await typebot_service.get_typebot(app.builder, typebot_id)

    @mcp.tool(annotations=READ_ANNOTATIONS)
    async def get_published_typebot(
        typebot_id: Annotated[
            str,
            Field(
                description=(
                    "Internal typebot ID (the `id` field from `list_typebots`). The "
                    "lookup uses this even though end users address the bot by its "
                    "public slug."
                )
            ),
        ],
    ) -> dict[str, Any]:
        """Fetch the LIVE PUBLISHED version of a typebot by internal ID.

        Returns the snapshot that public chat sessions execute — i.e. exactly
        what end users hit through `start_chat`. Will return empty / fail if
        the bot has never been published.

        WHEN TO USE THIS vs `get_typebot`:
        - `get_published_typebot` — what's running in production right now.
        - `get_typebot` — the editable draft (may have unpublished changes).
        Use this one to audit what users currently see.
        """
        async with http_errors_as_tool_errors("get_published_typebot"):
            return await typebot_service.get_published_typebot(app.builder, typebot_id)
