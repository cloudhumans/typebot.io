"""Tests asserting tool annotations match the design table in the plan."""

from __future__ import annotations

from typebot_mcp.config import Settings
from typebot_mcp.server import build_server

# Mapping per the approved plan: name -> (readOnlyHint, destructiveHint, idempotentHint).
EXPECTED: dict[str, tuple[bool, bool, bool]] = {
    "start_chat": (False, False, False),
    "continue_chat": (False, False, False),
    "start_chat_preview": (False, False, False),
    "list_typebots": (True, False, True),
    "get_typebot": (True, False, True),
    "get_published_typebot": (True, False, True),
    "list_results": (True, False, True),
    "get_result": (True, False, True),
    "get_result_logs": (True, False, True),
    "get_analytics_stats": (True, False, True),
    "list_folders": (True, False, True),
    "list_workspaces": (True, False, True),
    "list_credentials": (True, False, True),
    "create_typebot": (False, False, False),
    "update_typebot": (False, False, True),
    "publish_typebot": (False, False, True),
    "unpublish_typebot": (False, True, True),
    "delete_typebot": (False, True, True),
    "delete_results": (False, True, True),
}


async def test_every_tool_has_expected_annotations(
    settings_writable: Settings,
) -> None:
    mcp = build_server(settings_writable)
    tools = await mcp.list_tools()
    by_name = {t.name: t for t in tools}

    for name, (read_only, destructive, idempotent) in EXPECTED.items():
        tool = by_name.get(name)
        assert tool is not None, f"missing tool: {name}"
        ann = tool.annotations
        assert ann is not None, f"tool {name} has no annotations"
        assert ann.readOnlyHint is read_only, f"{name}.readOnlyHint"
        assert ann.destructiveHint is destructive, f"{name}.destructiveHint"
        assert ann.idempotentHint is idempotent, f"{name}.idempotentHint"
