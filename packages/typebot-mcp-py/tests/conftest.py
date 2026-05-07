"""Shared pytest fixtures for typebot-mcp."""

from __future__ import annotations

import pytest
from pydantic import HttpUrl

from typebot_mcp.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        api_base_url=HttpUrl("http://typebot.test"),
        builder_base_url=HttpUrl("http://typebot-builder.test"),
        api_token="test-token",
        tenant="acme",
        timeout_seconds=5.0,
        include_drafts=False,
        allow_writes=False,
    )


@pytest.fixture
def settings_writable() -> Settings:
    return Settings(
        api_base_url=HttpUrl("http://typebot.test"),
        builder_base_url=HttpUrl("http://typebot-builder.test"),
        api_token="test-token",
        tenant="acme",
        timeout_seconds=5.0,
        include_drafts=False,
        allow_writes=True,
    )
