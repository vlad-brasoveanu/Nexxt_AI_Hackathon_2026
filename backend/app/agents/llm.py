"""Calls to the routed model tier. Failures are returned, never hidden: the caller records them and uses its
deterministic path visibly. There is no fallback from one provider to another."""
import json
import re

from app.ai.provider import InferenceError


def provider_for(env, tier: str):
    return env.models.for_tier(tier) if env.models else None


def use(provider, tier: str, latency_ms: float | None = None, error: str | None = None) -> dict:
    return {"provider": provider.name, "model": provider.model, "tier": tier, "mode": provider.mode,
            "latency_ms": latency_ms, "error": error}


def ask_text(env, tier: str, messages: list[dict]) -> tuple[str | None, dict | None]:
    provider = provider_for(env, tier)
    if provider is None:
        return None, None
    try:
        completion = provider.complete(messages, timeout=env.timeout)
    except InferenceError as exc:
        return None, use(provider, tier, error=str(exc)[:200])
    return completion.text, use(provider, tier, completion.latency_ms)


def ask_json(env, tier: str, messages: list[dict]) -> tuple[dict | None, dict | None]:
    """One call plus one retry when the reply is not a JSON object."""
    model = None
    for _ in range(2):
        text, model = ask_text(env, tier, messages)
        if text is None:
            return None, model
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                value = json.loads(match.group(0))
                if isinstance(value, dict):
                    return value, model
            except json.JSONDecodeError:
                pass
        messages = messages + [{"role": "assistant", "content": text[:2000]},
                               {"role": "user", "content": "Răspunsul nu a fost un obiect JSON valid. Răspunde DOAR cu obiectul JSON cerut."}]
    if model:
        model["error"] = "Răspuns JSON invalid după o reîncercare"
    return None, model
