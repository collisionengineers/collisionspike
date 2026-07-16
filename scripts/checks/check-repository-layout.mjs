#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const allowedRootFiles = new Set([
  ".gitattributes",
  ".gitignore",
  ".infisical.json",
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md",
  "LIVE_FACTS.json",
  "README.md",
  "package-lock.json",
  "package.json",
  "skills-lock.json",
  "tsconfig.json",
  "verify-all.mjs",
]);

const allowedRootDirectories = new Set([
  ".agents",
  ".claude",
  ".codex",
  ".cursor",
  ".github",
  ".vscode",
  "apps",
  "contracts",
  "database",
  "docs",
  "emailevals",
  "infrastructure",
  "packages",
  "scripts",
  "services",
  "tests",
  "tools",
  "workingspace",
]);

const requiredPaths = [
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
  "scripts/checks/check-runtime-contract.mjs",
  "scripts/checks/check-production-dependencies.mjs",
  "scripts/maintenance/generate-checkout-inventory.mjs",
  "scripts/maintenance/reconcile-repository-reset.mjs",
  "services/data-api/package.json",
  "services/orchestration/package.json",
  "tests/fixtures/manifests/evidence.json",
  "tools/README.md",
  "workingspace/aifirstplan.txt",
];

const forbiddenSegments = new Set([
  ".artifacts",
  ".cache",
  ".pytest_cache",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules",
]);

export function validateTrackedPaths(paths) {
  const normalized = [...new Set(paths.map((value) => value.replaceAll("\\", "/")))].sort();
  const present = new Set(normalized);
  const issues = [];

  for (const repositoryPath of normalized) {
    const segments = repositoryPath.split("/");
    const root = segments[0];
    if (segments.length === 1) {
      if (!allowedRootFiles.has(root)) issues.push(`disallowed root file: ${repositoryPath}`);
    } else if (!allowedRootDirectories.has(root)) {
      issues.push(`disallowed top-level directory: ${root} (${repositoryPath})`);
    }

    const blocked = segments.find((segment) => forbiddenSegments.has(segment));
    if (blocked) issues.push(`tracked generated/dependency segment '${blocked}': ${repositoryPath}`);
  }

  for (const requiredPath of requiredPaths) {
    if (!present.has(requiredPath)) issues.push(`required path is not tracked: ${requiredPath}`);
  }

  return issues;
}

function trackedPaths() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function main() {
  const paths = trackedPaths();
  const issues = validateTrackedPaths(paths);
  if (issues.length) {
    console.error("Repository-layout check failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Repository-layout check passed for ${paths.length} tracked paths.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
