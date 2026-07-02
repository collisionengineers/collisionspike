#!/usr/bin/env python3
"""scripts/eval-email/run_eval.py — real-email eval harness for the deterministic
email classifier (Rules Engine v2 plan, Phase 1: docs/plans/rules_engine_v2_plan_9ba034c4.plan.md).

Loads a labelled corpus of REAL `.eml`/`.msg` files (see manifest.json + README.md),
calls the vendored, pure `classify_email()` function directly (no HTTP, no Azure), and
scores the result against a hand-labelled expected {category, subtype} per item. This is
a NET-NEW scorer — it does not touch/replace the engine's own regression suite under
functions/parser/tests/ or the synthetic corpus under test-cases-and-data/triage-corpus/.

PII discipline (see README.md "PII rules"): the real .eml/.msg files carry genuine
personal data (names, addresses, vehicle registrations, claim references). This script
NEVER prints or writes subject/body content or raw signal text by default — the default
stdout table and --baseline-out are aggregate-numbers-and-ids only. `--json-out` produces
a richer per-item report (including the classifier's `signals` list, which can contain
short extracted tokens such as a VRM or case ref) for LOCAL debugging only; see the
"PII rules" section of README.md before sharing or committing a --json-out artifact.

Usage:
    python run_eval.py                                   # v1 baseline, prints markdown, exit 0
    python run_eval.py --taxonomy v2                      # score against v2 expectations (fallback to v1)
    python run_eval.py --json-out /tmp/report.json         # full detail incl. signals (NOT committed)
    python run_eval.py --baseline-out baseline-v1.json      # redacted shape safe to commit
    python run_eval.py --check baseline-v1.json             # exit 1 on regression vs baseline
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
PARSER_DIR = REPO_ROOT / "functions" / "parser"

# ---- locate + import the vendored engine (READ-ONLY import; functions/parser/ is never
#      modified by this script). classify_email is a pure function: subject/body/from/etc
#      in, {category, subtype, confidence, signals, ...} out. No I/O, no network, no LLM. ----
if str(PARSER_DIR) not in sys.path:
    sys.path.insert(0, str(PARSER_DIR))

try:
    from cedocumentmapper_v2.rules.email_classifier import classify_email  # noqa: E402
except ImportError as exc:  # pragma: no cover - operator-facing message
    sys.stderr.write(
        "ERROR: could not import cedocumentmapper_v2.rules.email_classifier.\n"
        f"  sys.path includes: {PARSER_DIR}\n"
        "  Set up the venv: cd functions/parser && python -m venv .venv && "
        ".venv/bin/pip install -r requirements.txt -r requirements-dev.txt extract-msg\n"
        f"  ({exc})\n"
    )
    raise SystemExit(2)

try:
    import extract_msg  # noqa: E402
except ImportError:
    extract_msg = None


# =============================================================================
# Email loading — unifies .eml and .msg through the SAME extraction code path.
# extract_msg's Message.asEmailMessage() converts a .msg to a stdlib
# email.message.EmailMessage, so both formats are walked identically below
# (verified against the real corpus: headers, multipart body, and attachment
# filenames all survive the conversion).
# =============================================================================

# Mirrors packages/domain/src/domain/classification.ts EXTENSION_TABLE exactly
# (the production attachment-kind mapping the orchestrator's classifyInbound.ts
# feeds to /classify-email via describeEvidence().evidenceClass).
_EXT_TO_KIND: dict[str, str] = {
    "jpg": "image",
    "jpeg": "image",
    "png": "image",
    "pdf": "instruction",
    "docx": "instruction",
    "doc": "instruction",
    "eml": "email",
}


def _kind_for_filename(name: str) -> str:
    name = (name or "").strip()
    dot = name.rfind(".")
    if dot <= 0 or dot == len(name) - 1:
        return "other"
    ext = name[dot + 1 :].lower()
    return _EXT_TO_KIND.get(ext, "other")


# Mirrors functions/parser/function_app.py's `_strip_html` (the server-side HTML->text
# step the live /classify-email route always applies to `body` before calling
# classify_email) so this harness feeds the classifier exactly what the live route
# feeds it. Duplicated (not imported) because function_app.py is an Azure Function
# app module (side-effecting route registration on import) — this is a small, pure,
# ~15-line helper, cheap and safe to mirror.
_TAG_RE = re.compile(r"<[^>]+>")
_HTML_ENTITIES = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
}


def _strip_html(value: Any) -> str:
    if not isinstance(value, str) or not value:
        return ""
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", value)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</(p|div|tr|li|h[1-6])>", "\n", text)
    text = _TAG_RE.sub(" ", text)
    for entity, char in _HTML_ENTITIES.items():
        text = text.replace(entity, char)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


class EmailLoadError(Exception):
    """Raised when a corpus file cannot be parsed into email fields."""


def _load_email_message(path: Path):
    """Return a stdlib email.message.Message for both .eml and .msg."""
    suffix = path.suffix.lower()
    if suffix == ".eml":
        with open(path, "rb") as fh:
            return BytesParser(policy=policy.default).parse(fh)
    if suffix == ".msg":
        if extract_msg is None:
            raise EmailLoadError("extract_msg not installed (pip install extract-msg)")
        m = extract_msg.Message(str(path))
        try:
            return m.asEmailMessage()
        finally:
            m.close()
    raise EmailLoadError(f"unsupported extension: {suffix}")


def _body_and_attachments(msg) -> tuple[str, list[str]]:
    """Assemble a raw body string (text/plain preferred, else text/html) and the list
    of attachment filenames — mirrors the vendored EmailDocumentReader._read_eml's body
    assembly, minus the header/attachment-name text it prepends into ITS combined blob
    (this harness needs subject/body/attachments as SEPARATE classify_email fields)."""
    plain_parts: list[str] = []
    html_parts: list[str] = []
    attachment_names: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            disp = str(part.get_content_disposition() or "").lower()
            if disp == "attachment":
                name = part.get_filename()
                if name:
                    attachment_names.append(str(name).strip())
                continue
            ctype = part.get_content_type()
            if ctype not in ("text/plain", "text/html"):
                continue
            try:
                payload = part.get_content()
            except Exception:
                try:
                    raw = part.get_payload(decode=True)
                    payload = (
                        raw.decode(part.get_content_charset() or "utf-8", errors="ignore")
                        if isinstance(raw, bytes)
                        else ""
                    )
                except Exception:
                    payload = ""
            if not isinstance(payload, str):
                continue
            if ctype == "text/plain":
                plain_parts.append(payload)
            else:
                html_parts.append(payload)
    else:
        ctype = msg.get_content_type()
        try:
            payload = msg.get_content()
        except Exception:
            payload = ""
        if isinstance(payload, str):
            if ctype == "text/html":
                html_parts.append(payload)
            else:
                plain_parts.append(payload)

    raw_body = "\n\n".join(p for p in plain_parts if p and p.strip())
    if not raw_body:
        raw_body = "\n\n".join(p for p in html_parts if p and p.strip())
    return raw_body, attachment_names


def load_email_fields(path: Path) -> dict[str, Any]:
    """Extract the classify_email() request fields from a real .eml/.msg file.

    Returns: subject, body (HTML-stripped), from_address, sender_domain, in_reply_to,
    references, attachment_filenames, attachment_kinds, has_attachments.
    """
    try:
        msg = _load_email_message(path)
    except EmailLoadError:
        raise
    except Exception as exc:  # extract_msg ConversionError / stdlib parse failure
        raise EmailLoadError(f"{type(exc).__name__}") from exc

    subject = msg.get("Subject", "") or ""
    from_raw = msg.get("From", "") or ""
    _, from_address = parseaddr(from_raw)
    from_address = (from_address or "").strip().lower()
    sender_domain = from_address.rsplit("@", 1)[-1] if "@" in from_address else ""
    in_reply_to = msg.get("In-Reply-To", "") or ""
    references = msg.get("References", "") or ""

    raw_body, attachment_names = _body_and_attachments(msg)
    body = _strip_html(raw_body)
    attachment_kinds = [_kind_for_filename(n) for n in attachment_names]

    return {
        "subject": str(subject),
        "body": body,
        "from_address": from_address,
        "sender_domain": sender_domain,
        "in_reply_to": str(in_reply_to),
        "references": str(references),
        "attachment_filenames": attachment_names,
        "attachment_kinds": attachment_kinds,
        "has_attachments": bool(attachment_names),
    }


# classify_email() keyword-argument names differ slightly from the loader's dict keys
# above (which mirror the loader's own field names) — this maps loader-field -> the
# exact classify_email() parameter name.
_FIELD_TO_PARAM = {
    "subject": "subject",
    "body": "body",
    "from_address": "from_address",
    "sender_domain": "sender_domain",
    "provider_match_state": "provider_match_state",
    "attachment_kinds": "attachment_kinds",
    "attachment_filenames": "attachment_filenames",
    "has_attachments": "has_attachments",
    "in_reply_to": "in_reply_to",
    "references": "references",
}


# =============================================================================
# Manifest / corpus assembly
# =============================================================================


def load_manifest(manifest_path: Path) -> list[dict[str, Any]]:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    items = list(data.get("items", []))

    # Optional local-only overlay — same schema as manifest.json's "items" array,
    # merged in when present. Gitignored (test-cases-and-data/e-mail-examinations/ is
    # in .gitignore); see README.md "The overlay corpus" + export-live-labels.md.
    overlay_path = REPO_ROOT / "test-cases-and-data" / "e-mail-examinations" / "eval-overlay.json"
    if overlay_path.exists():
        try:
            overlay = json.loads(overlay_path.read_text(encoding="utf-8"))
            overlay_items = list(overlay.get("items", []))
            items.extend(overlay_items)
        except (OSError, json.JSONDecodeError) as exc:
            sys.stderr.write(f"WARNING: could not load overlay {overlay_path}: {exc}\n")

    return items


def resolve_expected(item: dict[str, Any], taxonomy: str) -> dict[str, str]:
    """v1 always present; v2 falls back to v1 when the item has no v2 expectation
    (per the plan's Phase-1 spec: 'v2 items without a v2 expectation fall back to v1')."""
    if taxonomy == "v2":
        v2 = item.get("expected_v2")
        if v2:
            return v2
    return item["expected_v1"]


# =============================================================================
# Scoring
# =============================================================================


def evaluate(items: list[dict[str, Any]], taxonomy: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Returns (results, skipped). `results` is one rich dict per scored item;
    `skipped` is one dict per item that could not be loaded/scored."""
    results: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for item in items:
        item_id = item.get("id", "(no id)")
        rel_file = item.get("file", "")
        tracked = item.get("tracked", True)
        source = item.get("source", "")
        file_path = (REPO_ROOT / rel_file) if rel_file else None

        if file_path is None or not file_path.exists():
            skipped.append(
                {
                    "id": item_id,
                    "source": source,
                    "tracked": tracked,
                    "reason": "file not found" + ("" if tracked else " (tracked:false — expected absent locally)"),
                }
            )
            continue

        try:
            fields = load_email_fields(file_path)
        except Exception as exc:  # noqa: BLE001 - any load failure is a clean skip
            skipped.append(
                {
                    "id": item_id,
                    "source": source,
                    "tracked": tracked,
                    "reason": f"load error: {type(exc).__name__}",
                }
            )
            continue

        # Manifest `context` overrides/augments the file-derived fields. provider_match_state
        # has no file-derived value (it is a labeler judgment — see README.md); default to
        # "none" (unmatched) if a manifest entry omits it, rather than silently passing "".
        context = dict(item.get("context") or {})
        merged = {**fields, **context}
        merged.setdefault("provider_match_state", "none")

        kwargs = {param: merged.get(field) for field, param in _FIELD_TO_PARAM.items()}
        got = classify_email(**kwargs)

        expected = resolve_expected(item, taxonomy)
        exp_cat, exp_sub = expected.get("category", ""), expected.get("subtype", "")
        got_cat, got_sub = got.get("category", ""), got.get("subtype", "")

        results.append(
            {
                "id": item_id,
                "source": source,
                "tracked": tracked,
                "expected_category": exp_cat,
                "expected_subtype": exp_sub,
                "got_category": got_cat,
                "got_subtype": got_sub,
                "category_correct": exp_cat == got_cat,
                "subtype_correct": exp_cat == got_cat and exp_sub == got_sub,
                "confidence": got.get("confidence"),
                "signals": got.get("signals", []),
                "is_reply": got.get("is_reply"),
                "body_vrm": got.get("body_vrm", ""),
                "body_caseref": got.get("body_caseref", ""),
                "body_jobref": got.get("body_jobref", ""),
                "contract_version": got.get("contract_version"),
                "provider_match_state": merged.get("provider_match_state"),
            }
        )

    return results, skipped


def compute_aggregate(results: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(results)
    categories = sorted({r["expected_category"] for r in results} | {r["got_category"] for r in results})

    confusion: dict[str, dict[str, int]] = {c: {c2: 0 for c2 in categories} for c in categories}
    for r in results:
        confusion[r["expected_category"]][r["got_category"]] += 1

    category_metrics: dict[str, Any] = {}
    for c in categories:
        tp = sum(1 for r in results if r["expected_category"] == c and r["got_category"] == c)
        fp = sum(1 for r in results if r["got_category"] == c and r["expected_category"] != c)
        fn = sum(1 for r in results if r["expected_category"] == c and r["got_category"] != c)
        support = sum(1 for r in results if r["expected_category"] == c)
        precision = tp / (tp + fp) if (tp + fp) else None
        recall = tp / (tp + fn) if (tp + fn) else None
        f1 = (2 * precision * recall / (precision + recall)) if precision and recall and (precision + recall) else 0.0
        category_metrics[c] = {
            "support": support,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }

    subtype_accuracy: dict[str, Any] = {}
    for r in results:
        key = f"{r['expected_category']}/{r['expected_subtype']}"
        bucket = subtype_accuracy.setdefault(key, {"support": 0, "correct": 0})
        bucket["support"] += 1
        if r["subtype_correct"]:
            bucket["correct"] += 1
    for bucket in subtype_accuracy.values():
        bucket["accuracy"] = bucket["correct"] / bucket["support"] if bucket["support"] else 0.0

    category_accuracy = sum(1 for r in results if r["category_correct"]) / total if total else 0.0
    subtype_exact_accuracy = sum(1 for r in results if r["subtype_correct"]) / total if total else 0.0

    return {
        "total": total,
        "category_accuracy": category_accuracy,
        "subtype_exact_accuracy": subtype_exact_accuracy,
        "categories": categories,
        "category_metrics": category_metrics,
        "confusion_matrix": confusion,
        "subtype_accuracy": subtype_accuracy,
    }


# =============================================================================
# Reporting
# =============================================================================


def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{x * 100:.1f}%"


def render_markdown(aggregate: dict[str, Any], results: list[dict[str, Any]], skipped: list[dict[str, Any]], taxonomy: str) -> str:
    lines: list[str] = []
    lines.append(f"# Email classifier eval — taxonomy {taxonomy}")
    lines.append("")
    lines.append(f"Loaded: {aggregate['total']}  ·  Skipped: {len(skipped)}")
    if skipped:
        by_reason: dict[str, int] = {}
        for s in skipped:
            by_reason[s["reason"]] = by_reason.get(s["reason"], 0) + 1
        lines.append("Skip reasons: " + ", ".join(f"{reason} x{count}" for reason, count in sorted(by_reason.items())))
    lines.append("")
    lines.append(f"Overall category accuracy: **{_pct(aggregate['category_accuracy'])}**")
    lines.append(f"Overall category+subtype (exact) accuracy: **{_pct(aggregate['subtype_exact_accuracy'])}**")
    lines.append("")

    lines.append("## Per-category precision / recall / F1")
    lines.append("")
    lines.append("| category | support | precision | recall | F1 |")
    lines.append("|---|---|---|---|---|")
    for c in aggregate["categories"]:
        m = aggregate["category_metrics"][c]
        lines.append(f"| {c} | {m['support']} | {_pct(m['precision'])} | {_pct(m['recall'])} | {m['f1']:.2f} |")
    lines.append("")

    lines.append("## Confusion matrix (rows = expected, cols = got)")
    lines.append("")
    cats = aggregate["categories"]
    header = "| expected \\\\ got | " + " | ".join(cats) + " |"
    lines.append(header)
    lines.append("|" + "---|" * (len(cats) + 1))
    for c in cats:
        row = aggregate["confusion_matrix"][c]
        lines.append(f"| {c} | " + " | ".join(str(row[c2]) for c2 in cats) + " |")
    lines.append("")

    lines.append("## Subtype accuracy (expected category/subtype)")
    lines.append("")
    lines.append("| expected category/subtype | support | correct | accuracy |")
    lines.append("|---|---|---|---|")
    for key in sorted(aggregate["subtype_accuracy"]):
        b = aggregate["subtype_accuracy"][key]
        lines.append(f"| {key} | {b['support']} | {b['correct']} | {_pct(b['accuracy'])} |")
    lines.append("")

    mismatches = [r for r in results if not r["category_correct"] or not r["subtype_correct"]]
    lines.append(f"## Mismatches ({len(mismatches)}/{aggregate['total']})")
    lines.append("")
    lines.append("| id | expected | got | confidence |")
    lines.append("|---|---|---|---|")
    for r in mismatches:
        exp = f"{r['expected_category']}/{r['expected_subtype']}"
        got = f"{r['got_category']}/{r['got_subtype']}"
        conf = "n/a" if r["confidence"] is None else f"{r['confidence']:.2f}"
        lines.append(f"| {r['id']} | {exp} | {got} | {conf} |")
    lines.append("")
    lines.append("(signals omitted from this table by design — see README.md \"PII rules\"; use --json-out for full detail.)")
    lines.append("")
    # A final compact one-liner so a tail-truncated capture (e.g. verify-all.mjs's
    # `run()` helper, which only keeps the last few lines of stdout) still shows the
    # headline numbers regardless of how much of the report above got cut.
    lines.append(
        f"SUMMARY: loaded={aggregate['total']} skipped={len(skipped)} "
        f"category_accuracy={_pct(aggregate['category_accuracy'])} "
        f"subtype_exact_accuracy={_pct(aggregate['subtype_exact_accuracy'])} "
        f"mismatches={len(mismatches)}"
    )

    return "\n".join(lines)


def _redact_for_baseline(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Minimal per-item shape for the COMMITTED baseline file: id/source/expected/got/
    correctness/confidence only. Deliberately excludes `signals`, `body_vrm`,
    `body_caseref`, `body_jobref` — those can carry short extracted content tokens
    (a registration, a claim ref) lifted from the real email; see README.md."""
    return [
        {
            "id": r["id"],
            "source": r["source"],
            "tracked": r["tracked"],
            "expected_category": r["expected_category"],
            "expected_subtype": r["expected_subtype"],
            "got_category": r["got_category"],
            "got_subtype": r["got_subtype"],
            "category_correct": r["category_correct"],
            "subtype_correct": r["subtype_correct"],
            "confidence": r["confidence"],
        }
        for r in results
    ]


def write_json(path: Path, aggregate: dict[str, Any], results: list[dict[str, Any]], skipped: list[dict[str, Any]], taxonomy: str, redacted: bool) -> None:
    payload = {
        "schema": "collisionspike-eval-email-baseline-v1" if redacted else "collisionspike-eval-email-report-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "taxonomy": taxonomy,
        "aggregate": {
            "total": aggregate["total"],
            "skipped": len(skipped),
            "category_accuracy": aggregate["category_accuracy"],
            "subtype_exact_accuracy": aggregate["subtype_exact_accuracy"],
            "category_metrics": aggregate["category_metrics"],
            "confusion_matrix": aggregate["confusion_matrix"],
            "subtype_accuracy": aggregate["subtype_accuracy"],
        },
        "items": _redact_for_baseline(results) if redacted else results,
    }
    if not redacted:
        payload["skipped_items"] = skipped
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# =============================================================================
# Regression check (--check)
# =============================================================================


def check_regression(baseline_path: Path, aggregate: dict[str, Any]) -> list[str]:
    """Returns a list of human-readable regression messages (empty = no regression).
    A regression is any category whose recall or precision drops below the baseline's
    value minus 0.0001 (per the Phase-1 plan spec)."""
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    baseline_metrics = baseline.get("aggregate", {}).get("category_metrics", baseline.get("category_metrics", {}))
    regressions: list[str] = []
    TOLERANCE = 0.0001
    for cat, base_m in baseline_metrics.items():
        cur_m = aggregate["category_metrics"].get(cat)
        if cur_m is None:
            regressions.append(f"category '{cat}' present in baseline but absent from current run")
            continue
        for metric in ("precision", "recall"):
            base_v = base_m.get(metric)
            cur_v = cur_m.get(metric)
            if base_v is None:
                continue
            if cur_v is None or cur_v < base_v - TOLERANCE:
                regressions.append(
                    f"category '{cat}' {metric} regressed: baseline={base_v:.4f} current={cur_v if cur_v is None else round(cur_v, 4)}"
                )
    return regressions


# =============================================================================
# CLI
# =============================================================================


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--taxonomy", choices=["v1", "v2"], default="v1", help="score against expected_v1 or expected_v2 (v2 falls back to v1 per item when absent)")
    parser.add_argument("--manifest", type=Path, default=SCRIPT_DIR / "manifest.json", help="path to the tracked manifest.json (default: alongside this script)")
    parser.add_argument("--json-out", type=Path, default=None, help="write the FULL per-item report (incl. signals) here — NOT for committing; see README.md PII rules")
    parser.add_argument("--baseline-out", type=Path, default=None, help="write the redacted baseline-shaped report here (safe to commit)")
    parser.add_argument("--check", type=Path, default=None, help="path to a baseline JSON; exit 1 if any category's precision/recall regressed vs it")
    args = parser.parse_args()

    if not args.manifest.exists():
        sys.stderr.write(f"ERROR: manifest not found: {args.manifest}\n")
        return 2

    items = load_manifest(args.manifest)
    results, skipped = evaluate(items, args.taxonomy)
    aggregate = compute_aggregate(results)

    print(render_markdown(aggregate, results, skipped, args.taxonomy))

    if args.json_out:
        write_json(args.json_out, aggregate, results, skipped, args.taxonomy, redacted=False)
        print(f"\n(full report written to {args.json_out})")

    if args.baseline_out:
        write_json(args.baseline_out, aggregate, results, skipped, args.taxonomy, redacted=True)
        print(f"\n(baseline report written to {args.baseline_out})")

    if args.check:
        if not args.check.exists():
            sys.stderr.write(f"ERROR: --check baseline not found: {args.check}\n")
            return 2
        regressions = check_regression(args.check, aggregate)
        if regressions:
            print("\n=== REGRESSION vs baseline ===")
            for msg in regressions:
                print(f"  - {msg}")
            return 1
        print(f"\nNo regression vs baseline {args.check}.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
