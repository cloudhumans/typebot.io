"""FastMCP server that exposes Typebot REST endpoints as MCP tools."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from typebot_mcp.client import TypebotClient
from typebot_mcp.config import Settings
from typebot_mcp.exceptions import TypebotHTTPError


def build_server(
    settings: Settings | None = None,
    *,
    name: str = "typebot-mcp",
    stateless_http: bool = True,
    json_response: bool = True,
) -> FastMCP:
    """Create a configured FastMCP server.

    Always registers the chat + read tools. Mutating tools
    (create/update/delete/publish/unpublish) are only registered when
    ``settings.allow_writes`` is ``True``.

    A single :class:`TypebotClient` is shared across every tool call so
    the underlying ``httpx`` connection pool is reused. The client is
    closed on FastMCP shutdown via the registered ``lifespan`` hook.
    """
    cfg = settings or Settings()
    client = TypebotClient(cfg)

    @asynccontextmanager
    async def lifespan(_: FastMCP) -> AsyncIterator[None]:
        try:
            yield
        finally:
            await client.aclose()

    mcp = FastMCP(
        name,
        stateless_http=stateless_http,
        json_response=json_response,
        lifespan=lifespan,
    )

    async def _call(operation: str, fn: Any) -> dict[str, Any]:
        try:
            return await fn(client)
        except TypebotHTTPError as exc:
            return {
                "ok": False,
                "operation": operation,
                "status": exc.status_code,
                "error": str(exc),
                "body": exc.body,
            }

    # ------------------------------------------------------------------
    # Chat tools (always registered)
    # ------------------------------------------------------------------

    @mcp.tool()
    async def start_chat(
        public_id: Annotated[str, Field(description="Public ID of the published typebot.")],
        message: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    "Optional initial message — only when the flow starts with an input block."
                ),
            ),
        ] = None,
        prefilled_variables: Annotated[
            dict[str, Any] | None,
            Field(
                default=None,
                description="Variables to pre-fill before the flow runs.",
            ),
        ] = None,
        result_id: Annotated[
            str | None,
            Field(
                default=None,
                description="Overwrite an existing result if provided.",
            ),
        ] = None,
        is_only_registering: Annotated[
            bool,
            Field(
                default=False,
                description="Register the session without starting the bot.",
            ),
        ] = False,
        text_bubble_content_format: Annotated[
            Literal["richText", "markdown"],
            Field(default="markdown", description="Format of returned text bubbles."),
        ] = "markdown",
    ) -> dict[str, Any]:
        """Start a chat session against a published Typebot flow."""
        return await _call(
            "start_chat",
            lambda c: c.start_chat(
                public_id,
                message=message,
                prefilled_variables=prefilled_variables,
                result_id=result_id,
                is_only_registering=is_only_registering,
                text_bubble_content_format=text_bubble_content_format,
            ),
        )

    @mcp.tool()
    async def continue_chat(
        session_id: Annotated[str, Field(description="Session ID returned by `start_chat`.")],
        message: Annotated[
            str | None,
            Field(default=None, description="User reply for the current step."),
        ] = None,
        text_bubble_content_format: Annotated[
            Literal["richText", "markdown"],
            Field(default="markdown", description="Format of returned text bubbles."),
        ] = "markdown",
    ) -> dict[str, Any]:
        """Continue an existing Typebot chat session."""
        return await _call(
            "continue_chat",
            lambda c: c.continue_chat(
                session_id,
                message=message,
                text_bubble_content_format=text_bubble_content_format,
            ),
        )

    @mcp.tool()
    async def start_chat_preview(
        typebot_id: Annotated[str, Field(description="Internal typebot ID (preview/draft mode).")],
        message: Annotated[
            str | None, Field(default=None, description="Optional initial message.")
        ] = None,
        prefilled_variables: Annotated[
            dict[str, Any] | None,
            Field(default=None, description="Pre-filled variables."),
        ] = None,
        text_bubble_content_format: Annotated[
            Literal["richText", "markdown"],
            Field(default="markdown", description="Format of returned text bubbles."),
        ] = "markdown",
    ) -> dict[str, Any]:
        """Start a preview chat against a draft typebot by ID."""
        return await _call(
            "start_chat_preview",
            lambda c: c.start_chat_preview(
                typebot_id,
                message=message,
                prefilled_variables=prefilled_variables,
                text_bubble_content_format=text_bubble_content_format,
            ),
        )

    # ------------------------------------------------------------------
    # Read tools (always registered)
    # ------------------------------------------------------------------

    @mcp.tool()
    async def list_typebots(
        workspace_id: Annotated[
            str | None,
            Field(default=None, description="Filter by workspace ID."),
        ] = None,
        folder_id: Annotated[
            str | None, Field(default=None, description="Filter by folder ID.")
        ] = None,
    ) -> dict[str, Any]:
        """List typebots visible to the caller."""
        return await _call(
            "list_typebots",
            lambda c: c.list_typebots(workspace_id=workspace_id, folder_id=folder_id),
        )

    @mcp.tool()
    async def get_typebot(
        typebot_id: Annotated[str, Field(description="Internal typebot ID.")],
    ) -> dict[str, Any]:
        """Fetch a typebot definition by ID."""
        return await _call("get_typebot", lambda c: c.get_typebot(typebot_id))

    @mcp.tool()
    async def get_published_typebot(
        typebot_id: Annotated[str, Field(description="Internal typebot ID.")],
    ) -> dict[str, Any]:
        """Fetch the published version of a typebot."""
        return await _call("get_published_typebot", lambda c: c.get_published_typebot(typebot_id))

    @mcp.tool()
    async def list_results(
        typebot_id: Annotated[str, Field(description="Internal typebot ID.")],
        limit: Annotated[
            int | None,
            Field(default=None, ge=1, le=200, description="Max results per page."),
        ] = None,
        cursor: Annotated[str | None, Field(default=None, description="Pagination cursor.")] = None,
    ) -> dict[str, Any]:
        """List chat results for a typebot, paginated."""
        return await _call(
            "list_results",
            lambda c: c.list_results(typebot_id, limit=limit, cursor=cursor),
        )

    @mcp.tool()
    async def get_result(
        typebot_id: Annotated[str, Field(description="Internal typebot ID.")],
        result_id: Annotated[str, Field(description="Result ID to fetch.")],
    ) -> dict[str, Any]:
        """Fetch a single result (response) for a typebot."""
        return await _call("get_result", lambda c: c.get_result(typebot_id, result_id))

    @mcp.tool()
    async def get_result_logs(
        typebot_id: Annotated[str, Field(description="Internal typebot ID.")],
        result_id: Annotated[str, Field(description="Result ID to fetch logs for.")],
    ) -> dict[str, Any]:
        """Fetch execution logs for a single result."""
        return await _call(
            "get_result_logs",
            lambda c: c.get_result_logs(typebot_id, result_id),
        )

    @mcp.tool()
    async def get_analytics_stats(
        typebot_id: Annotated[str, Field(description="Internal typebot ID.")],
        time_filter: Annotated[
            str | None,
            Field(
                default=None,
                description="Time range filter (e.g. 'last7Days', 'lastMonth').",
            ),
        ] = None,
        time_zone: Annotated[
            str | None,
            Field(default=None, description="IANA time zone for the analytics window."),
        ] = None,
    ) -> dict[str, Any]:
        """Fetch headline analytics stats for a typebot."""
        return await _call(
            "get_analytics_stats",
            lambda c: c.get_analytics_stats(
                typebot_id, time_filter=time_filter, time_zone=time_zone
            ),
        )

    @mcp.tool()
    async def list_folders(
        workspace_id: Annotated[str, Field(description="Workspace ID.")],
        parent_folder_id: Annotated[
            str | None,
            Field(default=None, description="Filter by parent folder."),
        ] = None,
    ) -> dict[str, Any]:
        """List folders inside a workspace."""
        return await _call(
            "list_folders",
            lambda c: c.list_folders(workspace_id=workspace_id, parent_folder_id=parent_folder_id),
        )

    @mcp.tool()
    async def list_workspaces() -> dict[str, Any]:
        """List workspaces visible to the caller."""
        return await _call("list_workspaces", lambda c: c.list_workspaces())

    @mcp.tool()
    async def list_credentials(
        workspace_id: Annotated[str, Field(description="Workspace ID.")],
        credential_type: Annotated[
            str,
            Field(
                description=(
                    "Credential type to filter by — e.g. 'stripe', 'smtp', "
                    "'google sheets', 'openai', 'whatsApp', 'zemanticAi'."
                )
            ),
        ],
    ) -> dict[str, Any]:
        """List credentials of a given type in a workspace.

        Returns only ``{id, name}`` per credential — secret material is never
        exposed by the upstream endpoint.
        """
        return await _call(
            "list_credentials",
            lambda c: c.list_credentials(workspace_id=workspace_id, type=credential_type),
        )

    # ------------------------------------------------------------------
    # Write tools (registered only when allow_writes=True)
    # ------------------------------------------------------------------

    if cfg.allow_writes:

        @mcp.tool()
        async def create_typebot(
            workspace_id: Annotated[str, Field(description="Workspace ID.")],
            typebot: Annotated[
                dict[str, Any],
                Field(description="Typebot definition payload."),
            ],
        ) -> dict[str, Any]:
            """Create a new typebot in the given workspace."""
            return await _call(
                "create_typebot",
                lambda c: c.create_typebot(workspace_id=workspace_id, typebot=typebot),
            )

        @mcp.tool()
        async def update_typebot(
            typebot_id: Annotated[str, Field(description="Internal typebot ID.")],
            typebot: Annotated[
                dict[str, Any],
                Field(description="Partial typebot definition payload."),
            ],
        ) -> dict[str, Any]:
            """Patch an existing typebot."""
            return await _call(
                "update_typebot",
                lambda c: c.update_typebot(typebot_id, typebot=typebot),
            )

        @mcp.tool()
        async def publish_typebot(
            typebot_id: Annotated[str, Field(description="Internal typebot ID.")],
        ) -> dict[str, Any]:
            """Publish the current draft of a typebot."""
            return await _call("publish_typebot", lambda c: c.publish_typebot(typebot_id))

        @mcp.tool()
        async def unpublish_typebot(
            typebot_id: Annotated[str, Field(description="Internal typebot ID.")],
        ) -> dict[str, Any]:
            """Unpublish the published version of a typebot."""
            return await _call("unpublish_typebot", lambda c: c.unpublish_typebot(typebot_id))

        @mcp.tool()
        async def delete_typebot(
            typebot_id: Annotated[str, Field(description="Internal typebot ID.")],
        ) -> dict[str, Any]:
            """Delete a typebot permanently."""
            return await _call("delete_typebot", lambda c: c.delete_typebot(typebot_id))

        @mcp.tool()
        async def delete_results(
            typebot_id: Annotated[str, Field(description="Internal typebot ID.")],
            result_ids: Annotated[
                list[str] | None,
                Field(
                    default=None,
                    description=(
                        "Specific result IDs to delete. When omitted, all "
                        "results for the typebot are deleted."
                    ),
                ),
            ] = None,
        ) -> dict[str, Any]:
            """Delete chat results for a typebot."""
            return await _call(
                "delete_results",
                lambda c: c.delete_results(typebot_id, result_ids=result_ids),
            )

    return mcp
