"""LLM provider abstraction — Anthropic, OpenAI-compatible, Ollama."""
from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import AsyncGenerator


class BaseLLMProvider(ABC):
    @abstractmethod
    def complete(self, system: str, messages: list[dict], max_tokens: int) -> str: ...

    @abstractmethod
    async def stream_text(
        self, system: str, messages: list[dict], max_tokens: int
    ) -> AsyncGenerator[str, None]: ...


class AnthropicProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        import anthropic
        self.model = model
        self._client = anthropic.Anthropic(api_key=api_key)
        self._async = anthropic.AsyncAnthropic(api_key=api_key)

    def complete(self, system, messages, max_tokens):
        r = self._client.messages.create(
            model=self.model, max_tokens=max_tokens, system=system, messages=messages
        )
        return r.content[0].text

    async def stream_text(self, system, messages, max_tokens):
        async with self._async.messages.stream(
            model=self.model, max_tokens=max_tokens, system=system, messages=messages
        ) as stream:
            async for text in stream.text_stream:
                yield text


class OpenAICompatibleProvider(BaseLLMProvider):
    """Covers OpenAI, Groq, DeepSeek, Mistral, Ollama, and any OpenAI-compatible API."""

    def __init__(self, api_key: str, model: str, base_url: str | None = None) -> None:
        from openai import AsyncOpenAI, OpenAI
        kwargs: dict = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self.model = model
        self._client = OpenAI(**kwargs)
        self._async = AsyncOpenAI(**kwargs)

    def _build_messages(self, system: str, messages: list[dict]) -> list[dict]:
        return [{"role": "system", "content": system}, *messages]

    def complete(self, system, messages, max_tokens):
        r = self._client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=self._build_messages(system, messages),
        )
        return r.choices[0].message.content or ""

    async def stream_text(self, system, messages, max_tokens):
        stream = await self._async.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=self._build_messages(system, messages),
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


# ── Factory ───────────────────────────────────────────────────────────────────

PROVIDER_PRESETS: dict[str, dict] = {
    "anthropic": {
        "models": ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
        "default_model": "claude-sonnet-4-6",
    },
    "openai": {
        "base_url": None,
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
        "default_model": "gpt-4o",
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
        "default_model": "llama-3.3-70b-versatile",
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "models": ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-1.5-pro"],
        "default_model": "gemini-2.0-flash",
    },
    "ollama": {
        "base_url": "http://localhost:11434/v1",
        "api_key": "ollama",
        "models": [],
        "default_model": "qwen3:8b",
    },
}


def build_provider(
    provider: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> BaseLLMProvider:
    model = model or os.getenv("CLIO_MODEL", "")

    # Provider selection:
    # 1. Explicit CLIO_PROVIDER wins.
    # 2. "auto" uses available local models first, then configured API keys.
    # 3. No configured provider falls back to Ollama so Local AI setup can guide users.
    explicit = (provider or os.getenv("CLIO_PROVIDER", "") or "auto").strip().lower()
    if explicit == "auto":
        provider, model, base_url = _resolve_auto_provider(model=model, base_url=base_url)
    else:
        provider = explicit

    if provider == "anthropic":
        key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
        if not key:
            raise RuntimeError("Anthropic provider selected, but ANTHROPIC_API_KEY is not set.")
        return AnthropicProvider(api_key=key, model=model or "claude-sonnet-4-6")

    preset = PROVIDER_PRESETS.get(provider, {})
    resolved_url  = base_url or os.getenv("OPENAI_BASE_URL") or preset.get("base_url")
    resolved_key  = api_key  or os.getenv("OPENAI_API_KEY", "") or preset.get("api_key", "")
    resolved_model = model or preset.get("default_model", "gpt-4o")

    return OpenAICompatibleProvider(
        api_key=resolved_key,
        model=resolved_model,
        base_url=resolved_url,
    )


def _resolve_auto_provider(model: str, base_url: str | None) -> tuple[str, str, str | None]:
    local_model = _first_ollama_model()
    if local_model:
        return "ollama", model or local_model, base_url or PROVIDER_PRESETS["ollama"]["base_url"]

    if os.getenv("ANTHROPIC_API_KEY", ""):
        return "anthropic", model or PROVIDER_PRESETS["anthropic"]["default_model"], base_url

    if os.getenv("OPENAI_API_KEY", ""):
        resolved_url = base_url or os.getenv("OPENAI_BASE_URL") or None
        inferred = _infer_openai_compatible_provider(resolved_url)
        preset = PROVIDER_PRESETS.get(inferred, PROVIDER_PRESETS["openai"])
        return inferred, model or preset["default_model"], resolved_url

    return "ollama", model or PROVIDER_PRESETS["ollama"]["default_model"], base_url or PROVIDER_PRESETS["ollama"]["base_url"]


def _first_ollama_model() -> str:
    try:
        import requests

        base = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
        res = requests.get(f"{base}/api/tags", timeout=1.5)
        res.raise_for_status()
        models = res.json().get("models", [])
        for item in models:
            name = item.get("name", "")
            if name:
                return name
    except Exception:
        return ""
    return ""


def _infer_openai_compatible_provider(base_url: str | None) -> str:
    url = (base_url or "").lower()
    if "groq.com" in url:
        return "groq"
    if "googleapis.com" in url or "generativelanguage" in url:
        return "gemini"
    return "openai"
