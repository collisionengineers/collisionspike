#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASELINE_OBJECT = "70a3bb57:.plan-006-baseline/repository-inventory.json";
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
    return {
      disposition: entry.sha256 === final.sha256 ? "move" : "rewrite",
      finalPath: mapped,
      reason: entry.sha256 === final.sha256 ? "Bytes moved into the locked repository layout." : "Content was moved and rewritten into the current authority.",
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
  if (reverse.length) return { origin: reverse, state: "rewritten" };

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
    baseline: { gitObject: BASELINE_OBJECT, entries: baseline.length },
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

function loadBaseline() {
  return JSON.parse(execFileSync("git", ["show", BASELINE_OBJECT], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }));
}

function main() {
  const ephemeral = process.argv.includes("--ephemeral") || !process.env.CI;
  const outputArgument = process.argv.indexOf("--output");
  const output = normalized(outputArgument >= 0 ? process.argv[outputArgument + 1] : DEFAULT_OUTPUT);
  if (outputArgument >= 0 && !process.argv[outputArgument + 1]) throw new Error("--output requires a path");
  const final = JSON.parse(readFileSync(path.join(ROOT, CURRENT_INVENTORY), "utf8"));
  const document = buildReconciliation(loadBaseline(), final);
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
