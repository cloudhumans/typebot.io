"""Tests for the CLI entry — friendly errors on bad env / runtime crash."""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch

import pytest

from typebot_mcp.__main__ import main


def _isolate_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(os.environ):
        if key.startswith("TYPEBOT_"):
            monkeypatch.delenv(key, raising=False)


def test_main_returns_1_on_bad_env_and_prints_to_stderr(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    _isolate_env(monkeypatch)
    env_file = tmp_path / ".env"
    env_file.write_text("TYPEBOTT_TYPO=oops\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    rc = main(["--transport", "stdio"])

    assert rc == 1
    captured = capsys.readouterr()
    assert "typebot-mcp: invalid configuration" in captured.err
    assert "typebott_typo" in captured.err.lower()


def test_main_returns_1_when_mcp_run_raises(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    _isolate_env(monkeypatch)
    monkeypatch.setenv("TYPEBOT_API_BASE_URL", "http://typebot.test")

    with patch("mcp.server.fastmcp.FastMCP.run", side_effect=RuntimeError("boom")):
        rc = main(["--transport", "stdio"])

    assert rc == 1
    assert any(
        "server crashed" in record.message and record.levelname == "ERROR"
        for record in caplog.records
    )


def test_main_returns_0_on_clean_run(monkeypatch: pytest.MonkeyPatch) -> None:
    _isolate_env(monkeypatch)
    monkeypatch.setenv("TYPEBOT_API_BASE_URL", "http://typebot.test")

    with patch("mcp.server.fastmcp.FastMCP.run", return_value=None):
        rc = main(["--transport", "stdio"])

    assert rc == 0
