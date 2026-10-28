from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CASECHECK_", env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://casecheck:casecheck@localhost:5432/casecheck"
    frontend_dir: str = ""
    storage_dir: str = ".runtime/documents"
    secure_cookies: bool = True
    allowed_origins: frozenset[str] = frozenset()
    max_document_bytes: int = 2_000_000
    # Demo inference (cloud, synthetic data only). The key stays server-side.
    featherless_api_key: SecretStr | None = Field(default=None, validation_alias=AliasChoices("FEATHERLESS_API_KEY", "CASECHECK_FEATHERLESS_API_KEY"))
    ai_base_url: str = "https://api.featherless.ai/v1"
    ai_model: str = "Qwen/Qwen2.5-32B-Instruct"
    ai_timeout_seconds: float = 90
