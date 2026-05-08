"""Unit tests for chat service functions."""

from __future__ import annotations

import httpx
import pytest
import respx

from typebot_mcp.config import Settings
from typebot_mcp.exceptions import TypebotHTTPError
from typebot_mcp.lifespan import app_lifespan
from typebot_mcp.services import chat


@respx.mock
async def test_start_chat_posts_to_public_id(settings: Settings) -> None:
    route = respx.post("http://typebot.test/api/v1/typebots/sample-public/startChat").mock(
        return_value=httpx.Response(200, json={"sessionId": "sess_42"})
    )

    async with app_lifespan(settings) as app:
        result = await chat.start_chat(
            app.viewer,
            "sample-public",
            message="hi",
            prefilled_variables={"name": "X"},
        )

    assert result == {"sessionId": "sess_42"}
    body = route.calls.last.request.read().decode()
    assert "sample-public" not in body
    assert "hi" in body
    assert "prefilledVariables" in body


@respx.mock
async def test_continue_chat_posts_to_session(settings: Settings) -> None:
    respx.post("http://typebot.test/api/v1/sessions/sess_1/continueChat").mock(
        return_value=httpx.Response(200, json={"messages": []})
    )

    async with app_lifespan(settings) as app:
        result = await chat.continue_chat(app.viewer, "sess_1", message="reply")

    assert result == {"messages": []}


@respx.mock
async def test_start_chat_preview_posts_to_typebot_id(settings: Settings) -> None:
    respx.post("http://typebot.test/api/v1/typebots/tb_1/preview/startChat").mock(
        return_value=httpx.Response(200, json={"sessionId": "preview_1"})
    )

    async with app_lifespan(settings) as app:
        result = await chat.start_chat_preview(app.viewer, "tb_1")

    assert result == {"sessionId": "preview_1"}


@respx.mock
async def test_chat_raises_typebot_http_error_on_500(settings: Settings) -> None:
    respx.post("http://typebot.test/api/v1/typebots/x/startChat").mock(
        return_value=httpx.Response(500, text="boom")
    )

    async with app_lifespan(settings) as app:
        with pytest.raises(TypebotHTTPError) as exc_info:
            await chat.start_chat(app.viewer, "x")

    assert exc_info.value.status_code == 500
