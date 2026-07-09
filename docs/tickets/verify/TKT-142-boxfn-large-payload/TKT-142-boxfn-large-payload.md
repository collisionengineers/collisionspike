---
id: TKT-142
title: Box facade 502s on large base64 payloads — QDOS26029 archive stranded (17.6 MB .eml)
status: verify
priority: P1
area: box
tickets-it-relates-to: [TKT-087, TKT-003]
research-link: docs/tickets/verify/TKT-142-boxfn-large-payload/evidence/operator-note.md
plan: PLAN-003
---

# TKT-142 — Box facade 502s on large base64 payloads — QDOS26029 archive stranded (17.6 MB .eml)

## Problem

The box-webhook facade dies (502, worker death) on a 17.6 MB base64 .eml upload payload — the QDOS26029 (ae1c0c84) re-archive failed 0/4, with small files failing as recycle collateral. Large evidence cannot reach the Box mirror.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — lifecycle-wave workflow finding, 2026-07-09.

## Proposed change

PROPOSED (not built): chunked/streaming upload through the facade (Box chunked-upload API for >20MB; raise the practical cap below that) or a direct-from-blob upload path; retry the stranded QDOS26029 archive after the fix; consider a size cap with an honest audit if truly capped.

## Acceptance

- A 17.6 MB .eml archives to Box successfully through the facade (or the documented cap path audits honestly).
- The stranded ae1c0c84/QDOS26029 archive completes (4/4).
- No small-file collateral failures during a large upload.

## Research

Filed 2026-07-09 from the lifecycle-wave report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
