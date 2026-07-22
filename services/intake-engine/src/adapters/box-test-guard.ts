/* ============================================================
   intake-engine — THE single Box-folder-creation safety primitive.

   This package has ZERO live Box/Graph SDK dependencies and ZERO runtime I/O.
   `ensureArchiveFolder` is pure logic plus ONE guarded pass-through: the actual Box
   read/create calls are INJECTED (an interface, never a live SDK import). It resolves
   the pinned test-scope root via `resolveArchiveRoot()` — the compiled-in
   `PINNED_ARCHIVE_ROOT_ID` (`392761581105`), the SAME pinned root id the rest of this
   repo's Box tooling already enforces (see .claude/hooks/box-scope-lib.mjs and
   tools/box-scope.json) — and asserts it BEFORE calling either injected client method.
   Any mismatch throws immediately; no Box call happens.

   Written so it is IMPOSSIBLE to reach `boxClient.getFolder`/`createFolder` without
   first passing the root assertion: there is exactly one code path through this
   function, and the assertion is the first statement on it.
   ============================================================ */

/**
 * The pinned test-scope archive root, COMPILED IN as a literal.
 *
 * This deliberately does NOT read tools/box-scope.json at runtime. The orchestration
 * service ships as a single esbuild bundle (scripts/build/build-orchestration.cjs) with
 * `import.meta.url` rewritten to the bundle's own path, and the bundler copies only
 * host.json — so an `import.meta.url`-relative read of tools/box-scope.json resolves to
 * a path four levels above wwwroot that has never existed on the Function App. A file
 * read here fails closed on EVERY archive-folder call in production while CI stays green
 * (ci.yml only `require`s the bundle, which registers activities without calling this).
 *
 * tools/box-scope.json remains the single source of truth: `box-scope-parity.test.ts`
 * reads it at TEST time — where the repo genuinely exists — and fails if this literal
 * ever drifts from its `allowedRoot`.
 */
export const PINNED_ARCHIVE_ROOT_ID = '392761581105';

/** The shape of Box folder read/create calls this module accepts. Deliberately NOT the
 * live Box SDK's client type — an injected fake/mock satisfies this in tests, a real
 * caller adapts its own SDK client to it. */
export interface BoxFolderClient {
  getFolder(folderId: string): Promise<{ id: string; name: string } | undefined>;
  createFolder(parentFolderId: string, name: string): Promise<{ id: string; name: string }>;
}

export interface EnsureArchiveFolderOptions {
  /** The Box folder id to create/find under. Defaults to the pinned root itself — ANY
   * other value throws (see module doc). Real callers should essentially never set
   * this to anything but the default; it exists so this function still has an
   * explicit assertion point rather than an implicit "trust the caller" root. */
  parentFolderId?: string;
}

/**
 * The pinned allowed Box archive root. Pure — no I/O, so it behaves identically in the
 * repo, in tests, and inside the deployed single-file bundle.
 *
 * Note what this does and does not buy: the assertion below compares a caller-supplied
 * parent (env `BOX_FOLDER_ROOT_ID`, or a persisted `root_folder_id` DB column on the
 * TKT-034 holding path) against this compiled-in literal. That comparison is only
 * meaningful BECAUSE the two sides come from different places — were both sides read
 * from the same env var, the guard would be a tautology.
 */
export function resolveArchiveRoot(): string {
  return PINNED_ARCHIVE_ROOT_ID;
}

/**
 * The one safe way this package ever gets/creates an archive folder. Asserts the
 * target parent folder id against the pinned root BEFORE touching `boxClient` at all;
 * throws immediately on any mismatch — no Box call happens on a mismatch. On a match,
 * it first reads the pinned root via `getFolder` (a defensive existence/reachability
 * check on the root itself — `BoxFolderClient` has no "find child by name" shape, so
 * this is NOT a name-based dedupe; a caller wired to a broken/disconnected fake fails
 * loudly here rather than on `createFolder`), then creates the folder underneath it.
 */
export async function ensureArchiveFolder(
  name: string,
  boxClient: BoxFolderClient,
  opts: EnsureArchiveFolderOptions = {},
): Promise<{ id: string; name: string }> {
  const pinnedRoot = resolveArchiveRoot();
  const targetParent = opts.parentFolderId ?? pinnedRoot;

  if (targetParent !== pinnedRoot) {
    throw new Error(
      `box-test-guard: refusing to create/find folder under "${targetParent}" — pinned test root is "${pinnedRoot}"`,
    );
  }

  await boxClient.getFolder(pinnedRoot);
  return boxClient.createFolder(pinnedRoot, name);
}
