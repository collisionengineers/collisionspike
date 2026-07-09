# Changes — TKT-083: instructions email left "Unidentified"

**Commit:** `1d7947e` (branch `fix/email-misclass-batch-081-083-093`).

## Root cause
The fairwaylegal "New INSTRUCTIONS:" email is body-only (no attachment), with instruction
wording + a job ref (30230-01) + a VRM (BV72YVB). Rule 3 (typed-in-body instruction) requires
`len(work_phrases) >= 2`, but only ONE work phrase ("new instruction") fired → it fell through
to abstain (`other/other`). It abstained even at `provider_match_state=one`, confirming the
Rule-3 floor — not the domain corpus — was the cause.

## Fix
- **Classifier**: a SECOND Rule-3 arm promotes a FRESH (non-reply) instruction that has a work
  phrase + a body VRM + an existing job/Case ref and asks no question — the ref+VRM
  corroboration substitutes for the second phrase. Gated to non-reply + no-query + not-
  suppressed so a chase/ack reply cannot slip in. Without both a ref and a VRM it still
  abstains (the floor holds for a bare single phrase).

## Deploy
- **Parser DEPLOYED 2026-07-07** — the classifier fix is live.

## Note — provider corpus (operator-reviewable)
The fix promotes to `new_client_work` because `fairwaylegal.co.uk` is not yet live in
`known_email_domains` (seed `916_provider_domain_corrections.sql` is AUTHOR-ONLY / "do not
apply without operator review"). Adding it (FW = Fairway Legal, a real provider) would upgrade
the label to `existing_provider_instruction` — flagged for operator sign-off, NOT applied here.
The classifier fix is provider-agnostic and stands alone.

## PLAN-003 adjudication + reconciliation — 2026-07-09

**Adjudication — the ref-OR-VRM widening is REJECTED; the AND arm stands.** A/B over the FULL
52-item eval corpus (sibling engine, both variants scored identically-loaded): the OR widening
(`body_vrm OR has_existing_ref`) changed exactly ONE item — `tkt041-06-hold-request` ("place this
file on hold … until further instructions": a work phrase + a ref, NO VRM) left the harmless
`other/other` abstain and promoted to `receiving_work/new_client_work`, i.e. a HOLD request would
mint a case. It fixed ZERO items. That is precisely the abstain-lane regression the dispatch allowed
for: **AND kept**, an adjudication comment + a regression pin
(`test_hold_request_with_ref_but_no_vrm_stays_out_of_receiving_work`) added at the arm
(engine-v2.10), and the ticket's Acceptance should read "ref AND VRM (adjudicated 2026-07-09 —
OR regresses the abstain lane)".

**Reconciliation — the "fairwaylegal.co.uk is unseeded" claim above is STALE.** Confirmed two ways
this wave: (a) row-level — `work_provider` "Fairway Solicitors" (principal FW, active) carries
`known_email_domains = fairwaylegal.co.uk` (seed 916 Section A, applied 2026-07-03); (b) live
behaviour — App Insights shows `providerMatch matched fairwaylegal.co.uk` from 2026-07-06. The eval
manifest item `tkt083-body-instruction-onephrase` is updated accordingly: `provider_match_state: one`,
expected `receiving_work/existing_provider_instruction` (was none/new_client_work) — the label
upgrade this file predicted. Baselines regenerated; `--check` clean.

**No code change to the deployed Rule-3 fix itself** (live since the 2026-07-07 parser deploy;
carried unchanged through engine-v2.10).
