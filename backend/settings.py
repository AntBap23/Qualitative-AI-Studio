from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class BackendSettings(BaseSettings):
    api_title: str = "Qualitative AI Interview Studio API"
    api_version: str = "0.1.0"
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    n8n_support_ticket_webhook_url: str | None = Field(default=None, alias="N8N_SUPPORT_TICKET_WEBHOOK_URL")
    n8n_support_ticket_webhook_secret: str | None = Field(default=None, alias="N8N_SUPPORT_TICKET_WEBHOOK_SECRET")
    n8n_support_ticket_timeout_seconds: float = Field(default=20.0, alias="N8N_SUPPORT_TICKET_TIMEOUT_SECONDS")
    storage_backend: str = Field(default="local", alias="STORAGE_BACKEND")
    local_storage_root: Path = Field(default=Path("backend_data"), alias="LOCAL_STORAGE_ROOT")
    supabase_url: str | None = Field(default=None, alias="SUPABASE_URL")
    supabase_anon_key: str | None = Field(default=None, alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str | None = Field(default=None, alias="SUPABASE_SERVICE_ROLE_KEY")
    auth_access_cookie_name: str = Field(default="qa_access_token", alias="AUTH_ACCESS_COOKIE_NAME")
    auth_refresh_cookie_name: str = Field(default="qa_refresh_token", alias="AUTH_REFRESH_COOKIE_NAME")
    auth_cookie_secure: bool = Field(default=False, alias="AUTH_COOKIE_SECURE")
    auth_cookie_samesite: str = Field(default="lax", alias="AUTH_COOKIE_SAMESITE")
    cors_origins: str = Field(default="http://127.0.0.1:8000,http://localhost:8000", alias="CORS_ORIGINS")
    max_upload_bytes: int = Field(default=5 * 1024 * 1024, alias="MAX_UPLOAD_BYTES")
    allowed_upload_extensions: str = Field(default=".txt,.md,.pdf,.docx", alias="ALLOWED_UPLOAD_EXTENSIONS")
    auth_rate_limit_attempts: int = Field(default=8, alias="AUTH_RATE_LIMIT_ATTEMPTS")
    auth_rate_limit_window_seconds: int = Field(default=300, alias="AUTH_RATE_LIMIT_WINDOW_SECONDS")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [item.strip().rstrip("/") for item in self.cors_origins.split(",") if item.strip()]
        return origins or ["http://127.0.0.1:8000", "http://localhost:8000"]

    @property
    def allowed_upload_extension_set(self) -> set[str]:
        return {item.strip().lower() for item in self.allowed_upload_extensions.split(",") if item.strip()}

    @property
    def allowed_origin_hosts(self) -> set[str]:
        hosts: set[str] = set()
        for origin in self.cors_origin_list:
            parsed = urlparse(origin)
            if parsed.netloc:
                hosts.add(parsed.netloc.lower())
        return hosts


settings = BackendSettings()
