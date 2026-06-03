import json
import os
from functools import cached_property
from typing import Any

import requests
import structlog

log = structlog.get_logger()

_OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
_DEFAULT_MODEL = os.getenv("LOCAL_REASONER_MODEL", "qwen3:14b")
_FALLBACK_MODEL = os.getenv("LOCAL_REASONER_FALLBACK_MODEL", "qwen3:7b")
_DEEP_MODEL = os.getenv("LOCAL_REASONER_DEEP_MODEL", "deepseek-r1:14b")
_ENABLED = os.getenv("LOCAL_REASONER_ENABLED", "true").lower() in ("1", "true", "yes")
_TIMEOUT_S = float(os.getenv("LOCAL_REASONER_TIMEOUT_S", "12"))


class LocalReasoner:
    """Optional local LLM bridge for figure/diagram structuring.

    It uses Ollama if available. Missing Ollama or missing models should never
    break ingestion; callers receive None and keep the deterministic parser
    output.
    """

    def __init__(
        self,
        base_url: str = _OLLAMA_URL,
        model: str = _DEFAULT_MODEL,
        fallback_model: str = _FALLBACK_MODEL,
        deep_model: str = _DEEP_MODEL,
        enabled: bool = _ENABLED,
        timeout_s: float = _TIMEOUT_S,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.fallback_model = fallback_model
        self.deep_model = deep_model
        self.enabled = enabled
        self.timeout_s = timeout_s

    @cached_property
    def available_models(self) -> set[str]:
        if not self.enabled:
            return set()
        try:
            res = requests.get(f"{self.base_url}/api/tags", timeout=2)
            res.raise_for_status()
            data = res.json()
            return {m.get("name", "") for m in data.get("models", [])}
        except Exception as exc:
            log.debug("local_reasoner_unavailable", error=str(exc))
            return set()

    def is_available(self) -> bool:
        return bool(self.available_models)

    def status(self) -> dict[str, Any]:
        model = self.best_model()
        return {
            "enabled": self.enabled,
            "base_url": self.base_url,
            "available": bool(model),
            "model": model or "",
            "installed_models": sorted(self.available_models),
            "recommended": [
                {"name": self.model, "role": "기본 로컬 조교", "target": "16GB+ RAM 권장"},
                {"name": self.fallback_model, "role": "가벼운 fallback", "target": "8-16GB RAM"},
                {"name": self.deep_model, "role": "깊은 추론 옵션", "target": "16GB+ RAM 권장"},
            ],
        }

    def pull_model(self, model: str) -> dict[str, Any]:
        if not self.enabled:
            return {"ok": False, "status": "local reasoner disabled"}
        try:
            res = requests.post(
                f"{self.base_url}/api/pull",
                json={"model": model, "stream": False},
                timeout=float(os.getenv("LOCAL_REASONER_PULL_TIMEOUT_S", "900")),
            )
            res.raise_for_status()
            return {"ok": True, "status": res.json().get("status", "success"), "model": model}
        except Exception as exc:
            log.warning("local_reasoner_pull_failed", model=model, error=str(exc))
            return {"ok": False, "status": str(exc), "model": model}

    def best_model(self, mode: str = "default") -> str | None:
        preferred = self.deep_model if mode == "deep" else self.model
        for candidate in (preferred, self.fallback_model):
            if candidate in self.available_models:
                return candidate
        return next(iter(self.available_models), None)

    def structure_visual_evidence(self, figure: dict[str, Any]) -> dict[str, Any] | None:
        model = self.best_model(mode="default")
        if not model:
            return None

        prompt = _build_visual_prompt(figure)
        try:
            res = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "num_ctx": 4096,
                    },
                },
                timeout=self.timeout_s,
            )
            res.raise_for_status()
            text = res.json().get("response", "")
            parsed = _parse_json_object(text)
            if parsed:
                parsed["local_model"] = model
                log.info("local_reasoner_visual_done", model=model, figure_type=figure.get("figure_type", ""))
                return parsed
        except Exception as exc:
            log.warning("local_reasoner_visual_failed", model=model, error=str(exc))
        return None


def _build_visual_prompt(figure: dict[str, Any]) -> str:
    return f"""You are a local research diagram parser.

Given OCR/caption/layout evidence from one PDF visual, extract a cautious structured summary.
Do not invent arrows, direction, or cardinality if the evidence is insufficient.
Return only a JSON object.

Input:
- page_number: {figure.get("page_number")}
- detected_type: {figure.get("figure_type")}
- bbox: {figure.get("bbox")}
- caption: {figure.get("caption", "")}
- ocr_text: {figure.get("ocr_text", "")}
- parser_summary: {figure.get("summary", "")}

JSON shape:
{{
  "visual_summary": "short natural-language summary",
  "entities_or_components": ["..."],
  "relations_or_flows": [
    {{
      "name": "relationship or flow name",
      "participants": ["..."],
      "evidence": "caption or OCR phrase",
      "certainty": "high|medium|low"
    }}
  ],
  "uncertainty": "high|medium|low",
  "needs_human_check": true
}}
"""


def _parse_json_object(text: str) -> dict[str, Any] | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            return None
