# TKT-229 — changes

## Code

- `services/data-api/src/features/evidence/internal-persist-routes.ts`
  - `persistRows` gains a `mirrored` counter (additive; `merged` semantics untouched).
    Incremented in BOTH sha256-twin branches when `blobTwin && isBoxRow`
    (`blobTwin = ex.storage_path != null`); discriminator + purge-timing rationale recorded in
    a code comment at the twin block.
  - `mirrored` added to the route response (and as an honest `0` on the backfill
    already-completed replay path, which the webhook lane never takes).
- `services/data-api/src/features/cases/internal-operations-routes.ts`
  - `internalAudit` accepts an optional `onceKey` — top-level `body.onceKey` OR
    `body.after.onceKey` (the box-webhook rides `after_fields`, so the stored row's `after`
    carries the key the guard matches on). When present WITH `caseId`, a bounded existence
    SELECT (`pg_input_is_valid(after,'jsonb') AND after::jsonb->>'onceKey' = $3`) skips the
    write; 204 either way. Benign concurrent-delivery race documented in the comment.
- `services/functions/box-webhook/data_api_client.py`
  - `EvidenceWriteResult` gains `mirrored: int | None = None`; `create_evidence` parses it via
    the new `_int_or_none` (None preserved for older API builds — the fallback trigger).
  - `evidence_exists_for_box_file` (always-False shim) DELETED; module docstring updated.
- `services/functions/box-webhook/function_app.py`
  - Shim call site deleted (`result["deduped"]` path gone); the idempotent POST is the single
    evidence-write dedup authority.
  - Origin derivation: `mirror_echo = mirrored > 0 if mirrored is not None else merged > 0`
    (the required rolling-deploy fallback); `origin = 'archive_mirror'` only with
    `persisted == 0 and mirror_echo`.
  - `after_fields` gains `boxFileId` + `onceKey = box_upload_received:<boxFileId>`; the stale
    "only on a fresh Evidence write" comment replaced with the once-key mechanism description.

## Tests

- `internal-persist-routes.test.ts`: new TKT-229 describe (sameIdentity+blob twin → mirrored:1
  with merged:0; sameIdentity without blob → mirrored:0; cross-lane blob twin → merged:1 AND
  mirrored:1). Existing expectations gained the additive `mirrored` key ONLY (see deviations).
- NEW `internal-operations-routes.test.ts`: internalAudit onceKey guard — skip on existing key,
  write on absent key, ignore onceKey without caseId, after-object-carried key, no-onceKey
  byte-identical path.
- pytest `test_data_api_client.py`: shim-removal pin (`not hasattr`), `mirrored` parsing
  (present int / explicit 0 / absent → None); docstring updated.
- pytest `test_webhook.py`: four-row origin matrix (`mirrored>0` → archive_mirror; `mirrored=0`
  beats the legacy merged heuristic; `mirrored=None` falls back to merged; fresh write always
  external); `after_fields` carries boxFileId + onceKey; the shim-dependent tests reworked to
  the server-side-dedup contract (see deviations).

## Deviations from the plan (recorded)

1. **"Existing merged-semantics tests stay green UNTOUCHED"** — satisfied for the pytest
   merged-semantics tests (the None fallback keeps `test_receiver_audit_marks_archive_mirror_on_merged_twin`
   passing with its original EvidenceWriteResult call). It is NOT literally satisfiable for the
   vitest persist-route tests: they assert strict `toEqual` on the whole response object, so an
   ALWAYS-PRESENT additive field is visible to them. Emitting `mirrored` conditionally would
   defeat the latent-mislabel fix (an absent field means "old API" to the webhook), so the
   field is always present and the expected objects gained the `mirrored` key. Every existing
   `merged` count is unchanged.
2. **Shim-dependent pytest tests reworked, one deleted**: with the shim gone there is no
   client-side pre-write dedup gate. `test_receiver_durable_dedup_when_evidence_exists` became
   `test_receiver_durable_dedup_is_the_idempotent_post`; the strand/retry and report-redelivery
   tests now script the server answering `persisted:0` on the re-POST (created records 2 client
   calls; the SERVER keeps the row once-only). `test_receiver_no_sha256_fetch_when_evidence_deduped`
   was deleted — its premise (skip the byte fetch when the client-side gate dedups) no longer
   exists; a rare Box redelivery now re-fetches bytes for its idempotent re-POST (accepted
   cost, noted in-file).
3. **onceKey wire shape**: the plan's route spec said "accept optional `onceKey?: string`"
   while its client spec put the key in `after_fields` only. The route accepts BOTH (top-level
   `onceKey` or `after.onceKey`) so the webhook needs no extra wire field and other callers can
   use the top-level form.
4. `contracts/runtime-contract.snapshot.json` needed NO regeneration: the snapshot tracks
   routes/methods/auth, not response-body fields (`node scripts/checks/check-runtime-contract.mjs`
   passes unchanged).
