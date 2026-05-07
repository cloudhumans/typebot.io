"""FastMCP server that exposes Typebot REST endpoints as MCP tools."""
# pyright: reportUnusedFunction=false

from __future__ import annotations

from collections.abc import AsyncGenerator
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
    async def lifespan(_: FastMCP) -> AsyncGenerator[None]:
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
        return await _call(
            "list_typebots",
            lambda c: c.list_typebots(workspace_id=workspace_id, folder_id=folder_id),
        )

    @mcp.tool()
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
        return await _call("get_typebot", lambda c: c.get_typebot(typebot_id))

    @mcp.tool()
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
        return await _call("get_published_typebot", lambda c: c.get_published_typebot(typebot_id))

    @mcp.tool()
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
        return await _call(
            "list_results",
            lambda c: c.list_results(typebot_id, limit=limit, cursor=cursor),
        )

    @mcp.tool()
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
        return await _call("get_result", lambda c: c.get_result(typebot_id, result_id))

    @mcp.tool()
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
        return await _call(
            "get_result_logs",
            lambda c: c.get_result_logs(typebot_id, result_id),
        )

    @mcp.tool()
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
        return await _call(
            "get_analytics_stats",
            lambda c: c.get_analytics_stats(
                typebot_id, time_filter=time_filter, time_zone=time_zone
            ),
        )

    @mcp.tool()
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
        return await _call(
            "list_folders",
            lambda c: c.list_folders(workspace_id=workspace_id, parent_folder_id=parent_folder_id),
        )

    @mcp.tool()
    async def list_workspaces() -> dict[str, Any]:
        """List every workspace the authenticated caller belongs to.

        Returns id + name + role per workspace. Most other management tools
        require a `workspace_id` argument — call this FIRST when you don't
        already know which workspace to target. No parameters: scoping is
        derived entirely from the bearer token / `x-tenant` header.
        """
        return await _call("list_workspaces", lambda c: c.list_workspaces())

    @mcp.tool()
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
            return await _call(
                "create_typebot",
                lambda c: c.create_typebot(workspace_id=workspace_id, typebot=typebot),
            )

        @mcp.tool()
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
            return await _call(
                "update_typebot",
                lambda c: c.update_typebot(typebot_id, typebot=typebot),
            )

        @mcp.tool()
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
            return await _call("publish_typebot", lambda c: c.publish_typebot(typebot_id))

        @mcp.tool()
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
            return await _call("unpublish_typebot", lambda c: c.unpublish_typebot(typebot_id))

        @mcp.tool()
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
            return await _call("delete_typebot", lambda c: c.delete_typebot(typebot_id))

        @mcp.tool()
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
            return await _call(
                "delete_results",
                lambda c: c.delete_results(typebot_id, result_ids=result_ids),
            )

    return mcp
