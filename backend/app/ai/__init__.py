"""AI layer: inference providers and evidence-bound extraction proposals."""
from app.ai.featherless import FeatherlessProvider
from app.ai.provider import Completion, InferenceError, InferenceProvider


def build_provider(settings) -> InferenceProvider | None:
    """Return the configured provider, or None when AI is not configured. No implicit fallback."""
    if settings.featherless_api_key:
        return FeatherlessProvider(settings.featherless_api_key.get_secret_value(), settings.ai_model, settings.ai_base_url)
    return None


__all__ = ["Completion", "InferenceError", "InferenceProvider", "build_provider"]
