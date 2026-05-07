"""Async HTTP client for Typebot's viewer + builder REST APIs."""

from __future__ import annotations

from collections.abc import Iterable
from types import TracebackType
from typing import Any

import httpx

from typebot_mcp.config import Settings
from typebot_mcp.exceptions import TypebotHTTPError

ContentFormat = str  # "richText" | "markdown"


class TypebotClient:
    """Thin async wrapper over Typebot's REST endpoints.

    The client is `async with`-friendly. It owns two underlying
    ``httpx.AsyncClient`` instances — one for the viewer (chat) API and
    one for the builder (management) API — and forwards Typebot-specific
    headers (``Authorization``, ``x-tenant``, ``X-Include-Drafts``) on
    every request.
    """

    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if settings.api_token:
            headers["Authorization"] = f"Bearer {settings.api_token}"
        if settings.tenant:
            headers["x-tenant"] = settings.tenant
        if settings.include_drafts:
            headers["X-Include-Drafts"] = "true"

        self._chat = httpx.AsyncClient(
            base_url=settings.base_url_str,
            timeout=settings.timeout_seconds,
            headers=headers,
            transport=transport,
        )
        self._builder = httpx.AsyncClient(
            base_url=settings.builder_url_str,
            timeout=settings.timeout_seconds,
            headers=headers,
            transport=transport,
        )

    async def __aenter__(self) -> TypebotClient:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._chat.aclose()
        await self._builder.aclose()

    async def _request(
        self,
        client: httpx.AsyncClient,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] | None = None
        if payload is not None:
            body = {k: v for k, v in payload.items() if v is not None}
        clean_params = {k: v for k, v in params.items() if v is not None} if params else None

        try:
            response = await client.request(
                method,
                path,
                json=body,
                params=clean_params,
            )
        except httpx.HTTPError as exc:
            raise TypebotHTTPError(
                status_code=0,
                message=str(exc),
                url=f"{client.base_url}{path}",
            ) from exc

        if response.is_error:
            raise TypebotHTTPError(
                status_code=response.status_code,
                message=response.reason_phrase or "request failed",
                url=str(response.request.url),
                body=response.text,
            )

        if not response.content:
            return {}
        try:
            data = response.json()
        except ValueError as exc:
            raise TypebotHTTPError(
                status_code=response.status_code,
                message="response was not valid JSON",
                url=str(response.request.url),
                body=response.text,
            ) from exc
        if isinstance(data, list):
            return {"items": data}
        if not isinstance(data, dict):
            raise TypebotHTTPError(
                status_code=response.status_code,
                message="expected JSON object or array response",
                url=str(response.request.url),
                body=response.text,
            )
        return data

    # ------------------------------------------------------------------
    # Chat (viewer) endpoints
    # ------------------------------------------------------------------

    async def start_chat(
        self,
        public_id: str,
        *,
        message: str | None = None,
        prefilled_variables: dict[str, Any] | None = None,
        result_id: str | None = None,
        is_only_registering: bool = False,
        is_stream_enabled: bool = False,
        text_bubble_content_format: ContentFormat = "markdown",
    ) -> dict[str, Any]:
        """Wraps ``POST /api/v1/typebots/{publicId}/startChat``."""
        payload: dict[str, Any] = {
            "publicId": public_id,
            "message": message,
            "prefilledVariables": prefilled_variables,
            "resultId": result_id,
            "isOnlyRegistering": is_only_registering,
            "isStreamEnabled": is_stream_enabled,
            "textBubbleContentFormat": text_bubble_content_format,
        }
        return await self._request(
            self._chat,
            "POST",
            f"/api/v1/typebots/{public_id}/startChat",
            payload=payload,
        )

    async def continue_chat(
        self,
        session_id: str,
        *,
        message: str | None = None,
        text_bubble_content_format: ContentFormat = "markdown",
    ) -> dict[str, Any]:
        """Wraps ``POST /api/v1/sessions/{sessionId}/continueChat``."""
        payload: dict[str, Any] = {
            "sessionId": session_id,
            "message": message,
            "textBubbleContentFormat": text_bubble_content_format,
        }
        return await self._request(
            self._chat,
            "POST",
            f"/api/v1/sessions/{session_id}/continueChat",
            payload=payload,
        )

    async def start_chat_preview(
        self,
        typebot_id: str,
        *,
        message: str | None = None,
        prefilled_variables: dict[str, Any] | None = None,
        is_stream_enabled: bool = False,
        text_bubble_content_format: ContentFormat = "markdown",
    ) -> dict[str, Any]:
        """Wraps ``POST /api/v1/typebots/{typebotId}/preview/startChat``."""
        payload: dict[str, Any] = {
            "typebotId": typebot_id,
            "message": message,
            "prefilledVariables": prefilled_variables,
            "isStreamEnabled": is_stream_enabled,
            "textBubbleContentFormat": text_bubble_content_format,
        }
        return await self._request(
            self._chat,
            "POST",
            f"/api/v1/typebots/{typebot_id}/preview/startChat",
            payload=payload,
        )

    # ------------------------------------------------------------------
    # Typebot management (builder)
    # ------------------------------------------------------------------

    async def list_typebots(
        self,
        *,
        workspace_id: str | None = None,
        folder_id: str | None = None,
    ) -> dict[str, Any]:
        """Wraps ``GET /api/v1/typebots``.

        When ``Settings.include_drafts`` is ``False`` (default), unpublished
        typebots are filtered out client-side. The upstream REST endpoint
        ignores the ``X-Include-Drafts`` header — that header is honoured
        only by the TS ``/api/mcp`` handler — so the filter must run here.
        """
        params = {"workspaceId": workspace_id, "folderId": folder_id}
        data = await self._request(self._builder, "GET", "/api/v1/typebots", params=params)
        if not self._settings.include_drafts:
            typebots = data.get("typebots")
            if isinstance(typebots, list):
                data["typebots"] = [
                    tb for tb in typebots if isinstance(tb, dict) and tb.get("publishedTypebotId")
                ]
        return data

    async def get_typebot(self, typebot_id: str) -> dict[str, Any]:
        """Wraps ``GET /api/v1/typebots/{typebotId}``."""
        return await self._request(self._builder, "GET", f"/api/v1/typebots/{typebot_id}")

    async def get_published_typebot(self, typebot_id: str) -> dict[str, Any]:
        """Wraps ``GET /api/v1/typebots/{typebotId}/publishedTypebot``."""
        return await self._request(
            self._builder,
            "GET",
            f"/api/v1/typebots/{typebot_id}/publishedTypebot",
        )

    async def create_typebot(
        self,
        *,
        workspace_id: str,
        typebot: dict[str, Any],
    ) -> dict[str, Any]:
        """Wraps ``POST /api/v1/typebots``."""
        payload = {"workspaceId": workspace_id, "typebot": typebot}
        return await self._request(self._builder, "POST", "/api/v1/typebots", payload=payload)

    async def update_typebot(
        self,
        typebot_id: str,
        *,
        typebot: dict[str, Any],
    ) -> dict[str, Any]:
        """Wraps ``PATCH /api/v1/typebots/{typebotId}``."""
        return await self._request(
            self._builder,
            "PATCH",
            f"/api/v1/typebots/{typebot_id}",
            payload={"typebot": typebot},
        )

    async def publish_typebot(self, typebot_id: str) -> dict[str, Any]:
        """Wraps ``POST /api/v1/typebots/{typebotId}/publish``."""
        return await self._request(self._builder, "POST", f"/api/v1/typebots/{typebot_id}/publish")

    async def unpublish_typebot(self, typebot_id: str) -> dict[str, Any]:
        """Wraps ``POST /api/v1/typebots/{typebotId}/unpublish``."""
        return await self._request(
            self._builder, "POST", f"/api/v1/typebots/{typebot_id}/unpublish"
        )

    async def delete_typebot(self, typebot_id: str) -> dict[str, Any]:
        """Wraps ``DELETE /api/v1/typebots/{typebotId}``."""
        return await self._request(self._builder, "DELETE", f"/api/v1/typebots/{typebot_id}")

    # ------------------------------------------------------------------
    # Results + analytics
    # ------------------------------------------------------------------

    async def list_results(
        self,
        typebot_id: str,
        *,
        limit: int | None = None,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        """Wraps ``GET /api/v1/typebots/{typebotId}/results``."""
        params = {"limit": limit, "cursor": cursor}
        return await self._request(
            self._builder,
            "GET",
            f"/api/v1/typebots/{typebot_id}/results",
            params=params,
        )

    async def get_result(self, typebot_id: str, result_id: str) -> dict[str, Any]:
        """Wraps ``GET /api/v1/typebots/{typebotId}/results/{resultId}``."""
        return await self._request(
            self._builder,
            "GET",
            f"/api/v1/typebots/{typebot_id}/results/{result_id}",
        )

    async def get_result_logs(self, typebot_id: str, result_id: str) -> dict[str, Any]:
        """Wraps ``GET /api/v1/typebots/{typebotId}/results/{resultId}/logs``."""
        return await self._request(
            self._builder,
            "GET",
            f"/api/v1/typebots/{typebot_id}/results/{result_id}/logs",
        )

    async def delete_results(
        self,
        typebot_id: str,
        *,
        result_ids: Iterable[str] | None = None,
    ) -> dict[str, Any]:
        """Wraps ``DELETE /api/v1/typebots/{typebotId}/results``."""
        params = {"resultIds": ",".join(result_ids)} if result_ids is not None else None
        return await self._request(
            self._builder,
            "DELETE",
            f"/api/v1/typebots/{typebot_id}/results",
            params=params,
        )

    async def get_analytics_stats(
        self,
        typebot_id: str,
        *,
        time_filter: str | None = None,
        time_zone: str | None = None,
    ) -> dict[str, Any]:
        """Wraps ``GET /api/v1/typebots/{typebotId}/analytics/stats``."""
        params = {"timeFilter": time_filter, "timeZone": time_zone}
        return await self._request(
            self._builder,
            "GET",
            f"/api/v1/typebots/{typebot_id}/analytics/stats",
            params=params,
        )

    # ------------------------------------------------------------------
    # Folders
    # ------------------------------------------------------------------

    async def list_folders(
        self,
        *,
        workspace_id: str,
        parent_folder_id: str | None = None,
    ) -> dict[str, Any]:
        """Wraps ``GET /api/v1/folders``."""
        params = {"workspaceId": workspace_id, "parentFolderId": parent_folder_id}
        return await self._request(self._builder, "GET", "/api/v1/folders", params=params)

    # ------------------------------------------------------------------
    # Workspaces + credentials
    # ------------------------------------------------------------------

    async def list_workspaces(self) -> dict[str, Any]:
        """Wraps ``GET /api/v1/workspaces``."""
        return await self._request(self._builder, "GET", "/api/v1/workspaces")

    async def list_credentials(
        self,
        *,
        workspace_id: str,
        type: str,
    ) -> dict[str, Any]:
        """Wraps ``GET /api/v1/credentials``.

        Returns ``{credentials: [{id, name}]}`` only — secret material is
        never exposed by the upstream endpoint.
        """
        params = {"workspaceId": workspace_id, "type": type}
        return await self._request(self._builder, "GET", "/api/v1/credentials", params=params)
