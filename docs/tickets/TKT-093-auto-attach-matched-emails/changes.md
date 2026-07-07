# Changes — TKT-093: auto-attach matched emails + visibility + case_update misclass

**Commits:** `1d7947e` (misclass), `628b3f5` (auto-attach backend), `fa66461` (inbox visibility).

## Three parts
1. **Misclass fix (LIVE):** the forwarded "Audatex attached" email (inherited
   inspection-request/audit subject, sender text just a delivery note) promoted to
   `receiving_work/existing_provider_audit`. The classifier now (a) suppresses a FORWARD whose
   sender wrote no new work language from promoting on its inherited subject, and (b) anchors
   the `case_update` rule on the body VRM for a reply/forward → **`case_update/update_general`**
   (additional documentation on the open case).
2. **Auto-attach (BUILT, ships DARK):** new gate `TRIAGE_AUTO_ATTACH_ENABLED` (default off) +
   a new `attach_case` action (`@cs/domain` `decideTriage` rung-3 promotion seam). An EXACT
   SINGLE open-case match on a STRONG signal (`case_po`/`job_ref`) is attached automatically
   instead of suggested; the Data API self-accepts the `case_link` suggestion → the SAME
   reversible attach as accepting from the inbox (FILL-IF-EMPTY link + `triage_state='routed'`
   + `inbound_linked` audit, actor `auto-attach`; reversible via the existing detach).
   **Honours the permanent inviolable rule (ADR-0010/0019): a VRM-ONLY match NEVER promotes past
   suggestion** — so the real 093 sample (matched by registration only) correctly stays a
   *visible suggestion*, and an ambiguous match always needs a person.
3. **Inbox-list visibility (built):** the inbox list surfaces a pending case_link suggestion as
   a "may belong to · <Case/PO>" hint under the status (an already-linked/auto-attached email
   keeps its "Linked to case · <Case/PO>" status) — the suggest-attach affordance is no longer
   only inside the opened email. Data API list LATERAL-joins the pending suggestion's Case/PO
   (read from `suggested_value`, no uuid cast); DTO `InboundEmail.linkSuggestionCasePo`.

## Deploy
- **Parser DEPLOYED 2026-07-07** — the misclass fix is live.
- **api + orch DEPLOYED 2026-07-07** — the auto-attach backend (DARK) + the inbox-list query.

## Precedence note (ticket vs ADR)
The ticket's "exact VRM auto-attaches" is superseded by the binding ADR-0010/0019 VRM-only
invariant (precedence: ADR > ticket). Auto-attach is `case_po`/`job_ref`-only; a vrm match
stays a suggestion. This is the safer behaviour (two claims can share a registration).
