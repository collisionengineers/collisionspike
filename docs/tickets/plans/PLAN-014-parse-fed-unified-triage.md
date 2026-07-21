---
id: PLAN-014
title: Parse-fed unified triage — reorder parse ahead of triage and compose classify + policy
status: active
tickets: [TKT-290, TKT-291, TKT-292, TKT-293, TKT-294]
depends-on: []
plan-kind: feature
---

# PLAN-014 — Parse-fed unified triage

## Outcome

Move the parser ahead of triage in the Durable intake pipeline so the instruction document's extracted
VRM / Case-reference and per-attachment content typings can feed the triage classify decision itself,
and compose the two-call `classifyInbound` (Stage A) + `triagePolicy` (Stage B) sequence into one
`triageUnified` activity. This closes the gap `detection/attachment_typing.py`'s own docstring names —
content typing "cannot feed back into `classify_email`'s Rule 1 corroboration gate without a pipeline
reorder" — and lets a document-only reference reach the open-case ref-gate. Behaviour ships dark behind
`TRIAGE_PARSE_FED_ENABLED` (ADR-0027) and is validated by an offline OLD-vs-NEW backtest against the
labelled email corpus before the gate flips.

Source of record for the technical reasoning: `workingspace/proposedparserchanges.md` (corrected for the
2026-07-15 monorepo reset). This plan carries the execution-ready version.

## Slices (each its own ticket + PR, smallest safe unit first)

| Slice | Ticket | Scope |
|---|---|---|
| 0 | TKT-290 | Centralize the duplicated VRM/ref precedence into `case-identity.ts` helpers. |
| 1 | TKT-291 | `classify_email()` gains `attachment_content_typings` + the D4 content-overrides-filename rule. |
| 2 | TKT-292 | `/classify-email` route + `functions-client.ts` wiring for `open_case_ref_match` + typings. |
| 3 | TKT-293 | OLD-vs-NEW backtest harness + report — the go/no-go gate. |
| 4a | TKT-294 | `triageUnified` activity composing classify + policy — no reorder yet. |
| 4b | TKT-295 | Atomic reorder (parse hoisted above triage) + TKT-102 inline-parse collapse. |
| 5 | TKT-296 | Deploy gate-off, drain in-flight instances, live KQL spot-check, flip the gate. |

## Sequencing

Slice 0 lands first (standalone). Slices 1–3 touch disjoint files from 0/4a/4b and can proceed in
parallel. Slice 3's backtest is a hard go/no-go gate before any Slice-4 branch is cut. Slice 4a's
gate-off-parity test must be green before 4b. Slice 4b is one atomic PR (splitting it would let parse
run twice per email). Slice 5 follows the TKT-056 gate-flip precedent.

## Invariants (do not regress)

- ADR-0010 — a VRM-only match never auto-attaches (suggest-only), enforced at the type level by
  `triage-policy.ts`'s `matchedOn !== 'vrm'` guard.
- `decideTriage`'s own logic is unchanged; only its inputs widen.
- Gate-off is byte-identical to the pre-reorder pipeline for both the triage decision and the
  downstream lanes; the reorder is validated by draining in-flight Durable instances at deploy.

## Related ADR

Amends ADR-0019 (Stage A gains parse-derived inputs; Stage A+B compose under `triageUnified`; parse
precedes triage; corpus-backtest validation replaces any live-shadow model). Number to be confirmed at
filing time.

<!-- GENERATED:PROGRESS -->
## Computed progress

**0/5 done (0%).**

| Status | Count |
|---|---:|
| Now | 5 |
| Verify | 0 |
| Done | 0 |
| Next | 0 |
| Backlog | 0 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-290](../now/TKT-290-intake-vrm-ref-precedence-centralization/TKT-290-intake-vrm-ref-precedence-centralization.md) | now | Centralize the intake orchestrator's duplicated VRM/ref precedence logic |
| [TKT-291](../now/TKT-291-classifier-attachment-content-typings/TKT-291-classifier-attachment-content-typings.md) | now | classify_email() gains attachment_content_typings (PLAN-014 Slice 1 / D4) |
| [TKT-292](../now/TKT-292-classify-email-route-client-wiring/TKT-292-classify-email-route-client-wiring.md) | now | Wire open_case_ref_match and attachment_content_typings through /classify-email (PLAN-014 Slice 2) |
| [TKT-293](../now/TKT-293-parsefed-backtest-harness/TKT-293-parsefed-backtest-harness.md) | now | Parse-fed backtest harness — the go/no-go gate (PLAN-014 Slice 3) |
| [TKT-294](../now/TKT-294-triageunified-activity/TKT-294-triageunified-activity.md) | now | triageUnified activity — composes classify + triage, no reorder yet (PLAN-014 Slice 4a) |
<!-- /GENERATED:PROGRESS -->
