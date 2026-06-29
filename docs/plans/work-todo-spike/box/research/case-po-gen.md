# Case/PO generation research

## Ticket

Source stub: `docs/plans/work-todo-spike/box/case-po-gen.md`

The ticket asks to confirm that Case/PO generation can find the latest Case/PO. If the provider exists in the database, use the database history. If not, look up the most recent Box folder and add one.

## Short finding

Current source has a Case/PO formatter, not a safe allocator.

`suggestCasePo` formats `principal + YY + sequence`, but callers are not passing a live sequence and it defaults to `001`. Automated email intake currently creates cases without `case_po`, and manual intake lets staff type a value. The database only indexes `case_po`; it does not enforce uniqueness or manage per-provider/year sequences.

## Evidence

- `case_.case_po` exists but is only a plain column with an index: `migration/assets/schema/050_case.sql:20-22`, `migration/assets/schema/050_case.sql:108-112`.
- No unique constraint for `case_po` appears in the schema constraints file: `migration/assets/schema/900_constraints.sql`.
- Provider principal code is the intended prefix source: `migration/assets/schema/010_work_provider.sql:15`.
- The pure formatter explains the desired shape, then defaults `nextSeq` to `1`: `packages/domain/src/model/intake.ts:119-160`.
- The formatter comment still says the next provider sequence came from the old live flow: `packages/domain/src/model/intake.ts:138-140`.
- The submit dialog calls `suggestCasePo(c)` without a live `nextSeq`, so it will show `001` unless this is replaced by server data: `mockup-app/src/screens/EvaSubmitDialog.tsx:225-233`.
- Manual intake requires a typed Case/PO and posts it to `createCase`: `mockup-app/src/screens/ManualIntake.tsx:564-601`.
- The manual API create path stores a supplied `casePo`, but does not allocate or check the next sequence: `api/src/functions/cases.ts:215`.
- Automated email intake creates `case_` rows in `internalCasesResolve` without writing `case_po`: `api/src/functions/internal.ts:349-383`.
- The Box facade can list folder items under a folder id: `orchestration/src/lib/functions-client.ts:125-127`, `functions/box-webhook/function_app.py:198-207`, `functions/box-webhook/box_client.py:586-624`.
- Live read-only Azure CLI showed the Box root id is configured as `BOX_FOLDER_ROOT_ID=392761581105` on `cespk-orch-dev`, so a fallback Box folder scan has the required configured root.

## Why it is happening

The legacy design treated Case/PO as a parse-confirm/finalize-time value with a user-editable three-digit sequence. That produced a formatter in the shared domain package and UI affordances around editing the suffix, but the Azure stack does not currently have a server-side allocator.

This matters because the allocator must be authoritative. A browser-local suggestion cannot safely decide the next number when multiple cases may be created concurrently, and a typed manual value can duplicate an existing Case/PO unless the database rejects it.

The Box fallback is also not wired. The code can list Box folder items, but no API route currently:

- computes a provider/year prefix;
- reads max matching `case_.case_po`;
- falls back to Box root folder names when DB history is absent;
- claims the next number transactionally.

## Files affected by a fix

- `api/src/functions/cases.ts` - manual create should call the allocator or validate/claim the supplied Case/PO.
- `api/src/functions/internal.ts` - automated intake should allocate/stamp Case/PO at the chosen case-confirm boundary.
- `packages/domain/src/model/intake.ts` - keep formatter pure, but stop using it as the source of truth for sequence.
- `mockup-app/src/screens/EvaSubmitDialog.tsx` - replace local `suggestCasePo(c)` sequence default with a server preview/claim result.
- `mockup-app/src/screens/ManualIntake.tsx` - move from free text to server-suggested/validated Case/PO, while still allowing controlled override if the business requires it.
- `functions/box-webhook/function_app.py`, `functions/box-webhook/box_client.py`, and `orchestration/src/lib/functions-client.ts` - existing list-folder primitives can support fallback discovery.
- `migration/assets/schema/050_case.sql` and `migration/assets/schema/900_constraints.sql` - need uniqueness and/or sequence-state storage.

## Resolution shape

1. Add a server-side Case/PO allocator route.
   - Input: case id or provider id/principal, target year, optional requested suffix.
   - Output: `principal`, `yy`, `seq`, lowercase EVA form, uppercase folder form, and whether it was claimed or preview-only.
2. Compute DB history first.
   - Normalize `case_po` to uppercase for comparison.
   - Filter by `principal + YY`.
   - Parse the three-digit suffix and find max.
3. Fallback to Box only when DB has no matching provider/year rows.
   - List `BOX_FOLDER_ROOT_ID`.
   - Parse folder names matching the same `principal + YY + NNN` pattern.
   - Use the max suffix as the external baseline.
4. Add concurrency protection.
   - Prefer a `case_po_sequence` table keyed by `principal + yy`, or a transaction/advisory lock around allocation.
   - Add a unique index on normalized non-empty `case_po`.
5. Stamp the claimed Case/PO in the same unit of work that claims the sequence.
   - Automated intake should not leave created cases indefinitely without `case_po` if downstream Box folder names depend on it.
   - Manual intake should validate staff edits before insert/update.
6. Create/reuse the Box folder using the uppercase form.
   - Persist `case_.box_folder_id` and `case_.box_folder_url`.
   - Do not rely on folder name alone once the id is known.

## Risks to handle

- Provider ambiguity: do not allocate a provider-prefixed Case/PO when provider matching is `unmatched` or `ambiguous`.
- Year boundary: define whether the year comes from case creation date, instruction date, or current date. Current formatter uses `case.createdAt` when parseable, otherwise current year.
- Case merge: merging should preserve the target case's Case/PO and avoid reusing the source value.
- Existing duplicates: before adding a unique index, run a duplicate report and decide how to resolve historical collisions.
- Box pagination: folder fallback must page through Box results, not only inspect the first page.
