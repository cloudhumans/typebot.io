"""Workspaces + credentials MCP tools."""
# pyright: reportUnusedFunction=false

from __future__ import annotations

from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

from typebot_mcp.context import AppContext
from typebot_mcp.errors import http_errors_as_tool_errors
from typebot_mcp.services import workspaces as workspaces_service

READ_ANNOTATIONS = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
)


def register(mcp: FastMCP, app: AppContext) -> None:
    """Register the always-on workspace + credential tools."""

    @mcp.tool(annotations=READ_ANNOTATIONS)
    async def list_workspaces() -> dict[str, Any]:
        """List every workspace the authenticated caller belongs to.

        Returns id + name + role per workspace. Most other management tools
        require a `workspace_id` argument — call this FIRST when you don't
        already know which workspace to target. No parameters: scoping is
        derived entirely from the bearer token / `x-tenant` header.
        """
        async with http_errors_as_tool_errors("list_workspaces"):
            return await workspaces_service.list_workspaces(app.builder)

    @mcp.tool(annotations=READ_ANNOTATIONS)
    async def list_credentials(
        workspace_id: Annotated[
            str,
            Field(description="Workspace ID owning the credentials. From `list_workspaces`."),
        ],
        credential_type: Annotated[
            str,
            Field(
                description=(
                    "Integration slug to filter by — case-sensitive. Common values: "
                    "'stripe', 'smtp', 'google sheets', 'openai', 'anthropic', "
                    "'whatsApp', 'zemanticAi', 'openrouter'. Must exactly match the "
                    "type used by the corresponding Typebot integration block."
                )
            ),
        ],
    ) -> dict[str, Any]:
        """List the IDs and names of stored credentials of a given integration type.

        Use to find which credential to attach to an integration block when
        creating/updating a typebot (e.g. picking a Stripe key to wire into
        a payment block via `update_typebot`).

        SAFE BY DESIGN: returns only `{id, name}` per credential — secret
        material (API keys, tokens, passwords) is never exposed by the
        upstream endpoint, so this is fine to call from untrusted contexts.
        """
        async with http_errors_as_tool_errors("list_credentials"):
            return await workspaces_service.list_credentials(
                app.builder, workspace_id=workspace_id, type=credential_type
            )
