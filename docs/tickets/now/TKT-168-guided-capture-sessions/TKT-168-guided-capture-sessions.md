---
id: TKT-168
title: Add secure guided photo capture sessions
status: now
priority: P1
area: integration
tickets-it-relates-to: [TKT-064, TKT-148, TKT-156, TKT-165, TKT-167]
research-link: docs/tickets/now/TKT-168-guided-capture-sessions/evidence/code-audit.md
---

# Add secure guided photo capture sessions

## Problem

Case handlers can ask for images through ordinary chasers and archive file-request links, but there is
no case-scoped guided capture session that tells an invited person which photographs are required,
accepts safe resumable uploads, and brings the selected originals into canonical evidence. An open
public intake or reuse of the staff evidence-upload route would expose the wrong authority boundary.

## Evidence

- [Code audit](./evidence/code-audit.md) — source trace for the contract, staff workflow, public
  boundary, upload validation and schema candidate now on the implementation branch.
- TKT-148 and TKT-167 define the existing image-gap and chaser behavior this route must complement,
  rather than replace with a raw photo-count rule.
- TKT-165 defines the canonical staff evidence lifecycle and its storage, audit, archive and readiness
  invariants.

## Proposed change

IN PROGRESS: add authenticated staff controls for issuing, replacing and cancelling a case-scoped
guided-photo link; exchange the one-time bootstrap secret for short-lived public session access;
stage exact-object uploads behind server validation; and materialise only submitted, selected photos
as review-pending case evidence under the case mutation lock.

The canonical OpenAPI contract, generated types, staff workflow and a public API/database candidate
are built on `codex/guided-capture-server`. They are not deployed and are not confirmed on physical
devices.

## Acceptance

- The canonical OpenAPI contract defines staff create/list/replace/cancel operations and public
  exchange/manifest/upload/complete/submit operations. Generated types are reproducible and contract
  drift fails CI.
- An authenticated staff member can issue a link only for an existing case they may access, choose an
  approved shot plan and bounded expiry, list non-secret session summaries, replace an open link and
  cancel an open link. Terminal or retired cases fail closed.
- The staff UI uses plain case-handler language, keeps the existing archive upload option intact, and
  places a newly issued or replaced link into an editable one-time chaser draft. Listing a session
  never reveals a previously issued secret.
- Bootstrap secrets are high entropy, hashed with a separately configured pepper at rest, expiring,
  revocable and invalidated on replacement. Exchange returns short-lived, session-scoped access;
  secrets and access values are not written to logs, telemetry, browser persistence or query strings,
  and public responses are non-cacheable.
- The public manifest exposes only the minimum information needed to complete that invited session.
  A public user cannot create, search, select or change a case, alter the shot plan, or address an
  object outside the session.
- Each upload uses an exact-object, short-lived, create/write-only user-delegation SAS minted through
  managed identity. The browser never receives a storage account key, connection string or broad
  container permission.
- Completion validates the stored bytes server-side: declared and actual size/hash, extension/MIME,
  magic bytes, complete decode, dimensions and pixel bounds, session/shot/path ownership and duplicate
  state. A failed or superseded attempt is never selected for submission.
- Upload intent and final submission are idempotent. Replaying the same key returns the same outcome;
  reusing it for different bytes, a different shot or a different session fails without creating a
  second asset, evidence row, archive job or audit.
- Submission runs under the existing case mutation lock, refuses a missing/retired target, requires
  every mandatory shot, preserves the original bytes and SHA-256, and materialises only selected
  assets as review-pending evidence. It also writes strict audit, requests archive mirroring and
  recomputes readiness without auto-accepting a photo for EVA.
- Expired, cancelled, completed, locked and repeatedly abused sessions fail closed with finite public
  error shapes. Public ingress has an explicit origin policy, request/body limits, throttling and
  abuse telemetry that contains no case identifiers, registrations, filenames or secret values.
- Canonical and live-delta DDL agree on capture tables, constraints, indexes, least-privilege grants
  and forced RLS. The additive delta has a backup-first rollout and rollback plan.
- Offline tests cover staff authorization, secret exchange/rotation/cancellation, status transitions,
  idempotency conflict/concurrency, exact-object upload, structural validation, required-shot submit,
  case-lock rollback, audit/archive/readiness work, and the rendered create/replace/cancel/chaser flow.
- Chromium and WebKit browser tests prove bootstrap removal, fallback capture, draft recovery, upload
  retry and submit behavior. Physical Safari on a supported iPhone and Chrome on a supported Android
  device prove camera permission denial, OS/file fallback, track cleanup, retake/accept, low-memory
  recovery, background/foreground recovery and real rear-camera capture.
- Independent live verification proves one designated test session end to end from the staff case to
  canonical evidence, storage, audit, readiness and the archive test root, plus old-link, revoked-link,
  tampered-upload, replay and unauthorized negative probes.

## Scope boundary

This ticket delivers professional guided manual capture with deterministic image-quality advice. It
does not claim vehicle recognition, viewpoint classification, part detection, damage assessment or
automated evidential acceptance. Any later model remains advisory until separately validated on
case-separated evidence and enabled by a reversible configuration flag.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Code audit](./evidence/code-audit.md)
