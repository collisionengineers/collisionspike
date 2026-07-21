---
id: TKT-306
title: Image classification is 100% dead — a body-text scan misreads every healthy response as a content-filter block
status: now
priority: P0
area: orchestration
tickets-it-relates-to: [TKT-064, TKT-089, TKT-123]
research-link: docs/tickets/now/TKT-306-image-classify-content-filter-false-positive/evidence/code-read-2026-07-21.md
---

# Image classification is 100% dead — a body-text scan misreads every healthy response as a content-filter block

## Problem

`hasExplicitContentFilter` in `services/orchestration/src/platform/image-classify.ts` checked
`finish_reason === 'content_filter'` correctly, then added a defensive fallback:
`/content[_ -]?filter|responsibleaipolicyviolation/i.test(JSON.stringify(result))`.

Under RAI policy `Microsoft.DefaultV2` (the gpt-5 deployment this repo uses), every successful
200 response also carries `content_filter_results` / `prompt_filter_results` keys with every
category `"safe"`. The regex matches those key names, so the fallback misread **every healthy
response** as a terminal content-filter block — the first check in
`imageClassificationOutcomeFromResponse`, ahead of the 413/status/parse checks.

`services/orchestration/src/adapters/aoai.ts:306` checks only `finish_reason` for the same
provider and works correctly; this was the one caller that grew the extra fallback.

### Live symptom

Two callers of `imageClassificationOutcomeFromResponse` diverge on a terminal result:

- The sweep path (`classifyImageWithOutcome` callers in `box-classify-sweep.ts`) dead-letters —
  total loss for that image.
- The intake path (`extractImages.ts`, via the `classifyImage` null-wrapper) fails open: the
  image persists `imageRoleCode: 'unknown'`, and the failure code was discarded entirely — no
  log, no counter. So the live symptom on intake is **silent degradation to role-unknown**
  (letterhead/logo rasters sitting unexcluded, a genuine damage photo never getting
  `registration_visible`), not lost images.

Every success fixture in `image-classify.test.ts` prior to this ticket was annotation-free (no
`content_filter_results` key), which is exactly why CI was green while classification was dead
in production.

## Change

1. `hasExplicitContentFilter` now checks only `finish_reason === 'content_filter'`. The
   `JSON.stringify` fallback is deleted.
2. Regression fixture added: a 200 body carrying realistic `content_filter_results` /
   `prompt_filter_results` with every category `safe` now asserts `ok: true`.
3. `extractImages.ts` now calls `classifyImageWithOutcome` (was the null-collapsing
   `classifyImage` wrapper) so a classify failure's `code`/`disposition` is visible instead of
   silently discarded. Counts-only by code (`classifyFailureCounts`) in the existing per-run
   summary log — no per-image log volume added.

## Acceptance

- A healthy 200 response carrying `content_filter_results`/`prompt_filter_results` with safe
  severities classifies successfully (`ok: true`), proven by a fixture using the real annotated
  shape, not a bare `{ finish_reason: 'stop' }`.
- `finish_reason === 'content_filter'` still classifies as terminal.
- A classify failure during intake extraction is counted by failure code in the `extractImages`
  summary log instead of being silently discarded.
- Live watch after deploy: `evidence.image_role_code` is no longer uniformly `unknown` on new
  extractions; cross-check extraction volume against the `AzureOpenAIRequests` 200-count for the
  same window.

## Out of scope

- The sweep path's dead-letter-on-terminal behaviour (`box-classify-sweep.ts`) — unchanged by
  this fix; it was already correctly acting on the (wrong) terminal verdict this ticket removes.
- The ~64 excess model calls (81 vs 17 images) from another caller of the same Cognitive
  Services account observed during diagnosis — not attributable from telemetry alone.

## Artifacts

- [Changes made](./changes.md)
- [Code-read evidence](./evidence/code-read-2026-07-21.md)
