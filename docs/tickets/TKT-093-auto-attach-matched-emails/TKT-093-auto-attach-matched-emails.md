---
id: TKT-093
title: Auto-attach matched emails to their case instead of a hidden suggest dialog
status: now
priority: P1
area: email
tickets-it-relates-to: [TKT-046, TKT-023, TKT-056, TKT-009]
research-link: docs/tickets/TKT-093-auto-attach-matched-emails/evidence/operator-note.md
---

# Auto-attach matched emails to their case instead of a hidden suggest dialog

## Problem

When an inbound email matches an open case, the system shows a **"suggested attaching this email
to it"** card — but only inside the email detail view, where it goes unseen ("hidden in the
e-mail view"). The operator wants matched emails **attached automatically** where the match is
confident and attaching is viable, with the manual dialog reserved for uncertain matches.

The dropped sample (`FW: RE: Enclosing Inspection Request to Engineers 2 … 577298` from
`colette.woods@pch-ltd.com`) shows the card: "Looks like this email belongs to an open case —
PCH26007. Matches open case PCH26007 by its registration" with Attach-to-case / Not-a-match
buttons. The same sample also exposes a **misclassification**: it is labelled
`Receiving work · Audit re-inspection` (suggested folder INBOX/AUDITS), but it is a **case
update** — additional documentation (an Audatex report, `AJB14044.AudatexMS.pdf`) sent in on the
open case, not a new audit re-inspection instruction.

## Evidence

- `evidence/operator-note.md` — verbatim drop-note.
- `evidence/FW RE Enclosing Inspection Request to Engineers 2 ….eml` +
  `evidence/AJB14044.AudatexMS.pdf` — the sample email and its Audatex attachment.
- `evidence/suggest-attach-card.png` — the SPA card: registration match to open case PCH26007,
  suggest-attach buttons, and the `Audit re-inspection` label.
- Existing machinery: the TKT-023 ref-gate correlation (ACTING live since 2026-07-03) produces
  the match; TKT-046 separated `case_update` from queries; audit-case classification is TKT-056
  territory. Verify current gate states against the registry before building.

## Proposed change

PROPOSED (not built):

- **Auto-attach policy**: when the correlation is high-confidence (exact VRM or provider-ref
  match to exactly one open case) and attaching is viable, attach automatically — writing the
  audit row, keeping an **undo/detach** action, and surfacing what happened in the inbox row
  (e.g. "attached to PCH26007"), not just the detail view. Ambiguous matches (multiple candidate
  cases, weak signals) keep the manual suggest dialog.
- **Gate it** (`TRIAGE_AUTO_ATTACH_ENABLED`-style, default off) consistent with the
  rules-engine-v2 activation pattern.
- **Visibility fix** regardless of gate: the suggest card must be visible from the inbox list
  (badge/inline action), not only inside the opened email.
- **Misclass fix**: additional-documentation emails on an open case must classify
  `case_update` (attach lane), not `Audit re-inspection` — sample pinned in the eval corpus
  (coordinate with TKT-056's audit-marker rules so genuine `A.` re-inspection instructions still
  route to audits).

## Acceptance

- [ ] With the gate on: the sample email auto-attaches to PCH26007, audited, with a visible
      inbox indication and a working detach/undo.
- [ ] With the gate off (or on ambiguity): the suggestion is visible from the inbox list, not
      only the email detail view.
- [ ] The sample classifies `case_update` (not audit re-inspection) in the eval corpus; a genuine
      audit re-inspection instruction still classifies as audit work (regression pins both ways).
- [ ] A wrong auto-attach can be reversed (detach restores the email to the unattached state,
      audited).

## Verification requirements (proof standard — all classes required before `done`)

1. **Offline eval + unit tests** — the misclass pin + auto-attach policy tests (single-candidate
   attach, multi-candidate defer, undo) green; recorded in [verification.md](./verification.md).
2. **Gate + deploy** — `node verify-all.mjs` green; deploys + the gate name/value recorded in
   [changes.md](./changes.md).
3. **Live probe** — replay the sample against the deployed stack with the gate on: Postgres shows
   the email linked to PCH26007 + the audit row; the SPA inbox shows the attached state.
4. **Counter-probe** — an ambiguous email (two same-VRM open cases — the TKT-072 grouping shape)
   does NOT auto-attach and shows the manual suggestion.
5. **Recall guard** — a genuine audit re-inspection instruction still routes to the audits lane
   post-deploy.

## Research

Distilled 2026-07-06 from the operator drop-note folder `to-distill/suggest-attach/`; raw
material in [evidence/](./evidence/).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
