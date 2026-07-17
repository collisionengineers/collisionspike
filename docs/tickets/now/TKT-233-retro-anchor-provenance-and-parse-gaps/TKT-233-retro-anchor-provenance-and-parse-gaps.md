---
id: TKT-233
title: Retro anchor provenance and parse gaps — hide anchors from triage, own-domain contact exclusion, .msg originals
status: now
priority: P1
area: email
tickets-it-relates-to: [TKT-219, TKT-225, TKT-232, TKT-194]
research-link: docs/tickets/now/TKT-233-retro-anchor-provenance-and-parse-gaps/evidence/live-defects-2026-07-17.md
---

# Retro anchor provenance and parse gaps (live defects U1–U4)

## Problem

Three defects observed on the live dev deploy after the 286-row retro sweep, plus one
coverage gap surfaced while triaging them
([evidence/live-defects-2026-07-17.md](./evidence/live-defects-2026-07-17.md)):

- **U1 — unspecified "Other source" mailbox chip.** The box-arm reconstruction anchors are
  stamped `sourceMailbox: 'box-archive'`; the Triage Inbox derives its mailbox chips
  dynamically from row values (TKT-025) and labels any non-address "Other source" — a fourth
  chip nobody designed. An `.eml` anchor carrying a historic To-address would mint a fifth.
- **U2 — claimant email = our own intake address.** Case `b5ffe5e4` (AC14ACE / PCH): the
  instruction PDF's "send reports to engineers@collisionengineers.co.uk" was harvested by the
  parser's fallback claimant-email rule; `_is_non_claimant_email` excluded team inboxes and
  service desks but never our own domain.
- **U3 — sparse reconstruction.** The same case lacks claimant name / accident circumstances /
  mileage. Box-arm creations DO run related ingest + backfill (`finishPersisted`); the parse
  coverage of this document shape is the open question (diagnosis lane below).
- **U4 — `.msg` originals unreadable.** Box archives hold the original email as `.eml` OR
  `.msg`; the retro ladder classifies `.msg` as email-class but explode-eml parsed RFC-822
  only, so `.msg` anchors degraded to raw bytes (losing headers, body, the real intake
  To-address, and attachments).

## Decision (operator, 2026-07-17)

Reconstruction anchor rows are **hidden from the Triage Inbox entirely** — "theoretically
it's just as though the case was always there (apart from a note in the case)". They remain
in the DB and on the case's Emails tab (new server-side case-scoped slice). The chip
dissolves automatically because the facets derive from loaded rows.

## Change

See [changes.md](./changes.md). U1: server-side anchor exclusion in the inbox list + the
`?caseId=` case slice the Emails tab now uses. U2: own-domain exclusion landed sibling-first
(cedocumentmapper_v2.0 `engine-v2.25`, vendor pin refreshed) + ops SQL to clear wrongly
stamped values. U4: explode-eml parses `.msg` via extract-msg (OLE magic or extension) into
the identical envelope shape.

## M365 long-term stores (research, banked)

Graph's Outlook mail API reaches primary + shared mailboxes only — **not** In-Place Archive
mailboxes (documented limitation). Reachable longer-term stores: the **Recoverable Items
dumpster** (`recoverableitemsdeletions` well-known folder; 14–30 d retention, indefinite
under hold) with existing permissions — the `retro-deleted-probe` follow-up should sweep it
for the 22 hard-gone triggers before retention lapses; and the **beta mailbox import/export
APIs** (`/admin/exchange/mailboxes/…`), which DO support archive mailboxes, as a future rung
only if archives are enabled (one-off live enablement probe listed in verification).

## U3 diagnosis lane (open)

1. Re-parse the `A.PCH261343` instruction document locally (inspect only — no real case data
   committed) to separate "absent from document" from "present but unextracted"; extend the
   PCH profile/fallbacks sibling-first with a synthetic fixture if the latter.
2. After the ops SQL clears the wrong claimant email, fill-gaps backfill / staff complete the
   record; bank the AC14ACE before/after here.

## Artifacts

- [Changes made](./changes.md)
- [Verification record](./verification.md)
- [Live-defect evidence](./evidence/live-defects-2026-07-17.md)
