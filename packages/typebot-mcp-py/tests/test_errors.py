"""Tests for the ToolError adapter and MCP-protocol error semantics."""

from __future__ import annotations

import httpx
import pytest
import respx
from mcp.server.fastmcp.exceptions import ToolError

from typebot_mcp.config import Settings
from typebot_mcp.errors import http_errors_as_tool_errors
from typebot_mcp.exceptions import TypebotHTTPError
from typebot_mcp.server import build_server


async def test_http_errors_translate_to_tool_error() -> None:
    with pytest.raises(ToolError) as exc_info:
        async with http_errors_as_tool_errors("op"):
            raise TypebotHTTPError(
                status_code=503,
                message="upstream",
                url="http://x",
                body="oops",
            )

    msg = str(exc_info.value)
    assert "op" in msg
    assert "503" in msg
    assert "oops" in msg


async def test_http_errors_passthrough_on_success() -> None:
    async with http_errors_as_tool_errors("op"):
        pass


@respx.mock
async def test_tool_call_raises_tool_error_on_500(settings: Settings) -> None:
    respx.post("http://typebot.test/api/v1/typebots/x/startChat").mock(
        return_value=httpx.Response(500, text="boom")
    )

    mcp = build_server(settings)
    with pytest.raises(ToolError) as exc_info:
        await mcp.call_tool("start_chat", {"public_id": "x"})

    msg = str(exc_info.value)
    assert "500" in msg
