"""AI layer: inference providers, model routing by tier and evidence-bound extraction proposals."""
from dataclasses import dataclass

from app.ai.featherless import FeatherlessProvider
from app.ai.provider import Completion, InferenceError, InferenceProvider


def build_provider(settings) -> InferenceProvider | None:
    """Return the configured provider, or None when AI is not configured. No implicit fallback."""
    if settings.featherless_api_key:
        return FeatherlessProvider(settings.featherless_api_key.get_secret_value(), settings.ai_model, settings.ai_base_url)
    return None


@dataclass
class ModelRouter:
    """Routes each agent to the smallest model that does its job. Both None means deterministic mode, shown as such."""
    large: InferenceProvider | None = None
    small: InferenceProvider | None = None

    def for_tier(self, tier: str) -> InferenceProvider | None:
        return self.large if tier == "large" else self.small if tier == "small" else None


def build_router(settings) -> ModelRouter:
    if not settings.featherless_api_key:
        return ModelRouter()
    key = settings.featherless_api_key.get_secret_value()
    return ModelRouter(large=FeatherlessProvider(key, settings.ai_model, settings.ai_base_url),
                       small=FeatherlessProvider(key, settings.ai_model_small, settings.ai_base_url))


__all__ = ["Completion", "InferenceError", "InferenceProvider", "ModelRouter", "build_provider", "build_router"]
