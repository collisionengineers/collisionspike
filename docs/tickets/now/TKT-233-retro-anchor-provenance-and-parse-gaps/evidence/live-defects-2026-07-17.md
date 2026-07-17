# Live defects observed 2026-07-17 (dev deploy, post-sweep)

Reported by the operator with SPA screenshots (screenshots retained operator-side; textual
record here per the binary-evidence policy).

## U1 — "Other source" chip

Triage Inbox mailbox row read `All (1639) · Other source (2) · desk@ (615) · engineers@ (641)
· info@ (381)`. The two "Other source" rows were the box-arm reconstruction anchors
`Retro reconstruction: A.PCH261343 — 576003.pdf` and `Retro reconstruction: QDOS261397 —
54634_…`, both status "Case created", detail card showing `· box-archive`.

Mechanism (code-verified): `retro-envelope.ts:67/98/129` stamp synthetic ids and
`sourceMailbox: 'box-archive'` (the eml arm uses `firstAddress(exploded.to) || 'box-archive'`);
`apps/web/src/features/inbox/inbox-mailbox-filter.ts:37-39` labels any non-address value
"Other source"; facets are dynamic by TKT-025 design.

## U2 — claimant email

Case `b5ffe5e4-0ffc-4510-8d2f-29f9de03d47b` (AC14ACE, provider PCH, "Performance Car Hire"):
Claimant Email Address field = `engineers@collisionengineers.co.uk`; claim no. 36176 imported
from the same parse.

Mechanism (code-verified): `cedocumentmapper_v2/rules/engine.py` `_is_non_claimant_email`
(~2808-2832) excluded team-inbox local-parts and context phrases ("credit repair",
"servicedesk"…) but no own-domain rule; the fallback email rule (`fallback_email_sole` shape)
harvested the document's report-to address. Red-check during the fix: with the new own-domain
tuple emptied, the sibling test reproduces the exact live harvest.

## U3 — sparse fields

Same case: Claimant Name, Accident Circumstances, Mileage empty (readiness panel red).
`finishPersisted` (retro-case.ts:846/977/1143) proves related ingest + backfill runs for
box-arm creations, so the open question is parse coverage of this PCH document shape —
diagnosis lane in the ticket body.

## U4 — .msg gap

Operator: Box typically stores the original/first email as `.eml` or `.msg` (carrying the
info@/desk@/engineers@ addresses). Code: `retro-envelope.ts:275` classifies `.msg` as
email-class and the fetch ladder prefers it (`retro-activities.ts:279-297`), but
`function_app.py:561` parsed with `email.message_from_bytes` (RFC-822 only) — a `.msg`
anchor degraded to raw bytes ("explode unavailable" warn path).

## M365 store research (Microsoft Learn, 2026-07-17)

- Outlook mail API: primary + shared mailboxes; "The API does not support accessing in-place
  archive mailboxes" (mail-api-overview, v1.0).
- `recoverableitemsdeletions` is an accessible well-known folder (the dumpster) — default
  14 d, max 30 d deleted-item retention; indefinite under Litigation Hold.
- Mailbox import/export APIs (beta, `/admin/exchange/mailboxes/…`): "support access to data
  in users' primary, shared, and archive mailboxes"; auxiliary auto-expanded archives via
  HTTP 308 redirects; admin-consented MailboxItem permissions; full-fidelity opaque export
  streams.
- Purview eDiscovery Graph APIs exist but are disproportionate for this system.
