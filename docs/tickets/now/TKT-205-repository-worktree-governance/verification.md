# Verification — TKT-205: Make ticketed worktrees and offline checks the repository workflow

## Verdict
PENDING

## Evidence needed

Record the fixture lifecycle tests, offline verification output, draft-PR publication proof, removal refusal/approval proof and the first weekly hygiene report against the final implementation.

## Current offline evidence

- `node scripts/check-tickets.mjs` and `node scripts/check-doc-links.mjs` passed after staging the new ticket records.
- `npm run test:data-authority`, JavaScript syntax checks and `node scripts/worktree.mjs doctor TKT-205` passed.
- **2026-07-15 (post-review):** `node --check` passes for `worktree.mjs`, `repository-hygiene.mjs`,
  `verify-offline.mjs`, `hooks/pre-push` and both new test files. `npm run test:worktree-governance`
  passes **10/10** (`node:test`, isolated git fixtures, offline) — covering the create guard/rejection
  matrix, the `mkdirSync` non-crash regression, `remove` refusal, and the pre-push `refs/heads/main`
  refspec block + fallback. `node scripts/repository-hygiene.mjs` emits valid JSON and exits non-zero only
  on real pre-existing findings (stray local branches).
- Full offline build/test evidence is pending a clean dependency installation: the earlier Windows worktree
  `npm ci` stopped at `ENOTEMPTY` while removing generated Fluent icon files. No build/test result was
  inferred from that environment failure.

## Still PENDING (live/signed-in proof)

A real create→publish→remove of one non-production ticket worktree through a draft PR (with captured
branch/lane/hook/CI results), the removal refusal/approval proof, and the first weekly hygiene report — none
of which code review or offline tests can stand in for.
