#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHashedSignatureMatcher } from "../checks/hashed-signature-matcher.mjs";
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
export const CURRENT_INVENTORY = "docs/governance/repository-inventory.json";
export const COMMITTED_RECONCILIATION = "docs/governance/repository-reconciliation.json";
const RECURSIVE_GOVERNANCE_ARTIFACTS = new Set([
  CURRENT_INVENTORY,
  COMMITTED_RECONCILIATION,
]);
const FORBIDDEN_SIGNATURES = JSON.parse(
  readFileSync(new URL("../checks/forbidden-signatures.json", import.meta.url), "utf8"),
);
const forbiddenSignatureIdsFor = createHashedSignatureMatcher(FORBIDDEN_SIGNATURES);

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

export function policySafeReference(value, matcher = forbiddenSignatureIdsFor) {
  if (matcher(value).length === 0) return value;
  const digest = createHash("sha256").update(value, "utf8").digest("hex");
  return `policy-redacted:sha256:${digest}`;
}

function policySafeDocument(value) {
  if (typeof value === "string") return policySafeReference(value);
  if (Array.isArray(value)) return value.map((entry) => policySafeDocument(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, policySafeDocument(entry)]));
  }
  return value;
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
    reason: `PLAN-006 explicitly retired this ${entry.category} path after authority review; `
      + "no current authority or retained byte-equivalent remains and Git history is the recovery path.",
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
  // The two committed governance artifacts are deliberately omitted from the reconciliation's
  // content map. Inventory records the reconciliation digest, while reconciliation is generated
  // from inventory; including either would create an impossible mutual-hash fixed point. Layout
  // and inventory gates still require and record both files.
  const finalEntries = finalDocument.entries
    .map((entry) => ({ ...entry, path: normalized(entry.path) }))
    .filter((entry) => !RECURSIVE_GOVERNANCE_ARTIFACTS.has(entry.path));
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
    schemaVersion: 2,
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
  const baselineByPath = new Map((document.baselineEntries ?? []).map((entry) => [entry.path, entry]));
  const finalByPath = new Map((document.finalEntries ?? []).map((entry) => [entry.path, entry]));
  for (const entry of document.baselineEntries ?? []) {
    if (!entry.disposition || !entry.reason || !entry.ticket) issues.push(`incomplete baseline disposition: ${entry.path}`);
    if (entry.disposition !== "delete" && !entry.finalPath) issues.push(`missing final path: ${entry.path}`);
    const final = entry.finalPath ? finalByPath.get(entry.finalPath) : null;
    if (entry.disposition !== "delete" && !final) issues.push(`final path does not exist: ${entry.path} -> ${entry.finalPath}`);
    if (entry.disposition === "keep") {
      if (entry.finalPath !== entry.path) issues.push(`kept path changed: ${entry.path}`);
      if (final && (entry.sha256 !== final.sha256 || entry.size !== final.size)) {
        issues.push(`kept bytes changed: ${entry.path}`);
      }
    } else if (entry.disposition === "move" && final) {
      const immutableWorkingMove = isImmutableWorkingMove(entry, final);
      if (!immutableWorkingMove && (entry.sha256 !== final.sha256 || entry.size !== final.size)) {
        issues.push(`moved bytes changed: ${entry.path} -> ${entry.finalPath}`);
      }
    } else if (entry.disposition === "rewrite" && final) {
      if (entry.sha256 === final.sha256 && entry.size === final.size) {
        issues.push(`rewrite has unchanged bytes: ${entry.path} -> ${entry.finalPath}`);
      }
    } else if (entry.disposition === "delete") {
      if (entry.finalPath !== null) issues.push(`deleted path has a final path: ${entry.path}`);
      if (!entry.reason.startsWith("PLAN-006 explicitly retired this ")) {
        issues.push(`deleted path lacks an explicit retirement rationale: ${entry.path}`);
      }
    } else if (!new Set(["keep", "move", "rewrite", "delete"]).has(entry.disposition)) {
      issues.push(`invalid disposition ${entry.disposition}: ${entry.path}`);
    }
  }
  for (const entry of document.finalEntries ?? []) {
    if (!entry.owner || !entry.ticket || !entry.state || !(entry.origin?.length > 0)) issues.push(`unexplained final entry: ${entry.path}`);
    if (entry.state === "retained") {
      const baseline = baselineByPath.get(entry.path);
      if (!baseline || baseline.sha256 !== entry.sha256 || baseline.size !== entry.size) {
        issues.push(`retained final bytes lack a matching baseline: ${entry.path}`);
      }
    } else if (entry.state === "moved") {
      const byteMatch = entry.origin.some((origin) => {
        const baseline = baselineByPath.get(origin);
        return baseline && (isImmutableWorkingMove(baseline, entry)
          || (baseline.sha256 === entry.sha256 && baseline.size === entry.size));
      });
      if (!byteMatch) issues.push(`moved final bytes lack a matching baseline: ${entry.path}`);
    }
  }
  return issues;
}

async function main() {
  const write = process.argv.includes("--write");
  const unknown = process.argv.slice(2).filter((argument) => argument !== "--write");
  if (unknown.length) throw new Error(`Unknown option: ${unknown[0]}`);
  const final = JSON.parse(readFileSync(path.join(ROOT, CURRENT_INVENTORY), "utf8"));
  const internalDocument = buildReconciliation(await collectPreResetInventory(), final);
  const issues = validateReconciliation(internalDocument);
  if (issues.length) {
    console.error(`Repository reconciliation failed with ${issues.length} issue(s):`);
    for (const issue of issues.slice(0, 100)) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  const destination = path.join(ROOT, ...COMMITTED_RECONCILIATION.split("/"));
  // The immutable baseline commit remains the audit source of truth. Clear text that matches the
  // repository's retired-vocabulary policy is represented only by an irreversible digest in the
  // committed ledger, so the ledger cannot reintroduce a prohibited reference merely by naming a
  // deleted historical path. Generation and validation still operate on the exact Git tree first.
  const document = policySafeDocument(internalDocument);
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  if (write) {
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, serialized, "utf8");
  } else {
    let committed = null;
    try {
      committed = readFileSync(destination, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (committed !== serialized) {
      console.error(
        `${COMMITTED_RECONCILIATION} is missing or stale; regenerate it with `
          + "node scripts/maintenance/reconcile-repository-reset.mjs --write.",
      );
      process.exitCode = 1;
      return;
    }
  }
  console.log(
    `Repository reconciliation ${write ? "written" : "passed"}: ${document.summary.baselineFiles} baseline files, `
      + `${document.summary.finalFiles} final files, ${document.summary.unexplained} unexplained.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
