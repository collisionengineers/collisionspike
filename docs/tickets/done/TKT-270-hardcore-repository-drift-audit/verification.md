# Verification — TKT-270: Run the hardcore repository duplication and drift audit

## Verdict

PASS — 2026-07-20.

## Evidence

- **A1.** `evidence/audit-report-2026-07-20.md` names the audited base/head (`main @ f6b3cda3`) and tool/query
  version (workflow `wf_07a02a81-abe`), and covers all four dimensions: equivalent mechanisms, duplicate
  authority by lane, cross-language divergence, and registry/doc + registry/evidence disagreement. Each of the
  13 findings records exact paths and a structural/behavioural basis; no finding rests on a lexical hit alone.
- **A2.** Every residual maps to an owner: M1–M3 → TKT-275 (new), A1–A2 → TKT-276 (new), C1–C5 → TKT-277 (new),
  R1–R3 → TKT-273 (existing, referenced in its Evidence). No duplicate ticket was created for a finding an
  existing plan already owns; no intentional exception was needed.
- **A3.** Discovery was read-only. Writes are limited to the report, this ticket's evidence, the TKT-273
  finding-reference, and the three lifecycle stubs (TKT-275/276/277) + regenerated ticket/governance views. No
  production source, unrelated ticket status, live state, or `workingspace/` content changed.
- **A4.** The report lives in `evidence/` and is referenced by TKT-273 and by the three new tickets'
  `research-link`.
- **A5.** No live write.

## Commands

- `npm run check:tickets` (after `ticket-generate`) and `npm run check:docs` → PASS.

## How to re-verify

Read `evidence/audit-report-2026-07-20.md`; re-run the four read-only dimension checks it documents; confirm
each finding's ticket/exception mapping resolves (TKT-273/275/276/277).
