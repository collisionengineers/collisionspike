---
id: TKT-091
title: Outlook "File to …" move fails live with a 503 from the Data API
status: backlog
priority: P1
area: email
tickets-it-relates-to: [TKT-054, TKT-005]
research-link: docs/tickets/TKT-091-outlook-move-fail/evidence/operator-note.md
---

# Outlook "File to …" move fails live with a 503 from the Data API

## Problem

The operator pressed the SPA's Outlook **"File to …"** button and the move failed. Chrome dev
tools show the actual failure:

```
POST cespk-api-dev.azurewebsites.net/api/inbound/a137d98f-bda5-4e09-bdac-c306a2fd3f7a/outlook-move
  → 503 (Service Unavailable)
```

This is a **503 from the Data API app**, not the Graph **403** that
[TKT-054](../TKT-054-ui-work/TKT-054-ui-work.md) was expecting while the operator's Exchange
`Mail.ReadWrite` grant ([docs/gated.md B4](../../gated.md)) is outstanding. Candidate causes to
verify (not conclusions):

- **Cold start / host unavailable** — a scale-to-zero Function-app cold start surfacing as 503
  to the SPA (the same failure family as the orch app's `graph-webhook` 499s).
- **Unhandled exception / crash** in the `outlook-move` route surfacing as a host-level 503.
- **Deliberate (or accidental) error-mapping** — the route proxying a downstream Graph failure
  (possibly the B4 403) out as 503.

Either way there are two defects: the move doesn't work, and the SPA gives the operator no
readable error (they had to open dev tools).

## Evidence

- `evidence/operator-note.md` — the operator note (verbatim) + distilled key facts.
- `evidence/outlook-move-fail.md` — the raw dropped file (dev-tools console text; failing
  inbound-email id `a137d98f-bda5-4e09-bdac-c306a2fd3f7a`).
- `evidence/outlook-move-fail-original-empty.md` — the first drop of the note (empty; provenance).
- Known open state: `OUTLOOK_MOVE_ENABLED` flipped `true` 2026-07-03; the Exchange
  `Mail.ReadWrite` grant is still pending (gated.md B4) — earlier live attempts 403'd (TKT-054).
  Verify current gate/grant state against the registry before acting.

## Proposed change

PROPOSED (not built):

- **Diagnose the 503**: pull the App Insights traces/exceptions for `cespk-api-dev` around the
  request (correlate on the inbound-email id / route); establish cold-start vs crash vs
  error-mapping. Re-press the button while watching live telemetry if the original window has
  aged out.
- **Fix the API-side cause**: catch and map downstream failures to meaningful status codes
  (Graph 403 → a 4xx with a machine-readable reason; never a bare 503 from a handled path); if
  cold start is implicated, record it and consider a warm-up mitigation consistent with the
  platform pattern.
- **Failure UX in the SPA**: a failed move must show a human-readable error (e.g. "Outlook
  filing needs a permission the admin hasn't granted yet" for the B4 case) instead of failing
  silently into the console.
- **After the B4 grant lands**: run the full live move test and close TKT-054's remaining move
  item together with this ticket.

## Acceptance

- [ ] The 503's root cause is named with App Insights evidence in
      [verification.md](./verification.md).
- [ ] The `outlook-move` route returns meaningful status codes for its failure modes (unit
      tests: Graph-denied → 4xx + reason; unexpected exception → 500 + logged trace).
- [ ] A failed move shows a clear, actionable error in the SPA (no dev-tools-only failures).
- [ ] Post-B4-grant: a live "File to …" move succeeds — the email visibly moves in the mailbox
      and the move is audited.

## Verification requirements (proof standard — all classes required before `done`)

1. **Trace evidence** — the KQL result pinning the 503's cause, recorded in
   [verification.md](./verification.md).
2. **Offline tests** — error-mapping unit tests green; `node verify-all.mjs` green.
3. **Deploy record** — api/SPA deploys recorded in [changes.md](./changes.md).
4. **Live failure-UX probe** — with the grant still missing, a move attempt shows the readable
   in-SPA error (screenshot).
5. **Live probe (post-grant)** — a real move: SPA action → 2xx → email in the target Outlook
   folder → audit row in Postgres; ids recorded.

## Research

Distilled 2026-07-06 from the operator drop-note folder `to-distill/outlook-move/`; the note body
(the dev-tools 503 evidence) was supplied by the operator later the same day and folded into
[evidence/](./evidence/).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
