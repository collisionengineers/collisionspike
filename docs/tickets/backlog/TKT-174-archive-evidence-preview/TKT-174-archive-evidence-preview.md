---
id: TKT-174
title: Make Archive evidence previews load clearly and open larger
status: backlog
priority: P2
area: ui
tickets-it-relates-to: [TKT-003, TKT-048, TKT-107, TKT-133, TKT-146]
research-link: docs/tickets/backlog/TKT-174-archive-evidence-preview/evidence/info.md
plan: PLAN-004
---

# Make Archive evidence previews load clearly and open larger

## Problem
Evidence images sourced from the Archive can take long enough to appear that the preview area looks blank or broken. There is no reliable visible distinction between loading, failed and unavailable content, and staff cannot open the image in a useful larger view.

## Evidence
- [Operator note](./evidence/info.md) — reports slow previews and asks for a visible loading state plus a larger image view.
- [Screenshot](./evidence-manifest.json) — supplied example of the evidence-preview surface.
- TKT-048 restored basic inbox/case image rendering, but does not specify the Archive-specific loading, retry or large-view lifecycle required here.

## Proposed change
PROPOSED (not built): first record a request waterfall from selection to first pixels and identify application delay, access-token delay, provider rendition delay and original-byte transfer separately. Remove application-controlled delay where possible, then make the preview an explicit state machine with immediate progress, terminal retryable failure and a bounded larger view. Prefer a small rendition when the measured provider path supports one; do not promise a thumbnail that the source cannot supply.

Any rendered copy must stay in handler language. Suitable labels are “Loading preview…”, “Preview unavailable”, “Try again” and “Open larger view”; raw service names, status codes and storage identifiers must not be shown.

## Acceptance
- **A1.** Selecting Archive-backed image evidence immediately renders a stable loading placeholder; the preview area is never blank, left on the previous image, or presented as complete while bytes are still being fetched.
- **A2.** A captured request waterfall identifies the dominant delay and selects the fastest authorized preview path on evidence. When a bounded rendition is available, normal preview uses it instead of the full original; when only original bytes are available, that limitation is recorded and the response is streamed/bounded without pretending a thumbnail exists. Either path replaces the placeholder without layout shift.
- **A3.** “Open larger view” opens the selected image in a bounded, responsive overlay using a large rendition or original only when needed; closing it returns focus to the control that opened it and does not change evidence acceptance or order.
- **A4.** Missing/deleted content, expired access, permission refusal, unsupported content, timeout and network failure all leave the surface in a terminal “Preview unavailable” state with a usable “Try again” action. No failure can leave an indefinite spinner or an empty panel. A preview/rendition failure does not become an image-analysis failure or change readiness unless the canonical content path independently proves the original evidence is unavailable.
- **A5.** Retry resolves fresh access for the same current evidence item and performs a new request. It does not reuse an expired URL, create evidence, alter the Archive, or apply a late response from an earlier attempt.
- **A6.** Rapidly switching evidence, closing the view or leaving the page cancels or ignores obsolete requests, so an image can never appear against the wrong filename, case or evidence record.
- **A7.** Preview and large-view access remain server-authorized for the signed-in user and case. Responses expose neither provider credentials nor raw internal paths/identifiers, and authorization failures use the same safe handler-facing error state.
- **A8.** Loading, loaded, unavailable and large-view states are keyboard operable, screen-reader labelled, visible at supported mobile/desktop widths, and preserve useful alternative text based on the evidence filename/type rather than guessed image contents.
- **A9.** Automated coverage exercises fast, delayed, failed, timed-out, expired-access, retry, rapid-selection and unmount paths; signed-in browser proof covers a controlled Archive thumbnail, its larger view and a safely simulated unavailable item without mutating production evidence.

## Validation
- **Offline:** use component tests with controlled promises and fake timers to prove every state transition, request cancellation and focus return; use API tests to prove evidence-based rendition/original selection, authorization, fresh-access retry and safe error shaping; assert that original bytes are avoided when a bounded rendition exists.
- **Signed-in/live:** open operator-designated existing evidence through an assigned staff account, capture the loading state and request waterfall, open/close the larger view, and exercise unavailable/expired response handling without mutating evidence. Record the actual selected path, retry and absence of write requests; do not require thumbnail-first when the measured source cannot provide it.
- **Regression:** rerun evidence-page, inbox-preview, authorization, accessibility and responsive-layout suites, including TKT-048/TKT-133 duplicate-source cases.

## Research
Distilled 2026-07-13 from the [operator note and screenshot](./evidence/). Implementation must verify the current signed-URL/rendition path before selecting a remedy; the ticket does not assume that Archive latency itself can be removed.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/info.md)
- [Screenshot](./evidence-manifest.json)
