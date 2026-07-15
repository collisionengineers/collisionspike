#!/usr/bin/env node

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePaths, repositoryDirectoriesForFiles } from "../checks/repository-files.mjs";
import {
  gitOutput,
  mediaTypeFor,
  readGitBlobMetadata,
} from "./generate-repository-inventory.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// This commit was main immediately before PLAN-006 began. Unlike a commit that exists only on the
// implementation branch, it remains in main's ancestry after merge, squash, or rebase and does not
// depend on the feature branch continuing to exist. CI fetches full history so this immutable object is
// available without retaining the path-level reset ledger in the checked-out tree.
export const PRE_RESET_COMMIT = "81ae8fdf68b4fd29648d76dc77c379cd98764dbe";
const CURRENT_INVENTORY = "docs/governance/repository-inventory.json";
const DEFAULT_OUTPUT = ".artifacts/audit/repository-reconciliation.json";

const PREFIX_MOVES = [
  ["api/", "services/data-api/"],
  ["functions/", "services/functions/"],
  ["infra/", "infrastructure/"],
  ["migration/", "database/"],
  ["mockup-app/", "apps/web/"],
  ["ocr/", "services/functions/ocr/"],
  ["orchestration/", "services/orchestration/"],
  ["test-cases-and-data/", "tests/fixtures/"],
  ["docs/workingspace/", "workingspace/"],
  ["docs/azure/", "docs/operations/"],
  ["docs/runbooks/", "docs/operations/"],
  ["project-demo/", "docs/design/product-demo/"],
];

function baselineCategoryFor(repositoryPath, kind = "file") {
  const value = repositoryPath.toLowerCase();
  if (kind === "directory") return "directory";
  if (value.includes("/evidence/") || value.startsWith("test-cases-and-data/")) return "evidence";
  if (value.startsWith("project-demo/")) return "demo-evidence";
  if (value.startsWith("docs/tickets/")) return "ticket";
  if (value.startsWith("docs/workingspace/")) return "working-document";
  if (value.startsWith("docs/")) return "documentation";
  if (value.startsWith("contracts/") || value.includes("/contracts/")) return "contract";
  if (value.includes("/tests/") || /(?:^|\/)test[^/]*\.[^/]+$/.test(value)) return "test";
  if (value.includes("/fixtures/") || value.includes("/fixture/")) return "fixture";
  if (value.includes("/vendor/") || value.includes("/vendor_")) return "vendored-source";
  if (value.startsWith("scripts/") || value.startsWith(".github/")) return "automation";
  if (value.startsWith("infra/") || value.includes("/infra/")) return "infrastructure";
  if (value.endsWith("package-lock.json")
    || /(?:^|\/)(?:package|tsconfig|vite\.config|vitest\.config)[^/]*\.json$/.test(value)) return "configuration";
  if (value.match(/\.(?:md|txt)$/)) return "documentation";
  if (value.match(/\.(?:png|jpe?g|gif|svg|webp|ico|woff2?)$/)) return "asset";
  return "source";
}

function baselineOwnerFor(repositoryPath) {
  const value = repositoryPath.toLowerCase();
  if (value === ".") return "repository-governance";
  if (value.startsWith(".agents/") || value.startsWith(".claude/")
    || value === "agents.md" || value === "claude.md") return "agent-governance";
  if (value.startsWith("docs/workingspace/")) return "user-workspace";
  if (value.startsWith("docs/tickets/")) return "ticket-system";
  if (value.startsWith("docs/")) return "documentation";
  if (value.startsWith("scripts/") || value.startsWith(".github/")) return "engineering-automation";
  if (value.startsWith("api/")) return "data-api";
  if (value.startsWith("orchestration/")) return "orchestration";
  if (value.startsWith("mockup-app/")) return "web-app";
  if (value.startsWith("packages/domain/")) return "domain-model";
  if (value.startsWith("contracts/")) return "contracts";
  if (value.startsWith("functions/parser/")) return "document-parsing";
  if (value.startsWith("functions/enrichment/")) return "vehicle-enrichment";
  if (value.startsWith("functions/evasentry/")) return "eva-integration";
  if (value.startsWith("functions/evavalidation/")) return "eva-validation";
  if (value.startsWith("functions/location-suggest/")) return "location-suggestions";
  if (value.startsWith("functions/box-webhook/")) return "archive-integration";
  if (value.startsWith("ocr/")) return "image-analysis";
  if (value.startsWith("test-cases-and-data/")) return "quality-and-evaluation";
  if (value.startsWith("project-demo/")) return "product-demo";
  if (value.startsWith("migration/") || value.startsWith("database/")) return "data-platform";
  return "repository";
}

function baselineLifecycleFor(repositoryPath, kind = "file") {
  const value = repositoryPath.toLowerCase();
  if (kind === "directory") {
    if (value.startsWith("docs/workingspace")) return "working";
    if (value.startsWith("deploy")) return "generated";
    return "structural";
  }
  if (value.startsWith("docs/workingspace/")) return "working";
  if (value.includes("/evidence/") || value.startsWith("test-cases-and-data/")
    || value.startsWith("project-demo/")) return "evidence";
  if (value.includes("/vendor/") || value.includes("/vendor_")) return "vendored";
  if (value.startsWith("deploy/") || value.match(/(?:^|\/)(?:dist|build|coverage)\//)
    || value.includes(".generated.")) return "generated";
  return "active";
}

function commitTreeEntries(root, commit) {
  try {
    gitOutput(root, ["cat-file", "-e", `${commit}^{commit}`]);
  } catch (error) {
    throw new Error(
      `Locked pre-reset commit ${commit} is unavailable. Fetch repository history before reconciliation `
      + "(GitHub Actions checkout must use fetch-depth: 0).",
      { cause: error },
    );
  }

  const output = gitOutput(root, ["ls-tree", "-r", "-z", "--full-tree", commit]);
  return output.toString("utf8").split("\0").filter(Boolean).map((record) => {
    const tab = record.indexOf("\t");
    const match = record.slice(0, tab).match(/^(\d+) (\S+) ([0-9a-f]+)$/);
    if (tab < 0 || !match) throw new Error(`Could not parse Git tree record: ${record}`);
    const [, mode, objectType, objectId] = match;
    const repositoryPath = normalized(record.slice(tab + 1));
    if (objectType !== "blob") throw new Error(`Unsupported Git tree object ${objectType}: ${repositoryPath}`);
    if (!mode.match(/^(?:100644|100755|120000)$/)) {
      throw new Error(`Unsupported Git tree mode ${mode}: ${repositoryPath}`);
    }
    return { path: repositoryPath, mode, objectId };
  }).sort((left, right) => comparePaths(left.path, right.path));
}

function inventoryEntry(repositoryPath, mode, metadata = { size: 0, sha256: null }) {
  const kind = mode === "040000" ? "directory" : "file";
  return {
    path: repositoryPath,
    mediaType: mode === "120000" ? "inode/symlink" : mediaTypeFor(repositoryPath, kind),
    size: metadata.size,
    sha256: metadata.sha256,
    category: baselineCategoryFor(repositoryPath, kind),
    owner: baselineOwnerFor(repositoryPath),
    lifecycle: baselineLifecycleFor(repositoryPath, kind),
  };
}

export async function collectPreResetInventory({ root = ROOT, commit = PRE_RESET_COMMIT } = {}) {
  const treeEntries = commitTreeEntries(root, commit);
  const metadata = await readGitBlobMetadata(root, treeEntries.map((entry) => entry.objectId));
  const files = treeEntries.map((entry) => inventoryEntry(entry.path, entry.mode, metadata.get(entry.objectId)));
  const directories = repositoryDirectoriesForFiles(files.map((entry) => entry.path))
    .map((repositoryPath) => inventoryEntry(repositoryPath, "040000"));
  const entries = [...directories, ...files];

  return {
    schemaVersion: 2,
    scope: `Git tree at locked pre-reset commit ${commit}`,
    pathStyle: "repository-relative POSIX",
    ordering: "path ascending with directories before files",
    hashAlgorithm: "sha256",
    hashPolicy: {
      directories: "null because directories have no repository byte stream",
      tracked: "size and sha256 use committed Git blob bytes, independent of checkout filters and line endings",
    },
    classificationPolicy: "Deterministic path-based ownership and lifecycle metadata for the pre-reset layout",
    counts: {
      directories: directories.length,
      files: files.length,
      entries: entries.length,
    },
    totalFileBytes: files.reduce((total, entry) => total + entry.size, 0),
    entries,
  };
}

function normalized(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function mappedPath(repositoryPath) {
  for (const [before, after] of PREFIX_MOVES) {
    const bareBefore = before.replace(/\/$/, "");
    const bareAfter = after.replace(/\/$/, "");
    if (repositoryPath === bareBefore) return bareAfter;
    if (repositoryPath.startsWith(before)) return `${after}${repositoryPath.slice(before.length)}`;
  }
  return null;
}

function ownerTicket(repositoryPath) {
  if (repositoryPath.startsWith("workingspace/") || repositoryPath.startsWith("tests/fixtures/")) return "TKT-208";
  if (repositoryPath.startsWith(".agents/") || repositoryPath.startsWith(".claude/")
    || repositoryPath.startsWith(".codex/") || repositoryPath.startsWith(".cursor/")) return "TKT-212";
  if (repositoryPath.startsWith("docs/tickets/") || repositoryPath.startsWith("scripts/evaluation/")) return "TKT-213";
  if (repositoryPath.startsWith("scripts/checks/") || repositoryPath.startsWith("scripts/maintenance/")
    || repositoryPath.startsWith(".github/") || repositoryPath === "verify-all.mjs") return "TKT-214";
  if (repositoryPath.startsWith("docs/")) return "TKT-020";
  if (repositoryPath.startsWith("apps/") || repositoryPath.startsWith("services/")
    || repositoryPath.startsWith("packages/")) return "TKT-210";
  return "TKT-209";
}

function byPath(entries) {
  return new Map(entries.map((entry) => [normalized(entry.path), { ...entry, path: normalized(entry.path) }]));
}

function byHash(entries) {
  const index = new Map();
  for (const entry of entries) {
    if (!entry.sha256) continue;
    const values = index.get(entry.sha256) ?? [];
    values.push(entry.path);
    index.set(entry.sha256, values);
  }
  for (const values of index.values()) values.sort();
  return index;
}

function isImmutableWorkingMove(before, after) {
  return before.path.startsWith("docs/workingspace/")
    && after.path === `workingspace/${before.path.slice("docs/workingspace/".length)}`
    && before.lifecycle === "working"
    && after.lifecycle === "working";
}

function baselineDisposition(entry, finalByPath, finalByHash) {
  const same = finalByPath.get(entry.path);
  if (same) {
    return {
      disposition: entry.sha256 === same.sha256 ? "keep" : "rewrite",
      finalPath: entry.path,
      reason: entry.sha256 === same.sha256 ? "Path and bytes are retained." : "The retained authority was rewritten for the current repository.",
    };
  }

  const mapped = mappedPath(entry.path);
  if (mapped && finalByPath.has(mapped)) {
    const final = finalByPath.get(mapped);
    const immutableWorkingMove = isImmutableWorkingMove(entry, final);
    return {
      disposition: entry.sha256 === final.sha256 || immutableWorkingMove ? "move" : "rewrite",
      finalPath: mapped,
      reason: immutableWorkingMove
        ? "The committed source blob maps to the separately locked physical working file; the working-byte gate proves preservation."
        : entry.sha256 === final.sha256
          ? "Bytes moved into the locked repository layout."
          : "Content was moved and rewritten into the current authority.",
    };
  }

  if (entry.sha256 && finalByHash.has(entry.sha256)) {
    return {
      disposition: "move",
      finalPath: finalByHash.get(entry.sha256)[0],
      reason: "Identical bytes are retained at a canonical final path.",
    };
  }

  return {
    disposition: "delete",
    finalPath: null,
    reason: "No current authority or retained byte-equivalent remains; Git history is the recovery path.",
  };
}

function finalOrigin(entry, baselineByPath, baselineByHash) {
  const same = baselineByPath.get(entry.path);
  if (same) {
    return {
      origin: [entry.path],
      state: same.sha256 === entry.sha256 ? "retained" : "rewritten",
    };
  }

  if (entry.sha256 && baselineByHash.has(entry.sha256)) {
    return { origin: baselineByHash.get(entry.sha256), state: "moved" };
  }

  const reverse = PREFIX_MOVES.flatMap(([before, after]) => {
    const bareAfter = after.replace(/\/$/, "");
    if (entry.path === bareAfter) return [before.replace(/\/$/, "")];
    if (entry.path.startsWith(after)) return [`${before}${entry.path.slice(after.length)}`];
    return [];
  }).filter((candidate) => baselineByPath.has(candidate));
  if (reverse.length) {
    const immutableWorkingMove = reverse.some((candidate) => isImmutableWorkingMove(baselineByPath.get(candidate), entry));
    return { origin: reverse, state: immutableWorkingMove ? "moved" : "rewritten" };
  }

  return {
    origin: ["PLAN-006"],
    state: entry.lifecycle === "generated" ? "regenerated" : "created",
  };
}

export function buildReconciliation(baselineDocument, finalDocument) {
  const baselineEntries = baselineDocument.entries.map((entry) => ({ ...entry, path: normalized(entry.path) }));
  const finalEntries = finalDocument.entries.map((entry) => ({ ...entry, path: normalized(entry.path) }));
  const baselineByPath = byPath(baselineEntries);
  const finalByPath = byPath(finalEntries);
  const baselineByHash = byHash(baselineEntries);
  const finalByHash = byHash(finalEntries);

  const baseline = baselineEntries.map((entry) => ({
    path: entry.path,
    kind: entry.mediaType === "inode/directory" ? "directory" : "file",
    size: entry.size,
    sha256: entry.sha256,
    category: entry.category,
    owner: entry.owner,
    lifecycle: entry.lifecycle,
    ...baselineDisposition(entry, finalByPath, finalByHash),
    ticket: ownerTicket(mappedPath(entry.path) ?? entry.path),
  }));

  const final = finalEntries.map((entry) => ({
    path: entry.path,
    kind: entry.mediaType === "inode/directory" ? "directory" : "file",
    size: entry.size,
    sha256: entry.sha256,
    category: entry.category,
    owner: entry.owner,
    lifecycle: entry.lifecycle,
    ...finalOrigin(entry, baselineByPath, baselineByHash),
    ticket: ownerTicket(entry.path),
  }));

  const document = {
    schemaVersion: 1,
    baseline: {
      gitCommit: PRE_RESET_COMMIT,
      byteSource: "committed Git tree and blob bytes",
      entries: baseline.length,
    },
    final: { inventory: CURRENT_INVENTORY, entries: final.length },
    summary: {
      baselineFiles: baseline.filter((entry) => entry.kind === "file").length,
      baselineDirectories: baseline.filter((entry) => entry.kind === "directory").length,
      finalFiles: final.filter((entry) => entry.kind === "file").length,
      finalDirectories: final.filter((entry) => entry.kind === "directory").length,
      dispositions: Object.fromEntries([...new Set(baseline.map((entry) => entry.disposition))]
        .sort().map((value) => [value, baseline.filter((entry) => entry.disposition === value).length])),
      unexplained: 0,
    },
    baselineEntries: baseline,
    finalEntries: final,
  };
  document.summary.unexplained = validateReconciliation(document).length;
  return document;
}

export function validateReconciliation(document) {
  const issues = [];
  for (const entry of document.baselineEntries ?? []) {
    if (!entry.disposition || !entry.reason || !entry.ticket) issues.push(`incomplete baseline disposition: ${entry.path}`);
    if (entry.disposition !== "delete" && !entry.finalPath) issues.push(`missing final path: ${entry.path}`);
  }
  for (const entry of document.finalEntries ?? []) {
    if (!entry.owner || !entry.ticket || !entry.state || !(entry.origin?.length > 0)) issues.push(`unexplained final entry: ${entry.path}`);
  }
  return issues;
}

async function main() {
  const ephemeral = process.argv.includes("--ephemeral") || !process.env.CI;
  const outputArgument = process.argv.indexOf("--output");
  const output = normalized(outputArgument >= 0 ? process.argv[outputArgument + 1] : DEFAULT_OUTPUT);
  if (outputArgument >= 0 && !process.argv[outputArgument + 1]) throw new Error("--output requires a path");
  const final = JSON.parse(readFileSync(path.join(ROOT, CURRENT_INVENTORY), "utf8"));
  const document = buildReconciliation(await collectPreResetInventory(), final);
  const issues = validateReconciliation(document);
  if (issues.length) {
    console.error(`Repository reconciliation failed with ${issues.length} issue(s):`);
    for (const issue of issues.slice(0, 100)) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  const destination = path.join(ROOT, ...output.split("/"));
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(
    `Repository reconciliation passed: ${document.summary.baselineFiles} baseline files, `
      + `${document.summary.finalFiles} final files, ${document.summary.unexplained} unexplained.`,
  );
  if (ephemeral) unlinkSync(destination);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
