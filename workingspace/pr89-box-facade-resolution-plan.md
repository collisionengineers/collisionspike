# Resolve the Box facade collision & land PR #89 (TKT-034 archive adoption)

## Context

Two PRs are open. **#100 (`codex/plan-006-repository-reset`, "PLAN-006: reset repository structure and
documentation", ~3,214 files) is the large one — out of scope for now** (deferred). The in-scope work is
**PR #89** — `codex/tkt-034-archive-adoption` (TKT-034), head `3ffe81ec`, merge-base with `main`
`f419e315`. Everything else is already merged (PR #87 delete-case-image at `4f33b283` = current `main`).

#89 adds archive-holding folder adoption (route unmatched images by registration, idempotently adopt the
holding folder into the Case/PO) plus Box mutation primitives. When rebased onto post-#87 `main` it
**collides on the Box facade** with #87's now-live delete capability. Resolving that collision cleanly —
without weakening #87's live destructive-delete safety — is the immediate task; landing #89 dark is the
container. Its ticket (folder `docs/tickets/now/TKT-034-images-received-routing` — the branch/PR slug says
"archive-adoption", the folder says "images-received-routing"; same id, don't guess the slug for
`ticket-move`) stays PENDING (no live proof) and must **not** be advanced to `done` on a dark merge.

> **"Dark" here means NOT-DEPLOYED, not env-gated (verified against LIVE_FACTS).** The three gates
> fronting `adoptArchiveHolding` — `BOX_REG_FOLDER_ENABLED`, `BOX_API_ENABLED`,
> `BOX_FOLDER_AT_INTAKE_ENABLED` — are **already `true`** on `cespk-orch-dev`. So merging is safe (code
> only), but the converged delete becomes **live-callable the moment the regenerated `deploy/orch/main.cjs`
> is deployed** (and the box-webhook Python routes the moment that app is `func publish`ed). Do **not**
> deploy either artifact on the strength of the gate guard; treat deploy as the real dark boundary. Also
> confirm `BOX_ALLOWED_ROOT_ID` remains set on `cespk-orch-dev` (fail-closed) — the converged delete
> hard-requires it (see below).

## The Box facade collision — RESOLVED DESIGN (the core of this task)

**Two collisions**, both under `functions/box-webhook/`, verified against `origin/main` + the #89 branch:

1. `box_client.py` — two `def delete_file`. #87 **live**: `delete_file(file_id, *, expected_folder_id)`
   — fresh re-fetch, assert parent == `expected_folder_id` **and** under the RW root, then
   `DELETE /2.0/files/{id}`; already-missing is idempotent success. #89: `delete_file(file_id)` —
   `_assert_in_scope("files", file_id, fresh=True)` (scope-root only, **no parent pin**) then delete.
   Python keeps the **last** def, silently clobbering the other.
2. `function_app.py` — two route-template collisions (Azure Functions Python v4 `@app.route`):
   - `box/files/{fileId}` — main `file_deletion` `[GET,DELETE]` vs #89 `delete_file` `[DELETE]`.
   - `box/folders/{folderId}` — main `get_folder` `[GET]` vs #89 `mutate_folder` `[PATCH,DELETE]`.

**Decisive fact (why convergence is safe, with zero relaxation):** at #89's delete call site
(`orchestration/src/functions/archiveHolding.ts` → `deps.deleteFile(file.boxFileId)`) the parent folder
id is **already in scope** as `claim.holdingFolderId`, and every deleted source is by construction a
direct child of that one folder (it is the not-moved dedup source still sitting in the holding folder).
`ArchiveHoldingFile` carries no parent field, but the enclosing `claim` supplies `holdingFolderId`. So
#89 can adopt #87's **stronger** parent-pinned contract — the only missing piece is a wire channel to
carry the folder id. (The delete call site is `archiveHolding.ts:85`, inside the `deduplicate &&
!recoveredMove` branch; `deleteFolder(claim.holdingFolderId)` runs **last** after the file loop, so on a
partial-failure resume the holding folder is still present and the pin never spuriously fails —
replay-safe.) **Two new couplings this introduces, not "losing nothing":** (1) the converged delete
**hard-requires `BOX_ALLOWED_ROOT_ID` to be set** (`validate_file_deletion` raises "file deletion requires
a configured read-write root" when unset), whereas #89's original delete no-op'd scope when unset — a new
operational dependency (satisfied live today: root-lock = `392761581105`); (2) the pin depends on holding
folders being **flat** (held images are direct children) — true for the one-flat-folder-per-registration
layout, but it is the silent invariant.

**Resolution — converge onto ONE canonical, stronger primitive (best practice):**

- **`box_client.py`** — keep #87's pinned `delete_file(file_id, *, expected_folder_id)` as the **sole**
  file-delete method; **delete #89's single-arg `delete_file` entirely**. Box exposes one
  `DELETE /2.0/files/{id}`; the facade mirrors it with one method. This *strengthens* #89's deletes (they
  gain the exact-parent guarantee) and conforms to the house keyword-pin style already used by
  `delete_file_request` and `move_file`'s destination pin. Keep #89's net-new `rename_folder`,
  `move_file`, `delete_empty_folder` (distinct names, no collision).
- **`function_app.py`** — keep main's `file_deletion` `[GET,DELETE]` **byte-for-byte**; remove #89's
  `delete_file` route. **Merge** `get_folder` `[GET]` + `mutate_folder` `[PATCH,DELETE]` into one
  **`folder_lifecycle` `[GET,PATCH,DELETE]`** dispatching on `req.method` (GET→`get_folder`,
  PATCH→`rename_folder`, DELETE→`delete_empty_folder`) — matching the established house convention (one
  function per path, dispatch on method, exactly like `file_request_lifecycle` GET/PUT/DELETE; #89's own
  `mutate_folder` already uses that style). Restore the main-only routes #89's stale base dropped
  (`verify_write_scope`; `get_folder` now folded into `folder_lifecycle`). Keep #89's `move_file` `[POST]`
  on `box/files/{fileId}/move` (no collision).
- **`orchestration/src/lib/functions-client.ts`** — two edits, not one: (a) `deleteFile(fileId)` →
  `deleteFile(fileId, folderId)` building `DELETE box/files/${fileId}?folderId=${folderId}` — same wire
  shape as #87's api-side `deleteBoxFile(fileId, expectedFolderId)` (param named `expectedFolderId`, wire
  **query key `folderId`**) in `api/src/lib/functions-client.ts`; **and (b) union in main's `getFolder`
  method** (this file is a real rebase conflict on both sides — main added `box.getFolder`, #89's tree has
  none). Main's `orchestration/src/functions/gated/box-folder-create.ts:90` calls `deps.getFolder(...)`
  and is auto-carried unchanged by the rebase, so dropping `getFolder` breaks the orch build. `getFolder`
  is also the client half of the `folder_lifecycle` GET route being restored.
- **`orchestration/src/functions/archiveHolding.ts`** — `deps.deleteFile(file.boxFileId)` →
  `deps.deleteFile(file.boxFileId, claim.holdingFolderId)`; update the `deps` type + any test mocks.
- **`functions/box-webhook/tests/test_scope_lock.py`** — adapt #89's single-arg `delete_file("gone")`
  test(s) to the pinned signature, preserving the already-missing→idempotent intent against #87's actual
  404 handling; keep the rename / move / delete-empty tests.

**Why this over the alternatives:** an *optional* `expected_folder_id=None` unify reintroduces a footgun
(a future caller silently gets the weaker check by omitting the arg); keeping two distinctly-named
methods/routes duplicates one Box operation and still leaves the folder-route collision unsolved.
Convergence removes the duplication, keeps the **live** #87 contract untouched, strengthens #89, conforms
to house style, and never relies on the repo-undocumented question of whether Azure Functions Python v4
permits two functions on one route template with disjoint methods.

## The rest of the #89 rebase (non-Box surfaces)

After the Box facade is resolved, complete the rebase of #89 onto current `origin/main`:

- **`api/src/functions/cases.ts`** — #89's actual change is **additive**: it inserts a new sibling
  function `reconcileMergeArchiveHolding` and adds **one call to it inside `mergeCases`** (returns 409 on a
  holding conflict). It does **not** edit `mergeEvidenceRows` or `reconcileMergeFileRequestIntent` — those
  are only the **textual-adjacency conflict surface** against #87's main-side edits. So resolve as an
  additive union that keeps #87's evidence-delete blocks in `mergeCases` **and** grafts in #89's
  `reconcileMergeArchiveHolding` + its call (never ours/theirs whole-hunk; API vitest is the check).
- **`orchestration/src/functions/intakeOrchestrator.ts`** — #89-only conflict (evidence-disjoint).
- **`migration/assets/schema/900_constraints.sql` — MERGE MAIN-BASED, NOT #89-BASED (highest-severity
  trap).** #89's file is stale: it puts `evidence` **back inside** the generic admin-only no-delete loop
  and has **no** `p_evidence_scoped_delete` / `complete_evidence_deletion` block, and it also predates
  main's `capture_*`, `mcp_*`, `capture_session_resume_token`, and TKT-152 immutable-lookup RLS additions.
  A "theirs"/whole-file take (or "take #89 and patch the evidence block back") silently reverts #87's
  **live** destructive-delete posture *and* drops all those other live RLS — with **green offline gates**,
  because nothing offline exercises the live RLS delete path. Correct procedure: **start from main's
  `900_constraints.sql`, add exactly the four `archive_holding_folder/intake/file/deferred_intake` tables
  to the generic ENABLE-RLS loop array, change nothing else**, then **read the rendered evidence block
  back byte-for-byte** to confirm `p_evidence_scoped_delete` RESTRICTIVE + the `complete_evidence_deletion`
  SECURITY DEFINER seam survive and `evidence` is still OUT of the generic loop. If that can't be shown by
  reading the block, STOP — never guess the security posture.
- **`197_archive_holding.sql` + its delta + `050_case.sql`** — additive; no evidence/audit work.
- **One must-fix from review:** `adoptArchiveHolding` in `archiveHolding.ts:51` guards only on
  `gates.boxApi() || gates.boxFolderAtIntake()` and omits `gates.boxRegFolder()` (the gate **already
  exists**, `packages/domain/src/gates.ts:141` = `BOX_REG_FOLDER_ENABLED`; it is just unwired here, unlike
  its siblings `imagesUnmatched.ts`/`archive-holding-monitor.ts`). Wire it in — correct defense-in-depth
  hygiene. **But note:** all three gates are live-`true`, so this does **not** keep the path dark on its
  own; not-deploying does (see Context banner). Fixing it is required for correctness, not as the dark
  mechanism.
- **Ticket records** — keep TKT-034 consistent; do **not** promote to `done` on a dark merge; move status
  folders only via `scripts/ticket-move.mjs`. Strip any retired reciprocal-review / phantom-test-suite
  refs from `verification.md`/`changes.md`; file follow-up tickets (next ids after TKT-208) for any
  inherently-live gaps.
- **Bundles LAST** — regenerate `deploy/orch/main.cjs` (and `deploy/api/main.cjs` if `cases.ts` changed)
  via `node build-orch.cjs` / `node build-api.cjs`; never hand-merge a `deploy/*.cjs` conflict marker.

## Gates, verification & merge

- **Box collision specifically:** exactly one `def delete_file` in `box_client.py`; grep shows no bare-id
  `deleteFile(` / single-arg `delete_file(` caller remains; box-webhook pytest green (provision
  `functions/box-webhook/.venv`, else flag the facade lands uncovered) — box-webhook is a **separate
  Python v2 Function App** deployed independently via `func azure functionapp publish` (NOT in the esbuild
  bundles), so **pytest is its only automated proof**; orch vitest green (archiveHolding + functions-client,
  incl. the restored `getFolder`).
- **Green bar before push/merge:** run the suites directly (Windows `verify:offline` is broken — the seven
  `npm run …` workspace steps spawn `npm` not `npm.cmd` → ENOENT; the node-script steps survive) —
  domain/api/orch/SPA builds, api + orch vitest, `check-tickets`, `check-doc-links`.
- **Bundle smoke (orch/api only):** after regen, `node -e "require('./deploy/orch/main.cjs')"` (and api)
  must **load without throwing** — a dropped `import.meta.url` banner makes the `createRequire` load throw
  (the "0 functions" regression). Treat success as "loads clean," not a literal function enumeration; do
  not push on a throw.
- **Merge:** rebased onto current `origin/main`, zero open must-fix, gates green on the exact pushed head,
  bundles regenerated from that head, ticket not advanced to `done`. Then `--force-with-lease` push,
  confirm PR shows MERGEABLE + CI green, auto-merge (merge commit) dark, delete branch.

## Stop conditions (pause and report, do not merge)

- The main-based `900_constraints.sql` merge can't be shown (by reading the rendered block) to preserve
  #87's evidence DELETE-posture invariant AND main's other post-branch RLS (`capture_*`, `mcp_*`,
  `capture_session_resume_token`, TKT-152) while adding the four `archive_holding_*` tables — never guess a
  security posture; a #89-based take silently reverts all of it with green offline gates.
- box-webhook pytest can't run (no `.venv`) so the delete convergence lands uncovered; or a bundle
  regenerates to 0 functions.
- A review BLOCKER needs a design decision beyond the diff (a real retry-sweeper subsystem, etc.) — file
  a P0 follow-up; hold unless dark-safe.

At each stop: leave the branch abortable (`git rebase --abort`; `origin/codex/tkt-034-archive-adoption`
ref is intact at `3ffe81ec`), surface the exact hunks + both intents, give 2–3 concrete options.

## Critical files

- `functions/box-webhook/box_client.py` + `function_app.py` — the delete-facade convergence (this task's core).
- `orchestration/src/functions/archiveHolding.ts` + `orchestration/src/lib/functions-client.ts` — thread `folderId` + kill-switch.
- `api/src/functions/cases.ts` — adoption union.
- `migration/assets/schema/900_constraints.sql`, `197_archive_holding.sql` — RLS DELETE-posture preservation + additive tables.
- `build-orch.cjs` / `build-api.cjs` → `deploy/{orch,api}/main.cjs` — bundle regen + smoke.
- `functions/box-webhook/tests/test_scope_lock.py`, orch vitest — coverage of the converged delete.
