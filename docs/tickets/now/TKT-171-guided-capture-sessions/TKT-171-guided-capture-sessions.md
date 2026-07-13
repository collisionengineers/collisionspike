---
id: TKT-171
title: Add secure guided photo capture sessions
status: now
priority: P1
area: integration
tickets-it-relates-to: [TKT-064, TKT-148, TKT-156, TKT-165, TKT-167]
research-link: docs/tickets/now/TKT-171-guided-capture-sessions/evidence/code-audit.md
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
renew that access through a protected host cookie; stage exact-object uploads behind server validation;
and materialise only submitted, selected photos as review-pending case evidence under the case mutation
lock.

The canonical OpenAPI contract, generated types, staff workflow and a public API/database candidate
are built on `codex/guided-capture-server`. They are not deployed and are not confirmed on physical
devices.

## Acceptance

- The canonical OpenAPI contract defines staff create/list/replace/cancel operations and public
  exchange/renew/manifest/upload/complete/submit operations. Generated types are reproducible and
  contract drift fails CI.
- An authenticated staff member can issue a link only for an existing case they may access, choose an
  approved shot plan and bounded expiry, list non-secret session summaries, replace an open link and
  cancel an open link. Terminal or retired cases fail closed.
- The staff UI uses plain case-handler language, keeps the existing archive upload option intact, and
  places a newly issued or replaced link into an editable one-time chaser draft. Listing a session
  never reveals a previously issued secret.
- Bootstrap secrets are high entropy, stored only as SHA-256 hashes at rest, expiring,
  revocable and invalidated on replacement. Exchange returns short-lived, session-scoped access;
  secrets and access values are not written to logs, telemetry, browser persistence or query strings,
  and public responses are non-cacheable.
- Exchange also sets a 256-bit resume secret only as a host-only `HttpOnly`, `Secure`,
  `SameSite=Strict` cookie whose lifetime cannot exceed the session. Only its hash is stored. A bodyless
  renewal can issue another short-lived bearer; rotation, cancellation, lock, expiry and completion
  invalidate it, and submission clears it.
- The public manifest exposes only the minimum information needed to complete that invited session.
  A public user cannot create, search, select or change a case, alter the shot plan, or address an
  object outside the session.
- Manifest progress chooses the selected asset first, otherwise the latest attempt, and exposes only
  safe recovery states plus a generic rejection reason. Response loss and a stale validation lease can
  therefore converge without disclosing filenames, storage paths or internal validation codes.
- Each upload uses an exact-object, short-lived, create/write-only user-delegation SAS minted through
  managed identity. The browser never receives a storage account key, connection string or broad
  container permission.
- Completion validates the stored bytes server-side: declared and actual size/hash, extension/MIME,
  magic bytes, complete decode, dimensions and pixel bounds, session/shot/path ownership and duplicate
  state. A failed or superseded attempt is never selected for submission.
- Upload intent requires a strict, bounded client observation tied to the session rules version.
  `ready`, `take_anyway` and `unassessed` outcomes and normalized signals are stored only as untrusted
  review/evaluation data and participate in idempotency comparison. Separate bounded server structural
  observations record format/hash/decode/dimensions and remain authoritative. Take-anyway always
  remains available and every pilot upload still becomes review-pending.
- Upload intent and final submission are idempotent. Replaying the same key returns the same outcome;
  reusing it for different bytes, a different shot or a different session fails without creating a
  second asset, evidence row, archive job or audit.
- Submission resolves and locks the complete durable merge lineage in the existing global mutation
  order. It transactionally retargets an open session to an active survivor; a missing, malformed or
  terminal lineage persistently locks the session for staff resolution. It requires every mandatory
  shot, preserves the original bytes and SHA-256, and materialises only selected assets as
  review-pending evidence. Retarget, lock and completion transitions write strict audit; successful
  submission also requests archive mirroring and recomputes readiness without auto-accepting a photo
  for EVA.
- Excluded guided-capture Evidence remains visible in the staff image-review surface with plain-language
  copy. A staff Evidence PATCH must explicitly include and accept it before EVA use, then schedules the
  ordinary archive and readiness work.
- Staff sessions, public access, direct upload and retention cleanup have independent default-off
  gates. New sessions snapshot a validated guidance rollout rung. Validation leases are reclaimable
  and fenced against stale workers; retention deletes only capture-owned unmaterialised or redundant
  objects after the configured window and never deletes a canonical Evidence storage path. Locked
  sessions are retained by the same policy; cleanup retries use bounded durable backoff and expiry uses
  an ordered, bounded `SKIP LOCKED` batch.
- Expired, cancelled, completed, locked and repeatedly abused sessions fail closed with finite public
  error shapes. Public ingress has an explicit origin policy, request/body limits, throttling and
  abuse telemetry that contains no case identifiers, registrations, filenames or secret values.
- Canonical and live-delta DDL agree on capture tables, constraints, indexes, least-privilege grants
  and forced RLS. The additive delta has a backup-first rollout and rollback plan.
- Offline tests cover staff authorization, secret exchange/rotation/cancellation, status transitions,
  resume renewal/invalidation, observation bounds and replay mismatch, idempotency conflict/concurrency,
  exact-object upload, structural validation, manifest recovery, required-shot submit, case-lock
  rollback, audit/archive/readiness work, and the rendered create/replace/cancel/chaser/review flow.
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

The pilot completion route performs validation synchronously. Its fenced lease makes retries safe but
does not constitute a durable background worker; that worker and its queue/observability proof remain a
rollout requirement before high-volume production claims.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Code audit](./evidence/code-audit.md)
