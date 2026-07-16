# Reopen follow-up — TKT-021 (2026-07-10)

## Why reopened (verify → now, --force)

The 2026-07-10 verify-sweep ruled **PENDING with one real shortfall**: acceptance line 3 requires an
unresolved-principal Connexus case to be "held for review with an **explicit unresolved-principal
reason**", but the deployed Held lane (`services/data-api/src/features/` new-client branch) writes the
**generic** note *"New client — no work provider matched for sender @connexus.co.uk"* — branding a
known-intermediary sender as a **new client**, which is exactly the misframing this ticket exists to
remove (line 1: "no longer flagged as a new enquiry/customer").

W5 evidence (2026-07-10 data pass, transcribed in [../verification.md](../verification.md)):
- 9 distinct Connexus-born cases since D8 — ALL correctly Held, none guessed, none resolved AS
  Connexus (S2/S5a clean; S5b maps Connexus → exactly {PCH, SBL}).
- Both sampled cases carry the generic 'New client' note (S4a); the intermediary context lives only
  in the case-less global audit row + telemetry.

The other two arms are live-proven (16/16 intermediary matches, candidateCount=2, 0
`query_new_enquiry`; content-resolver mechanism live at volume via TKT-051's 84 firings) — this
reopen is **only** the reason-wording fix.

## Scope of the fix

At the Held/new-client routing seam: when the sender matched an **intermediary** image_source (the
provider-match record carries the intermediary + its candidate set), the case note + audit must say
so explicitly — e.g. *"Held — intermediary sender (Connexus): principal unresolved (candidates
Performance Car Hire, SBL). Pick the instructing provider."* — instead of the New-client wording.
True unknown senders keep the existing New-client note. Handler-plain language (no engineering
strings); unit tests pin both branches; api deploy.

## Not in scope

- Rewording the 9 existing cases' notes (staff review them from the Held queue; forward fix only).
- Any change to the never-guess / >1-candidates-stays-Held semantics (they are correct and proven).
- The content-resolver (proven live under TKT-051).

## Exit path

Fix + tests + deploy → back to `verify` (PENDING) — the live wording proof lands on the next
unresolved Connexus arrival.
