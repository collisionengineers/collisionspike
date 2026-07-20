---
id: TKT-287
title: cedocumentmapper engine repository consolidation
status: now
priority: P1
area: parsing
tickets-it-relates-to: []
research-link: docs/tickets/now/TKT-287-cedocumentmapper-engine-repository-consolidation/evidence/merge-notes.md
---

# cedocumentmapper engine repository consolidation

## Problem

The deterministic parser engine was authored in a separate sibling repository
(`collisionengineers/cedocumentmapper_v2.0`) and vendored into this repository under an
immutable tag/commit pin (`VENDOR_LOCK.json`, ADR-0018). That sibling repository is also an
independently-shipped Windows desktop product (PyInstaller build, pywebview review UI) which is
no longer being maintained going forward. With the desktop product retiring, the two-repo split
no longer buys anything — it only costs a cross-repo re-vendor cycle, a second CI job with a
deploy-key checkout of a private repository, and a documented history of drift incidents
(`docs/reviews/150726/python-vendor/review.md` findings E2/E3).

## Proposed change

Merge the engine (not the desktop app) into this repository as its new canonical, permanently
authored home: `services/engine/cedocumentmapper_v2/`, history-preserving via `git filter-repo`.
Materialize `services/functions/parser/cedocumentmapper_v2/` and a new
`services/functions/ocr/cedocumentmapper_v2/` from that one source via a new
`scripts/build/sync-engine.py`, gated by a new `scripts/checks/check-engine-materialized.py`
byte-identity check replacing the old cross-repo vendor-pin verifier. Bring across the engine's
own `eval/` regression harness (38-fixture corpus, document-field extraction) as a new,
additional CI gate — complementary to this repository's existing email-triage-only eval harness,
not redundant with it. Retire the vendor-pin mechanism, `.cursor/rules/parser-sibling.mdc`, and
the `parser-vendor-source` CI job. Supersede ADR-0018 with a new ADR; amend ADR-0032's now-false
claim that the vendor-lock mechanism is untouched.

## Acceptance

- The engine is authored in exactly one place; parser and OCR each carry an identical
  materialized copy, proven byte-identical and enforced by CI.
- No behavior change: the migration is proven byte-for-byte identical to what was already
  vendored (except two files already excluded from the old vendor pin, and the three
  wording-normalized files reconciled to collisionspike's current wording, proven AST-equal).
- The OCR host's long-dormant "engine copied too WHEN present" seam becomes a real, tested
  integration for the first time.
- Every live consumer of the old vendor-pin mechanism keeps working, including ones the original
  plan didn't enumerate up front (the `/api/fingerprint` route — see evidence).
- ADR-0018 is superseded; ADR-0032 and `scripts/checks/parser-domain-parity.md`'s prose about the
  vendor-lock boundary are corrected; four files carrying vendoring-relationship prose
  (`AGENTS.md`, `.cursor/rules/collisionspike-core.mdc`, `docs/governance/repository-map.md`,
  `services/functions/parser/README.md`) are rewritten.
- `npm run verify`'s Python suites (parser, OCR, the new engine suite) and the cross-language
  parity guards all stay green throughout.

## Research

See [merge notes](./evidence/merge-notes.md) for the concrete findings made while executing this
(a live-numbering collision with a concurrently in-flight PR, the live `/api/fingerprint` route,
and a local-machine eval-harness contamination bug that was fixed rather than worked around).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Merge notes](./evidence/merge-notes.md)
