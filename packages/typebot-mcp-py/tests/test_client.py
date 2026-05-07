"""Unit tests for `typebot_mcp.client.TypebotClient`."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from typebot_mcp.client import TypebotClient
from typebot_mcp.config import Settings
from typebot_mcp.exceptions import TypebotHTTPError


@respx.mock
async def test_start_chat_sends_expected_payload_and_headers(settings: Settings) -> None:
    route = respx.post("http://typebot.test/api/v1/typebots/sample-public/startChat").mock(
        return_value=httpx.Response(
            200,
            json={"sessionId": "sess_1", "messages": [{"type": "text", "content": "hi"}]},
        )
    )

    async with TypebotClient(settings) as client:
        result = await client.start_chat(
            "sample-public",
            message="hello",
            prefilled_variables={"Name": "Ada"},
            text_bubble_content_format="markdown",
        )

    assert result["sessionId"] == "sess_1"
    request = route.calls.last.request
    sent = json.loads(request.content)
    assert sent == {
        "publicId": "sample-public",
        "message": "hello",
        "prefilledVariables": {"Name": "Ada"},
        "isOnlyRegistering": False,
        "isStreamEnabled": False,
        "textBubbleContentFormat": "markdown",
    }
    assert request.headers["authorization"] == "Bearer test-token"
    assert request.headers["x-tenant"] == "acme"
    assert "x-include-drafts" not in {k.lower() for k in request.headers}


@respx.mock
async def test_continue_chat_round_trip(settings: Settings) -> None:
    respx.post("http://typebot.test/api/v1/sessions/sess_1/continueChat").mock(
        return_value=httpx.Response(200, json={"messages": []})
    )

    async with TypebotClient(settings) as client:
        result = await client.continue_chat("sess_1", message="yes")

    assert result == {"messages": []}


@respx.mock
async def test_http_error_is_raised(settings: Settings) -> None:
    respx.post("http://typebot.test/api/v1/typebots/missing/startChat").mock(
        return_value=httpx.Response(404, json={"message": "Typebot not found"}),
    )

    async with TypebotClient(settings) as client:
        with pytest.raises(TypebotHTTPError) as excinfo:
            await client.start_chat("missing")

    assert excinfo.value.status_code == 404
    assert "Typebot not found" in (excinfo.value.body or "")


@respx.mock
async def test_include_drafts_header_when_enabled() -> None:
    cfg = Settings(
        api_base_url="http://typebot.test",  # type: ignore[arg-type]
        tenant="acme",
        include_drafts=True,
    )
    route = respx.post("http://typebot.test/api/v1/typebots/x/preview/startChat").mock(
        return_value=httpx.Response(200, json={"ok": True})
    )

    async with TypebotClient(cfg) as client:
        await client.start_chat_preview("x", message="hi")

    assert route.calls.last.request.headers["x-include-drafts"] == "true"
