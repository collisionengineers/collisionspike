---
id: TKT-188
title: Keep report amendments with the existing case
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-023, TKT-030, TKT-037, TKT-039, TKT-046, TKT-056, TKT-058, TKT-093, TKT-119, TKT-193]
research-link: docs/tickets/backlog/TKT-188-report-amendment-classification-reconstruction/evidence/issue.md
plan: PLAN-004
---

# Keep report amendments with the existing case

## Problem
An email asking Collision Engineers to correct a claimant name in a report was labelled “Receiving work · Provider instruction”. Its attachment is a Collision Engineers engineer’s report, not instruction paperwork, but wording inside that report triggered the instruction rule. If the original case cannot immediately be found, the same mistake can also create fresh work instead of recovering or holding an amendment for the existing matter.

An amendment is an existing-case action. It must retain the requested correction and report, find the case safely where possible, and remain explicitly unresolved where not; it must never disguise itself as a new instruction.

## Evidence
- [Operator note](./evidence/issue.md) — reports the wrong Provider instruction label, identifies the attached Collision Engineers report and asks that reconstruction use the deep mail/Archive history where safe.
- [Original amendment email](<./evidence/Client Mr Shedrack Nlemchukwu Ndugba -- VRN DE67 LLG __ Amendment Required.eml>) — subject names DE67 LLG; body asks to change “Mr Shedrack Nlemchukwu N” to “Mr Shedrack Nlemchukwu Ndugba”.
- [Attached engineer’s report](./evidence/DE67LLG.pdf) — the prior Collision Engineers report returned for correction.
- [Inbox screenshot](./evidence/1.png) — shows the wrong Receiving work/Provider instruction label and “Has instruction paperwork attached” explanation.
- TKT-058 provides the guarded reconstruction ladder; TKT-056 already distinguishes engineer-report layouts from provider instructions in other paths.

## Proposed change
PROPOSED (not built): add a report_amendment subtype under the existing-case update lane and give explicit amendment intent plus a recognised Collision Engineers report precedence over generic instruction-language/document signals.

Resolve the existing case by exact Case/PO/provider reference/registration/thread first, including terminal cases. If it is absent from the live case table, use the guarded reconstruction ladder to locate a corroborated original instruction in the Archive/mail history. Where no unique source exists, hand the email/report and extracted identity to TKT-193's canonical holding/adoption contract in “Case needs finding”; never create a second holding store or mint a Case/PO from the amendment itself.

## Acceptance
- **A1.** The supplied email classifies as Case update · Report amendment, not Receiving work, Provider instruction, Case query or Unidentified, and the inbox shows the requested correction as the next action.
- **A2.** A recognised Collision Engineers engineer’s report is classified as a prior report, not instruction paperwork. Branding/layout/report headings and document provenance outweigh instruction-like phrases embedded in the report or quoted correspondence.
- **A3.** Explicit amendment/correction intent plus a prior report wins before generic new-work rules, while a genuine provider instruction with an actual instruction document still classifies as Receiving work.
- **A4.** The amendment first associates with one existing case of any status using strong exact evidence and provider scope. It never opens a second case, allocates a new Case/PO or reopens a terminal case merely because work is requested.
- **A5.** When no live case matches, the guarded reconstruction ladder may create/adopt the existing matter only from a uniquely corroborated original instruction or Archive case identity. The amendment alone, a name alone or a registration shared by several cases is never enough to invent a case or Case/PO.
- **A6.** If reconstruction cannot find one safe source, TKT-193 retains the email, report, requested correction and extracted reference/registration in a visible “Case needs finding” holding state with the precise reason; this route creates no parallel retention/adoption mechanism, and staff can choose an existing case later without losing evidence.
- **A7.** Once associated or reconstructed, the case history shows the amendment request and original attached report once, and the handler can record the amended report as completed/sent through the normal case lifecycle. Classification itself does not mark the amendment completed.
- **A8.** Replay, TKT-193 adoption and reconstruction retry share stable operation/content identities: they cannot duplicate the case, Case/PO, email, PDF, Archive item or amendment task, and a staff-chosen association is not silently replaced.
- **A9.** Automated coverage pins the supplied EML/PDF, genuine-instruction controls, quoted-thread/report wording, exact/terminal/missing/multiple case matches, successful/failed reconstruction, later adoption and replay; signed-in proof exercises both a matched amendment and the safe unresolved path.

## Validation
- **Offline:** add the exact email/PDF to classifier/document fixtures, precedence and report-layout tests, any-status correlation tests, guarded reconstruction decision tables, the TKT-193 holding/adoption contract, and API/SPA audit/idempotency coverage.
- **Signed-in/live:** safely probe the supplied sample and naturally occurring operator-designated amendments. In the deployed signed-in inbox, prove the Report amendment label and requested correction, then demonstrate naturally available exact-case association and unresolved/no-safe-source paths; corroborate no new Case/PO and one evidence set in Postgres/Archive. Do not manufacture a case, message or reconstruction solely for proof; leave unavailable live rows PENDING and prove them in isolation.
- **Regression:** rerun genuine instruction, report chaser, billing with attached report, audit case, retro reconstruction, auto-attach and case-link evidence suites. No production case is reconstructed or reopened solely for verification.

## Research
Distilled 2026-07-13 from the [operator note, screenshot, original email and report](./evidence/). The ticket accepts pre-case identity/evidence as a safe holding state but does not weaken TKT-058’s corroboration rules.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/issue.md)
- [Original amendment email](<./evidence/Client Mr Shedrack Nlemchukwu Ndugba -- VRN DE67 LLG __ Amendment Required.eml>)
- [Attached engineer’s report](./evidence/DE67LLG.pdf)
- [Inbox screenshot](./evidence/1.png)
