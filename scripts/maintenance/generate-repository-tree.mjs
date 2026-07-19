#!/usr/bin/env node
/**
 * generate-repository-tree.mjs — deterministic human-readable repository tree.
 *
 * Renders the current (pre-reset baseline) and proposed (final) directory trees from the same
 * machine-readable source as the reset ledger — docs/governance/repository-reconciliation.json,
 * whose `baselineEntries` carry the current tree and whose `finalEntries` carry the proposed tree —
 * and asserts that the rendered per-area subtotals reconcile to that ledger's `summary` and to
 * docs/governance/repository-inventory.json counts. Byte sizes and hashes are intentionally NOT
 * read, so the document is a pure function of the path/kind set; that is what keeps the
 * generate:governance fixed point convergent when this doc is itself an inventory/ledger row.
 *
 *   node scripts/maintenance/generate-repository-tree.mjs           # write the document
 *   node scripts/maintenance/generate-repository-tree.mjs --check   # fail if the committed doc drifted
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparePaths } from "../checks/repository-files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RECONCILIATION = "docs/governance/repository-reconciliation.json";
const INVENTORY = "docs/governance/repository-inventory.json";
const OUTPUT = "docs/governance/repository-tree.md";

// The reconciliation ledger deliberately omits its own two governance artifacts from its content
// map to avoid a mutual-hash cycle (the inventory records the reconciliation digest; the
// reconciliation is generated from the inventory). Both files still exist in the inventory and are
// required by the layout gate, so the proposed (final) file count trails the inventory file count
// by exactly this many rows.
const LEDGER_OMITTED_FILES = Object.freeze([
  "docs/governance/repository-inventory.json",
  "docs/governance/repository-reconciliation.json",
]);

const ROOT_AREA = "(repository root)";
const REDACTED_AREA = "(policy-redacted paths)";
const REDACTED_PREFIX = "policy-redacted:";

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, ...relativePath.split("/")), "utf8"));
}

function segmentCount(dirPath) {
  return dirPath === "." ? 0 : dirPath.split("/").length;
}

// Every entry belongs to exactly one top-level area: the repository root (the "." directory and any
// root file), a policy-redacted bucket (opaque paths carry no structure), or the first path segment.
function areaOf(entry) {
  const value = entry.path;
  if (value.startsWith(REDACTED_PREFIX)) return REDACTED_AREA;
  if (value === ".") return ROOT_AREA;
  const slash = value.indexOf("/");
  if (slash === -1) return entry.kind === "directory" ? value : ROOT_AREA;
  return value.slice(0, slash);
}

function orderedAreas(areaNames) {
  const present = new Set(areaNames);
  const middle = [...present]
    .filter((name) => name !== ROOT_AREA && name !== REDACTED_AREA)
    .sort(comparePaths);
  return [
    ...(present.has(ROOT_AREA) ? [ROOT_AREA] : []),
    ...middle,
    ...(present.has(REDACTED_AREA) ? [REDACTED_AREA] : []),
  ];
}

// Immediate (non-recursive) file count for each directory, from non-redacted files only.
function directFileCounts(entries) {
  const counts = new Map();
  for (const entry of entries) {
    if (entry.kind !== "file" || entry.path.startsWith(REDACTED_PREFIX)) continue;
    const slash = entry.path.lastIndexOf("/");
    const parent = slash === -1 ? "." : entry.path.slice(0, slash);
    counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  return counts;
}

function groupByArea(entries) {
  const areas = new Map();
  for (const entry of entries) {
    const area = areaOf(entry);
    if (!areas.has(area)) areas.set(area, { files: 0, directories: 0, dirPaths: [] });
    const bucket = areas.get(area);
    if (entry.kind === "directory") {
      bucket.directories += 1;
      if (!entry.path.startsWith(REDACTED_PREFIX)) bucket.dirPaths.push(entry.path);
    } else {
      bucket.files += 1;
    }
  }
  return areas;
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function renderTree(entries) {
  const areas = groupByArea(entries);
  const counts = directFileCounts(entries);
  const lines = [];
  let totalFiles = 0;
  let totalDirectories = 0;
  for (const area of orderedAreas([...areas.keys()])) {
    const bucket = areas.get(area);
    totalFiles += bucket.files;
    totalDirectories += bucket.directories;
    lines.push("", `### ${area} — ${plural(bucket.directories, "directory", "directories")}, `
      + `${plural(bucket.files, "file", "files")}`);
    if (area === REDACTED_AREA) {
      lines.push("", "Paths withheld by the repository forbidden-vocabulary policy; counted in the totals above.");
      continue;
    }
    const baseDepth = segmentCount(area === ROOT_AREA ? "." : area);
    lines.push("", "```text");
    for (const dirPath of bucket.dirPaths.sort(comparePaths)) {
      const indent = "  ".repeat(Math.max(0, segmentCount(dirPath) - baseDepth));
      const label = dirPath === "." ? "." : `${dirPath.slice(dirPath.lastIndexOf("/") + 1)}/`;
      lines.push(`${indent}${label}  (${plural(counts.get(dirPath) ?? 0, "file", "files")})`);
    }
    lines.push("```");
  }
  return { lines, totalFiles, totalDirectories };
}

function assert(description, left, right) {
  return { description, left, right, pass: left === right };
}

function buildDocument(reconciliation, inventory) {
  const current = renderTree(reconciliation.baselineEntries);
  const proposed = renderTree(reconciliation.finalEntries);
  const { summary } = reconciliation;
  const omitted = LEDGER_OMITTED_FILES.length;
  const checks = [
    assert("Current tree files == ledger baseline files", current.totalFiles, summary.baselineFiles),
    assert("Current tree directories == ledger baseline directories", current.totalDirectories, summary.baselineDirectories),
    assert("Proposed tree files == ledger final files", proposed.totalFiles, summary.finalFiles),
    assert("Proposed tree directories == ledger final directories", proposed.totalDirectories, summary.finalDirectories),
    assert(`Proposed files + ${omitted} ledger-omitted files == inventory files`, proposed.totalFiles + omitted, inventory.counts.files),
    assert("Proposed directories == inventory directories", proposed.totalDirectories, inventory.counts.directories),
  ];
  const failed = checks.filter((check) => !check.pass);
  if (failed.length) {
    throw new Error(
      "Repository tree does not reconcile to the ledgers:\n"
        + failed.map((c) => `- ${c.description}: ${c.left} != ${c.right}`).join("\n")
        + "\nRegenerate the ledgers first with: npm run generate:governance",
    );
  }
  const lines = [
    "# Repository tree",
    "",
    "Generated by `scripts/maintenance/generate-repository-tree.mjs`; do not edit by hand. The current",
    "and proposed trees below are rendered from the same machine-readable source as the reset ledger —",
    "[`repository-reconciliation.json`](./repository-reconciliation.json) (its `baselineEntries` and",
    "`finalEntries`) — and their per-area subtotals reconcile to that ledger and to",
    "[`repository-inventory.json`](./repository-inventory.json). Only path structure and entry kind are",
    "rendered; byte sizes and hashes live in the machine-readable ledgers. Each directory line shows the",
    "count of files held directly in that directory. Regenerate with `npm run generate:tree` (or the",
    "whole `npm run generate:governance` chain).",
    "",
    "## Current tree (pre-reset baseline)",
    "",
    `Grand total: ${plural(current.totalDirectories, "directory", "directories")}, `
      + `${plural(current.totalFiles, "file", "files")} at locked commit \`${reconciliation.baseline.gitCommit}\`.`,
    ...current.lines,
    "",
    "## Proposed tree (final layout)",
    "",
    `Grand total: ${plural(proposed.totalDirectories, "directory", "directories")}, `
      + `${plural(proposed.totalFiles, "file", "files")}.`,
    ...proposed.lines,
    "",
    "## Reconciliation",
    "",
    "Every assertion below is checked at generation time; the document cannot be written while any",
    "assertion is false, so a committed tree that passes `check:tree` provably reconciles to the ledgers.",
    "",
    "| Assertion | Left | Right | Result |",
    "| --- | ---: | ---: | :---: |",
    ...checks.map((c) => `| ${c.description} | ${c.left} | ${c.right} | ${c.pass ? "PASS" : "FAIL"} |`),
    "",
    `The proposed tree carries ${plural(omitted, "file", "files")} fewer than the inventory because the`,
    "reconciliation ledger omits its own two governance artifacts from its content map to avoid a",
    "mutual-hash cycle:",
    ...LEDGER_OMITTED_FILES.map((p) => `- \`${p}\``),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function main() {
  const check = process.argv.includes("--check");
  const unknown = process.argv.slice(2).filter((argument) => argument !== "--check");
  if (unknown.length) throw new Error(`Unknown option: ${unknown[0]}`);
  const serialized = buildDocument(readJson(RECONCILIATION), readJson(INVENTORY));
  const destination = path.join(ROOT, ...OUTPUT.split("/"));
  if (check) {
    let committed = null;
    try {
      committed = readFileSync(destination, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (committed !== serialized) {
      process.stderr.write(`${OUTPUT} is missing or stale; regenerate it with `
        + "npm run generate:tree (or npm run generate:governance).\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write("Repository tree is current: baseline and final trees reconcile to the ledgers.\n");
    return;
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, serialized, "utf8");
  process.stdout.write(`Wrote ${OUTPUT}.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
