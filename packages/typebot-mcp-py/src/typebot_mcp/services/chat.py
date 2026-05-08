"""Chat (viewer) endpoints — start/continue/preview a Typebot chat session."""

from __future__ import annotations

from typing import Any

import httpx

from typebot_mcp.transport import request

ContentFormat = str  # "richText" | "markdown"


async def start_chat(
    viewer: httpx.AsyncClient,
    public_id: str,
    *,
    message: str | None = None,
    prefilled_variables: dict[str, Any] | None = None,
    result_id: str | None = None,
    is_only_registering: bool = False,
    is_stream_enabled: bool = False,
    text_bubble_content_format: ContentFormat = "markdown",
) -> dict[str, Any]:
    """Wraps ``POST /api/v1/typebots/{publicId}/startChat``.

    ``publicId`` is in the URL path — the trpc-openapi adapter merges
    it into the validated input before the handler runs, so the body
    only needs to carry the genuinely body-only fields.
    """
    payload: dict[str, Any] = {
        "message": message,
        "prefilledVariables": prefilled_variables,
        "resultId": result_id,
        "isOnlyRegistering": is_only_registering,
        "isStreamEnabled": is_stream_enabled,
        "textBubbleContentFormat": text_bubble_content_format,
    }
    return await request(
        viewer,
        "POST",
        f"/api/v1/typebots/{public_id}/startChat",
        payload=payload,
    )


async def continue_chat(
    viewer: httpx.AsyncClient,
    session_id: str,
    *,
    message: str | None = None,
    text_bubble_content_format: ContentFormat = "markdown",
) -> dict[str, Any]:
    """Wraps ``POST /api/v1/sessions/{sessionId}/continueChat``.

    ``sessionId`` lives in the URL path — the trpc-openapi adapter
    merges it into the validated input before the handler runs, so the
    body only needs to carry the genuinely body-only fields.
    """
    payload: dict[str, Any] = {
        "message": message,
        "textBubbleContentFormat": text_bubble_content_format,
    }
    return await request(
        viewer,
        "POST",
        f"/api/v1/sessions/{session_id}/continueChat",
        payload=payload,
    )


async def start_chat_preview(
    viewer: httpx.AsyncClient,
    typebot_id: str,
    *,
    message: str | None = None,
    prefilled_variables: dict[str, Any] | None = None,
    is_stream_enabled: bool = False,
    text_bubble_content_format: ContentFormat = "markdown",
) -> dict[str, Any]:
    """Wraps ``POST /api/v1/typebots/{typebotId}/preview/startChat``.

    ``typebotId`` is in the URL path — the trpc-openapi adapter merges
    it into the validated input before the handler runs, so the body
    only needs to carry the genuinely body-only fields.
    """
    payload: dict[str, Any] = {
        "message": message,
        "prefilledVariables": prefilled_variables,
        "isStreamEnabled": is_stream_enabled,
        "textBubbleContentFormat": text_bubble_content_format,
    }
    return await request(
        viewer,
        "POST",
        f"/api/v1/typebots/{typebot_id}/preview/startChat",
        payload=payload,
    )
