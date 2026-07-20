#!/usr/bin/env node
/**
 * Python auth/retry inventory drift guard (TKT-268 / PLAN-011).
 *
 * The Python function services each hand-roll their own bearer/refresh/retry policy (ADR-0032 — they
 * stay independently packaged, the duplication is CHECKED not shared). This guard keeps the checked
 * per-client inventory (services/functions/auth-conformance-inventory.json) honest: it scans the
 * production Python for token-acquisition / caching / bounded-retry SITES and FAILS if one appears that
 * the inventory does not list (as a conformance-harness client or a deliberately-excluded caller), or if
 * an inventory entry's file has vanished. The behavioural pinning itself lives in the pytest conformance
 * harness; this guard is the anti-drift half — "an omitted inventoried client must fail".
 *
 * It is marker-based, not a naive grep: Python comments and triple-quoted docstrings are stripped before
 * matching, so a marker mentioned only in prose does not trip it. Scope: production Python under
 * services/functions (excludes tests, __pycache__, .venv).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  comparePaths,
  listRepositoryFiles,
  normalizeRepositoryPath,
  repositoryRoot,
  resolveRepositoryPath,
} from "./repository-files.mjs";

export const INVENTORY_PATH = "services/functions/auth-conformance-inventory.json";
export const BEHAVIOURS = ["expiry-aware-reuse", "one-time-refresh", "bounded-transient-retry", "retry-after"];

// Code identifiers that signal a token cache, a managed-identity mint, or a bounded transient-retry
// loop. A production Python module containing any of these (in code, not a comment) is an auth/retry
// site the inventory must account for.
const AUTH_MARKERS = [
  "_CachedToken",
  "_RETRY_SAFE_STATUS",
  "_TOKEN_CACHE",
  "expires_at_monotonic",
  "DefaultAzureCredential",
  "mint_cognitive_token",
  "mint_storage_token",
];

export function isProductionPython(repositoryPath) {
  const posix = repositoryPath.replaceAll("\\", "/");
  if (!posix.endsWith(".py")) return false;
  if (!posix.startsWith("services/functions/")) return false;
  const segments = posix.split("/");
  return !segments.some((s) => s === "tests" || s === "__pycache__" || s === ".venv" || s === "node_modules");
}

/** Strip triple-quoted docstrings and `#` line comments so markers in prose do not match. */
export function stripPythonProse(text) {
  const withoutDocstrings = text.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, "");
  return withoutDocstrings
    .split("\n")
    .map((line) => line.replace(/#.*$/, ""))
    .join("\n");
}

/** Does this Python source (prose stripped) contain an auth/retry marker? Returns the markers found. */
export function authMarkersIn(text) {
  const code = stripPythonProse(text);
  return AUTH_MARKERS.filter((marker) => code.includes(marker));
}

function collectPythonFiles(directory) {
  const results = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (["__pycache__", ".venv", "node_modules", "tests"].includes(entry.name)) continue;
        walk(absolute);
      } else if (entry.name.endsWith(".py")) {
        results.push(absolute);
      }
    }
  };
  walk(directory);
  return results.sort(comparePaths);
}

function readInventory(root) {
  return JSON.parse(fs.readFileSync(path.resolve(root, INVENTORY_PATH), "utf8"));
}

/**
 * Reconcile the marker-bearing Python sites against the inventory. Pure over its inputs.
 * `sites` = [{ path, markers }]; returns findings `{ kind, detail }`.
 */
export function evaluateInventory(sites, inventory) {
  const findings = [];
  const clients = inventory.clients ?? [];
  const excluded = inventory.excluded ?? [];
  const accounted = new Set([...clients, ...excluded].map((e) => e.path));

  // (a) A marker-bearing site the inventory does not account for.
  for (const site of sites) {
    if (!accounted.has(site.path)) {
      findings.push({
        kind: "unlisted-auth-site",
        detail: `${site.path} has auth/retry marker(s) [${site.markers.join(", ")}] but is not listed in ${INVENTORY_PATH} (as a client or excluded)`,
      });
    }
  }

  // (b) Each client's claims are valid, and its file still exists.
  for (const client of clients) {
    for (const claim of client.claims ?? []) {
      if (!BEHAVIOURS.includes(claim)) {
        findings.push({ kind: "invalid-claim", detail: `${client.path}: unknown claimed behaviour '${claim}'` });
      }
    }
    if (client.exists === false) {
      findings.push({ kind: "stale-inventory", detail: `client ${client.path} no longer exists` });
    }
  }
  for (const entry of excluded) {
    if (entry.exists === false) {
      findings.push({ kind: "stale-inventory", detail: `excluded entry ${entry.path} no longer exists` });
    }
  }
  return findings;
}

/** Scan production Python and reconcile against the committed inventory. */
export function scanTree({ root = repositoryRoot, files } = {}) {
  const candidates = (files ?? listRepositoryFiles()).map(normalizeRepositoryPath).filter(isProductionPython);
  const sites = [];
  for (const repositoryPath of candidates) {
    const absolute = files ? path.resolve(root, repositoryPath) : resolveRepositoryPath(repositoryPath);
    let text;
    try {
      text = fs.readFileSync(absolute, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const markers = authMarkersIn(text);
    if (markers.length) sites.push({ path: repositoryPath, markers });
  }
  const inventory = readInventory(root);
  // Stamp existence for entries so evaluateInventory can flag a vanished file.
  const stamp = (entry) => ({ ...entry, exists: fs.existsSync(path.resolve(root, entry.path)) });
  const stamped = {
    ...inventory,
    clients: (inventory.clients ?? []).map(stamp),
    excluded: (inventory.excluded ?? []).map(stamp),
  };
  return { scannedFiles: candidates.length, sites, findings: evaluateInventory(sites, stamped) };
}

/** `--scan <dir>`: scan an arbitrary directory's Python against the real inventory (negative fixtures). */
export function scanPaths({ root = repositoryRoot, dir }) {
  const absoluteDir = path.isAbsolute(dir) ? dir : path.resolve(root, dir);
  const sites = [];
  for (const absolute of collectPythonFiles(absoluteDir)) {
    const markers = authMarkersIn(fs.readFileSync(absolute, "utf8"));
    if (markers.length) sites.push({ path: normalizeRepositoryPath(path.relative(root, absolute)), markers });
  }
  const inventory = readInventory(root);
  return { scannedFiles: sites.length, sites, findings: evaluateInventory(sites, inventory) };
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const scanIndex = argv.indexOf("--scan");
  const scanDir = scanIndex >= 0 ? argv[scanIndex + 1] : undefined;
  const rest = argv.filter((v, i) => v !== "--json" && v !== "--scan" && i !== (scanIndex >= 0 ? scanIndex + 1 : -1));
  if (rest.length) {
    console.error(`Unknown option(s): ${rest.join(", ")}`);
    process.exitCode = 2;
    return;
  }

  const result = scanDir ? scanPaths({ dir: scanDir }) : scanTree();
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.findings.length === 0) {
    console.log(
      `Auth-conformance inventory: PASS (${result.scannedFiles} Python file(s) scanned; `
        + `${result.sites.length} auth/retry site(s), all accounted for in ${INVENTORY_PATH}).`,
    );
  } else {
    console.error(`Auth-conformance inventory: FAIL (${result.findings.length} finding(s)).`);
    for (const finding of result.findings) console.error(`- [${finding.kind}] ${finding.detail}`);
  }
  process.exitCode = result.findings.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
