/**
 * NEGATIVE FIXTURE (TKT-261 / PLAN-010) — a synthetic re-implementation of the inventory SHA-256
 * content-hash core OUTSIDE `scripts/checks/content-hash.mjs`. It exists only so the scripts
 * single-source drift guard can prove it FAILS when a generator re-grows its own byte hasher.
 *
 * It is NOT production code, is never imported by production code, and lives under
 * `scripts/checks/fixtures/` so the normal guard run (an explicit real-file allowlist) never scans
 * it. If this file ever stops tripping `check-scripts-dedup.mjs`, the guard has regressed.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// The forbidden pattern: a local direct-byte SHA-256 primitive instead of importing
// createContentHash / sha256File from scripts/checks/content-hash.mjs. All three signals fire —
// the `{ createHash }` crypto import, the `createHash("sha256")` call, and the shadowing local
// `sha256File` declaration.
function sha256File(absolutePath) {
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

export function buildInventoryEntry(absolutePath) {
  return { sha256: sha256File(absolutePath) };
}
