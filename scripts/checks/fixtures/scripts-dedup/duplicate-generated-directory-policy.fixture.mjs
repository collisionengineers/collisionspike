/**
 * NEGATIVE FIXTURE (TKT-261 / PLAN-010) — a synthetic SECOND definition of the generated-directory
 * policy (the set + predicate) OUTSIDE `scripts/checks/repository-files.mjs`, exactly the drift
 * TKT-259 removed. It exists only so the scripts single-source drift guard can prove it FAILS when a
 * repo-shape check re-hard-codes the generated-directory set instead of importing the shared one.
 *
 * It is NOT production code, is never imported by production code, and lives under
 * `scripts/checks/fixtures/` so the normal guard run never scans it. If this file ever stops
 * tripping `check-scripts-dedup.mjs`, the guard has regressed.
 */
import { listRepositoryFiles } from "../../repository-files.mjs";

// The forbidden pattern: a drifted local copy of the policy set AND predicate instead of importing
// generatedDirectorySegment / GENERATED_DIRECTORY_SEGMENTS from repository-files.mjs.
const GENERATED_DIRECTORY_SEGMENTS = new Set([".artifacts", "dist", "node_modules"]);

function generatedDirectorySegment(repositoryPath) {
  const segments = repositoryPath.toLowerCase().split("/");
  return segments.find((segment) => GENERATED_DIRECTORY_SEGMENTS.has(segment)) ?? null;
}

export function violations() {
  return listRepositoryFiles().filter((file) => generatedDirectorySegment(file));
}
