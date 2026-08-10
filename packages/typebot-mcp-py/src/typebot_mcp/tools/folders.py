"""Folder MCP tools."""
# pyright: reportUnusedFunction=false

from __future__ import annotations

from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

from typebot_mcp.context import AppContext
from typebot_mcp.errors import http_errors_as_tool_errors
from typebot_mcp.services import folders as folders_service


def register(mcp: FastMCP, app: AppContext) -> None:
    """Register the always-on folder tools."""

    @mcp.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
        ),
    )
    async def list_folders(
        workspace_id: Annotated[
            str,
            Field(
                description=(
                    "Workspace ID whose folder tree to list. Discover via `list_workspaces`."
                )
            ),
        ],
        parent_folder_id: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    "Parent folder ID — when provided, lists children of that folder "
                    "only. None lists the workspace's top-level folders."
                ),
            ),
        ] = None,
    ) -> dict[str, Any]:
        """List folders (the typebot organization tree) inside a workspace.

        Folders group typebots in the builder UI. Use the IDs returned here to
        narrow `list_typebots(folder_id=...)` to a specific folder, or to
        recurse the tree by feeding each folder's ID back as `parent_folder_id`.
        """
        async with http_errors_as_tool_errors("list_folders"):
            return await folders_service.list_folders(
                app.builder,
                workspace_id=workspace_id,
                parent_folder_id=parent_folder_id,
            )
