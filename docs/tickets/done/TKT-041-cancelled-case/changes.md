# Changes — TKT-041: Cancelled/closed-case emails have no home (no cancellation concept)

## Status
done — VERIFIED-LIVE 2026-07-09 (ticket-verifier dispatch, classify layer — the scoped acceptance).
See [verification.md](./verification.md).

## Commits
- **Taxonomy v2 `cancellation` category** — ships in the taxonomy-v2 DDL delta (`84fb102`) and the re-cut
  parser engine (`ec45970`, engine-v2.3 — `cancellation` + `case_update` rules). The email is matched to its
  open case by ref/job-ref.
- **Propose-only action (never auto-close)** — the propose-close/hold action rides the same triage-policy +
  `ai_suggestion` machinery as TKT-023 (`7bac2ee` / `00980d5` / `9fb16cf`); a cancellation banner + an "Open
  case" affordance were added to the SPA (`69ec02e`). `cancellation` never mints a case and never
  auto-closes — the terminal `removed` status is only ever reached by staff confirmation.
- **Gate flipped live** — `TRIAGE_CANCELLATION_ENABLED=true` on `cespk-orch-dev`; the taxonomy-v2 DDL delta
  (was operator-gated §D7) was applied and the taxonomy-v2 parser deployed, so the category and the engine
  that emits it are now active (superseding the spec's prior "Not yet active" note).

## Summary
Providers email us when a claim/case is cancelled or closed (e.g. `Claim Cancelled - SBL-B0649696`); the
classifier previously had no cancellation concept, so these fell to `other/other` at abstain confidence with
nothing linking them to the case they cancel. A `cancellation` triage category now recognises them, matches
the email to its open case, and **proposes** a staff-confirmed close/hold (never an automatic close) with an
audit trail; unmatched cancellations surface for review. Part of Rules Engine v2 Phase 2 (relates TKT-023,
TKT-046).

## Verification
- Live probe: the real sample `Claim Cancelled - SBL-B0649696` POSTed to the deployed classify route returned
  200 `cancellation`/`cancellation_notice` at taxonomy_version 2; corpus cancellation recall 12/12, no
  regression. See [verification.md](./verification.md).
- Evidence: the 13 real `.eml` samples and their pointer are described in
  [evidence/README.md](./evidence/README.md) (they remain at their eval-harness-referenced path under
  `source-emails/cancelled-cases/`).

## Open item (not a failure)
The 13th sample (`tkt041-06-hold-request`) is a **hold**, not a cancellation — a sender asking us to pause
work on a specific job while the case stays open. The plan defines no `hold` category distinct from
`cancellation`, so the eval harness scores it `query` (not a taxonomy miss). This is a genuine operator
taxonomy decision, recorded here and in the manifest's own rationale — see the spec's "Flagged taxonomy gap"
and [scripts/eval-email/manifest.json](../../../../scripts/eval-email/manifest.json).
