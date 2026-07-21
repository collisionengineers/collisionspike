#!/usr/bin/env python3
"""OLD-vs-NEW classify_email() backtest for PLAN-014 (parse-fed unified triage reorder).

For every tracked item in the real-email corpus (manifest.json + local overlay), runs
`classify_email()` TWICE:

  OLD — today's exact request (no `attachment_content_typings`) — the same call
        `run_eval.py` already makes.
  NEW — the SAME request plus `attachment_content_typings` derived by running each real
        attachment through the vendored engine's content-based document detector
        (`parser_adapter.run_parser`, the same in-process call the live `/parse` route
        makes — no HTTP, no Azure).

Reuses `run_eval.py`'s loader machinery BY IMPORT (never copied) — the established
convention `run_ab.py` already follows for its own (unrelated) deterministic-vs-model
comparison. This is the D5 go/no-go gate: PLAN-014's orchestration changes (Slice 4a/4b)
must not ship until this comparison shows zero regressions on the corpus and every
changed outcome is individually justified.

PII discipline (see README.md "PII rules"): identical to run_eval.py — default output is
aggregate numbers, ids, and closed-vocabulary labels only. `--json-out` is local-debugging
only, never committed.

Usage:
    python run_ab_parsefed.py                          # markdown delta report, exit 0
    python run_ab_parsefed.py --json-out /tmp/delta.json  # full per-item OLD/NEW detail (local only)
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]
PARSER_DIR = REPO_ROOT / "services" / "functions" / "parser"

sys.path.insert(0, str(SCRIPT_DIR))
import run_eval  # noqa: E402 - loader machinery reused BY IMPORT, never copied

if str(PARSER_DIR) not in sys.path:
    sys.path.insert(0, str(PARSER_DIR))


# Mirror the live parser's candidate ordering + cap (parse-candidates.ts / parse.ts): only
# DOC-type attachments are parsed, Word/RTF before PDF, email files (.eml/.msg) a last resort,
# and no more than MAX_PARSE_DOCS. Reproduced here (filename-based, since the corpus loader
# yields filename+bytes) so the harness never derives a content typing from an attachment the
# live intake pipeline would never parse — e.g. a 4th document beyond the cap.
_MAX_PARSE_DOCS = 3
_DOC_EXT_RE = re.compile(r"\.(pdf|docx?|rtf|eml|msg)$", re.IGNORECASE)
_EMAIL_EXT_RE = re.compile(r"\.(eml|msg)$", re.IGNORECASE)
_PDF_EXT_RE = re.compile(r"\.pdf$", re.IGNORECASE)


def _order_parse_candidates(attachments: list[tuple[str, bytes]]) -> list[tuple[str, bytes]]:
    docs = [a for a in attachments if _DOC_EXT_RE.search(a[0] or "")]
    if not docs:
        return []
    non_email = [a for a in docs if not _EMAIL_EXT_RE.search(a[0] or "")]
    pool = non_email if non_email else [a for a in docs if _EMAIL_EXT_RE.search(a[0] or "")]
    non_pdf = [a for a in pool if not _PDF_EXT_RE.search(a[0] or "")]
    pdf = [a for a in pool if _PDF_EXT_RE.search(a[0] or "")]
    return (non_pdf + pdf)[:_MAX_PARSE_DOCS]


def _derive_content_typings(path: Path) -> list[dict[str, str]]:
    """Run the LIVE candidate set of an email's attachments through the engine's content-based
    document typing (the same in-process call the live `/parse` route makes). Per-document
    client-side failures (an unreadable / image-only / unsupported document) are skipped — they
    contribute no content-typing signal, matching how the live pipeline degrades per document.

    An INFRASTRUCTURE fault (`ParserError`: a missing engine dependency or an engine crash — a
    500 in production, NOT a per-document 422) is deliberately NOT caught: it propagates and
    ABORTS the backtest, so a broken parser environment can never masquerade as "0 regressions"
    and falsely certify the gate."""
    from parser_adapter import DocumentUnreadableError, run_parser  # local import

    typings: list[dict[str, str]] = []
    candidates = _order_parse_candidates(list(run_eval.load_email_attachment_bytes(path)))
    for filename, data in candidates:
        try:
            result = run_parser(data, filename)
        except (DocumentUnreadableError, ValueError):
            # Per-document, client-side (unreadable / unsupported extension) — skip this doc,
            # exactly as the live pipeline does. ParserError (RuntimeError) is intentionally
            # not caught here.
            continue
        doc_type = (result.get("content_typing") or {}).get("doc_type")
        if doc_type:
            typings.append({"filename": filename, "doc_type": str(doc_type)})
    return typings


def compare_item(item: dict[str, Any], taxonomy: str) -> dict[str, Any] | None:
    """Returns one delta record, or None if the item could not be loaded (a clean skip,
    matching run_eval.py's own skip semantics)."""
    path = run_eval.resolve_manifest_file(item)
    if path is None or not path.exists():
        return None
    try:
        fields = run_eval.load_email_fields(path)
    except Exception:
        return None

    context = dict(item.get("context") or {})
    merged = {**fields, **context}
    merged.setdefault("provider_match_state", "none")
    old_kwargs = {param: merged.get(field) for field, param in run_eval._FIELD_TO_PARAM.items()}

    old_result = run_eval.classify_email(**old_kwargs)

    content_typings = _derive_content_typings(path)
    new_kwargs = dict(old_kwargs)
    new_kwargs["attachment_content_typings"] = content_typings
    new_result = run_eval.classify_email(**new_kwargs)

    expected = run_eval.resolve_expected(item, taxonomy)
    changed = (old_result.get("category"), old_result.get("subtype")) != (
        new_result.get("category"),
        new_result.get("subtype"),
    )

    return {
        "id": item.get("id", "(no id)"),
        "content_typings_found": len(content_typings),
        "expected_category": expected.get("category", ""),
        "expected_subtype": expected.get("subtype", ""),
        "old_category": old_result.get("category"),
        "old_subtype": old_result.get("subtype"),
        "new_category": new_result.get("category"),
        "new_subtype": new_result.get("subtype"),
        "old_correct": (old_result.get("category"), old_result.get("subtype"))
        == (expected.get("category", ""), expected.get("subtype", "")),
        "new_correct": (new_result.get("category"), new_result.get("subtype"))
        == (expected.get("category", ""), expected.get("subtype", "")),
        "changed": changed,
    }


def run_backtest(manifest_path: Path, taxonomy: str) -> tuple[list[dict[str, Any]], list[str]]:
    items = [i for i in run_eval.load_manifest(manifest_path) if i.get("tracked", True)]
    deltas: list[dict[str, Any]] = []
    skipped: list[str] = []
    for item in items:
        delta = compare_item(item, taxonomy)
        if delta is None:
            skipped.append(item.get("id", "(no id)"))
            continue
        deltas.append(delta)
    return deltas, skipped


def render_report(deltas: list[dict[str, Any]], skipped: list[str]) -> str:
    lines: list[str] = []
    lines.append("# PLAN-014 D5 — OLD-vs-NEW classify_email() backtest (attachment_content_typings)")
    lines.append("")
    lines.append(f"Compared: {len(deltas)}  ·  Skipped: {len(skipped)}")
    lines.append("")

    old_correct = sum(1 for d in deltas if d["old_correct"])
    new_correct = sum(1 for d in deltas if d["new_correct"])
    changed = [d for d in deltas if d["changed"]]
    regressions = [d for d in changed if d["old_correct"] and not d["new_correct"]]
    improvements = [d for d in changed if not d["old_correct"] and d["new_correct"]]
    neutral_changes = [d for d in changed if d not in regressions and d not in improvements]

    total = len(deltas) or 1
    lines.append(f"OLD accuracy (category+subtype exact): **{old_correct}/{len(deltas)} ({old_correct / total * 100:.1f}%)**")
    lines.append(f"NEW accuracy (category+subtype exact): **{new_correct}/{len(deltas)} ({new_correct / total * 100:.1f}%)**")
    lines.append(f"Changed outcomes: {len(changed)}  ·  Regressions: {len(regressions)}  ·  Improvements: {len(improvements)}  ·  Neutral changes: {len(neutral_changes)}")
    lines.append("")

    if regressions:
        lines.append("## REGRESSIONS (was correct, now wrong) — MUST be zero to ship")
        lines.append("")
        lines.append("| id | expected | old | new |")
        lines.append("|---|---|---|---|")
        for d in regressions:
            exp = f"{d['expected_category']}/{d['expected_subtype']}"
            old = f"{d['old_category']}/{d['old_subtype']}"
            new = f"{d['new_category']}/{d['new_subtype']}"
            lines.append(f"| {d['id']} | {exp} | {old} | {new} |")
        lines.append("")

    if improvements:
        lines.append("## Improvements (was wrong, now correct)")
        lines.append("")
        lines.append("| id | expected | old | new |")
        lines.append("|---|---|---|---|")
        for d in improvements:
            exp = f"{d['expected_category']}/{d['expected_subtype']}"
            old = f"{d['old_category']}/{d['old_subtype']}"
            new = f"{d['new_category']}/{d['new_subtype']}"
            lines.append(f"| {d['id']} | {exp} | {old} | {new} |")
        lines.append("")

    if neutral_changes:
        lines.append("## Neutral changes (still wrong either way, or still right either way but a different label)")
        lines.append("")
        lines.append("| id | expected | old | new |")
        lines.append("|---|---|---|---|")
        for d in neutral_changes:
            exp = f"{d['expected_category']}/{d['expected_subtype']}"
            old = f"{d['old_category']}/{d['old_subtype']}"
            new = f"{d['new_category']}/{d['new_subtype']}"
            lines.append(f"| {d['id']} | {exp} | {old} | {new} |")
        lines.append("")

    with_content = sum(1 for d in deltas if d["content_typings_found"] > 0)
    lines.append(f"Items where at least one attachment produced a content typing: {with_content}/{len(deltas)}")
    lines.append("")
    lines.append(
        f"SUMMARY: compared={len(deltas)} skipped={len(skipped)} "
        f"old_accuracy={old_correct}/{len(deltas)} new_accuracy={new_correct}/{len(deltas)} "
        f"changed={len(changed)} regressions={len(regressions)} improvements={len(improvements)}"
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--taxonomy", choices=["v1", "v2"], default="v2")
    parser.add_argument("--manifest", type=Path, default=SCRIPT_DIR / "manifest.json")
    parser.add_argument("--json-out", type=Path, default=None, help="full per-item OLD/NEW detail (local debugging only — see README.md PII rules)")
    parser.add_argument("--fail-on-regression", action="store_true", help="exit 1 if any regression is found (go/no-go mode)")
    args = parser.parse_args()

    if not args.manifest.exists():
        sys.stderr.write(f"ERROR: manifest not found: {args.manifest}\n")
        return 2

    deltas, skipped = run_backtest(args.manifest, args.taxonomy)
    report = render_report(deltas, skipped)
    print(report)

    if args.json_out:
        import json

        payload = {
            "schema": "collisionspike-eval-email-parsefed-backtest-v1",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "taxonomy": args.taxonomy,
            "deltas": deltas,
            "skipped": skipped,
        }
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"\n(full report written to {args.json_out})")

    if args.fail_on_regression:
        # A skipped tracked item can HIDE the sole regression, so the go/no-go gate treats any
        # skip as a failure (matches the evaluator README's rule that missing tracked evidence
        # is an operational failure) — never let a shrunken corpus exit 0.
        if skipped:
            sys.stderr.write(
                f"GATE FAILED: {len(skipped)} tracked item(s) skipped (missing/unloadable): "
                f"{', '.join(skipped)}. A skip can mask a regression — treated as a gate failure.\n"
            )
            return 1
        regressions = [d for d in deltas if d["changed"] and d["old_correct"] and not d["new_correct"]]
        if regressions:
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
