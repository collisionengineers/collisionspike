# Changes — TKT-131: Classify the role-unknown evidence images — retry the backfill residue so cases can reach Ready for EVA

## Status
EXECUTED LIVE (final wave D2, 2026-07-09) — 1,998/2,002 images classified + stamped, statuses
re-evaluated with audit; 4 honest residuals enumerated. Verification transcription PENDING.

## What ran (no repo code change — a one-shot admin pass mirroring the orch writer)

A Python driver (faithful port of `services/orchestration/src/platform/image-classify.ts` — same system
prompt, same strict `json_schema`, same gpt-5 params `max_completion_tokens:3000 /
reasoning_effort:low`, same `caseRegistrationVisible` case-VRM constraint and
`classificationToEvidenceFields` policy, same `imageRoleCodec` role→code map with
`other`→unknown-code+not-accepted) over every unclassified image evidence row, under the
TKT-112 ownership model (a backfill acts FOR the orch writer over prior rows).

1. **Enumeration** (csadmin read, transient FW rule added→removed, backup-first):
   **2,002 unclassified** image rows (`image_role_code=unknown AND registration_visible IS NULL
   AND excluded=false`) across **142 cases** — lanes: **1,852 Box facade / 150 blob**; the
   recorded ~82-error cohort present as 82 `application/octet-stream` rows. Backups:
   `evidence/backup-evidence-classification-before.csv` (6,700 rows) + the case-status snapshot.
2. **Byte lanes**: blob via a 10h read-only container SAS; Box via the facade
   `GET /api/box/files/{id}/content` (function key). MIME repaired by **magic-byte sniffing**
   (data-URL typed from actual bytes, Pillow fallback conversion for exotic formats) — the
   prior MIME/box-fetch error causes did NOT reproduce: **0 fetch failures, 0 conversion
   failures** in 2,002 attempts.
3. **Model calls**: AOAI `gpt-5` (key auth, operator account), concurrency 8 under a
   42K-TPM token bucket + 429/5xx backoff; resume-safe JSONL ledger (survived one external
   kill at ~1,730 and resumed with zero rework).
4. **Write-back** (guarded UPDATE — only rows STILL unclassified and not excluded, protecting
   racing live intake/human edits): **1,998/1,998 loaded updates stamped** across **142 cases**,
   one `attachment_classified` audit_event per case with before/after JSON counts.
5. **Status re-evaluation** — the recorded statusForReviewCase SQL parity pattern (terminals
   incl. `done` excluded), audited per move.

## Results

- **Classification split (1,998 ok)**: overview 260 · damage_closeup 752 · additional 585 ·
  non-vehicle "other" 401 (stamped unknown-code + `accepted_for_eva=false`, per the live
  policy). **registration_visible 298** (case-VRM-constrained), **person_reflection 337**
  (excluded with the domain reason — this IS the TKT-123 reflection backfill for these rows).
- **Spend**: **$4.72** (1,908,866 prompt + 232,896 completion tokens; 2,002 calls) — 12% of the
  ~$40 ceiling. Ledger totals computed from per-call `usage`.
- **Status movement** (this pass): `missing_images → ready_for_eva` **4**,
  `needs_review → missing_required_fields` 6, `linked_to_instruction → needs_review` 3.
  **108 cases now pass the EVA image rule** (previously unmeasurable — most rows unclassified).
  After the TKT-133 dedup passes a follow-up re-eval moved 2 more
  (`missing_required_fields → needs_review`); final distribution: needs_review 142 ·
  missing_images 108 · missing_required_fields 78 · **ready_for_eva 27** · error 2 · removed 2.
- **Coverage**: 6,712 image rows total (live-growing), **10 unclassified remain** = the 4
  residuals + rows arriving after enumeration (the live orch classifier stamps new intake).
- **The marker case A.QDOS26029 honestly did NOT flip**: its 28 images classified as 23
  damage-closeups (2 with the registration readable — on close-ups, which the overview rule
  does not accept), 1 additional, 3 non-vehicle, 1 reflection-excluded — **the set genuinely
  contains no vehicle overview shot**, so `missing_images` is the CORRECT status. The
  acceptance's conditional ("passes IF its photos genuinely contain an overview with visible
  registration") resolves to: they don't; the case needs a real overview photo (chaser
  material), not classification. Four OTHER cases did flip to ready_for_eva.
- **Residuals (4, enumerated with cause — `evidence/backfill-residuals.csv`)**: all four are
  **AOAI content-safety refusals of the input image** (2 rows each on A.PCH26013 and
  A.PCH26010); they remain role-unknown for human classification. Not retryable by us.

## Remainders
- The box-upload live-classify path (an image arriving VIA Box at event time) is still not
  wired to the classifier — forward-path candidate under TKT-112's orch-side ownership.
- The 4 content-safety rows need human roles (SPA dropdown works).
- Reflection flags on rows classified BEFORE TKT-123 but not in this pass's target set (already
  role-stamped rows) remain unstamped — a full re-run was out of scope; the flag matters most
  for EVA-order acceptance, which their prior stamps already decided.
