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
    # Large tier: orchestrator planning and the credit memo. Small tier: extraction and client messages.
    # 14B replaced 32B after the 2026-10-28 measurement (32B 0/10, 14B 10/10 correct extractions).
    ai_model: str = "Qwen/Qwen2.5-14B-Instruct"
    ai_model_small: str = "Qwen/Qwen2.5-7B-Instruct"
    ai_timeout_seconds: float = 90
    # Multi-agent credit workflow.
    fixtures_dir: str = "fixtures"
    history_path: str = "fixtures/credit/history/historical_cases.db"
    agent_budget: int = 16                 # dispatched tasks per segment (start or resume)
    agent_deadline_seconds: float = 300
    agent_sync: bool = False               # run agents inline (tests) instead of in a background thread
    evaluation_date: str | None = None     # ISO date; defaults to today
    demo_simulations: bool = True          # simulated client portal answers and the guard test button
