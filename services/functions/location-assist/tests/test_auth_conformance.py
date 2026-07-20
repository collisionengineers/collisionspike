"""Auth conformance for the location-assist client (TKT-268 / PLAN-011).

The AI location reasoner is a RETAINED-BUT-NOT-EXPIRY-AWARE bearer: it mints a Cognitive-Services token
once at build time, reuses it for the object's lifetime, never tracks expiry, never refreshes, and degrades
any non-200 to []. It therefore claims NONE of the four behaviours — there is nothing to pin behaviourally,
so it is represented in the inventory as `claims: []` (A3), and build_reasoner ships dark (returns None
unless the gate + endpoint + a mintable token are all present).
"""

from __future__ import annotations

from _authconf.conformance import claims_for

AI_PATH = "services/functions/location-assist/ai_reasoning.py"


def test_ai_reasoning_pins_the_absence_of_all_behaviours():
    # A claims:[] row pins that this client must NOT grow an expiry cache, refresh, or retry unnoticed —
    # the check-auth-inventory drift guard fails if it silently gains one of the four marker patterns.
    assert claims_for(AI_PATH) == []


def test_ai_reasoning_ships_dark_when_ungated(monkeypatch):
    import ai_reasoning

    for var in ("LOCATION_ASSIST_AI_ENABLED", "AI_MODEL_ENDPOINT", "AI_MODEL_DEPLOYMENT"):
        monkeypatch.delenv(var, raising=False)
    # With the gate off, no reasoner is built — the retained bearer is never even minted.
    assert ai_reasoning.build_reasoner() is None
