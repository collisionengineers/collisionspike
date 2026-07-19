# Changes — TKT-258: Extract one shared hash and inventory core

## Status

Implemented on branch `plan010/scripts-dedup`.

## What changed

- **New `scripts/checks/content-hash.mjs`** — one incremental SHA-256 content-hash
  primitive plus byte and file helpers, all built on a single `createHash("sha256")`:
  - `createContentHash()` — incremental hasher (`update(chunk)` / `digestHex()`), fed the
    streamed `git cat-file --batch` blob chunks and, via the helpers, every other source.
  - `sha256Bytes(bytes)` — direct in-memory bytes (symlink targets).
  - `sha256File(absolutePath)` — filesystem read-stream chunks.
- **`scripts/maintenance/generate-repository-inventory.mjs`** — dropped its local
  `sha256File`, its inline `createHash("sha256")` in the git-blob path, and its direct-byte
  symlink hash; now imports the three helpers from the shared primitive. `readGitBlobMetadata`
  (imported by `reconcile-repository-reset.mjs`) keeps its signature and is unchanged apart
  from delegating the hash to `createContentHash()`. Already used the shared
  `normalizeRepositoryPath`.
- **`scripts/maintenance/generate-checkout-inventory.mjs`** — dropped its local `sha256File`,
  its direct-byte symlink hash, and its local `normalize`; now imports `sha256Bytes` /
  `sha256File` from the primitive and `normalizeRepositoryPath` from the single shared source.
- **New `scripts/checks/content-hash.test.mjs`** — proves identical SHA-256 for the same
  bytes as one buffer, as multiple git-blob-style chunks (boundaries inside multibyte
  sequences), and as a filesystem stream; plus NIST "abc" and empty-string known answers.

## Not touched (by design)

- `reconcile-repository-reset.mjs` — left on the `readGitBlobMetadata` reader it already
  imports; not restructured.
- The three intentionally-divergent classification maps (pre-reset / current tracked tree /
  physical checkout) — left intact and separate.
- Sibling scripts (`evidence-catalog.mjs` keeps its own synchronous `sha256File`), data
  authority, hygiene. No live/cloud writes.

## A6 — structural delta (nonblank lines, check-source-size logic)

| File | Before | After | Delta |
|---|---|---|---|
| `generate-repository-inventory.mjs` | 474 | 468 | −6 |
| `generate-checkout-inventory.mjs` | 172 | 164 | −8 |
| core generators combined | 646 | 632 | **−14** |
| `content-hash.mjs` (new shared primitive) | 0 | 33 | +33 |
| `content-hash.test.mjs` (new) | 0 | 73 | +73 |

Owned source files: 955 → 957 (+2). Duplicated hashing/normalisation logic collapsed from
two `sha256File` copies + two direct-byte hash sites + one local `normalize` into one shared
module; net non-test source +19 lines but the hashing surface now lives in exactly one place.
