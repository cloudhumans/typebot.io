"""Construct + tear down the upstream HTTP clients owned by the server."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx

from typebot_mcp.config import Settings
from typebot_mcp.context import AppContext
from typebot_mcp.transport import build_headers


def open_clients(settings: Settings) -> AppContext:
    """Open both viewer + builder ``httpx.AsyncClient``s.

    Returns an :class:`AppContext` containing the open clients. Caller
    is responsible for closing them — use :func:`app_lifespan` when an
    async context manager is wanted.
    """
    headers = build_headers(
        api_token=settings.api_token,
        tenant=settings.tenant,
        include_drafts=settings.include_drafts,
    )
    viewer = httpx.AsyncClient(
        base_url=settings.base_url_str,
        timeout=settings.timeout_seconds,
        headers=headers,
    )
    builder = httpx.AsyncClient(
        base_url=settings.builder_url_str,
        timeout=settings.timeout_seconds,
        headers=headers,
    )
    return AppContext(settings=settings, viewer=viewer, builder=builder)


@asynccontextmanager
async def app_lifespan(settings: Settings) -> AsyncIterator[AppContext]:
    """Async context manager wrapping :func:`open_clients` + close."""
    app = open_clients(settings)
    try:
        yield app
    finally:
        await app.viewer.aclose()
        await app.builder.aclose()
