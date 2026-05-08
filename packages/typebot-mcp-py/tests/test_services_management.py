"""Unit tests for management/results/analytics/folders/workspaces services."""

from __future__ import annotations

import httpx
import respx

from typebot_mcp.config import Settings
from typebot_mcp.lifespan import app_lifespan
from typebot_mcp.services import (
    analytics,
    folders,
    results,
    typebots,
    workspaces,
)

BUILDER = "http://typebot-builder.test"


@respx.mock
async def test_list_typebots_filters_drafts(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots").mock(
        return_value=httpx.Response(
            200,
            json={
                "typebots": [
                    {"id": "tb_a", "publishedTypebotId": "pt_a"},
                    {"id": "tb_draft", "publishedTypebotId": None},
                ]
            },
        )
    )

    async with app_lifespan(settings) as app:
        data = await typebots.list_typebots(app.builder, include_drafts=False)

    ids = [tb["id"] for tb in data["typebots"]]
    assert ids == ["tb_a"]


@respx.mock
async def test_list_typebots_includes_drafts_when_enabled(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots").mock(
        return_value=httpx.Response(
            200,
            json={
                "typebots": [
                    {"id": "tb_a", "publishedTypebotId": "pt_a"},
                    {"id": "tb_draft", "publishedTypebotId": None},
                ]
            },
        )
    )

    async with app_lifespan(settings) as app:
        data = await typebots.list_typebots(app.builder, include_drafts=True)

    assert {tb["id"] for tb in data["typebots"]} == {"tb_a", "tb_draft"}


@respx.mock
async def test_get_typebot(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots/tb_1").mock(
        return_value=httpx.Response(200, json={"id": "tb_1"})
    )

    async with app_lifespan(settings) as app:
        result = await typebots.get_typebot(app.builder, "tb_1")

    assert result == {"id": "tb_1"}


@respx.mock
async def test_get_published_typebot(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots/tb_1/publishedTypebot").mock(
        return_value=httpx.Response(200, json={"id": "pt_1"})
    )

    async with app_lifespan(settings) as app:
        result = await typebots.get_published_typebot(app.builder, "tb_1")

    assert result == {"id": "pt_1"}


@respx.mock
async def test_create_typebot_posts_payload(settings: Settings) -> None:
    route = respx.post(f"{BUILDER}/api/v1/typebots").mock(
        return_value=httpx.Response(200, json={"id": "tb_new"})
    )

    async with app_lifespan(settings) as app:
        result = await typebots.create_typebot(
            app.builder, workspace_id="ws_1", typebot={"name": "X"}
        )

    assert result == {"id": "tb_new"}
    body = route.calls.last.request.read().decode()
    assert "workspaceId" in body
    assert '"name":"X"' in body or '"name": "X"' in body


@respx.mock
async def test_update_typebot_patch(settings: Settings) -> None:
    route = respx.patch(f"{BUILDER}/api/v1/typebots/tb_1").mock(
        return_value=httpx.Response(200, json={"id": "tb_1"})
    )

    async with app_lifespan(settings) as app:
        await typebots.update_typebot(app.builder, "tb_1", typebot={"name": "Y"})

    body = route.calls.last.request.read().decode()
    assert '"typebot"' in body
    assert "Y" in body


@respx.mock
async def test_publish_typebot(settings: Settings) -> None:
    respx.post(f"{BUILDER}/api/v1/typebots/tb_1/publish").mock(
        return_value=httpx.Response(200, json={"published": True})
    )

    async with app_lifespan(settings) as app:
        result = await typebots.publish_typebot(app.builder, "tb_1")

    assert result == {"published": True}


@respx.mock
async def test_unpublish_typebot(settings: Settings) -> None:
    respx.post(f"{BUILDER}/api/v1/typebots/tb_1/unpublish").mock(
        return_value=httpx.Response(200, json={})
    )

    async with app_lifespan(settings) as app:
        await typebots.unpublish_typebot(app.builder, "tb_1")


@respx.mock
async def test_delete_typebot(settings: Settings) -> None:
    respx.delete(f"{BUILDER}/api/v1/typebots/tb_1").mock(return_value=httpx.Response(200, json={}))

    async with app_lifespan(settings) as app:
        await typebots.delete_typebot(app.builder, "tb_1")


@respx.mock
async def test_list_results_passes_pagination(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/typebots/tb_1/results").mock(
        return_value=httpx.Response(200, json={"results": []})
    )

    async with app_lifespan(settings) as app:
        await results.list_results(app.builder, "tb_1", limit=25, cursor="c1")

    params = route.calls.last.request.url.params
    assert params["limit"] == "25"
    assert params["cursor"] == "c1"


@respx.mock
async def test_get_result(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots/tb_1/results/r_1").mock(
        return_value=httpx.Response(200, json={"id": "r_1"})
    )

    async with app_lifespan(settings) as app:
        result = await results.get_result(app.builder, "tb_1", "r_1")

    assert result == {"id": "r_1"}


@respx.mock
async def test_get_result_logs(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/typebots/tb_1/results/r_1/logs").mock(
        return_value=httpx.Response(200, json={"logs": []})
    )

    async with app_lifespan(settings) as app:
        await results.get_result_logs(app.builder, "tb_1", "r_1")


@respx.mock
async def test_delete_results_all(settings: Settings) -> None:
    route = respx.delete(f"{BUILDER}/api/v1/typebots/tb_1/results").mock(
        return_value=httpx.Response(200, json={})
    )

    async with app_lifespan(settings) as app:
        await results.delete_results(app.builder, "tb_1")

    assert "resultIds" not in route.calls.last.request.url.params


@respx.mock
async def test_delete_results_specific(settings: Settings) -> None:
    route = respx.delete(f"{BUILDER}/api/v1/typebots/tb_1/results").mock(
        return_value=httpx.Response(200, json={})
    )

    async with app_lifespan(settings) as app:
        await results.delete_results(app.builder, "tb_1", result_ids=["r1", "r2"])

    assert route.calls.last.request.url.params["resultIds"] == "r1,r2"


async def test_delete_results_empty_list_is_noop(settings: Settings) -> None:
    async with app_lifespan(settings) as app:
        result = await results.delete_results(app.builder, "tb_1", result_ids=[])
    assert result == {}


@respx.mock
async def test_get_analytics_stats(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/typebots/tb_1/analytics/stats").mock(
        return_value=httpx.Response(200, json={"totalViews": 99})
    )

    async with app_lifespan(settings) as app:
        result = await analytics.get_analytics_stats(
            app.builder, "tb_1", time_filter="last7Days", time_zone="UTC"
        )

    assert result == {"totalViews": 99}
    params = route.calls.last.request.url.params
    assert params["timeFilter"] == "last7Days"
    assert params["timeZone"] == "UTC"


@respx.mock
async def test_list_folders(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/folders").mock(
        return_value=httpx.Response(200, json={"folders": []})
    )

    async with app_lifespan(settings) as app:
        await folders.list_folders(app.builder, workspace_id="ws_1", parent_folder_id="f_root")

    params = route.calls.last.request.url.params
    assert params["workspaceId"] == "ws_1"
    assert params["parentFolderId"] == "f_root"


@respx.mock
async def test_list_workspaces(settings: Settings) -> None:
    respx.get(f"{BUILDER}/api/v1/workspaces").mock(
        return_value=httpx.Response(200, json={"workspaces": [{"id": "ws_a"}]})
    )

    async with app_lifespan(settings) as app:
        result = await workspaces.list_workspaces(app.builder)

    assert result["workspaces"][0]["id"] == "ws_a"


@respx.mock
async def test_list_credentials(settings: Settings) -> None:
    route = respx.get(f"{BUILDER}/api/v1/credentials").mock(
        return_value=httpx.Response(200, json={"credentials": [{"id": "c_a", "name": "k"}]})
    )

    async with app_lifespan(settings) as app:
        result = await workspaces.list_credentials(
            app.builder, workspace_id="ws_1", credential_type="google sheets"
        )

    assert result["credentials"][0]["id"] == "c_a"
    params = route.calls.last.request.url.params
    assert params["workspaceId"] == "ws_1"
    assert params["type"] == "google sheets"
