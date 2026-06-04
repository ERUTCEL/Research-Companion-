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
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "default_model": "deepseek-chat",
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
    provider = provider or os.getenv("CLIO_PROVIDER", "anthropic")
    model    = model    or os.getenv("CLIO_MODEL", "")

    if provider == "anthropic":
        key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
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
