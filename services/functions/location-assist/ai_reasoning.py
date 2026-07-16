"""ai_reasoning — AI vision-reasoning ESCALATION for the location-suggest Function (TKT-078).

A DEEPER, reviewer-invoked photo-based location suggestion: when the deterministic tier (Vision
OCR signage + Maps geocode) is weak, the reviewer can escalate to the keyless AOAI ``gpt-5`` vision
model, which reasons over the case's photos ("what place is this, from signage / landmarks / road
markings?") and returns candidate PLACE GUESSES. Those are then re-geocoded via Azure Maps, exactly
like signage — so the AI never returns a final address, only a query a reviewer still confirms
(ADR-0013). Mirrors the orchestration ``image-classify.ts`` gpt-5 discipline.

SHIPS DARK. Gated by ``LOCATION_ASSIST_AI_ENABLED`` (default off) + a configured model endpoint +
deployment; ``build_reasoner()`` returns ``None`` unless all are present, so the escalation is an
honest no-op today. Live activation awaits the production AI sign-off recorded in
``docs/operations/operator-actions.md``.

Discipline:
  * reasoning model -> ``max_completion_tokens`` + ``reasoning_effort``; NO ``temperature`` / ``max_tokens``;
  * keyless: a managed-identity Cognitive-Services token (IDENTITY_ENDPOINT REST), never an API key;
  * structured output (JSON) + "only report what is visibly evidenced";
  * per-request photo cap; usage/spend telemetry logged; every failure degrades to ``[]`` (never raises).
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass

import httpx

logger = logging.getLogger("locationsuggest.ai")

# Per-escalation cap (a reasoning vision call is the expensive tier).
MAX_AI_PHOTOS = 4
_COGNITIVE_RESOURCE = "https://cognitiveservices.azure.com"
_REQUEST_TIMEOUT_S = 30.0

_SYSTEM_PROMPT = (
    "You identify the real-world LOCATION where vehicle-inspection photos were taken, for a UK motor "
    "claim. Reason ONLY from what is VISIBLY EVIDENCED in the images: business signage, shop/road-sign "
    "text, unit numbers, distinctive landmarks. Do NOT guess from vehicle damage or invent places. "
    "Return STRICT JSON: {\"guesses\":[{\"query\":\"<a UK place or business name to look up>\","
    "\"postcode\":\"<full UK postcode if legible, else empty>\",\"confidence\":<0..1>,"
    "\"reasoning\":\"<short plain-language evidence, e.g. sign reads 'Smith Recovery'>\"}]}. "
    "Return an empty guesses array if nothing is visibly evidenced. Max 4 guesses."
)


@dataclass
class AiPlaceGuess:
    """One AI place guess — a query to geocode + its plain-language reasoning. NOT a final address."""

    query: str
    postcode: str | None
    confidence: float
    reasoning: str


def _truthy(v: str | None) -> bool:
    return (v or "").strip().lower() in {"1", "true", "yes", "on"}


def mint_cognitive_token(transport: httpx.BaseTransport | None = None) -> str | None:
    """Mint a managed-identity access token for Cognitive Services (keyless). Returns None on any
    failure or when the identity endpoint is absent (local/dev)."""
    endpoint = os.environ.get("IDENTITY_ENDPOINT", "").strip()
    header = os.environ.get("IDENTITY_HEADER", "").strip()
    if not endpoint or not header:
        return None
    try:
        with httpx.Client(timeout=10.0, transport=transport) as client:
            resp = client.get(
                endpoint,
                params={"resource": _COGNITIVE_RESOURCE, "api-version": "2019-08-01"},
                headers={"X-IDENTITY-HEADER": header},
            )
        if resp.status_code != 200:
            logger.warning("MSI token mint failed: HTTP %s", resp.status_code)
            return None
        return (resp.json() or {}).get("access_token") or None
    except (httpx.HTTPError, ValueError) as exc:  # noqa: BLE001 - keyless best-effort
        logger.warning("MSI token mint error: %s", type(exc).__name__)
        return None


class AiLocationReasoner:
    """Calls the AOAI gpt-5 vision model over the case photos and returns place guesses."""

    def __init__(
        self,
        endpoint: str,
        deployment: str,
        *,
        token: str,
        transport: httpx.BaseTransport | None = None,
        reasoning_effort: str = "low",
    ) -> None:
        self._endpoint = endpoint.rstrip("/")
        self._deployment = deployment
        self._token = token
        self._transport = transport
        self._effort = reasoning_effort

    @property
    def _url(self) -> str:
        # AOAI GA v1 surface (keyless): /openai/v1/chat/completions, model = the deployment name.
        return f"{self._endpoint}/openai/v1/chat/completions"

    def suggest(
        self, photos: list[bytes], *, accident: str | None = None, claimant: str | None = None
    ) -> list[AiPlaceGuess]:
        images = [p for p in photos if p][:MAX_AI_PHOTOS]
        if not images:
            return []
        content: list[dict] = [{"type": "text", "text": _user_text(accident, claimant)}]
        for raw in images:
            import base64

            b64 = base64.b64encode(raw).decode("ascii")
            content.append(
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
            )
        body = {
            "model": self._deployment,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
            # Reasoning-model call form: NO temperature / max_tokens.
            "max_completion_tokens": 2000,
            "reasoning_effort": self._effort,
            "response_format": {"type": "json_object"},
        }
        try:
            with httpx.Client(timeout=_REQUEST_TIMEOUT_S, transport=self._transport) as client:
                resp = client.post(
                    self._url,
                    headers={"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"},
                    json=body,
                )
        except httpx.HTTPError as exc:
            logger.warning("AI reasoning transport error: %s", type(exc).__name__)
            return []
        if resp.status_code != 200:
            logger.warning("AI reasoning HTTP %s", resp.status_code)
            return []
        try:
            payload = resp.json()
        except ValueError:
            return []
        _log_usage(payload)
        return parse_ai_response(payload)


def _user_text(accident: str | None, claimant: str | None) -> str:
    clues = []
    if (accident or "").strip():
        clues.append(f"Accident circumstances (text): {accident.strip()[:400]}")
    if (claimant or "").strip():
        clues.append(f"Claimant address (text): {claimant.strip()[:200]}")
    clue_block = ("\n".join(clues) + "\n") if clues else ""
    return (
        clue_block
        + "Identify where these vehicle-inspection photos were taken. Only use what is visibly "
        "evidenced. Return the strict JSON described in the system message."
    )


def parse_ai_response(payload: dict) -> list[AiPlaceGuess]:
    """Project the model's JSON content into AiPlaceGuess list. Tolerant: never raises."""
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return []
    if not isinstance(content, str):
        return []
    try:
        data = json.loads(content)
    except ValueError:
        return []
    guesses_raw = (data or {}).get("guesses") if isinstance(data, dict) else None
    if not isinstance(guesses_raw, list):
        return []
    out: list[AiPlaceGuess] = []
    for g in guesses_raw:
        if not isinstance(g, dict):
            continue
        query = str(g.get("query") or "").strip()
        if not query:
            continue
        pc = str(g.get("postcode") or "").strip() or None
        try:
            conf = float(g.get("confidence"))
        except (TypeError, ValueError):
            conf = 0.5
        conf = max(0.0, min(1.0, conf))
        out.append(
            AiPlaceGuess(
                query=query,
                postcode=pc,
                confidence=conf,
                reasoning=str(g.get("reasoning") or "").strip()[:200],
            )
        )
    return out[:MAX_AI_PHOTOS]


def _log_usage(payload: dict) -> None:
    usage = payload.get("usage") if isinstance(payload, dict) else None
    if isinstance(usage, dict):
        # Spend telemetry — token counts only (never image bytes / content).
        logger.info(
            "ai_reasoning usage prompt=%s completion=%s total=%s",
            usage.get("prompt_tokens"),
            usage.get("completion_tokens"),
            usage.get("total_tokens"),
        )


def build_reasoner(transport: httpx.BaseTransport | None = None) -> AiLocationReasoner | None:
    """Factory: return a reasoner only when the escalation is fully configured + gated ON, else None
    (honest no-op). Gate: LOCATION_ASSIST_AI_ENABLED + AI_MODEL_ENDPOINT + AI_MODEL_DEPLOYMENT +
    a mintable managed-identity token. SHIPS DARK — returns None today."""
    if not _truthy(os.environ.get("LOCATION_ASSIST_AI_ENABLED")):
        return None
    endpoint = os.environ.get("AI_MODEL_ENDPOINT", "").strip()
    deployment = os.environ.get("AI_MODEL_DEPLOYMENT", "").strip()
    if not endpoint or not deployment:
        return None
    token = mint_cognitive_token(transport)
    if not token:
        return None
    return AiLocationReasoner(endpoint, deployment, token=token, transport=transport)
