# TKT-150 controlled claimant-remediation runbook

This runbook deploys and executes only TKT-150 claimant remediation. It does **not** perform the final
operational cutover. The spreadsheet-dependent live-folder switch, production EVA API, production Archive
roots, Outlook writes, Graph subscription changes, service pauses, and cutover DDL remain out of scope.

## 1. Fixed safety and artifact boundary

- Run from the exact reviewed TKT-150 commit on current `main`.
- Put every plan, dump, manifest, approval, journal, ledger, raw source, and command transcript in one private
  directory outside every Git repository and linked worktree. The runner resolves symlinks/junctions and
  refuses repository-contained paths.
- Use TLS certificate verification for PostgreSQL. `sslmode=disable`, `allow`, `prefer`, or `require` is
  rejected because it does not verify the server certificate.
- Outlook and production Archive roots are read-only. The only allowed Archive write root is the pinned test
  root `392761581105`; code verifies exact root, Case/PO name, parent, and path before linking a folder.
- Do not call production EVA during this run.

## Execution checkpoint — 2026-07-14

- PR #93 completed the schema/runtime/API/orchestration/Box/parser deployment and its deployment proof.
- PRs #94–#96 changed only the offline remediation runner and tests. Repeat the deployment gate below only if
  reviewed runtime/schema/parser bytes change.
- The latest v8 read-only plan completed with 156 baseline cases but failed its independent audit. It is
  superseded and cannot be approved, backed up as current authority, or applied.
- The initial attempt's dump/restore proof belongs to its superseded plan. V8 has no backup, approval, journal,
  apply, or ledger.
- Before continuing to section 4, a newly generated plan must pass the independent redacted audit and account
  for every exact retained-source binding, including QDOS26079.

Example private PowerShell setup (choose a new timestamped directory):

```powershell
$artifactRoot = Join-Path $env:USERPROFILE 'Documents\CollisionSpike-Private\TKT-150\YYYYMMDD-HHMMSS'
New-Item -ItemType Directory -Path $artifactRoot | Out-Null
```

Never print secrets into the transcript. Load the database, evidence-storage, and parser Function credentials
into the current process from the authorised secret source, then clear them when finished. Required runner
variables are `DATABASE_URL` or the `PG*` set, `EVIDENCE_BLOB_CONNECTION`, `PARSER_FN_URL`,
`PARSER_FN_KEY`, `BOX_FACADE_URL`, and `BOX_FACADE_KEY`.

## 2. Pre-deployment gate and backup

1. Confirm the branch is clean, current commit is reviewed, and `main` equals `origin/main`.
2. Run the full repository/API/orchestration/parser/Box suites and builds recorded in the ticket.
3. Take a deployment safety `pg_dump` before any schema or Function change and hash it. This is separate from
   the later plan-bound authority dump.
4. Apply `migration/assets/schema/deltas/2026-07-14-tkt150-provider-recovery.sql` transactionally.
5. Build and deploy Data API, Box webhook, orchestration, and parser from the same reviewed commit. Do not pause
   intake services.
6. Rerun the idempotent delta after all code is live. This closes the no-pause deployment window: any eligible
   legacy provider hold created during rollout is classified by the second pass.
7. Verify constraints, source choice `100000011`, zero invalid hold reasons, zero non-held rows with a hold
   reason, and zero eligible provider-held rows left with a null reason.
8. Verify the deployed parser `/api/fingerprint` response exactly matches `VENDOR_LOCK.json`, all expected
   Function registrations exist, and the provider-Archive monitor singleton is running.

Stop on any mismatch. Do not generate an apply plan against a mixed or unidentified deployment.

## 3. Freeze the fresh immutable plan

Create the full plan outside Git. A `--case-po` plan is diagnostic only and can never be applied.

```powershell
$plan = Join-Path $artifactRoot 'claimant-plan-v2.json'
node scripts/live/remediate-blank-claimants.mjs `
  --mode plan `
  --environment azure-paas-live-claimant-remediation `
  --out $plan
```

Capture the runner's `rawPlanSha256`, sealed `planSha256`, `runnerSha256`, environment hash, counts, exact
write allowlist, exact status-recompute allowlist, source-failure reasons, and deployed parser fingerprint.
Review the complete plan, including QDOS26079 and every `conflicting`, `absent_in_source`, or `failed` row.
Do not edit or reuse the plan after hashing; rerun planning to create a new artifact instead.

Run the independently reviewed redacted audit helper against that exact raw plan. The audit must prove complete
one-to-one baseline/status accounting, exact retained-source identity, approved reference-set growth, exact
hash/fingerprint bindings, and zero unauthorized write surface. An audit failure supersedes the plan
immediately. Do not proceed to backup or approval.

## 4. Create and prove the plan-bound backup

After the plan is frozen **and its independent audit passes**:

The initial attempt's plan-bound dump is superseded and cannot satisfy this section. V8 did not create a
plan-bound dump. Always create a new backup/restore proof for the exact newly audited plan.

1. Take a PostgreSQL 16 custom-format dump with `--no-owner --no-acl` from the exact planned database.
2. Record the dump byte length and SHA-256.
3. Record source row counts and SHA-256 of a stable `COPY (SELECT to_jsonb(t)::text ... ORDER BY id)` stream
   for `case_`, `field_level_provenance`, and `audit_event`.
4. Restore the dump into a clean local PostgreSQL 16 database.
5. Repeat the three row counts and SHA-256 streams and require exact equality with source.
6. Write `backup-manifest-v1.json` outside Git with:
   - contract `tkt150-claimant-backup-manifest-v1` and the exact plan scope;
   - completion time, plan raw/sealed hashes, environment hash, counts, and exact allowlists;
   - SHA-256 of the sorted repair-case ID array;
   - actual dump SHA-256/byte length; and
   - restore completion time, PostgreSQL major `16`, database name, dump binding, and matching source/restored
     counts plus SHA-256 values for all three tables.
7. Hash the raw manifest bytes. Do not alter the manifest after hashing.

The apply runner independently hashes the supplied dump and rejects a manifest, restore, environment,
allowlist, count, or timestamp mismatch.

## 5. Obtain exact named approval

Present the human approver with the reviewed plan summary, all four plan counts, exact write/status counts,
parser/runner/environment hashes, dump hash/size, restore proof, and backup-manifest raw hash. Approval must be
an external JSON artifact with contract `tkt150-claimant-remediation-approval-v1` that copies the exact plan
scope, environment/runner/plan hashes, counts, allowlists, repair-case ID hash, and backup-manifest raw hash.
It must name the human, contain `approvedAt`, and have a future `expiresAt` after approval.

Do not infer approval from chat tone, fabricate a name, widen an allowlist, or apply after expiry. A changed
plan, runner, deployment, environment, or backup requires a new backup/restore proof and new approval.

## 6. Apply claimant-only remediation

```powershell
$backupManifest = Join-Path $artifactRoot 'backup-manifest-v1.json'
$dump = Join-Path $artifactRoot 'collisionspike-plan-bound.dump'
$approval = Join-Path $artifactRoot 'approval-v1.json'
$ledger = Join-Path $artifactRoot 'claimant-ledger-v2.json'
$journal = Join-Path $artifactRoot 'claimant-journal-v2.jsonl'

node scripts/live/remediate-blank-claimants.mjs `
  --mode apply `
  --environment azure-paas-live-claimant-remediation `
  --plan $plan `
  --plan-sha256 '<raw-plan-sha256>' `
  --backup-manifest $backupManifest `
  --backup-manifest-sha256 '<raw-backup-manifest-sha256>' `
  --backup-artifact $dump `
  --approval $approval `
  --journal $journal `
  --out $ledger
```

The only permitted case writes are fill-if-blank `eva_claimant_name` and durable status-recompute request
fields for the sealed per-case allowlists, plus claimant provenance and TKT-150 audit events. A changed case,
source byte/body, staff claimant, runner/environment identity, or authority artifact fails closed. The apply
does not call the parser again: it is bound to the frozen plan's parser fingerprint and revalidates the exact
retained source bytes/body before writing. Keep the append-only journal if the run stops; never hand-edit it or
the final ledger.

## 7. Post-apply verification

1. Require a complete ledger contract/hash and one result for every baseline row.
2. Recount every active blank claimant and require every baseline/new residual to have an actionable
   classification. A blank claimant must be Not Ready, never Review.
3. Confirm every repaired row has claimant source provenance, before/after audit, and completed canonical
   status generation.
4. Confirm conflicts remain visible and staff/current values were not overwritten.
5. Confirm provider-recovery proof uses only pinned test root `392761581105`; verify exact folder name,
   parent/path, case link, hold clearance, and status generation. Do not switch to production roots.
6. Independently exercise one authorised fresh case per repaired failure family across create, merge, exact
   replay, and later-document handling. No production EVA call is required or allowed.
7. Give the external plan/backup/approval/journal/ledger hashes and redacted aggregate evidence to the
   independent ticket verifier. Only the dispatcher may transcribe the verdict and move `verify` to `done`.

If any live acceptance remains pending, leave TKT-150 in `now` and retain the exact actionable reason.
