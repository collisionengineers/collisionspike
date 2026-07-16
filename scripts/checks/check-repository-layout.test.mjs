import assert from "node:assert/strict";
import { test } from "node:test";

import { validateTrackedPaths } from "./check-repository-layout.mjs";

const validFixture = [
  ".agents/agents/roles.json",
  ".github/workflows/ci.yml",
  "apps/web/package.json",
  "contracts/README.md",
  "contracts/runtime-contract.approved-deltas.json",
  "contracts/runtime-contract.snapshot.json",
  "database/README.md",
  "docs/README.md",
  "docs/governance/repository-inventory.json",
  "docs/governance/repository-reconciliation.json",
  "infrastructure/README.md",
  "packages/domain/package.json",
  "scripts/build/build-api.cjs",
  "scripts/build/build-orchestration.cjs",
  "scripts/checks/check-production-dependencies.mjs",
  "scripts/maintenance/generate-checkout-inventory.mjs",
  "scripts/maintenance/reconcile-repository-reset.mjs",
  "scripts/checks/check-runtime-contract.mjs",
  "services/data-api/package.json",
  "services/orchestration/package.json",
  "tests/fixtures/manifests/evidence.json",
  "tools/README.md",
  "workingspace/aifirstplan.txt",
];

test("accepts the locked repository roots", () => {
  assert.deepEqual(validateTrackedPaths(validFixture), []);
});

test("rejects an extra source root", () => {
  const issues = validateTrackedPaths([...validFixture, "prototype/app.ts"]);
  assert.ok(issues.some((issue) => issue.includes("disallowed top-level directory: prototype")));
});

test("rejects tracked dependency or build output", () => {
  const issues = validateTrackedPaths([...validFixture, "apps/web/dist/index.js", "node_modules/x/index.js"]);
  assert.ok(issues.some((issue) => issue.includes("'dist'")));
  assert.ok(issues.some((issue) => issue.includes("'node_modules'")));
});

test("rejects a missing deployment entry point", () => {
  const issues = validateTrackedPaths(validFixture.filter((path) => path !== "scripts/build/build-api.cjs"));
  assert.ok(issues.includes("required path is not tracked: scripts/build/build-api.cjs"));
});
