#!/usr/bin/env python3
"""scripts/eval-email/run_ab.py — deterministic-vs-LLM A/B harness (Rules Engine v2,
Phase 4: docs/plans/rules_engine_v2_plan_9ba034c4.plan.md "Eval A/B: deterministic vs +LLM
on the corpus before any live enable").

Reuses run_eval.py's manifest/loader machinery BY IMPORT (never copied — see the imports
below): `load_manifest`, `load_email_fields`, `resolve_expected`, `_FIELD_TO_PARAM`, and the
vendored `classify_email` function it already located on `sys.path`. This script adds ONE
thing run_eval.py does not do: for each corpus item it ALSO (with `--with-llm`) calls the
configured Azure OpenAI Foundry deployment and compares its answer to the deterministic
pass and to the hand-labelled expected value.

WHY A SEPARATE SCRIPT (not a run_eval.py flag): run_eval.py is a pure, $0, no-network
scorer — CLAUDE.md/ADR-0019 keep Stage A (the deterministic engine) and Stage C (the gated
LLM) architecturally distinct, and this repo's `verify-all.mjs` runs run_eval.py
UNAUTHENTICATED in CI-like contexts; a script that can make live, billed, credentialed
model calls must never be that same code path.

AUTH — the OPERATOR's own `az login` session, NOT any application/managed identity
(`orchestration/src/lib/aoai.ts`'s production path uses the orchestration app's managed
identity instead — this script is a standalone local tool, never deployed, never run with
an app identity). `G5` (ADR-0015 "AI-test authority": "the operator holds full authority to
run AI testing on all repo data") is the explicit enabler for sending this corpus's real
email text to the configured model for testing purposes.

MODEL CONTRACT — mirrors `orchestration/src/lib/aoai.ts` (the production Stage-C client):
AOAI GA v1 surface (`POST {endpoint}/openai/v1/chat/completions`), strict structured
outputs (`response_format: json_schema, strict: true`, enums locked to the live taxonomy),
`max_completion_tokens` + `reasoning_effort` (gpt-5 is a reasoning model — it REJECTS
temperature/top_p/penalties/max_tokens; verified against Microsoft Learn's "Azure OpenAI
reasoning models" doc, 2026-07-02). The taxonomy is loaded from the SAME JSON contract
`@cs/domain`'s codecs use (`packages/domain/src/data/choicesets/
inbound-email-classification.json`) rather than hand-duplicated here — a cross-language
read of the one canonical artifact, not a second source of truth.

PII discipline — IDENTICAL to run_eval.py (see its README.md "PII rules"): this script
NEVER prints or writes subject/body/rationale free text. Every table/summary below is
aggregate numbers, ids, and closed-vocabulary classification LABELS (category/subtype
names, confidence, agreement booleans) only. G5 authorises SENDING the real corpus text to
the configured model for testing; it does not relax this script's own output discipline —
the model's `rationale` field is deliberately DISCARDED after the taxonomy/confidence are
extracted from it (never printed, never stored), for the same reason run_eval.py's default
table omits `signals` (a free-text field can carry a short extracted token from the real
email).

Usage:
    python run_ab.py --limit 5                                     # deterministic only, no LLM, no az/network
    python run_ab.py --with-llm --deployment gpt-5 --limit 3        # deterministic + LLM (a live, billed call)
    python run_ab.py --with-llm --deployment gpt-5-mini --limit 3   # fails HONESTLY — gpt-5-mini is not deployed
    python run_ab.py --with-llm --limit 10 --taxonomy v2            # score against v2 expectations

Exit code: 0 on a normal run (LLM abstains/errors are reported IN the table, not treated as
a script failure — this is an eval/smoke tool, not a CI gate); non-zero only on a hard
operational error (manifest missing, engine import failure, az/token acquisition failure
when --with-llm is set).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent

# ---- import run_eval.py's manifest/loader machinery (read-only; NEVER copied) ----
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
try:
    import run_eval  # noqa: E402  (classify_email, load_manifest, load_email_fields, resolve_expected, _FIELD_TO_PARAM)
except ImportError as exc:  # pragma: no cover - operator-facing message
    sys.stderr.write(
        "ERROR: could not import run_eval.py from scripts/eval-email/ — this script reuses its\n"
        "manifest/loader machinery rather than duplicating it.\n"
        f"  ({exc})\n"
    )
    raise SystemExit(2)

# ---- taxonomy — loaded from the SAME JSON contract @cs/domain's codecs use, never
#      hand-duplicated (packages/domain is read-only / prior-art for this script; this is a
#      plain read of the shipped JSON artifact, not a modification). ----
CHOICESET_PATH = (
    REPO_ROOT / "packages" / "domain" / "src" / "data" / "choicesets" / "inbound-email-classification.json"
)


def load_taxonomy() -> tuple[list[str], list[str]]:
    """Returns (category_names, subtype_names) in the choiceset's own declared order."""
    data = json.loads(CHOICESET_PATH.read_text(encoding="utf-8"))
    by_name = {cs["logicalName"]: cs for cs in data["choiceSets"]}
    categories = [o["name"] for o in by_name["cr1bd_inboundcategory"]["options"]]
    subtypes = [o["name"] for o in by_name["cr1bd_inboundsubtype"]["options"]]
    return categories, subtypes


# ---- AOAI endpoint — verified 2026-07-02 via the one-time
#      `az cognitiveservices account show -n digital-3339-resource -g rg-collisionspike-dev
#      --query properties.endpoint` read (see docs/gated.md item D6 / LIVE_FACTS.json
#      `foundry`). Override with --endpoint if the account's endpoint ever changes;
#      hardcoded as the default rather than re-queried live on every run so this script's
#      ONLY per-run az dependency is the token mint below. ----
DEFAULT_ENDPOINT = "https://digital-3339-resource.cognitiveservices.azure.com"
DEPLOYMENT_CHOICES = ["gpt-5", "gpt-5-mini"]
MAX_COMPLETION_TOKENS = 2000
REQUEST_TIMEOUT_S = 15.0


# =============================================================================
# Token acquisition — the operator's own az-cli session (G5). ONE subprocess call, no retry
# loop (a token failure is reported honestly and this script stops, per the task brief:
# "if the token or endpoint fails ... capture the exact error and report it — do not
# retry-loop").
# =============================================================================


def get_az_token() -> str:
    proc = subprocess.run(
        [
            "az", "account", "get-access-token",
            "--resource", "https://cognitiveservices.azure.com",
            "--query", "accessToken",
            "-o", "tsv",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"az account get-access-token failed (exit {proc.returncode}): {proc.stderr.strip() or '(no stderr)'}"
        )
    token = proc.stdout.strip()
    if not token:
        raise RuntimeError("az account get-access-token returned an empty token")
    return token


# =============================================================================
# Request assembly — mirrors orchestration/src/lib/aoai.ts's buildSystemPrompt /
# buildUserPrompt / buildTriageRequestBody (same contract, independently authored in
# Python since this is a standalone script with no Node/TS runtime dependency).
# =============================================================================

_CATEGORY_DEFINITIONS: dict[str, str] = {
    "receiving_work": "An instruction or audit request that should become a case, for a new or an existing client.",
    "query": "A question about work already in progress, or a new enquiry — no new work to log yet.",
    "other": "Anything that is not a work item, a query, billing, or a cancellation report — the catch-all.",
    "billing": "An invoice, fee query, or payment matter about work already carried out.",
    "non_actionable": 'A short receipt/acknowledgement/no-action-needed message (e.g. "thanks", an auto-reply).',
    "case_update": "New information — evidence, photographs, or an answer — for a case already open.",
    "cancellation": "A claim or case reported cancelled, closed, or withdrawn.",
}

_SUBTYPE_DEFINITIONS: dict[str, str] = {
    "existing_provider_instruction": "An instruction from a sender who is a known work provider.",
    "existing_provider_audit": "An audit / re-inspection instruction from a known work provider.",
    "existing_provider_diminution": "A diminution-in-value instruction from a known work provider.",
    "new_client_work": "An instruction from a sender who is not a known work provider.",
    "query_existing_work": "A question referring to a case already in progress.",
    "query_new_enquiry": "A question from someone with no case in progress yet.",
    "billing_request": "An invoice or payment request tied to work already carried out.",
    "case_summary": "A status digest or summary covering one or more cases.",
    "acknowledgement": 'A short "received / thanks / noted" reply that needs no action.',
    "other": "None of the other subtypes apply.",
    "images_received": "Photographs with no other new instruction content.",
    "cancellation_notice": "The usual subtype for a cancellation report.",
    "update_general": "New information on an existing case that is not photographs alone.",
}


def build_system_prompt(categories: list[str], subtypes: list[str]) -> str:
    cat_lines = "\n".join(f"- {c}: {_CATEGORY_DEFINITIONS.get(c, 'A taxonomy category (no further description on file).')}" for c in categories)
    sub_lines = "\n".join(f"- {s}: {_SUBTYPE_DEFINITIONS.get(s, 'A taxonomy subtype (no further description on file).')}" for s in subtypes)
    return (
        "You triage inbound emails for a vehicle-collision engineering business. A fast, "
        "deterministic rule pass already ran on this message and could not confidently place "
        "it — you are a second opinion for that one message, not a first pass and not a "
        "replacement for the rules.\n\n"
        "Choose the single best category and subtype from the lists below. Give a confidence "
        "from 0 to 1 (your honest belief the label is right, not a fixed value). Write a "
        "rationale of one plain sentence, in everyday English, for a non-technical case "
        'handler: describe what the message is about, never how you decided. Never use the '
        'words "classifier", "signals", "model", "confidence", "rule", "category", '
        '"subtype", "JSON", or any similar technical term in the rationale. Never invent a '
        "case number, reference, or vehicle registration that is not present in the message "
        "text you were given.\n\n"
        f"Categories:\n{cat_lines}\n\n"
        f"Subtypes:\n{sub_lines}\n\n"
        "Pick the subtype that belongs with your chosen category; if none fits well, use "
        "that category's \"other\" or general subtype."
    )


def build_user_prompt(fields: dict[str, Any], deterministic: dict[str, Any]) -> str:
    attachments = ", ".join(fields.get("attachment_filenames") or []) or "(none)"
    signals = ", ".join(deterministic.get("signals") or []) or "(none)"
    return (
        f"Sender domain: {fields.get('sender_domain') or '(unknown)'}\n"
        f"Attachment filenames: {attachments}\n"
        f"Subject: {fields.get('subject') or '(none)'}\n"
        f"Body:\n{fields.get('body') or '(none)'}\n"
        "---\n"
        "The deterministic rule pass proposed (but did not confidently commit to):\n"
        f"category={deterministic.get('category') or '(none)'} subtype={deterministic.get('subtype') or '(none)'} "
        f"signals={signals}"
    )


def build_response_schema(categories: list[str], subtypes: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "category": {"type": "string", "enum": categories},
            "subtype": {"type": "string", "enum": subtypes},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "rationale": {"type": "string"},
        },
        "required": ["category", "subtype", "confidence", "rationale"],
        "additionalProperties": False,
    }


def build_request_body(
    deployment: str, categories: list[str], subtypes: list[str], fields: dict[str, Any], deterministic: dict[str, Any]
) -> dict[str, Any]:
    # Deliberately NO temperature/top_p/presence_penalty/frequency_penalty/max_tokens — gpt-5
    # is a reasoning model and rejects them (Microsoft Learn "Azure OpenAI reasoning models",
    # Not Supported list, verified 2026-07-02). max_completion_tokens + reasoning_effort instead.
    return {
        "model": deployment,
        "messages": [
            {"role": "system", "content": build_system_prompt(categories, subtypes)},
            {"role": "user", "content": build_user_prompt(fields, deterministic)},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "triage_classification", "strict": True, "schema": build_response_schema(categories, subtypes)},
        },
        "max_completion_tokens": MAX_COMPLETION_TOKENS,
        "reasoning_effort": "low",
    }


# =============================================================================
# The call + response mapping — mirrors aoai.ts's callTriageModel /
# abstainForErrorResponse / parseTriageModelResponse. NEVER raises for a model/HTTP-level
# failure — returns {"abstain": True, "reason": ...} instead, same contract as the TS lib.
# =============================================================================


def call_model(endpoint: str, deployment: str, token: str, body: dict[str, Any]) -> dict[str, Any]:
    url = f"{endpoint.rstrip('/')}/openai/v1/chat/completions"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
            raw = resp.read().decode("utf-8")
            return {"status": resp.status, "body": json.loads(raw) if raw else {}}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"raw_error_text": raw[:500]}
        return {"status": exc.code, "body": parsed}
    except urllib.error.URLError as exc:
        return {"status": None, "error": str(exc.reason)}
    except TimeoutError:
        return {"status": None, "error": "timeout"}


def parse_model_result(resp: dict[str, Any], categories: set[str], subtypes: set[str]) -> dict[str, Any]:
    status = resp.get("status")
    body = resp.get("body")

    if status is None:
        return {"abstain": True, "reason": f"request_failed:{resp.get('error', 'unknown')}"}

    if status != 200:
        code = None
        if isinstance(body, dict):
            code = (body.get("error") or {}).get("code")
        if code == "content_filter":
            return {"abstain": True, "reason": "content_filter"}
        return {"abstain": True, "reason": f"http_{status}" + (f"_{code}" if code else "")}

    choices = (body or {}).get("choices") or []
    if not choices:
        return {"abstain": True, "reason": "empty_response"}
    choice = choices[0]
    if choice.get("finish_reason") == "content_filter":
        return {"abstain": True, "reason": "content_filter"}
    content = (choice.get("message") or {}).get("content")
    if not content:
        return {"abstain": True, "reason": "empty_response"}
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return {"abstain": True, "reason": "parse_error"}
    if not isinstance(parsed, dict):
        return {"abstain": True, "reason": "parse_error"}

    category = parsed.get("category")
    subtype = parsed.get("subtype")
    if category not in categories or subtype not in subtypes:
        return {"abstain": True, "reason": "invalid_taxonomy"}

    rationale_present = isinstance(parsed.get("rationale"), str) and parsed["rationale"].strip() != ""
    if not rationale_present:
        return {"abstain": True, "reason": "empty_rationale"}

    try:
        confidence = max(0.0, min(1.0, float(parsed.get("confidence"))))
    except (TypeError, ValueError):
        confidence = 0.0

    # rationale is DELIBERATELY dropped here — never carried into the returned dict this
    # script prints/aggregates (PII discipline; see the module doc).
    return {
        "category": category,
        "subtype": subtype,
        "confidence": confidence,
        "model": body.get("model"),
    }


# =============================================================================
# Corpus loop — reuses run_eval's load_manifest/load_email_fields/resolve_expected/
# _FIELD_TO_PARAM. Deterministic pass ALWAYS runs (it's $0, no network); the LLM pass runs
# only with --with-llm.
# =============================================================================


def run_ab(
    items: list[dict[str, Any]],
    taxonomy: str,
    with_llm: bool,
    deployment: str,
    endpoint: str,
    limit: int | None,
    categories: list[str],
    subtypes: list[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    categories_set, subtypes_set = set(categories), set(subtypes)
    token = get_az_token() if with_llm else None

    results: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for item in items:
        if limit is not None and len(results) >= limit:
            break

        item_id = item.get("id", "(no id)")
        rel_file = item.get("file", "")
        source = item.get("source", "")
        tracked = item.get("tracked", True)
        file_path = (REPO_ROOT / rel_file) if rel_file else None
        if file_path is None or not file_path.exists():
            skipped.append({"id": item_id, "source": source, "tracked": tracked, "reason": "file not found"})
            continue

        try:
            fields = run_eval.load_email_fields(file_path)
        except Exception as exc:  # noqa: BLE001 - any load failure is a clean skip
            skipped.append({"id": item_id, "source": source, "tracked": tracked, "reason": f"load error: {type(exc).__name__}"})
            continue

        context = dict(item.get("context") or {})
        merged = {**fields, **context}
        merged.setdefault("provider_match_state", "none")
        kwargs = {param: merged.get(field) for field, param in run_eval._FIELD_TO_PARAM.items()}
        deterministic = run_eval.classify_email(**kwargs)

        expected = run_eval.resolve_expected(item, taxonomy)
        exp_cat, exp_sub = expected.get("category", ""), expected.get("subtype", "")

        row: dict[str, Any] = {
            "id": item_id,
            "source": source,
            "expected_category": exp_cat,
            "expected_subtype": exp_sub,
            "det_category": deterministic.get("category", ""),
            "det_subtype": deterministic.get("subtype", ""),
            "det_confidence": deterministic.get("confidence"),
        }

        if with_llm:
            body = build_request_body(deployment, categories, subtypes, merged, deterministic)
            resp = call_model(endpoint, deployment, token, body)  # type: ignore[arg-type]
            llm = parse_model_result(resp, categories_set, subtypes_set)
            if llm.get("abstain"):
                row["llm_abstain_reason"] = llm["reason"]
            else:
                row["llm_category"] = llm["category"]
                row["llm_subtype"] = llm["subtype"]
                row["llm_confidence"] = llm["confidence"]

        results.append(row)

    return results, skipped


# =============================================================================
# Reporting — aggregate/ids/labels only (PII discipline; see module doc).
# =============================================================================


def render_report(results: list[dict[str, Any]], skipped: list[dict[str, Any]], with_llm: bool, deployment: str) -> str:
    lines: list[str] = []
    lines.append(f"# Deterministic vs LLM A/B — {len(results)} item(s){f' (+LLM, {deployment})' if with_llm else ' (deterministic only)'}")
    lines.append("")
    lines.append(f"Scored: {len(results)}  ·  Skipped: {len(skipped)}")
    if skipped:
        lines.append("Skipped ids: " + ", ".join(s["id"] for s in skipped))
    lines.append("")

    header = "| id | expected | deterministic | det==expected"
    if with_llm:
        header += " | llm | llm==expected | det==llm |"
    else:
        header += " |"
    lines.append(header)
    lines.append("|" + "---|" * (6 if with_llm else 4))

    det_correct = 0
    llm_correct = 0
    agree = 0
    llm_attempted = 0
    per_category: dict[str, dict[str, int]] = {}

    for r in results:
        exp = f"{r['expected_category']}/{r['expected_subtype']}"
        det = f"{r['det_category']}/{r['det_subtype']}"
        det_ok = r["det_category"] == r["expected_category"] and r["det_subtype"] == r["expected_subtype"]
        det_correct += int(det_ok)

        bucket = per_category.setdefault(r["expected_category"], {"support": 0, "det_correct": 0, "llm_correct": 0, "llm_attempted": 0})
        bucket["support"] += 1
        bucket["det_correct"] += int(det_ok)

        row_str = f"| {r['id']} | {exp} | {det} | {'yes' if det_ok else 'no'}"
        if with_llm:
            if "llm_abstain_reason" in r:
                row_str += f" | (abstain: {r['llm_abstain_reason']}) | n/a | n/a |"
            else:
                llm_attempted += 1
                bucket["llm_attempted"] += 1
                llm = f"{r['llm_category']}/{r['llm_subtype']}"
                llm_ok = r["llm_category"] == r["expected_category"] and r["llm_subtype"] == r["expected_subtype"]
                llm_correct += int(llm_ok)
                bucket["llm_correct"] += int(llm_ok)
                det_llm_agree = r["llm_category"] == r["det_category"] and r["llm_subtype"] == r["det_subtype"]
                agree += int(det_llm_agree)
                row_str += f" | {llm} | {'yes' if llm_ok else 'no'} | {'yes' if det_llm_agree else 'no'} |"
        else:
            row_str += " |"
        lines.append(row_str)

    lines.append("")
    total = len(results)
    lines.append(f"Deterministic exact-match accuracy: {det_correct}/{total}" + (f" ({det_correct / total * 100:.0f}%)" if total else ""))
    if with_llm:
        lines.append(
            f"LLM exact-match accuracy (of {llm_attempted} attempted, {total - llm_attempted} abstained): "
            f"{llm_correct}/{llm_attempted}" + (f" ({llm_correct / llm_attempted * 100:.0f}%)" if llm_attempted else "")
        )
        lines.append(f"Deterministic/LLM agreement (of {llm_attempted} attempted): {agree}/{llm_attempted}" + (f" ({agree / llm_attempted * 100:.0f}%)" if llm_attempted else ""))
        lines.append("")
        lines.append("## Per-category deltas (expected category)")
        lines.append("")
        lines.append("| category | support | det correct | llm attempted | llm correct |")
        lines.append("|---|---|---|---|---|")
        for cat in sorted(per_category):
            b = per_category[cat]
            lines.append(f"| {cat} | {b['support']} | {b['det_correct']} | {b['llm_attempted']} | {b['llm_correct']} |")

    lines.append("")
    lines.append(
        f"SUMMARY: scored={total} skipped={len(skipped)} det_correct={det_correct}"
        + (f" llm_attempted={llm_attempted} llm_correct={llm_correct} agreement={agree}" if with_llm else "")
    )
    lines.append("")
    lines.append(
        "(model rationale text is never printed by this script — PII discipline identical to run_eval.py; "
        "see the module doc.)"
    )
    return "\n".join(lines)


# =============================================================================
# CLI
# =============================================================================


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, default=SCRIPT_DIR / "manifest.json", help="path to the tracked manifest.json (default: alongside this script)")
    parser.add_argument("--taxonomy", choices=["v1", "v2"], default="v2", help="score the deterministic pass against expected_v1 or expected_v2 (mirrors run_eval.py's default)")
    parser.add_argument("--with-llm", action="store_true", help="also call the configured Azure OpenAI deployment (a live, billed call, authenticated with your az-cli session)")
    parser.add_argument("--deployment", choices=DEPLOYMENT_CHOICES, default="gpt-5", help="the AOAI deployment name to call with --with-llm (gpt-5-mini is NOT deployed yet — see docs/gated.md)")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT, help=f"AOAI account endpoint (default: {DEFAULT_ENDPOINT}, verified 2026-07-02)")
    parser.add_argument("--limit", type=int, default=None, help="score at most N successfully-loaded corpus items (recommended with --with-llm, to bound cost/time)")
    args = parser.parse_args()

    if not args.manifest.exists():
        sys.stderr.write(f"ERROR: manifest not found: {args.manifest}\n")
        return 2

    try:
        categories, subtypes = load_taxonomy()
    except (OSError, json.JSONDecodeError, KeyError) as exc:
        sys.stderr.write(f"ERROR: could not load the taxonomy choiceset ({CHOICESET_PATH}): {exc}\n")
        return 2

    items = run_eval.load_manifest(args.manifest)

    if args.with_llm:
        try:
            # Fail fast, honestly, ONCE — no retry loop (see module doc + task brief).
            get_az_token()
        except Exception as exc:  # noqa: BLE001 - report the exact error, do not retry
            sys.stderr.write(f"ERROR: could not acquire an az-cli token for Cognitive Services: {exc}\n")
            return 1

    try:
        results, skipped = run_ab(
            items, args.taxonomy, args.with_llm, args.deployment, args.endpoint, args.limit, categories, subtypes
        )
    except RuntimeError as exc:
        sys.stderr.write(f"ERROR: {exc}\n")
        return 1

    print(render_report(results, skipped, args.with_llm, args.deployment))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
