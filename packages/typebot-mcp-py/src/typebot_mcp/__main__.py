"""CLI entry point: `python -m typebot_mcp` or the `typebot-mcp` script."""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Sequence

from pydantic import ValidationError

from typebot_mcp.config import Settings
from typebot_mcp.server import build_server

logger = logging.getLogger("typebot_mcp")


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="typebot-mcp",
        description="Run the Typebot MCP server (stdio or streamable HTTP).",
    )
    parser.add_argument(
        "--transport",
        choices=("stdio", "streamable-http", "sse"),
        default="stdio",
        help="MCP transport to use (default: stdio).",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind host for HTTP transports (default: 127.0.0.1).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Bind port for HTTP transports (default: 8000).",
    )
    parser.add_argument(
        "--stateful",
        action="store_true",
        help="Disable stateless_http (HTTP transports only).",
    )
    parser.add_argument(
        "--sse-responses",
        action="store_true",
        help="Stream responses as SSE instead of returning JSON.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable debug logging.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    try:
        settings = Settings()
    except ValidationError as exc:
        print(
            f"typebot-mcp: invalid configuration ({exc.error_count()} error(s)):\n{exc}",
            file=sys.stderr,
        )
        return 1

    mcp = build_server(
        settings,
        stateless_http=not args.stateful,
        json_response=not args.sse_responses,
    )

    try:
        if args.transport == "stdio":
            mcp.run(transport="stdio")
        else:
            mcp.settings.host = args.host
            mcp.settings.port = args.port
            mcp.run(transport=args.transport)
    except Exception:
        logger.exception("typebot-mcp: server crashed")
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
