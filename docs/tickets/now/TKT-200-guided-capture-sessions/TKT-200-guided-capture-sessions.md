---
id: TKT-200
title: Add secure guided photo capture sessions
status: now
priority: P1
area: integration
tickets-it-relates-to: [TKT-064, TKT-148, TKT-156, TKT-165, TKT-167]
research-link: docs/tickets/now/TKT-200-guided-capture-sessions/evidence/code-audit.md
plan: PLAN-004
---

# Add secure guided photo capture sessions

## Problem

Case handlers can request images through ordinary chasers and Archive file-request links, but there is
no case-scoped guided capture session that tells an invited person which photographs are required,
accepts safe resumable uploads, and brings selected originals into canonical evidence. An open public
intake or reuse of the staff evidence-upload route would expose the wrong authority boundary.

## Evidence

- [Implementation-branch audit](./evidence/code-audit.md) — the current PR #83 candidate and its honest
  offline/live boundary.
- TKT-148 and TKT-167 own image-gap and chaser behaviour; TKT-165 owns canonical staff evidence writes.

## Proposed change

IMPLEMENTED AND DEPLOYED DARK: authenticated staff issue/replace/cancel
controls, one-time high-entropy session exchange, short-lived public session access, exact-object
managed-identity uploads, server-side structural validation, idempotent submission, review-pending
canonical Evidence and bounded retention cleanup.

The contract, API, schema and staff workflow are deployed. Public ingress, cleanup, physical-device
acceptance and canonical evidence materialisation remain unproven and default-off.

## Acceptance

- One canonical OpenAPI contract owns staff create/list/replace/cancel and public
  exchange/renew/manifest/upload/complete/submit operations; generated consumers are drift-checked.
- Staff can issue only for an accessible non-terminal case, choose an approved shot plan and expiry,
  list non-secret summaries, replace an open link and cancel it. Existing Archive upload remains.
- Bootstrap and resume secrets are high-entropy, hash-only at rest, expiring and revocable. Short-lived
  access never enters logs, query strings, browser persistence or cacheable responses.
- Public authority is session-scoped: it cannot search/select/change cases, plans or storage paths.
- Upload permission is create/write-only for one exact object, short lived and minted through managed
  identity without exposing account keys or broad storage access.
- Completion verifies actual bytes, size/hash, MIME/magic/decode/dimensions and session/shot ownership.
  Client capture observations remain untrusted advice and never bypass server checks.
- Upload and submission are idempotent; replay mismatch fails without duplicate assets, Evidence,
  Archive work or audit. Reservation ceilings and abuse states are finite and auditable.
- Submission follows and locks merge lineage, preserves original bytes/hash, creates only selected
  review-pending Evidence, requests canonical Archive/readiness work and never auto-accepts an EVA photo.
- Staff/public/direct-upload/cleanup/guidance capabilities have independent default-off gates. Cleanup
  deletes only capture-owned unmaterialised/redundant objects and never a canonical Evidence path.
- Public ingress has explicit origin, request, body, throttling and PII-safe telemetry controls.
- Canonical and live-delta DDL agree, enforce RLS/least privilege, and have backup-first rollout/rollback.
- Offline suites cover auth, secret lifecycle, manifest recovery, validation, concurrency,
  idempotency, merge locking, audit/Archive/readiness work, retention and the staff-rendered workflow.
- Chromium/WebKit plus physical Safari/iPhone and Chrome/Android acceptance cover permissions,
  fallback, retake, retry, background recovery and real rear-camera capture.
- Independent live verification uses one operator-designated test session and the approved Archive test
  root; it proves canonical evidence/storage/audit/readiness plus negative old-link/tamper/replay probes.

## Scope boundary

This ticket is guided manual capture with deterministic quality advice. It does not claim vehicle,
viewpoint, part or damage recognition or automated evidential acceptance. The feature remains dark until
its integration, security, browser/device and live gates pass.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Implementation-branch audit](./evidence/code-audit.md)
