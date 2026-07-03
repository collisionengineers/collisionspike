# Runbook — NTFS colon-path history purge (fix Windows `git pull`)

> **Executed 2026-07-03.** `main` was rewritten via `git-filter-repo` and force-pushed; the 3 colon
> paths are gone from `main`'s history (verified: fresh-clone scan of `main` alone is empty).
> `feat/work-todo-spike-impl` was deleted from origin per the scope decision below.
> `backup/pre-rewrite-main-20260703` (pre-rewrite `main`, tip `c72b504b71448ae775a6e7fc0a38a1ad53b47f48`)
> was pushed to origin as a safety net and **still contains the 3 colon paths by design** — do not
> fetch/checkout that branch from Windows; it is not needed for normal work and can be deleted after a
> few weeks per the Rollback section. `.gitignore` and `scripts/hooks/pre-commit` were hardened
> (steps 6–7) to block any future colon-bearing path before it's committed. Recovery (step 5) was run
> on this machine's clone; other clones (the Windows machine, `merceralex397-collab`) still need it —
> see that section. GitHub's independently-retained `refs/pull/*/head` refs (see the "Known
> limitation" note below) are unaffected and expected.

## Context

`origin/main` contains 3 committed files whose filename has a literal `:` — Outlook `.eml`
alternate-data-stream export artifacts (e.g. `....eml:OECustomProperty`), added in commit `b6c6dd5`
(2026-06-29). On Windows/NTFS a `:` in a filename is the Alternate-Data-Stream separator, and Git's
`core.protectNTFS` safety check refuses such a path. Confirmed by direct experiment: not just
working-tree checkout, but `git read-tree` (no `-u`) and `git update-index --cacheinfo` — neither of
which ever touches disk — **also** fail with "invalid path," even with `core.protectNTFS=false`
passed inline. There is no config toggle, sparse-checkout, or skip-worktree trick around this. It's a
hard platform block. The only real fix is for these 3 paths to not exist in `main`'s history at all.

A local-only workaround exists on the affected Windows clone (a hand-built commit, `origin/main`'s
tree minus those 3 blobs, via `git mktree`/`commit-tree` plumbing) — it unblocks that one machine but
is not a real fix and doesn't help anyone else. This runbook removes the 3 paths from `origin/main`'s
actual history via `git-filter-repo`, then force-pushes the clean history so every clone can do a
normal `git pull` again.

**Scope decision:** `feat/work-todo-spike-impl` (origin, tip `493433e`) also contains `b6c6dd5` and
is fully merged into `main` — it's dead and serves no purpose, so **delete it from origin** rather
than rewrite-and-resync a second ref.

**Known limitation, not fixable by this runbook:** GitHub independently retains
`refs/pull/29,30,32/head` (verified 2026-07-03 — `refs/pull/30/head` still contains `b6c6dd5`,
confirmed by fetching it directly). These are GitHub-managed refs, not writable/deletable via
`git push`, and not touched by a normal clone/fetch of branches — so they don't block the
Windows-pull goal, but the 3 files are not literally erased from GitHub's backend by this runbook.
Full removal from GitHub's servers would need a GitHub Support request — out of scope here.

## Steps

### 1. Pre-flight backup (read-only object ops, no working-tree touch — can run from Windows)

```sh
git push origin origin/main:refs/heads/backup/pre-rewrite-main-20260703
git bundle create collisionspike-pre-rewrite-backup-20260703.bundle --all
```
Record: `origin/main` tip `3a7e65a9812a3101f129f7cc308daedfcbf858ca`; known-good post-fix tree hash
`190f66beec4db48fe876bc0993df7b54ae0e75a1` (independently computed twice from the local workaround
commit).

> **Execution note (2026-07-03):** by the time this ran, `origin/main` had advanced 2 commits past the
> tip recorded above (this runbook's own commit `644d758`, then `c72b504`), so the tip/tree-hash
> values above were stale before step 1 started. Used the *current* tip
> (`c72b504b71448ae775a6e7fc0a38a1ad53b47f48`) for the backup ref and `--force-with-lease` instead, and
> relied on the diff-based check in step 3 (diff vs. the backup ref shows exactly the 3 deletions)
> rather than the now-inapplicable fixed tree hash. Actual post-rewrite `main` tip: `3d73dde611d2181aa6916fd904c6a1d81f49d6bc`.

### 2. On Linux/WSL2: fresh clone + full-history discovery

**Must live on native ext4** (e.g. `~/rewrite-work`), never under `/mnt/c/...` — DrvFs enforces the
same NTFS colon rule and reproduces the exact block.

```sh
mkdir -p ~/rewrite-work && cd ~/rewrite-work
git clone https://github.com/collisionengineers/collisionspike.git collisionspike-rewrite
cd collisionspike-rewrite

git log --all --pretty=format: --name-only | sort -u | grep ':' | tee ../colon-paths-diffbased.txt
git rev-list --objects --all | cut -d' ' -f2- | sort -u | grep ':' | tee ../colon-paths-treewalk.txt
```
Both must list exactly the 3 known paths (the full set across 277 reachable commits as of
2026-07-03) and nothing else. If they disagree or list anything unexpected, stop and investigate
before proceeding.

### 3. Rewrite with `git-filter-repo`

```sh
python3 -m pip install --user git-filter-repo
git filter-repo --version

git filter-repo --invert-paths \
  --path 'docs/plans/work-todo-spike/pdf-image-extraction/New Inspection Instruction.eml:OECustomProperty' \
  --path 'test-cases-and-data/e-mail-examinations/knightsbridge1/our ref 506114 .eml:OECustomProperty' \
  --path 'test-cases-and-data/e-mail-examinations/oakwood1/Oakwood Scotland Solicitors- Instructions.eml:OECustomProperty' \
  --path-regex ':'
```
(`--path-regex ':'` is defense-in-depth beyond the 3 explicit paths.) Expected, not a failure:
filter-repo removes the `origin` remote and rewrites every locally-visible ref including
`refs/remotes/origin/feat/work-todo-spike-impl` — harmless, since that branch gets deleted, not
re-pushed, per the scope decision above.

**Verification (must all pass before touching origin):**
```sh
git log --all --pretty=format: --name-only | sort -u | grep ':'      # expect NO output
git rev-list --objects --all | cut -d' ' -f2- | sort -u | grep ':'   # expect NO output
git rev-parse main^{tree}                                            # MUST equal 190f66beec4db48fe876bc0993df7b54ae0e75a1

git remote add origin https://github.com/collisionengineers/collisionspike.git
git fetch origin refs/heads/backup/pre-rewrite-main-20260703
git diff FETCH_HEAD main --stat   # MUST show exactly the 3 file deletions, nothing else
```

### 4. Force-push + post-push verification

```sh
git push origin main --force-with-lease=main:3a7e65a9812a3101f129f7cc308daedfcbf858ca
git push origin --delete feat/work-todo-spike-impl
```
```sh
git ls-remote origin   # main = new SHA, feat/work-todo-spike-impl gone
cd /tmp && git clone https://github.com/collisionengineers/collisionspike.git verify-clone
cd verify-clone && git log --all --pretty=format: --name-only | sort -u | grep ':'   # expect nothing
```
Confirm `.github/workflows/docs.yml`'s `doc-links` job goes green on the auto-triggered run (no SHA
pinning in that workflow, so it's unaffected by the rewrite).

### 5. Recovery on every existing clone

```sh
git fetch origin --prune
git diff --stat origin/main <local-workaround-sha>   # sanity check: expect EMPTY
git checkout main
git reset --hard origin/main               # never `git pull`/merge old main into new — unrelated
                                            # histories; a merge would also re-hit protectNTFS mid-merge
git config core.hooksPath scripts/hooks    # verified unset on the affected Windows clone — fix now
```
The 5 detached-HEAD Codex worktrees under `C:\Users\Alex\.codex\worktrees\*` are unaffected (both
their SHAs predate `b6c6dd5`, unchanged by the rewrite) — no action needed.
**Other collaborator** (`merceralex397-collab`): notify before/at the force-push; same recipe
(`fetch --prune && reset --hard origin/main`, never `pull`).

### 6. `.gitignore` hardening

Root `.gitignore` already ends with:
```gitignore
# WSL/Windows download marker streams (e.g. <file>:Zone.Identifier) — never useful in-repo.
*:Zone.Identifier
*:OECustomProperty
```
Append a catch-all beneath it, since the real failure mode is "any colon," not just these two known
suffixes:
```gitignore

# Defense-in-depth: NTFS interprets ':' in a filename as an Alternate-Data-Stream separator;
# core.protectNTFS then refuses such a path in ANY index or working tree on Windows — not just
# checkout, but even via plumbing (git read-tree, update-index --cacheinfo). No config toggle
# around this. A colon-bearing path reaching a shared branch permanently blocks every Windows
# clone (hit 2026-07-03: 3 Outlook .eml:OECustomProperty exports on main, fixed via a full
# git-filter-repo history rewrite — see docs/plans/runbooks/ntfs-path-history-purge.md).
# Block all colon-bearing filenames, not just known suffixes.
*:*
```

### 7. `scripts/hooks/pre-commit` hardening

Add a new blocking check as the first section (cheap, no Node dependency, runs before the
doc-links check), reusing the existing `STAGED` variable pattern already in the file:
```sh
# --- Windows/NTFS-invalid path gate (BLOCKING) ---
BAD_PATHS="$(printf '%s\n' "$STAGED" | grep ':' || true)"
if [ -n "$BAD_PATHS" ]; then
  echo ""
  echo "pre-commit: BLOCKED — staged path(s) contain a ':' (NTFS-invalid on Windows):"
  printf '%s\n' "$BAD_PATHS" | sed 's/^/  /'
  echo "  Rename the file (no colon) before committing, or bypass once with: git commit --no-verify"
  exit 1
fi
```
Renumber the existing two checks below it; update the header comment to describe all three gates.

## Rollback

**Before force-push:** trivial — the Linux clone is disposable, origin untouched.
**After force-push:**
```sh
git push origin refs/heads/backup/pre-rewrite-main-20260703:refs/heads/main --force
git push origin 493433e4c8e84f1c6e96dfd572863a5830d3e51a:refs/heads/feat/work-todo-spike-impl
```
Every clone needs `fetch --prune && reset --hard origin/main` again afterward. Rolling back also
un-does the Windows-pull fix (would need a local-only plumbing workaround again meanwhile). Keep
`backup/pre-rewrite-main-20260703` for a few weeks before deleting it.

## Verification checklist

- [x] All three grep-for-colon scans (diff-based, tree-walk, on the fresh post-push clone **scoped to
      `main`**) return empty. (Scanning `--all` on a fresh clone also pulls in the retained
      `backup/pre-rewrite-main-20260703` branch, which still contains the 3 paths by design — scope
      the check to `main` specifically, not `--all`.)
- [ ] ~~`git rev-parse main^{tree}` equals `190f66beec4db48fe876bc0993df7b54ae0e75a1`~~ — inapplicable,
      see the step-1 execution note (main had moved on before the rewrite ran).
- [x] `git diff` between the rewritten tip and the `backup/pre-rewrite-main-20260703` ref shows
      exactly the 3 file deletions and nothing else. Confirmed.
- [x] `docs.yml` CI goes green on the post-push run. Confirmed (run 28656425926, headSha `3d73dde6`).
- [ ] Windows clone: `git pull` on `main` succeeds with no errors, `git status` is clean. **Still
      pending — needs the operator to run step 5 on the Windows machine and
      `merceralex397-collab`'s clone.**
