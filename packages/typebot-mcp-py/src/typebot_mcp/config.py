"""Runtime configuration loaded from environment variables / .env files."""

from __future__ import annotations

from pydantic import Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings for the Typebot MCP server.

    Environment variables (prefix `TYPEBOT_`):

    - ``TYPEBOT_API_BASE_URL`` — base URL of the Typebot viewer API
      (e.g. ``http://localhost:3003``). The chat endpoints live under
      ``/api/v1`` of this host.
    - ``TYPEBOT_API_TOKEN`` — bearer token for authenticated tRPC/REST
      calls (`Authorization: Bearer …`).
    - ``TYPEBOT_TENANT`` — default tenant slug forwarded as the
      ``x-tenant`` header.
    - ``TYPEBOT_TIMEOUT_SECONDS`` — request timeout for the underlying
      ``httpx.AsyncClient``.
    - ``TYPEBOT_INCLUDE_DRAFTS`` — when ``true`` the server adds the
      ``X-Include-Drafts: true`` header on every upstream request
      (viewer + builder). Honoured only by the TS ``/api/mcp`` proxy;
      the REST handlers ignore it, but it is forwarded uniformly.
    - ``TYPEBOT_BUILDER_BASE_URL`` — base URL of the Typebot builder API
      (management endpoints — typebot CRUD, results, analytics, folders).
      Falls back to ``TYPEBOT_API_BASE_URL`` when unset (single-host
      reverse-proxy deployments).
    - ``TYPEBOT_ALLOW_WRITES`` — when ``true`` the server registers
      destructive/mutating tools (create/update/delete/publish). Default
      ``false`` for safer shared deployments.
    """

    model_config = SettingsConfigDict(
        env_prefix="TYPEBOT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="forbid",
    )

    api_base_url: HttpUrl = Field(
        default=HttpUrl("http://localhost:3003"),
        description="Base URL of the Typebot viewer API.",
    )
    api_token: str | None = Field(
        default=None,
        description="Bearer token for authenticated requests.",
    )
    tenant: str | None = Field(
        default=None,
        description="Default tenant slug forwarded as the x-tenant header.",
    )
    timeout_seconds: float = Field(
        default=30.0,
        ge=1.0,
        le=600.0,
        description="HTTP request timeout in seconds.",
    )
    include_drafts: bool = Field(
        default=False,
        description="Forward X-Include-Drafts: true on discovery requests.",
    )
    builder_base_url: HttpUrl | None = Field(
        default=None,
        description=("Base URL of the Typebot builder API. Falls back to api_base_url when unset."),
    )
    allow_writes: bool = Field(
        default=False,
        description=("Register mutating tools (create/update/delete/publish). Default false."),
    )

    @property
    def base_url_str(self) -> str:
        """Return the viewer base URL as a string without a trailing slash."""
        return str(self.api_base_url).rstrip("/")

    @property
    def builder_url_str(self) -> str:
        """Return the builder base URL (or viewer URL when unset)."""
        url = self.builder_base_url or self.api_base_url
        return str(url).rstrip("/")
