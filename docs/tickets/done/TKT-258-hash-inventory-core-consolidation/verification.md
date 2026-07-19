# Verification — TKT-258: Extract one shared hash and inventory core

## Verdict

PASS — output-preserving. Verified on branch `plan010/scripts-dedup`, 2026-07-19.

## Evidence

**A1/A4 — single hash + path-normalise source.** `grep` confirms neither inventory generator
retains a `createHash("sha256")`, a local `sha256File`, a direct-byte hash, or a local path
normaliser; both import from `scripts/checks/content-hash.mjs` and
`normalizeRepositoryPath` from `scripts/checks/repository-files.mjs`.

**A2 — byte-identical governance ledgers.** With the two new source files unstaged, regenerated
both ledgers and asserted zero diff:
- `npm run generate:inventory` + `npm run generate:reconciliation` →
  `git diff --quiet docs/governance/repository-inventory.json docs/governance/repository-reconciliation.json` = ZERO.
- `npm run check:inventory` → "Repository inventory is current: 1114 directories, 3694 files."
- `npm run check:reconciliation` → "3268 baseline files, 3692 final files, 0 unexplained."
- `npm run check:tree` → reconciles to the ledgers.

**Checkout generator (ephemeral, non-ledger).** Full physical-checkout walk is inherently
non-deterministic (`.git/worktrees/`, packs, index churn — 144 lines differ even NEW-vs-NEW).
A per-entry comparison of the HEAD generator vs the refactored generator, excluding `.git/`
churn and the output self-entry, found **0 added, 0 removed, 0 changed** real entries.

**A5 — primitive equivalence tests.** `node --test scripts/checks/content-hash.test.mjs` →
3 pass / 0 fail (one-buffer == git-blob-style chunks == filesystem stream; NIST "abc" and
empty-string known answers). Generator modes pinned by the existing suites, both still green:
`generate-repository-inventory.test.mjs` (12→ index-blob / physical / immutable) and
`reconcile-repository-reset.test.mjs` (exercises the shared `readGitBlobMetadata`).

**A3 — divergent maps intact.** `reconcile-repository-reset.mjs` and the three classification
policies untouched.

**A6 — structural delta.** Recorded in [changes.md](./changes.md): core generators 646 → 632
nonblank (−14); shared primitive +33; test +73; owned source 955 → 957.

**A7 — no live write.** Local file edits and local ledger regeneration only.

## Other checks

- `npm run check:source-size` → passed for 957 owned source files (limit 800, 0 ratchets).
- `node scripts/checks/check-repository-layout.mjs` → passed for 3694 tracked paths.

## Pending / gaps

None. Refactor is structure-only; generated output preserved.
