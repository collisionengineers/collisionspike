---
id: TKT-083
title: Instructions email left "Unidentified" despite detected instruction signals
status: done
priority: P1
area: email
tickets-it-relates-to: [TKT-036, TKT-006]
research-link: docs/tickets/done/TKT-083-misclass-instructions-unidentified/evidence/operator-note.md
---

# Instructions email left "Unidentified" despite detected instruction signals

## Problem

An email from `info@fairwaylegal.co.uk` (subject: `Our Ref 30230-01 ; Name: Mr Abdullahi Yusuf
Ibrahim ; Vehicle Registration Number BV72YVB`, body containing "New INSTRUCTIONS:") was
classified **Other · Unidentified** — yet the SPA's own "Why this label" panel lists four
instruction signals the engine detected:

- Mentions instruction wording ("new instruction")
- Quotes reference 30230-01
- Mentions vehicle BV72YVB
- From a company we recognise

The signals fire but the final label ignores them — a precedence/threshold bug where detected
`receiving_work` evidence fails to reach the classification, so a complete, actionable
instruction email falls into `INBOX/OTHER` and no case is opened.

## Evidence

- `evidence/operator-note.md` — verbatim drop-note.
- `evidence/Our Ref 30230-01 ….eml` — the sample email (contains all necessary case details).
- `evidence/classifier-card-screenshot.png` — the SPA card showing "Other · Unidentified" beside
  the four detected instruction signals.

## Proposed change

PROPOSED (not built):

- Root-cause why the detected signals don't license `receiving_work` in the rules-engine-v2
  scoring (signal→label wiring, threshold, or a subtype-mapping miss for this signal
  combination); fix so instruction wording + ref + VRM + recognised sender is decisive.
- Confirm `info@fairwaylegal.co.uk` / fairwaylegal.co.uk is present (or added) in the provider
  identification corpus (`known_email_domains` / content mapping), since "from a company we
  recognise" fired.
- Add the sample to the eval corpus as a regression pin
  (`receiving_work`/`new_client_work` expected).

## Acceptance

- [ ] The sample `.eml` classifies `receiving_work` (not `Other`/`unidentified`) in the eval
      corpus, and a case would be opened with ref `30230-01` + VRM `BV72YVB`.
- [ ] Any email where the engine surfaces ≥ the instruction-wording signal plus a ref **and** VRM does
      not land `unidentified` (unit test at the signal→label layer).
      *Amended 2026-07-09 (orchestrator adjudication):* the original "ref **or** VRM" wording was
      A/B-tested against the full eval corpus — the OR-widening fixed zero real samples and promoted a
      genuine hold-request email into a case-mint, so the deployed ref-AND-VRM arm stands
      (regression-pinned at the arm; rationale in [changes.md](./changes.md)).
- [ ] Full prior eval corpus green (no regression).

## Verification requirements (proof standard — all classes required before `done`)

1. **Offline eval** — sample added to the committed eval corpus and passing; full prior corpus
   green; recorded in [verification.md](./verification.md).
2. **Gate + deploy** — `node verify-all.mjs` green; deploys recorded in [changes.md](./changes.md).
3. **Live probe** — replay the sample through the deployed stack; prove via Postgres the email is
   tagged `receiving_work` and the created case carries ref `30230-01` + VRM `BV72YVB`.
4. **Recall guard** — a genuinely unidentifiable email still lands `unidentified` (the lane must
   not be starved).

## Research

Distilled 2026-07-06 from the operator drop-note folder
`to-distill/email-mistags/instructions-received/`; raw material in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
