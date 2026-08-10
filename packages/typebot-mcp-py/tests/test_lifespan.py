"""Tests for the FastMCP lifespan that owns both upstream HTTP clients."""

from __future__ import annotations

import httpx

from typebot_mcp.config import Settings
from typebot_mcp.context import AppContext
from typebot_mcp.lifespan import app_lifespan


async def test_lifespan_yields_two_open_clients(settings: Settings) -> None:
    async with app_lifespan(settings) as app:
        assert isinstance(app, AppContext)
        assert isinstance(app.viewer, httpx.AsyncClient)
        assert isinstance(app.builder, httpx.AsyncClient)
        assert not app.viewer.is_closed
        assert not app.builder.is_closed
        assert str(app.viewer.base_url).rstrip("/") == "http://typebot.test"
        assert str(app.builder.base_url).rstrip("/") == "http://typebot-builder.test"

    assert app.viewer.is_closed
    assert app.builder.is_closed


async def test_lifespan_propagates_settings(settings: Settings) -> None:
    async with app_lifespan(settings) as app:
        assert app.settings is settings


async def test_lifespan_sets_auth_headers(settings: Settings) -> None:
    async with app_lifespan(settings) as app:
        assert app.viewer.headers["authorization"] == "Bearer test-token"
        assert app.viewer.headers["x-tenant"] == "acme"
        assert "x-include-drafts" not in app.viewer.headers
