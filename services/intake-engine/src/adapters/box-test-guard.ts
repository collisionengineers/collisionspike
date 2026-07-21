/* ============================================================
   intake-engine — THE single Box-folder-creation safety primitive.

   This package has ZERO live Box/Graph SDK dependencies. `ensureArchiveFolder` is pure
   logic plus ONE guarded pass-through: the actual Box read/create calls are INJECTED
   (an interface, never a live SDK import). It resolves the pinned test-scope root via
   `resolveArchiveRoot()` — which reads tools/box-scope.json's `allowedRoot`, the SAME
   pinned root id (`392761581105`) the rest of this repo's Box tooling already enforces
   (see .claude/hooks/box-scope-lib.mjs) — and asserts it BEFORE calling either injected
   client method. Any mismatch throws immediately; no Box call happens.

   Written so it is IMPOSSIBLE to reach `boxClient.getFolder`/`createFolder` without
   first passing the root assertion: there is exactly one code path through this
   function, and the assertion is the first statement on it.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// services/intake-engine/src/adapters -> repo root -> tools/box-scope.json
const DEFAULT_BOX_SCOPE_PATH = resolve(HERE, '..', '..', '..', '..', 'tools', 'box-scope.json');

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
  /** Override the box-scope.json path — TEST USE ONLY, so this module's own tests
   * don't depend on the file actually existing at the real repo-relative location.
   * Production callers must never set this. */
  scopeConfigPathOverride?: string;
}

/**
 * Reads the pinned allowed Box archive root from tools/box-scope.json. FAILS CLOSED:
 * throws if the file is missing, unreadable, not valid JSON, or missing a non-empty
 * `allowedRoot` string — never silently allows an un-pinned root.
 */
export function resolveArchiveRoot(scopeConfigPathOverride?: string): string {
  const path = scopeConfigPathOverride ?? DEFAULT_BOX_SCOPE_PATH;

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`box-test-guard: cannot read Box scope config at ${path}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`box-test-guard: Box scope config at ${path} is not valid JSON: ${(err as Error).message}`);
  }

  const allowedRoot = (parsed as Record<string, unknown> | null)?.allowedRoot;
  if (typeof allowedRoot !== 'string' || allowedRoot.length === 0) {
    throw new Error(`box-test-guard: Box scope config at ${path} has no non-empty "allowedRoot" string`);
  }
  return allowedRoot;
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
  const pinnedRoot = resolveArchiveRoot(opts.scopeConfigPathOverride);
  const targetParent = opts.parentFolderId ?? pinnedRoot;

  if (targetParent !== pinnedRoot) {
    throw new Error(
      `box-test-guard: refusing to create/find folder under "${targetParent}" — pinned test root is "${pinnedRoot}"`,
    );
  }

  await boxClient.getFolder(pinnedRoot);
  return boxClient.createFolder(pinnedRoot, name);
}
