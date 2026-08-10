"""Tests for Settings — strict env validation and typo detection."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from pydantic import ValidationError

from typebot_mcp.config import Settings


def _isolate_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Drop every TYPEBOT_* var so the host env can't bleed into the test."""
    for key in list(os.environ):
        if key.startswith("TYPEBOT_"):
            monkeypatch.delenv(key, raising=False)


def test_typo_in_env_file_raises(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _isolate_env(monkeypatch)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "TYPEBOT_API_TOKEN=good\nTYPEBOTT_API_TOKEN=typo-leaks-silently\n",
        encoding="utf-8",
    )

    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=str(env_file))  # type: ignore[call-arg]

    assert "typebott_api_token" in str(exc.value).lower()


def test_known_env_vars_still_work(monkeypatch: pytest.MonkeyPatch) -> None:
    _isolate_env(monkeypatch)
    monkeypatch.setenv("TYPEBOT_API_BASE_URL", "https://typebot.example.com")
    monkeypatch.setenv("TYPEBOT_API_TOKEN", "good-token")
    monkeypatch.setenv("TYPEBOT_TENANT", "acme")
    monkeypatch.setenv("TYPEBOT_ALLOW_WRITES", "true")

    cfg = Settings(_env_file=None)  # type: ignore[call-arg]

    assert cfg.api_token == "good-token"
    assert cfg.tenant == "acme"
    assert cfg.allow_writes is True
    assert cfg.base_url_str == "https://typebot.example.com"
