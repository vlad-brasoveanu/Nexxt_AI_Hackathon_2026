"""Featherless adapter (OpenAI-compatible chat completions). Cloud demo use with synthetic documents only."""
from time import perf_counter

import httpx

from app.ai.provider import Completion, InferenceError

RETRYABLE = {408, 429, 500, 502, 503, 504}


class FeatherlessProvider:
    name, mode = "featherless", "cloud"

    def __init__(self, api_key: str, model: str, base_url: str, transport: httpx.BaseTransport | None = None):
        self.model = model
        self._client = httpx.Client(base_url=base_url, transport=transport,
                                    headers={"Authorization": f"Bearer {api_key}"})

    def complete(self, messages, *, timeout):
        body = {"model": self.model, "messages": messages, "temperature": 0, "max_tokens": 1200}
        start = perf_counter()
        for attempt in range(2):  # one bounded retry for transient failures
            try:
                response = self._client.post("/chat/completions", json=body, timeout=timeout)
            except httpx.TimeoutException as exc:
                if attempt:
                    raise InferenceError("Provider timed out") from exc
                continue
            except httpx.HTTPError as exc:
                raise InferenceError("Provider unreachable") from exc
            if response.status_code in RETRYABLE and not attempt:
                continue
            if response.is_error:
                raise InferenceError(f"Provider returned HTTP {response.status_code}")
            try:
                text = response.json()["choices"][0]["message"]["content"]
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                raise InferenceError("Malformed provider response") from exc
            return Completion(text=text or "", provider=self.name, model=self.model,
                              latency_ms=round((perf_counter() - start) * 1000, 1))
        raise InferenceError("Provider unavailable after retry")
