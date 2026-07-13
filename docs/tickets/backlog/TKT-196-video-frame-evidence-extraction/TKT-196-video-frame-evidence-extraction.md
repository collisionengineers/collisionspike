---
id: TKT-196
title: Create evidence stills from case videos
status: backlog
priority: P3
area: evidence
tickets-it-relates-to: [TKT-002, TKT-064, TKT-088, TKT-112, TKT-130, TKT-160, TKT-165]
research-link: docs/tickets/backlog/TKT-196-video-frame-evidence-extraction/evidence/concept.md
---

# Create evidence stills from case videos

## Problem
A case can have too few suitable photos to progress while still holding useful vehicle video. Staff need a bounded way to review representative frames and deliberately add selected stills as image evidence; automatically treating arbitrary frames as accepted photos would create noise and could falsely change readiness.

## Evidence
- [Operator concept](./evidence/concept.md) — asks for a low-priority video-clipping option when photographs are insufficient, with staff accepting or rejecting proposed images.
- The evidence model already recognizes video, while TKT-064/TKT-112 own image role classification and TKT-130 owns strict readiness. No current ticket supplies reviewed video-to-still derivation.

## Proposed change
PROPOSED (not built): add an asynchronous server-side extraction job that samples a bounded set of representative frames from an existing case video. Show the candidates with source timestamps; let staff accept, reject and order them; only accepted frames become derived image evidence and enter the canonical classification/readiness lifecycle.

The original video remains unchanged. Handler copy should use “Create photos from video”, “Preparing photos…”, “Keep”, “Leave out” and “Add selected photos”; it must not mention codecs, worker processes, storage or extraction internals.

## Acceptance
- **A1.** “Create photos from video” is available only for an authorized case with at least one supported video and is prompted when the accepted photo set is insufficient; opening or running it does not itself change evidence acceptance, photo order or readiness.
- **A2.** Extraction runs asynchronously outside the request timeout and enforces documented limits for accepted formats/codecs, source size/duration, processing time, concurrent jobs and maximum candidate frames. Unsupported, corrupt, encrypted, oversized and timed-out video reaches a clear terminal/retryable outcome without blocking the case page.
- **A3.** Candidate selection is deterministic for the same video hash and extractor version, covers the usable timeline rather than only the first seconds, applies recorded rotation/orientation correctly, and avoids returning byte-identical or near-identical frames up to the documented threshold.
- **A4.** Candidates are temporary previews with source timestamps and are not evidence, accepted photos or readiness inputs. Staff can preview them, keep/leave out each one and set the order before one explicit “Add selected photos” confirmation.
- **A5.** Confirmation persists only selected frames as derived image evidence in the chosen order. Each records source video evidence ID/hash, exact timestamp or frame locator, derived content hash, extractor/version, creating staff identity and operation ID; filenames are collision-safe and handler-readable.
- **A6.** The original video bytes, evidence row, filename and source relationship are preserved unchanged and remain viewable. Deleting or excluding a derived still does not delete or alter the source video or sibling stills.
- **A7.** Accepted stills pass through the same canonical image-role/registration/reflection classification, staff decision and readiness recomputation as uploaded/extracted images. They do not bypass exclusions or automatically progress the case merely because they came from video.
- **A8.** Re-running, retrying after response loss or confirming the same selection twice is idempotent by source hash/version/frame/content: no duplicate evidence row/blob/Archive file is created, while a genuinely different selected frame can be added later with its own provenance.
- **A9.** Rejected/unconfirmed temporary frames are never exposed as case evidence or exported to EVA and are cleaned up after a documented short retention window. Cleanup is audited by job/item count and cannot remove accepted stills or the original video.
- **A10.** Video reads, job status, previews and confirmation are case-authorized server-side. Processing treats filenames/metadata as untrusted, cannot execute embedded input, uses bounded temporary space and emits no source bytes or client details to an unapproved external service.
- **A11.** The review surface is keyboard operable and responsive, distinguishes preparing/ready/partial/failure states, retains selections across ordinary navigation/reload while the job exists, and never reports photos added until persistence is confirmed.
- **A12.** Isolated tests use known-frame video fixtures and cover constant/variable frame rate, rotation, short/long duration, duplicate scenes, corrupt/unsupported/oversized input, timeout, partial candidate failure, cancellation, retry, double confirmation, classification/readiness handoff and cleanup; signed-in proof uses only a genuine operator-designated case video, accepts and rejects frames as operationally appropriate, and reconciles provenance and order. No case or evidence is created in the live app solely for proof.

## Validation
- **Offline:** generate small deterministic video fixtures with known timestamps/pixels; test bounded worker/job behavior, sandboxing, cancellation and cleanup; compare extracted frame hashes/orientation; run evidence idempotency, classification, readiness, authorization and UI accessibility suites.
- **Signed-in/live:** use a naturally occurring operator-designated case video and perform only genuine operational decisions. Show the async states and, where appropriate, keep/leave out/reorder/confirm candidates; reconcile the accepted image hash, source timestamp, audit and photo order across UI/database/content store/Archive. Prove rejected-candidate and original-video outcomes when naturally available, otherwise keep those live rows PENDING and rely on isolated proof. Never upload or create a case/video solely for verification.
- **Performance/safety:** record peak duration/memory/temp-space behavior at each documented limit and prove admission control prevents one video or staff member from exhausting the worker pool.

## Research
Distilled 2026-07-13 from the operator's [video clipper concept](./evidence/concept.md). This is intentionally a standalone P3 ticket and does not block PLAN-004 or production cutover.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator concept](./evidence/concept.md)
