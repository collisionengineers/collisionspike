---
name: fullbuild-decisions-2026-06
description: "User's scope decisions for the \"implement all remaining features\" effort on cedocumentmapper_v2.0"
metadata: 
  node_type: memory
  type: project
  originSessionId: a0c18ed6-864d-43c3-8700-e021535e33bd
---

On 2026-06-24 the user asked to investigate the completion claim, then implement ALL remaining features ("Everything (A + B roadmap)") and update docs. Build is sequenced in waves (each touches overlapping core files, so they run serially):

- **Wave 1 (parity foundation):** P0 contract fixes + P1 test/CLI/reader/migration gaps. Keep `pytest` green.
- **Wave 2 (measurement & review):** regression corpus import + scored v1↔v2 comparator; targeted extraction tests; **audit case-type built HERE** (A.-prefix Case/PO detection, `is_audit` on the record, never run the engineer-report overlay on it, surface in CLI/UI); review-UI source overlay + diagnostics + keyboard/confidence triage.
- **Wave 3 (revamp):** footprint trim, CI eval harness, table/geometry extraction primitives + orchestrator, teach-by-example, **FULL opt-in local model assist** (real offline, schema-constrained, source-cited, OFF by default, never auto-exports — user chose to override the requirements.md non-goal), GUI batch + frontend componentization.
- **Final:** documentation reconciliation (see [[completion-state-2026-06]]).

**Why / how to apply:**
- **AGPL/PyMuPDF is explicitly NOT my concern** — user said "ignore this, it's not your job, you are just the dev." Do not migrate the PDF engine or write licensing memos; leave PyMuPDF as-is.
- Local model: user wants the real thing, not a stub. Must stay offline + opt-in + off-by-default + never auto-export.
- Audit case-type: the broader Dataverse/Code App concept is tracked in the separate `collisionspike` repo; only the parser-level piece belongs here.
- Don't commit/push without asking; review each wave's diff before proceeding.
