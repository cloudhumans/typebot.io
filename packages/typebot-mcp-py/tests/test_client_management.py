"""Unit tests for TypebotClient management/results methods."""

from __future__ import annotations

import json

import httpx
import pytest
import respx
from pydantic import HttpUrl

from typebot_mcp.client import TypebotClient
from typebot_mcp.config import Settings
from typebot_mcp.exceptions import TypebotHTTPError

BUILDER = "http://typebot-builder.test"


@respx.mock
async def test_list_typebots_sends_query_params(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/typebots").mock(
        return_value=httpx.Response(200, json={"typebots": []})
    )

    async with TypebotClient(settings) as client:
        result = await client.list_typebots(workspace_id="ws_1", folder_id=None)

    assert result == {"typebots": []}
    request = route.calls.last.request
    assert request.url.params["workspaceId"] == "ws_1"
    assert "folderId" not in request.url.params
    assert request.headers["x-tenant"] == "acme"


@respx.mock
async def test_list_typebots_handles_array_response(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots").mock(
        return_value=httpx.Response(200, json=[{"id": "tb_1"}, {"id": "tb_2"}])
    )

    async with TypebotClient(settings) as client:
        result = await client.list_typebots()

    assert result == {"items": [{"id": "tb_1"}, {"id": "tb_2"}]}


@respx.mock
async def test_get_typebot(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots/tb_1").mock(
        return_value=httpx.Response(200, json={"id": "tb_1", "name": "Bot"})
    )

    async with TypebotClient(settings) as client:
        result = await client.get_typebot("tb_1")

    assert result["id"] == "tb_1"


@respx.mock
async def test_get_published_typebot(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots/tb_1/publishedTypebot").mock(
        return_value=httpx.Response(200, json={"version": 4})
    )

    async with TypebotClient(settings) as client:
        result = await client.get_published_typebot("tb_1")

    assert result == {"version": 4}


@respx.mock
async def test_create_typebot_posts_payload(settings: Settings) -> None:
    route = respx.post(f"{BUILDER}/api/v1/typebots").mock(
        return_value=httpx.Response(200, json={"id": "tb_new"})
    )

    async with TypebotClient(settings) as client:
        await client.create_typebot(workspace_id="ws_1", typebot={"name": "Bot", "groups": []})

    body = json.loads(route.calls.last.request.content)
    assert body == {"workspaceId": "ws_1", "typebot": {"name": "Bot", "groups": []}}


@respx.mock
async def test_update_typebot_patches(settings: Settings) -> None:
    route = respx.patch(f"{BUILDER}/api/v1/typebots/tb_1").mock(
        return_value=httpx.Response(200, json={"id": "tb_1"})
    )

    async with TypebotClient(settings) as client:
        await client.update_typebot("tb_1", typebot={"name": "Renamed"})

    body = json.loads(route.calls.last.request.content)
    assert body == {"typebot": {"name": "Renamed"}}


@respx.mock
async def test_publish_unpublish_delete(settings: Settings) -> None:
    publish = respx.post(f"{BUILDER}/api/v1/typebots/tb_1/publish").mock(
        return_value=httpx.Response(200, json={"published": True})
    )
    unpublish = respx.post(f"{BUILDER}/api/v1/typebots/tb_1/unpublish").mock(
        return_value=httpx.Response(200, json={"published": False})
    )
    delete = respx.delete(f"{BUILDER}/api/v1/typebots/tb_1").mock(
        return_value=httpx.Response(200, json={"deleted": True})
    )

    async with TypebotClient(settings) as client:
        await client.publish_typebot("tb_1")
        await client.unpublish_typebot("tb_1")
        await client.delete_typebot("tb_1")

    assert publish.called and unpublish.called and delete.called


@respx.mock
async def test_list_results_with_pagination(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/typebots/tb_1/results").mock(
        return_value=httpx.Response(200, json={"results": [], "nextCursor": None})
    )

    async with TypebotClient(settings) as client:
        await client.list_results("tb_1", limit=50, cursor="abc")

    request = route.calls.last.request
    assert request.url.params["limit"] == "50"
    assert request.url.params["cursor"] == "abc"


@respx.mock
async def test_get_result_and_logs(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots/tb_1/results/r_1").mock(
        return_value=httpx.Response(200, json={"id": "r_1"})
    )
    respx.get(f"{BUILDER}/api/v1/typebots/tb_1/results/r_1/logs").mock(
        return_value=httpx.Response(200, json={"logs": []})
    )

    async with TypebotClient(settings) as client:
        r = await client.get_result("tb_1", "r_1")
        logs = await client.get_result_logs("tb_1", "r_1")

    assert r["id"] == "r_1"
    assert logs == {"logs": []}


@respx.mock
async def test_delete_results_with_ids(settings: Settings) -> None:
    route = respx.delete(f"{BUILDER}/api/v1/typebots/tb_1/results").mock(
        return_value=httpx.Response(200, json={"count": 2})
    )

    async with TypebotClient(settings) as client:
        await client.delete_results("tb_1", result_ids=["r_1", "r_2"])

    assert route.calls.last.request.url.params["resultIds"] == "r_1,r_2"


@respx.mock
async def test_get_analytics_stats(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/typebots/tb_1/analytics/stats").mock(
        return_value=httpx.Response(200, json={"totalViews": 42})
    )

    async with TypebotClient(settings) as client:
        result = await client.get_analytics_stats("tb_1", time_filter="last7Days", time_zone="UTC")

    assert result == {"totalViews": 42}
    params = route.calls.last.request.url.params
    assert params["timeFilter"] == "last7Days"
    assert params["timeZone"] == "UTC"


@respx.mock
async def test_list_folders(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/folders").mock(
        return_value=httpx.Response(200, json={"folders": []})
    )

    async with TypebotClient(settings) as client:
        await client.list_folders(workspace_id="ws_1", parent_folder_id="f_root")

    params = route.calls.last.request.url.params
    assert params["workspaceId"] == "ws_1"
    assert params["parentFolderId"] == "f_root"


@respx.mock
async def test_builder_falls_back_to_api_base_url_when_unset() -> None:
    cfg = Settings(
        api_base_url=HttpUrl("http://typebot.test"),
        api_token="t",
        tenant="acme",
    )
    route = respx.get("http://typebot.test/api/v1/typebots").mock(
        return_value=httpx.Response(200, json={"typebots": []})
    )

    async with TypebotClient(cfg) as client:
        await client.list_typebots()

    assert route.called


@respx.mock
async def test_list_typebots_filters_drafts_when_include_drafts_false(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots").mock(
        return_value=httpx.Response(
            200,
            json={
                "typebots": [
                    {"id": "draft1", "name": "Draft Bot"},
                    {"id": "pub1", "name": "Published Bot", "publishedTypebotId": "pt1"},
                    {"id": "draft2", "name": "Another Draft", "publishedTypebotId": None},
                ]
            },
        )
    )

    async with TypebotClient(settings) as client:
        result = await client.list_typebots(workspace_id="ws_1")

    assert result["typebots"] == [
        {"id": "pub1", "name": "Published Bot", "publishedTypebotId": "pt1"}
    ]


@respx.mock
async def test_list_typebots_keeps_drafts_when_include_drafts_true() -> None:
    cfg = Settings(
        api_base_url=HttpUrl("http://typebot.test"),
        builder_base_url=HttpUrl("http://typebot-builder.test"),
        api_token="t",
        tenant="acme",
        include_drafts=True,
    )
    payload = {
        "typebots": [
            {"id": "draft1"},
            {"id": "pub1", "publishedTypebotId": "pt1"},
        ]
    }
    respx.get(f"{BUILDER}/api/v1/typebots").mock(return_value=httpx.Response(200, json=payload))

    async with TypebotClient(cfg) as client:
        result = await client.list_typebots()

    assert result == payload


@respx.mock
async def test_list_workspaces(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/workspaces").mock(
        return_value=httpx.Response(
            200,
            json={"workspaces": [{"id": "ws_1", "name": "Acme", "icon": None, "plan": "FREE"}]},
        )
    )

    async with TypebotClient(settings) as client:
        out = await client.list_workspaces()

    assert route.called
    assert out["workspaces"][0]["id"] == "ws_1"


@respx.mock
async def test_list_credentials_sends_type_param(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/credentials").mock(
        return_value=httpx.Response(
            200, json={"credentials": [{"id": "cred_1", "name": "default sheets"}]}
        )
    )

    async with TypebotClient(settings) as client:
        out = await client.list_credentials(workspace_id="ws_1", type="google sheets")

    params = route.calls.last.request.url.params
    assert params["workspaceId"] == "ws_1"
    assert params["type"] == "google sheets"
    assert out["credentials"][0]["id"] == "cred_1"


@respx.mock
async def test_management_http_error_propagates(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots/missing").mock(
        return_value=httpx.Response(404, json={"message": "Not found"})
    )

    async with TypebotClient(settings) as client:
        with pytest.raises(TypebotHTTPError) as excinfo:
            await client.get_typebot("missing")

    assert excinfo.value.status_code == 404
