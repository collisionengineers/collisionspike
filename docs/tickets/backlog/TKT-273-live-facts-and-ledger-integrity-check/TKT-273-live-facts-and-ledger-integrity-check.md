---
id: TKT-273
title: Add the LIVE_FACTS and ledger integrity standing check
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-257, TKT-258, TKT-270]
research-link: docs/tickets/backlog/TKT-273-live-facts-and-ledger-integrity-check/evidence/distillation-note.md
plan: PLAN-012
---

# Add the LIVE_FACTS and ledger integrity standing check

## Problem
The series was triggered partly by stale governed fields in `LIVE_FACTS.json`. Timestamp freshness and
agreement between prose and the registry do not prove that registry values match live evidence. The workflow
job currently named “Verify live registry drift” invokes
`VERIFY_LIVE=1 node verify-all.mjs`, but that verifier explicitly never contacts the live environment and does
not consume `VERIFY_LIVE`; the job can therefore report a false green.

## Evidence
`LIVE_FACTS.json` is the sole exact live-state registry, with a rule that it is replaced only from dated
read-only evidence and never inferred from source; PLAN-009 refreshes it (offer, function counts, retirements).
The inventory ledgers (`docs/governance/repository-inventory.json` + the reconciliation ledger) are already
integrity-checked by `check:inventory` / `check:reconciliation`. A current read-only comparison confirmed that
some governed subscription and function-registration fields in the tracked registry differ from Azure. Exact
state and the verification timestamp remain in `LIVE_FACTS.json`. The existing ledger checks must remain
canonical rather than being reimplemented inside another guard.

The TKT-270 audit ([report](../../done/TKT-270-hardcore-repository-drift-audit/evidence/audit-report-2026-07-20.md),
findings R1–R3) names three concrete instances this check owns: `LIVE_FACTS.parser.functionCount=4` vs the
committed evidence snapshot and `function_app.py` (both 5); `LIVE_FACTS.dataApi.functionCount=144` vs the
snapshot's 146 (the "over-count" resolution was never written back and its provenance is internally
contradictory); and `live-environment.md`'s header "last verified 2026-07-16" vs `LIVE_FACTS.lastVerified`
(2026-07-19). Remediation re-mints or corrects the counts from a fresh read-only read, writes the resolution
back into the snapshot, and derives the doc's verified-date from the registry.

## Proposed change
After TKT-257 and TKT-258 are `done`, define a secret-free machine-readable evidence snapshot and field map:
each governed `LIVE_FACTS.json` JSON path maps to a snapshot path, evidence source/probe, capture time, and
comparison rule. `LIVE_FACTS.json` references the snapshot path and digest. Add an offline command that checks
schema, freshness, digest, registry-to-snapshot parity, and doc authority. Add a separate credential-gated
read-only Azure command that captures an ephemeral snapshot, compares every governed Azure field, and emits a
sanitised artifact. Keep `verify-all.mjs` offline and reuse the existing inventory/reconciliation commands.

## Acceptance
- **A1.** A committed, secret-free JSON snapshot and field map cover every machine-governed live fact. The
  registry records the snapshot path and digest; each mapping names its evidence source/probe, capture time,
  and exact or explicitly-tolerated comparison.
- **A2.** An offline command fails on a stale snapshot, digest mismatch, missing mapping, registry/snapshot
  field mismatch, or tracked-doc/registry disagreement. Separate negative fixtures cover each case.
- **A3.** A distinct credential-gated command performs read-only Azure queries, creates an ephemeral
  sanitised snapshot, and compares each governed Azure field with both the committed evidence and registry.
  With credentials present, any query or comparison failure fails closed. Without credentials, CI reports an
  explicit skip that cannot be cited as live verification.
- **A4.** The workflow invokes the real live command rather than passing an unused variable to
  `verify-all.mjs`; the offline aggregate verifier remains network-free.
- **A5.** `check:inventory` and `check:reconciliation` remain the canonical deterministic ledger checks. The
  new integrity wiring invokes or registers them by reference and does not duplicate their algorithms; a
  synthetic ledger edit still fails the existing check.
- **A6.** The commands and evidence schema are documented on the operations/governance pages and expose no
  secret values, tokens, private identifiers, or connection strings.
- **A7.** No live write.

## Validation
- Run the offline command against the registry, committed snapshot, docs, and ledgers; run each negative
  fixture; run the credential-gated command read-only and retain its sanitised comparison result. Confirm the
  live command performs no mutation and that the workflow does not label an offline-only run as live proof.

## Research
Distilled from PLAN-009's `LIVE_FACTS` refresh (TKT-257), PLAN-010's output-preserving inventory refactor
(TKT-258), and the `LIVE_FACTS.json` authority doctrine, then corrected against the live Azure estate and the
current false-green workflow. Implementation is gated on TKT-257 and TKT-258 being `done` and consumes
TKT-270's audit.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
