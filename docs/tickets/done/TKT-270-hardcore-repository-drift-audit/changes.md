# Changes — TKT-270: Run the hardcore repository duplication and drift audit

## Status

Complete 2026-07-20 on branch `plan012/tkt-270-drift-audit`. Read-only audit; the only writes are the dated
report, this ticket's evidence, the finding-to-owner references, and the three new backlog stubs.

## What was done

- **Dated audit report** — `evidence/audit-report-2026-07-20.md`. Base/head `main @ f6b3cda3`, method pinned
  (workflow `wf_07a02a81-abe`, 4 parallel read-only dimension audits). Thirteen findings across the four
  dimensions (equivalent mechanisms, duplicate authority by lane, cross-language rule divergence,
  registry/doc/evidence disagreement), each with paths + a structural/behavioural basis (no lexical-only hits).
- **Finding-to-owner mapping** (A2) — every residual maps to a new backlog ticket or an existing owner; none
  needed an intentional exception (candidate equivalences that ARE intentional — the per-adapter error mappers,
  the VRM D1/D2 allowed divergences — were rejected during the audit, not recorded as findings):
  - M1–M3 (content-SHA-256 producer/validator with a `/i` split; stable-JSON request-digest with a
    `localeCompare` split; triplicated `safeText`) → **TKT-275** (new).
  - A1–A2 (two `recomputeStatus` authorities of `case_.status_code`; duplicated generation-counter ack) →
    **TKT-276** (new).
  - C1–C5 (five Python↔TS rule mirrors, incl. the already-divergent evidence-kind MIME fallback) →
    **TKT-277** (new).
  - R1–R3 (`LIVE_FACTS` parser count 4-vs-5, dataApi 144-vs-146, stale doc verified-date) → **TKT-273**
    (existing; its Evidence section now references these findings).
- **New backlog stubs minted** — `TKT-275`, `TKT-276`, `TKT-277`, each `research-link`ed to the report.

## Notes

No production source, unrelated ticket status, live state, or `workingspace/` content was changed (A3). The
report is referenced by TKT-273 (registry findings) and stands as the driver for the three new tickets.
