#!/usr/bin/env python3
"""plate_bench.py — reg-OCR benchmark harness for TKT-017.

Mirrors the shape of `scripts/eval-email/run_eval.py`: a labelled corpus
(`bench-manifest.json`) + a pluggable set of engine adapters + a scorer that
reports the TKT-017 metric set (exact normalised-VRM match, partial/ambiguous
reads, false-positive plate text, "visible-but-unreadable", "no registration
visible", latency, cost). It is deliberately runnable with **zero** ML / Azure
dependencies for the part that can run offline, and clearly marks the part that
needs a real image corpus + an engine.

Two tiers, because reg-OCR has two separable layers:

  TIER A — the SHARED post-processing decision layer (runs HERE, no deps).
      Every candidate engine (fast-alpr, DI Read, gpt-5 vision) ultimately hands
      raw OCR candidate strings to the SAME production code that decides
      `registration_visible` / `vrm_match` / `plate_text`: `ocr/plate_adapter.py`
      (`normalise_vrm`, `_looks_like_plate`, `_build_result`). Those functions are
      pure and import nothing heavy, so we score them directly over a labelled set
      of candidate scenarios. This measures the decision layer's behaviour on:
      exact match, VRM normalisation, one-char misread, scene-text false positive,
      plate split across lines, and the empty / no-plate case — i.e. the metrics
      that are IDENTICAL across engines.

  TIER B — raw-OCR-on-image accuracy per engine (NOT run here; pluggable).
      Turning an actual JPEG into candidate strings is the engine-specific part.
      `ENGINES` below defines the adapter contract; the concrete adapters are
      stubbed because this box has no ONNX wheels (Python 3.14, no numpy) and no
      live Cognitive Services token. Fill them in and point `--corpus` at a
      labelled photo manifest to get real per-engine accuracy/latency/cost.

Usage:
    python plate_bench.py                 # TIER A: score the shared decision layer (real run)
    python plate_bench.py --json-out r.json
    python plate_bench.py --engine fast_alpr --corpus <photo-manifest.json>   # TIER B (needs an engine)

PII: TIER A uses only SYNTHETIC plate strings (fake VRMs). A real TIER B photo
corpus keeps ground-truth registrations in a GITIGNORED overlay, never in the
committed manifest — see harness/README.md and scripts/eval-email/README.md.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Callable


# --------------------------------------------------------------------------- #
# Locate the repo root + import the LIVE production decision layer.            #
# --------------------------------------------------------------------------- #
def _find_repo_root(start: str) -> str:
    cur = os.path.abspath(start)
    while True:
        if os.path.exists(os.path.join(cur, "LIVE_FACTS.json")):
            return cur
        parent = os.path.dirname(cur)
        if parent == cur:
            raise RuntimeError("could not locate repo root (LIVE_FACTS.json)")
        cur = parent


REPO_ROOT = _find_repo_root(__file__)
sys.path.insert(0, os.path.join(REPO_ROOT, "ocr"))

# The REAL shipped code that converts any engine's raw candidates into the
# registration_visible / vrm_match / plate_text the pipeline writes.
import plate_adapter  # noqa: E402  (path set above)


# --------------------------------------------------------------------------- #
# TIER A — labelled scenarios for the shared decision layer.                   #
# Each scenario is a set of raw OCR candidates + an optional case VRM + the     #
# expected settled result. All VRMs here are SYNTHETIC (fake).                  #
# --------------------------------------------------------------------------- #
@dataclass
class Scenario:
    id: str
    metric: str  # which TKT-017 metric this probes
    axis: str  # crop | full-photo | visibility
    case_vrm: str | None
    candidates: list[dict[str, Any]]
    # exp_* = the DOCUMENTED contract of plate_adapter._build_result (what the shipped
    # code is specified to do), NOT necessarily the ideal reg-recognition behaviour.
    # Where the two diverge, `finding` names the gap the benchmark surfaces.
    exp_registration_visible: bool
    exp_vrm_match: bool | None
    finding: str | None = None  # a named design gap this scenario exposes
    note: str = ""


# Synthetic UK-format plates (AA00AAA). None are real registrations.
SCENARIOS: list[Scenario] = [
    Scenario(
        "clean-exact-match", "exact_normalised_vrm_match", "crop", "AB12CDE",
        [{"text": "AB12 CDE", "confidence": 0.98}], True, True,
        note="clean crop, spaced OCR text, matches the case VRM after normalisation",
    ),
    Scenario(
        "normalise-lower-dash", "exact_normalised_vrm_match", "crop", "AB12CDE",
        [{"text": "ab12-cde", "confidence": 0.9}], True, True,
        note="lower-case + hyphen still normalises to a match (normalise_vrm)",
    ),
    Scenario(
        "one-char-misread", "partial_ambiguous_read", "crop", "AB12CDE",
        [{"text": "AB12CDF", "confidence": 0.71}], True, False,
        note="plate-shaped but one char off -> visible True, match False, vrm_mismatch issue",
    ),
    Scenario(
        "no-case-vrm-any-plate", "partial_ambiguous_read", "full-photo", None,
        [{"text": "XY19ZZT", "confidence": 0.83}], True, None,
        note="a legible plate but NO case VRM supplied -> visible True, match None "
        "(the layer cannot tell it is the RIGHT vehicle without the case VRM)",
    ),
    Scenario(
        "scene-text-false-positive", "false_positive_no_plate", "full-photo", "AB12CDE",
        [{"text": "GIVE WAY", "confidence": 0.6}, {"text": "MAX 30", "confidence": 0.5}],
        # Documented contract: "MAX 30" -> "MAX30" passes _looks_like_plate
        # (5 chars, >=2 letters, >=1 digit) -> registration_visible True.
        True, False,
        finding="F1_scene_text_false_positive",
        note="road-sign text 'MAX 30' normalises to 'MAX30' and PASSES the lenient "
        "plate-shape gate -> registration_visible True on a photo with NO real plate. "
        "This is why whole-photo OCR needs plate LOCALISATION (fast-alpr) or VLM context.",
    ),
    Scenario(
        "wrong-vehicle-plate-in-scene", "false_positive_no_plate", "full-photo", "AB12CDE",
        [{"text": "LORRY LOGISTICS", "confidence": 0.4}, {"text": "GB", "confidence": 0.3}],
        False, False,
        note="background text on another vehicle -> rejected (too long / too short) -> "
        "correctly not visible. (vrm_match False, not None, because a case VRM was supplied.)",
    ),
    Scenario(
        "split-across-lines-joined", "exact_normalised_vrm_match", "crop", "AB12CDE",
        [{"text": "AB12", "confidence": 0.7}, {"text": "CDE", "confidence": 0.7},
         {"text": "AB12CDE", "confidence": 0.7}], True, True,
        note="DI-Read splits a plate across two lines; the pairwise-join candidate rescues it",
    ),
    Scenario(
        "split-across-lines-unjoined", "no_registration_visible", "crop", "AB12CDE",
        [{"text": "AB12", "confidence": 0.7}, {"text": "CDE", "confidence": 0.7}],
        False, False,
        finding="F2_split_line_recall_gap",
        note="same split WITHOUT the join -> neither token is plate-shaped -> a PRESENT "
        "plate is missed (visible False). Recall depends on the join step firing.",
    ),
    Scenario(
        "no-plate-empty", "no_registration_visible", "visibility", "AB12CDE",
        [], False, False,
        note="engine returned nothing -> registration_visible False, no_plate_found. "
        "NB vrm_match is False (not None) once a case VRM is supplied.",
    ),
    Scenario(
        "visible-but-unreadable", "visible_but_unreadable", "visibility", "AB12CDE",
        [{"text": "A?12???", "confidence": 0.25}], False, False,
        finding="F3_no_visible_but_unreadable_tristate",
        note="a plate is physically present but OCR is garbled -> the BOOLEAN layer "
        "reports the SAME 'not visible' as an absent plate. No tri-state -> motivates the "
        "observation record + evidence.registration_visible tri-state (VLM expresses this).",
    ),
]


def run_tier_a() -> dict[str, Any]:
    """Score the real `plate_adapter._build_result` over the labelled scenarios.

    `passed` = scenarios where the layer matched its DOCUMENTED contract (a
    characterisation, not a bug hunt). `findings` = named design gaps between that
    contract and ideal reg-recognition — the substance the benchmark feeds forward.
    """
    rows: list[dict[str, Any]] = []
    passed = 0
    findings: list[dict[str, Any]] = []
    latencies_us: list[float] = []
    for s in SCENARIOS:
        t0 = time.perf_counter()
        result = plate_adapter._build_result(s.candidates, case_vrm=s.case_vrm)
        latencies_us.append((time.perf_counter() - t0) * 1e6)
        got_vis = bool(result["registration_visible"])
        got_match = result["vrm_match"]
        ok = got_vis == s.exp_registration_visible and got_match == s.exp_vrm_match
        passed += ok
        if s.finding:
            findings.append({"id": s.id, "finding": s.finding, "note": s.note})
        rows.append({
            "id": s.id, "metric": s.metric, "axis": s.axis,
            "case_vrm": s.case_vrm,
            "exp": {"visible": s.exp_registration_visible, "match": s.exp_vrm_match},
            "got": {"visible": got_vis, "match": got_match,
                    "plate_text": result["plate_text"],
                    "issues": [i.get("code") for i in result["issues"]]},
            "matches_contract": ok, "finding": s.finding, "note": s.note,
        })
    return {
        "tier": "A",
        "target": "ocr/plate_adapter.py::_build_result (LIVE shared decision layer)",
        "total": len(SCENARIOS), "passed": passed,
        "decision_layer_latency_us_mean": round(sum(latencies_us) / len(latencies_us), 2),
        "findings": findings,
        "rows": rows,
    }


# --------------------------------------------------------------------------- #
# TIER B — engine adapter contract (STUBBED; fill in for a real photo run).    #
# An adapter takes image bytes + optional case VRM and returns the same        #
# candidate list shape TIER A scores, plus timing/cost telemetry.             #
# --------------------------------------------------------------------------- #
@dataclass
class EngineResult:
    candidates: list[dict[str, Any]]
    latency_ms: float
    cost_usd: float | None = None
    provider: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


EngineAdapter = Callable[[bytes, str | None], EngineResult]


def _stub(name: str, reason: str) -> EngineAdapter:
    def _adapter(_image: bytes, _vrm: str | None) -> EngineResult:
        raise NotImplementedError(
            f"[{name}] not runnable in this environment: {reason}. "
            f"Implement against a labelled photo corpus (see harness/README.md)."
        )
    return _adapter


ENGINES: dict[str, EngineAdapter] = {
    # Incumbent: local detector+OCR, no egress. Needs onnxruntime + fast-alpr
    # (no cp314 wheels on this box) — call ocr/plate_adapter.read_plate(provider="fast_alpr").
    "fast_alpr": _stub("fast_alpr", "onnxruntime/fast-alpr unavailable (Python 3.14, no numpy)"),
    # Managed OCR over the whole photo -> substring VRM. Needs a live
    # cespkdocintel-dev call — ocr/plate_adapter.read_plate(provider="docintel").
    "docintel": _stub("docintel", "requires a live cespkdocintel-dev credential/token"),
    # VLM: reuse orchestration/src/lib/image-classify.ts semantics (gpt-5 vision).
    # Needs a Cognitive Services token for digital-3339-resource.
    "gpt5_vision": _stub("gpt5_vision", "requires a live digital-3339-resource Cognitive token"),
}


def run_tier_b(engine: str, corpus_path: str) -> dict[str, Any]:
    adapter = ENGINES.get(engine)
    if adapter is None:
        raise SystemExit(f"unknown engine '{engine}'. Known: {', '.join(ENGINES)}")
    with open(corpus_path, encoding="utf-8") as fh:
        corpus = json.load(fh)
    # Ground-truth VRMs come from a gitignored overlay, never the committed manifest.
    raise SystemExit(
        f"TIER B is a stub for '{engine}'. Provide an engine adapter + a labelled "
        f"photo corpus ({len(corpus.get('items', []))} item(s) referenced in {corpus_path}). "
        f"See harness/README.md."
    )


# --------------------------------------------------------------------------- #
# Report                                                                       #
# --------------------------------------------------------------------------- #
def _print_tier_a(report: dict[str, Any]) -> None:
    print(f"\nTIER A - {report['target']}")
    print(f"  {report['passed']}/{report['total']} scenarios match the layer's DOCUMENTED contract")
    print(f"  decision-layer latency: ~{report['decision_layer_latency_us_mean']} us/call (mean)\n")
    hdr = f"  {'id':<28} {'metric':<28} {'vis':<5} {'match':<6} {'contract'}"
    print(hdr)
    print("  " + "-" * (len(hdr) - 2))
    for r in report["rows"]:
        vis = str(r["got"]["visible"])
        match = str(r["got"]["match"])
        flag = "ok" if r["matches_contract"] else "DEVIATES"
        star = "  <F" if r["finding"] else ""
        print(f"  {r['id']:<28} {r['metric']:<28} {vis:<5} {match:<6} {flag}{star}")
    if report["findings"]:
        print("\n  FINDINGS (contract behaves as documented, but reg-recognition gaps remain):")
        for f in report["findings"]:
            print(f"    [{f['finding']}] {f['id']}")
            print(f"        {f['note']}")


def main() -> int:
    ap = argparse.ArgumentParser(description="TKT-017 reg-OCR benchmark harness")
    ap.add_argument("--engine", help="TIER B engine adapter (fast_alpr|docintel|gpt5_vision)")
    ap.add_argument("--corpus", help="TIER B labelled photo manifest (json)")
    ap.add_argument("--json-out", help="write the full report as JSON")
    args = ap.parse_args()

    if args.engine or args.corpus:
        if not (args.engine and args.corpus):
            ap.error("--engine and --corpus must be given together for TIER B")
        run_tier_b(args.engine, args.corpus)
        return 0

    report = run_tier_a()
    _print_tier_a(report)
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
        print(f"\nwrote {args.json_out}")
    # Tier A is a CHARACTERISATION, not a pass/fail gate (cf. scripts/eval-email
    # "ground truth, not a pass/fail gate"): a documented-contract match is the
    # expectation, and the findings are the point. Always exit 0 here.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
