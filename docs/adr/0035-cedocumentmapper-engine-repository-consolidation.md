# ADR-0035 — The parser engine is merged into this repository, superseding ADR-0018

**Status:** Accepted 2026-07-20 per [TKT-287](../tickets/done/TKT-287-cedocumentmapper-engine-repository-consolidation/TKT-287-cedocumentmapper-engine-repository-consolidation.md).
Supersedes [ADR-0018](./0018-cedocumentmapper-dual-target-vendored-engine.md).

## Decision

The deterministic parser engine — previously authored in the sibling
`collisionengineers/cedocumentmapper_v2.0` repository and vendored into this repository under a pinned
tag/commit — is merged into this repository as its new canonical, permanently-authored home:
`services/engine/cedocumentmapper_v2/` (history-preserving, `git filter-repo`, 56 commits carried
forward). `services/functions/parser/cedocumentmapper_v2/` and the new
`services/functions/ocr/cedocumentmapper_v2/` are **materialized copies** generated from that one
canonical source by `scripts/build/sync-engine.py`, gated against drift by
`scripts/checks/check-engine-materialized.py` — a plain byte-identity comparison, much simpler than
ADR-0018's cross-repo tag/commit/AST-normalisation verifier, because there is only one authored source
now rather than two independently-editable ones.

Brought across: the deterministic engine (`domain/`, `readers/`, `detection/`, `rules/`,
`normalization/`, `exporters/`, `config/`, `application/`, `resources/`, the non-desktop subset of
`ui/`) and, per the plan's explicit eval-system decision, the engine's own `eval/` regression harness
(38-fixture corpus, `ci_eval.py`, 0.9571 overall baseline) as a **new, additional** CI gate — it scores
document-extraction fields across PDF/DOCX/DOC/EML/MSG, complementary to this repository's existing
`scripts/evaluation/email/` harness, which scores only inbound-email triage routing and shares no
corpus or code with it.

Explicitly **not** brought across: `__main__.py`, `cli.py`, `ui/host.py`, `frontend/`, `build.ps1`,
`CE-Document-Mapper.spec`, and `extraction/` (the opt-in field-extraction-strategy/local-LLM-assist
layer) — all desktop-app-only surface with zero cloud callers, confirmed by reading every consumer.
The desktop app is retired, not merged; see the Consequences section.

## Rationale

ADR-0018's stated rationale — "the parser is both a standalone product and a cloud capability; one
engine source avoids behavioural forks while the pinned copy keeps this repository buildable
independently" — is now moot on its own terms: the desktop product that vendoring was written to
protect is being retired (confirmed with the operator; no further releases are planned). The two
concrete drift incidents already on record before this decision (`docs/reviews/150726/python-vendor/review.md`
findings E2 — vendored files hand-edited instead of authored-then-revendored — and E3 — `PROVENANCE.md`
contradicting `VENDOR_LOCK.json`, since resolved on the `engine-v2.25` pin but a recurring risk class)
are the realized cost of the two-repo split; that cost no longer buys anything once there is only one
active product.

This does **not** reverse [ADR-0032](./0032-python-independent-packaging.md) — see that ADR's dated
amendment below. Parser and OCR sharing one authored Python engine is a narrow, explicit exception
(same language, same engine, byte-identical materialization) to ADR-0032's general independence
doctrine, not a reversal of it; ADR-0032's actual decision (no shared runtime for the genuinely
divergent per-client auth/retry policies) is unaffected.

## Consequences

- `VENDOR_LOCK.json`, `PROVENANCE.md`, `verify_vendor_pin.py`, the `parser-vendor-source` CI job, and
  `.cursor/rules/parser-sibling.mdc` are retired. The `CEDOCUMENTMAPPER_DEPLOY_KEY` GitHub secret is
  now unused and should be removed by someone with org-admin access (not done as part of this change).
- `services/functions/ocr/`'s long-dormant "engine copied too WHEN present" seam
  (`_engine_available()`/`_vendored_providers_seed()` in `ocr_pdf_adapter.py`) is activated into a
  real, tested integration for the first time — previously `services/functions/ocr/cedocumentmapper_v2/`
  never existed, so that code path was permanently dead.
- The parser's `/api/fingerprint` route (function-key protected, one of the live Function App's 5
  routes) no longer reports a cross-repo repository/ref/commit identity — that concept doesn't exist
  post-merge. It now reports a content hash and file count computed at materialization time
  (`ENGINE_FINGERPRINT.json`), still a real, live proof that the expected engine bytes are deployed.
- The former `cedocumentmapper_v2.0` repository is archived (not deleted) — see TKT-287's evidence for
  the reconciliation check run first, given the concrete finding that at least one real, in-use desktop
  installation exists. No further tags are cut there; it is no longer a runtime dependency of anything.
- A future in-repo simplify pass over `classify_email()`'s dispatch logic in
  `services/engine/cedocumentmapper_v2/src/cedocumentmapper_v2/rules/email_classifier.py` becomes
  possible now that it's authored-repo, not vendored, code — not part of this change's scope, a trigger
  to remember for later.
