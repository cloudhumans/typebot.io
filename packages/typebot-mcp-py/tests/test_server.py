"""Smoke tests for `typebot_mcp.server.build_server`."""

from __future__ import annotations

import httpx
import pytest
import respx
from mcp.server.fastmcp.exceptions import ToolError

from typebot_mcp.config import Settings
from typebot_mcp.server import build_server

BUILDER = "http://typebot-builder.test"

ALWAYS_ON_TOOLS = {
    "start_chat",
    "continue_chat",
    "start_chat_preview",
    "list_typebots",
    "get_typebot",
    "get_published_typebot",
    "list_results",
    "get_result",
    "get_result_logs",
    "get_analytics_stats",
    "list_folders",
    "list_workspaces",
    "list_credentials",
}

WRITE_TOOLS = {
    "create_typebot",
    "update_typebot",
    "publish_typebot",
    "unpublish_typebot",
    "delete_typebot",
    "delete_results",
}


async def test_build_server_registers_always_on_tools(settings: Settings) -> None:
    mcp = build_server(settings)
    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert names >= ALWAYS_ON_TOOLS
    assert names.isdisjoint(WRITE_TOOLS)


async def test_write_tools_registered_when_allowed(
    settings_writable: Settings,
) -> None:
    mcp = build_server(settings_writable)
    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert names >= ALWAYS_ON_TOOLS
    assert names >= WRITE_TOOLS


@respx.mock
async def test_start_chat_tool_invokes_client(settings: Settings) -> None:
    respx.post("http://typebot.test/api/v1/typebots/sample-public/startChat").mock(
        return_value=httpx.Response(200, json={"sessionId": "sess_42"})
    )

    mcp = build_server(settings)
    result = await mcp.call_tool(
        "start_chat",
        {"public_id": "sample-public", "message": "hi"},
    )
    assert "sess_42" in str(result)


@respx.mock
async def test_http_error_raises_tool_error(settings: Settings) -> None:
    respx.post("http://typebot.test/api/v1/typebots/x/startChat").mock(
        return_value=httpx.Response(500, text="boom")
    )

    mcp = build_server(settings)
    with pytest.raises(ToolError) as exc_info:
        await mcp.call_tool("start_chat", {"public_id": "x"})

    assert "500" in str(exc_info.value)


@respx.mock
async def test_list_typebots_tool(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots").mock(
        return_value=httpx.Response(
            200, json={"typebots": [{"id": "tb_a", "publishedTypebotId": "pt_a"}]}
        )
    )

    mcp = build_server(settings)
    result = await mcp.call_tool("list_typebots", {})
    assert "tb_a" in str(result)


@respx.mock
async def test_get_typebot_tool(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots/tb_1").mock(
        return_value=httpx.Response(200, json={"id": "tb_1"})
    )

    mcp = build_server(settings)
    result = await mcp.call_tool("get_typebot", {"typebot_id": "tb_1"})
    assert "tb_1" in str(result)


@respx.mock
async def test_list_results_tool_passes_pagination(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/typebots/tb_1/results").mock(
        return_value=httpx.Response(200, json={"results": []})
    )

    mcp = build_server(settings)
    await mcp.call_tool("list_results", {"typebot_id": "tb_1", "limit": 25, "cursor": "c1"})
    assert route.calls.last.request.url.params["limit"] == "25"


@respx.mock
async def test_analytics_stats_tool(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots/tb_1/analytics/stats").mock(
        return_value=httpx.Response(200, json={"totalViews": 99})
    )

    mcp = build_server(settings)
    result = await mcp.call_tool(
        "get_analytics_stats",
        {"typebot_id": "tb_1", "time_filter": "last7Days"},
    )
    assert "99" in str(result)


@respx.mock
async def test_create_typebot_only_when_writes_enabled(
    settings_writable: Settings,
) -> None:
    respx.post(f"{BUILDER}/api/v1/typebots").mock(
        return_value=httpx.Response(200, json={"id": "tb_new"})
    )

    mcp = build_server(settings_writable)
    result = await mcp.call_tool(
        "create_typebot",
        {"workspace_id": "ws_1", "typebot": {"name": "X"}},
    )
    assert "tb_new" in str(result)


@respx.mock
async def test_list_workspaces_tool(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/workspaces").mock(
        return_value=httpx.Response(200, json={"workspaces": [{"id": "ws_a"}]})
    )

    mcp = build_server(settings)
    result = await mcp.call_tool("list_workspaces", {})
    assert "ws_a" in str(result)


@respx.mock
async def test_list_credentials_tool(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/credentials").mock(
        return_value=httpx.Response(200, json={"credentials": [{"id": "cred_a", "name": "k"}]})
    )

    mcp = build_server(settings)
    result = await mcp.call_tool(
        "list_credentials",
        {"workspace_id": "ws_1", "credential_type": "google sheets"},
    )
    params = route.calls.last.request.url.params
    assert params["workspaceId"] == "ws_1"
    assert params["type"] == "google sheets"
    assert "cred_a" in str(result)


@respx.mock
async def test_publish_typebot_tool(settings_writable: Settings) -> None:
    respx.post(f"{BUILDER}/api/v1/typebots/tb_1/publish").mock(
        return_value=httpx.Response(200, json={"published": True})
    )

    mcp = build_server(settings_writable)
    result = await mcp.call_tool("publish_typebot", {"typebot_id": "tb_1"})
    assert "published" in str(result)
