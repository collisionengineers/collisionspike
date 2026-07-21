# Changes — TKT-306

## Source

### `services/orchestration/src/platform/image-classify.ts`

- `hasExplicitContentFilter` now checks only `finish_reason === 'content_filter'`. Deleted the
  `try { … JSON.stringify(result) … }` fallback that matched the `content_filter_results` /
  `prompt_filter_results` keys present on every successful response under RAI policy
  `Microsoft.DefaultV2`.

### `services/orchestration/src/workflows/evidence/extractImages.ts`

- Switched from the null-collapsing `classifyImage` wrapper to `classifyImageWithOutcome`, so a
  classify failure's `code`/`disposition` is visible instead of silently discarded.
- Added `classifyFailureCounts` (counts by failure code) to the activity's existing per-run
  summary log line — no per-image log volume added.

## Tests

- `image-classify.test.ts` — new regression fixture: a 200 body carrying realistic
  `content_filter_results`/`prompt_filter_results` with every category `safe` now asserts
  `ok: true`.
- `extractImages.test.ts` — updated the classifier mock from `classifyImage` to
  `classifyImageWithOutcome` (outcome-shaped return values); added a case asserting a classify
  failure is counted by code in the summary log.

Results: `@cs/orchestration` 649 passed (59 files); `tsc -b --force` clean.

## Not done here

Deployment. This ticket is code only; live verification (evidence.image_role_code no longer
uniformly `unknown`, cross-checked against the `AzureOpenAIRequests` 200-count) is a post-deploy
acceptance line, not proven here.
