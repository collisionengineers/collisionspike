from __future__ import annotations

import os
from dataclasses import dataclass

from .migration import (
    migrate_providers_config,
    migrate_providers_config_with_report,
    migrate_provider,
)

# --- Optional local-model ("LLM assist") settings -------------------------
#
# These gate the OPT-IN, OFFLINE local-model extraction assist
# (``extraction/llm_assist.py``, investigation/07 Phase 4). The feature is OFF
# by default and only activates when BOTH the flag is enabled AND a local
# inference endpoint is configured. There are NO network calls to remote/cloud
# services and NO bundled model weights — the endpoint is a *local*
# OpenAI-compatible chat/completions server (e.g. Ollama / llama.cpp).
#
# Environment variables (all optional; sensible defaults shown):
#   CEDM_LLM_ASSIST       -> enable flag ("1"/"true"/"yes"/"on" => True)
#   CEDM_LLM_ENDPOINT     -> base URL of the local OpenAI-compatible server,
#                            e.g. "http://localhost:11434/v1"
#   CEDM_LLM_MODEL        -> model name to request, e.g. "llama3.1"
#   CEDM_LLM_TEMPERATURE  -> sampling temperature (default 0.0 — low/deterministic)
#   CEDM_LLM_TIMEOUT      -> per-request timeout in seconds (default 30)

_TRUTHY = {"1", "true", "yes", "on", "y", "t"}

# Public names so other modules/tests can reference the canonical flag/env names.
LLM_ASSIST_ENABLED_ENV = "CEDM_LLM_ASSIST"
LLM_ENDPOINT_ENV = "CEDM_LLM_ENDPOINT"
LLM_MODEL_ENV = "CEDM_LLM_MODEL"
LLM_TEMPERATURE_ENV = "CEDM_LLM_TEMPERATURE"
LLM_TIMEOUT_ENV = "CEDM_LLM_TIMEOUT"

DEFAULT_LLM_MODEL = "llama3.1"
DEFAULT_LLM_TEMPERATURE = 0.0
DEFAULT_LLM_TIMEOUT = 30.0


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().casefold() in _TRUTHY


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return float(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class LLMAssistSettings:
    """Resolved configuration for the opt-in local-model extraction assist.

    Attributes:
        enabled: master on/off flag (default False — feature is opt-in).
        endpoint: base URL of a *local* OpenAI-compatible chat/completions
            server. Empty/``None`` means "not configured".
        model: model name to request from the endpoint.
        temperature: sampling temperature; kept low for deterministic, faithful
            extraction.
        timeout: per-request timeout in seconds.

    ``is_active`` is the single gate the strategy checks: the feature only runs
    when it is BOTH enabled AND has an endpoint configured. Either being unset
    makes the strategy a no-op.
    """

    enabled: bool = False
    endpoint: str | None = None
    model: str = DEFAULT_LLM_MODEL
    temperature: float = DEFAULT_LLM_TEMPERATURE
    timeout: float = DEFAULT_LLM_TIMEOUT

    @property
    def is_active(self) -> bool:
        return bool(self.enabled and self.endpoint and self.endpoint.strip())

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "LLMAssistSettings":
        """Build settings from environment variables (``os.environ`` by default)."""
        source = os.environ if env is None else env
        # Allow an explicit ``env`` mapping to drive the helpers too.
        if env is not None:
            enabled = source.get(LLM_ASSIST_ENABLED_ENV, "").strip().casefold() in _TRUTHY
            endpoint = source.get(LLM_ENDPOINT_ENV)
            model = source.get(LLM_MODEL_ENV) or DEFAULT_LLM_MODEL
            temp_raw = source.get(LLM_TEMPERATURE_ENV)
            timeout_raw = source.get(LLM_TIMEOUT_ENV)
            try:
                temperature = float(temp_raw) if temp_raw and temp_raw.strip() else DEFAULT_LLM_TEMPERATURE
            except ValueError:
                temperature = DEFAULT_LLM_TEMPERATURE
            try:
                timeout = float(timeout_raw) if timeout_raw and timeout_raw.strip() else DEFAULT_LLM_TIMEOUT
            except ValueError:
                timeout = DEFAULT_LLM_TIMEOUT
        else:
            enabled = _env_bool(LLM_ASSIST_ENABLED_ENV)
            endpoint = source.get(LLM_ENDPOINT_ENV)
            model = source.get(LLM_MODEL_ENV) or DEFAULT_LLM_MODEL
            temperature = _env_float(LLM_TEMPERATURE_ENV, DEFAULT_LLM_TEMPERATURE)
            timeout = _env_float(LLM_TIMEOUT_ENV, DEFAULT_LLM_TIMEOUT)

        endpoint = endpoint.strip() if endpoint and endpoint.strip() else None
        return cls(
            enabled=enabled,
            endpoint=endpoint,
            model=model,
            temperature=temperature,
            timeout=timeout,
        )


__all__ = [
    "migrate_providers_config",
    "migrate_providers_config_with_report",
    "migrate_provider",
    "LLMAssistSettings",
    "LLM_ASSIST_ENABLED_ENV",
    "LLM_ENDPOINT_ENV",
    "LLM_MODEL_ENV",
    "LLM_TEMPERATURE_ENV",
    "LLM_TIMEOUT_ENV",
    "DEFAULT_LLM_MODEL",
    "DEFAULT_LLM_TEMPERATURE",
    "DEFAULT_LLM_TIMEOUT",
]
