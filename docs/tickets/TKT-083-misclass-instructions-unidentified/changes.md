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
