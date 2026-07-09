# Changes — TKT-084: Pre-instruction directions email unidentified — define a handling lane

## Status
**Reclassified `backlog` → `blocked` (2026-07-07)** — blocked on an operator design sign-off. This is a
status correction, not a build.

## Commits
- No code changes — status reclassification only.

## Summary
The ticket's own acceptance and proof standard **gate the build on the operator**: Acceptance item 1 is
`[ ] Operator has signed off the proposed handling (recorded in this folder)`, and Verification
requirement 1 is "Operator sign-off — the handling-options note + the operator's choice recorded in
evidence/ **before the build**." A `pre_instruction` taxonomy lane (queue placement, hold/correlate
behaviour, retention) cannot be designed and shipped until that decision exists. No sign-off file is
present in `evidence/`, so the correct state is **blocked-on-operator** (same class as TKT-088), not
`backlog`. Unblocks when the operator signs off the proposed handling.

## PLAN-003 classifier wave — 2026-07-09 (BUILT + GATE FLIPPED LIVE)

Operator sign-off recorded 2026-07-09 (evidence/operator-signoff-2026-07-09.md) — built to the
signed-off approach: a `pre_instruction` taxonomy lane, no case minted, held + correlated onto the
later official instruction, gated `TRIAGE_PRE_INSTRUCTION_ENABLED` (default OFF in code).

**Classifier (sibling-first, engine-v2.10, re-vendored):** taxonomy v3 — new category
`pre_instruction` · subtype `pre_instruction_directions`; new `pre_instruction_phrases` collection
(17 phrases, every one anchored to a FUTURE-instruction reference — "when you receive an
instruction…", never a bare "hold off"); **Rule 0e** fires on phrase + an identifier (VRM/ref), with
NO instruction doc, <2 work phrases, and no question — a real instruction email that adds
"further instructions to follow" stays receiving_work (guard test), and an unanchored
"instructions will follow" newsletter abstains (guard test). The sample shape classifies
`pre_instruction/pre_instruction_directions` (sibling pin + triage-corpus fixture
`pre_instruction/hold-directions.eml` + eval pin `tkt084-preinstruction-directions` — all green).

**Plumbing:** TS unions/`INBOUND_CATEGORIES`/`InboundCounts` (@cs/domain), choiceset JSON code
**100000007** (+ subtype 100000014), api name↔code maps + count tally, SPA labels
("Pre-instruction", Hourglass icon, subtype under its own dropdown group), AOAI prompt definition.
`categoryMintsCase` stays receiving_work-only — **no case is ever minted from this lane**.

**Gate + kill-switch:** `gates.triagePreInstruction()`; while OFF, `classifyInbound` DEMOTES a
`pre_instruction` verdict to `other/other` (pure helper `resolveActingClassification`, unit-tested,
demotion logged) — gate-off output is byte-identical to today.

**Correlation (the ref-gate machinery, suggest-first):** new api route
`POST /api/internal/triage/held-pre-instruction` (FIND held rows: category pre_instruction, no
case_id, triage_state new, exact match on body_vrm/caseref/jobref, cap 5) + new orch activity
`correlatePreInstruction` (gate INSIDE the activity; called best-effort post-mint in
`intakeOrchestrator` step 2.2) which raises ONE `case_link` ai_suggestion per held row via the
EXISTING suggest-link route (idempotent; handler-language rationale; VRM-only NEVER auto-attaches per
the ADR-0019 doctrine — staff accept from the inbox banner, which performs the reversible attach).

**DDL:** delta `2026-07-09-taxonomy-v3-pre-instruction-payments.sql` authored + APPLIED live
(verified: 100000007 / 100000013-100000014) BEFORE the parser deploy (deploy-order honoured);
canonical 000_enums_lookups.sql carries the companion rows.

**Deploys + GATE FLIP:** parser engine-v2.10, orch (68 fns, +correlatePreInstruction), api (88 fns,
+internalTriageHeldPreInstruction), SPA — all live 2026-07-09. **`TRIAGE_PRE_INSTRUCTION_ENABLED=true`
SET + VERIFIED on cespk-orch-dev** (operator-granted). Live probe 2: the sample shape returned
`pre_instruction/pre_instruction_directions`, `taxonomy_version: 3`.

**Remainders:** the live e2e (a held pre-instruction row correlated onto a real later instruction's
case) awaits a natural arrival — verification.md stays PENDING for that proof class; retention/chaser
behaviour when NO instruction ever arrives was not specified in the sign-off and is a follow-up
decision.
