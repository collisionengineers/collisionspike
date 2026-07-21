---
id: TKT-297
title: Engine-merge post-consolidation hardening (deferred Codex review findings)
status: backlog
priority: P2
area: parsing
tickets-it-relates-to: [TKT-287, TKT-288]
research-link: docs/tickets/backlog/TKT-297-engine-merge-hardening-findings/evidence/codex-review-findings.md
---

# Engine-merge post-consolidation hardening (deferred Codex review findings)

## Problem

The engine-merge PR (TKT-287, PR #145) drew several automated-review findings that are VALID but are
either (a) refinements to eval/test tooling carried over verbatim from the archived sibling, or (b)
design/versioning concerns that are not CI-blocking and are not regressions to collisionspike's live
runtime behaviour. They are deferred here so the consolidation can land without silently dropping them.

## Findings deferred here (see evidence)

1. **`eval/comparator.py` exact-match denominator double-counts** a wrong-non-blank field (records
   both `fp` and `fn`), so reported experiment scores and the committed regression floor are slightly
   inaccurate. Inherited sibling scoring logic.
2. **`eval/comparator.py` silently drops fixtures with a missing source** instead of erroring — a
   deleted source/expected pair can shrink the corpus and lift the aggregate while the ≥3-fixture gate
   still passes.
3. **`eval/ci_eval.py --update-baseline` writes a baseline from errored/skipped fixtures** — should
   refuse to write whenever `score.skipped` is non-empty.
4. **`pyproject.toml` wheel omits `eval/baseline.json` + the default corpus + root `providers.json`** —
   a non-editable install of the eval entry point fails on its advertised default assets. CI uses an
   editable install, which masks it.
5. **`readers/pdf.py` process-global OCR monkeypatch race** when `OCR_PROVIDER=docintel` —
   `_install_docintel_ocr_hook()` swaps `pytesseract.image_to_string` process-wide and two concurrent
   requests can interleave the restore. Needs request-local injection or a lock. Only reachable under
   the docintel provider (see TKT-289's Document Intelligence investigation).

## Pre-redeploy gate (not deferrable past the parser/OCR redeploy)

6. **`function_app.py` parser-fingerprint response still self-identifies as `ce-parser-fingerprint-v1`**
   while dropping the v1 `repository`/`ref`/`commit`/`providers_sha256` fields (retired with vendoring).
   A deployment verifier keyed on the v1 contract id would accept a nominal-v1 response and then fail on
   the missing fields. **Bump the fingerprint contract id (e.g. `ce-parser-fingerprint-v2` /
   `ce-engine-fingerprint-v1`) and update any consumer BEFORE the parser Function is redeployed** as
   part of this workstream's deploy phase.

## Out of scope

The classifier-precedence findings from the sibling are tracked separately in [[TKT-288]]; this ticket
is only the engine-merge's own tooling/versioning hygiene.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
