"""Pure async HTTP helper used by every service module.

Owns nothing — takes a configured ``httpx.AsyncClient`` and returns parsed
JSON. ``None`` values are stripped from payload + params before sending.
List responses are wrapped as ``{"items": [...]}`` for caller convenience.
Non-2xx, transport, and decode failures are surfaced as
:class:`TypebotHTTPError`.
"""

from __future__ import annotations

from typing import Any

import httpx

from typebot_mcp.exceptions import TypebotHTTPError


def build_headers(
    *,
    api_token: str | None,
    tenant: str | None,
    include_drafts: bool,
) -> dict[str, str]:
    """Construct the request headers shared by every Typebot REST call."""
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if api_token:
        headers["Authorization"] = f"Bearer {api_token}"
    if tenant:
        headers["x-tenant"] = tenant
    if include_drafts:
        headers["X-Include-Drafts"] = "true"
    return headers


async def request(
    client: httpx.AsyncClient,
    method: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Issue a Typebot REST call and return the parsed JSON object."""
    body: dict[str, Any] | None = None
    if payload is not None:
        body = {k: v for k, v in payload.items() if v is not None}
    clean_params = {k: v for k, v in params.items() if v is not None} if params else None

    try:
        response = await client.request(method, path, json=body, params=clean_params)
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
