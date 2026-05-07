"""Typebot MCP exception hierarchy."""

from __future__ import annotations


class TypebotError(Exception):
    """Base exception for all typebot-mcp errors."""


class TypebotHTTPError(TypebotError):
    """Raised when the Typebot HTTP API returns a non-2xx response."""

    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        url: str | None = None,
        body: str | None = None,
    ) -> None:
        self.status_code = status_code
        self.url = url
        self.body = body
        suffix = f" ({url})" if url else ""
        super().__init__(f"HTTP {status_code}: {message}{suffix}")


class TypebotConfigError(TypebotError):
    """Raised when configuration is missing or invalid."""
