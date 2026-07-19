# Verification — TKT-261: Guard scripts and tooling deduplication

## Verdict

TESTED (offline) — the single-source drift guard is in place, passes the current tree, and fails a
synthetic re-duplication. Verified on branch `plan010/scripts-dedup`, 2026-07-19.

## Evidence

- **Guard exists (A1).** `scripts/checks/check-scripts-dedup.mjs` is AST/import-aware (parses with the
  TypeScript compiler, TKT-251 pattern) — `createHash("sha256")` in a comment/string is never flagged, and
  an import binding is distinguished from a local re-declaration. It asserts two single-source invariants:
  (1) the inventory content-hash core is imported from `scripts/checks/content-hash.mjs`, not re-implemented
  (no local `createHash("sha256")` / `sha256File` / direct-byte hash in the inventory/checkout generators or
  the two repo-shape checks; intentionally-independent siblings such as `evidence-catalog.mjs` /
  `reconcile-repository-reset.mjs` are out of scope); (2) `GENERATED_DIRECTORY_SEGMENTS` and
  `generatedDirectorySegment` are defined once in `repository-files.mjs` and imported, not re-declared, by
  `check-repository-layout.mjs` / `check-tracked-outputs.mjs`.
- **Guard passes the current tree:** `npm run check:scripts-dedup` → PASS ("5 shared-internals consumer(s)
  checked; inventory hash core and generated-directory policy each single-source"), exit 0.
- **Negative fixtures (A3-equivalent):** `scripts/checks/fixtures/scripts-dedup/` — a re-implemented hash
  core (4 findings) and a duplicated generated-directory policy (3 findings); both fail. The fixtures live
  under `fixtures/` so the normal run never scans them; the unit test points the analyzers at them.
- **Wired into the aggregate gate (A4):** `verify-all.mjs` line 66 (`Scripts single-source drift`) and
  `package.json` (`check:scripts-dedup`); the unit test is covered by the `scripts/checks/*.test.mjs` glob.
- **Unit test:** `node --test scripts/checks/check-scripts-dedup.test.mjs` → 10/10 pass (tree-pass, AST
  precision on both surfaces, both negative fixtures, plus the three coverage cases added at review
  remediation below).
- `npm run check:runtime-contract` unchanged (191 routes); `npm run check:source-size` PASS. No live write.

## Remediation (2026-07-19, PR #121 review)

Three bypass paths in the guard were closed and covered by tests, so the single-source invariants can no
longer be evaded:

- **Path-normalisation half of A1 now guarded.** The two inventory generators must import
  `normalizeRepositoryPath` from `repository-files.mjs` (`missing-shared-path-import`), and a local
  re-declaration of `normalizeRepositoryPath` / `normalizePath` is flagged (`reimplemented-inventory-core`)
  — previously only the SHA-256 hash import was contracted.
- **One-shot hash detection.** The Node one-shot `hash("sha256", …)` API and a `{ hash }` import from
  `node:crypto` are now flagged alongside `createHash("sha256")`, so a generator cannot re-hash by the
  newer API.
- **Predicate required, not just the set.** A generated-directory consumer must import
  `generatedDirectorySegment` specifically; importing only the raw `GENERATED_DIRECTORY_SEGMENTS` set and
  rebuilding the matcher locally is now flagged (`missing-generated-directory-import`).

The guard still PASSES the current tree (`npm run check:scripts-dedup` → PASS, 5 consumers checked).

## Pending / gaps

None.

## How to re-verify

`npm run check:scripts-dedup` (PASS), `node --test scripts/checks/check-scripts-dedup.test.mjs` (7/7), and
confirm `verify-all.mjs` invokes the guard.
