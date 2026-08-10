"""Tests for the transport helper — recursive None strip + array wrap."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from typebot_mcp.transport import _drop_nones, request


def test_drop_nones_strips_nested_dict_values() -> None:
    payload = {
        "typebot": {
            "name": "Hello",
            "folderId": None,
            "settings": {"general": {"isHidden": None, "isPublic": True}},
        }
    }

    cleaned = _drop_nones(payload)

    assert cleaned == {
        "typebot": {
            "name": "Hello",
            "settings": {"general": {"isPublic": True}},
        }
    }


def test_drop_nones_strips_nones_inside_lists() -> None:
    payload = {"items": [{"id": 1, "label": None}, None, {"id": 2}]}

    cleaned = _drop_nones(payload)

    assert cleaned == {"items": [{"id": 1}, {"id": 2}]}


def test_drop_nones_passes_scalars_through() -> None:
    assert _drop_nones("a") == "a"
    assert _drop_nones(0) == 0
    assert _drop_nones(False) is False


@pytest.mark.asyncio
@respx.mock
async def test_request_does_not_send_nested_nulls() -> None:
    route = respx.patch("http://typebot.test/api/v1/typebots/abc").mock(
        return_value=httpx.Response(200, json={"typebot": {"id": "abc"}}),
    )

    async with httpx.AsyncClient(base_url="http://typebot.test") as client:
        await request(
            client,
            "PATCH",
            "/api/v1/typebots/abc",
            payload={
                "typebot": {
                    "name": "renamed",
                    "folderId": None,
                    "metadata": {"keep": True, "drop": None},
                }
            },
        )

    assert route.called
    sent = json.loads(route.calls.last.request.content.decode())
    assert sent == {"typebot": {"name": "renamed", "metadata": {"keep": True}}}


@pytest.mark.asyncio
@respx.mock
async def test_request_wraps_array_response_as_items() -> None:
    respx.get("http://typebot.test/api/v1/workspaces").mock(
        return_value=httpx.Response(200, json=[{"id": "w1"}, {"id": "w2"}]),
    )

    async with httpx.AsyncClient(base_url="http://typebot.test") as client:
        result = await request(client, "GET", "/api/v1/workspaces")

    assert result == {"items": [{"id": "w1"}, {"id": "w2"}]}
