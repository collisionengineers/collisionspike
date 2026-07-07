# Operator note — case `done` detectors (Phase C)

`done` is triggered by any of:
- (a) a **sent email from a CE mailbox to the case's work provider** — the primary signal;
- (b) a **CE report PDF uploaded into the case's Box folder** — the alternative signal;
- (c) *(later / gated)* **EVA Sentry report-retrieval polling** flipping `eva_submitted → done`.

Recommended thin-slice bridge (given the Free-Trial deadline): ship a **manual "Mark report delivered"**
action first — zero detector infra, makes `done` usable and testable on day one — then layer the
auto-detectors (Box report-PDF first as the webhook is already live, then sent-email, then the gated EVA
poll).

> This is Phase C of the case-done plan. The full A–E plan (with code references) is preserved in the
> anchor ticket [TKT-094/evidence/PLAN-case-done-lifecycle.md](../../TKT-094-case-done-status-model/evidence/PLAN-case-done-lifecycle.md).
