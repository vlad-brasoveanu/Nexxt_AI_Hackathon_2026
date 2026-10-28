from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CASECHECK_", env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://casecheck:casecheck@localhost:5432/casecheck"
    storage_dir: str = ".runtime/documents"
    secure_cookies: bool = True
    max_document_bytes: int = 2_000_000
