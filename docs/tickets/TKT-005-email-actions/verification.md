# Verification — TKT-005: Make the inbox actionable (dismiss removes from view)

## Verdict
CODE-COMPLETE, NOT CONFIRMED LIVE

## Evidence
The dismiss-removes-from-view behaviour is coded and present in the live SPA bundle (commit `94902ce`). It is data-driven on `inbound_email` rows, which now exist again following the 2026-06-30 10:21Z clean-slate reset. The live e2e agent (2026-06-30) did NOT exercise the SPA UI, so there is no behavioural confirmation, and the operator reported it as NOT live.

## Pending / gaps
Confirm in the live SPA that dismissing an email actually removes the row from the active view. No SPA UI test was run.

## How to re-verify
Open the live SPA inbox, dismiss an email, and confirm it leaves the active list (and that the `inbound_email` row's `triage_state` persisted so it stays gone on refresh).
