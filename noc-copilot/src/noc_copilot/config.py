"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_uri: str
    mongodb_database: str = "noc_copilot"
    voyage_api_key: str
    anthropic_api_key: str
    voyage_model: str = "voyage-4-large"
    voyage_context_model: str = "voyage-context-3"
    voyage_dimensions: int = 1024
    anthropic_model: str = "claude-sonnet-4-20250514"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
