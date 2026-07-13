---
id: TKT-171
title: Keep Case/PO numbering working after 999
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-004, TKT-058, TKT-099, TKT-118]
research-link: docs/tickets/backlog/TKT-171-four-digit-case-po-sequence/evidence/info.md
plan: PLAN-004
---

# Keep Case/PO numbering working after 999

## Problem
Case/PO sequences are normally shown with three digits, but a principal can exceed 999 cases in one year. The canonical formatter already lets the number grow, while other validators and the EVA submission screen still require exactly three digits. At the boundary, that disagreement can reject a legitimate Case/PO, make correlation fail, sort cases incorrectly, or encourage a handler to truncate/reuse a number.

The required rule is minimum width, not fixed width: keep 001–999 in the familiar three-digit form and use 1000–9999 only after that principal and year have exhausted the three-digit range.

## Evidence
- [Operator note](./evidence/info.md) — confirms that three digits remain the default and four digits are allowed only after more than 999 cases for the principal/year.
- [Canonical formatter](../../../../packages/domain/src/domain/case-po.ts) — pads to a minimum of three digits and therefore formats 1000 without truncation.
- [Retro correlation validator](../../../../packages/domain/src/domain/retro-case.ts) — currently rejects a four-digit sequence for a two-letter principal such as AX.
- [EVA submission screen](../../../../mockup-app/src/screens/EvaSubmitDialog.tsx) — currently validates and describes the editable sequence as exactly three digits.
- TKT-004 owns reliable allocation; this ticket owns compatibility with the 999→1000 boundary everywhere that consumes the allocated value.

## Proposed change
PROPOSED (not built): define one shared Case/PO shape and sequence parser with a three-digit minimum and four-digit overflow, then replace fixed-width assumptions in allocation, validation, storage, manual entry, search, sorting, correlation, archive naming and EVA preparation.

The allocator remains scoped independently by marker, principal and two-digit year. Nothing renumbers existing cases, and no handler is asked to select four digits early.

## Acceptance
- **A1.** For every marker/principal/year sequence, values 1–999 render with exactly three sequence digits; 1000–9999 render with exactly four. The formatter never truncates, wraps, resets or drops leading zeroes within 001–999.
- **A2.** The server-side allocator advances atomically from 999 to 1000 for the same marker/principal/year, and concurrent requests around that boundary receive distinct values with no reused Case/PO, folder or operation.
- **A3.** One shared validation/parsing contract accepts three- and four-digit sequences for every supported principal length and for the unmarked, A., AP. and D. forms. API validation, database constraints, imports, manual edits and retro correlation do not retain a conflicting fixed-three-digit rule.
- **A4.** The Case/PO preview and EVA submission screen show the allocated sequence without truncation, accept a legitimate three- or four-digit value, and use neutral handler copy such as “Provider sequence”; they do not tell staff that the value must always contain three digits.
- **A5.** Exact lookup, global search, inbound-email correlation, retro reconstruction and Archive folder matching all resolve a four-digit Case/PO as the same case and do not split it into a year/sequence or shorter-reference false match.
- **A6.** Ordering and “latest sequence” logic compare the parsed numeric sequence inside the same marker/principal/year scope, so 1000 follows 999; string length or lexical order cannot select an older value as the latest.
- **A7.** Existing three-digit Case/POs, provider/year isolation and marker-specific sequences remain unchanged. Reaching 1000 in one scope cannot advance or invalidate another scope.
- **A8.** Storage fields, indexes, audit values, filenames, exports and Archive names preserve the complete four-digit Case/PO. If 9999 is ever exhausted, allocation fails visibly and safely rather than truncating or reusing a value.
- **A9.** Automated coverage exercises 001, 009, 099, 999, 1000, 1001 and 9999 across two-, three- and longer principal codes, every marker form, concurrent allocation and every named consumer; signed-in deployed proof demonstrates the boundary without advancing a real provider solely for testing.

## Validation
- **Offline:** add shared domain contract tests, allocator/concurrency tests, API/schema tests, retro/email-correlation fixtures, numeric ordering tests and SPA interaction tests. Fail the suite if any consumer still imposes exactly three digits.
- **Isolated non-live:** exercise 999→1000, concurrency and all consumers against a production-shaped deployment/database that cannot surface seeded cases in the live app.
- **Signed-in/live:** prove the deployed version and existing real three-digit behavior read-only. Capture four-digit behavior only when a real operator-designated scope naturally reaches the boundary; until then the mutating live rows remain PENDING. Never create a disposable principal/case or advance a production sequence solely for proof.
- **Regression:** rerun Case/PO allocation, manual intake, retro reconstruction, global search, EVA export and Archive-folder suites, with existing three-digit cases compared byte-for-byte before and after.

## Research
Distilled 2026-07-13 from the [operator note](./evidence/info.md), with a read-only trace of the formatter, retro validator and EVA sequence field. The inconsistency is concrete even though no live principal has yet been shown at 1000.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/info.md)
