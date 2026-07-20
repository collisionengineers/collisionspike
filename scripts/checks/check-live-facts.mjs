#!/usr/bin/env node
/**
 * Offline LIVE_FACTS integrity check (TKT-273 / PLAN-012).
 *
 * `LIVE_FACTS.json` is the sole exact live-state registry, but timestamp freshness and prose/registry
 * agreement do not prove the governed values match live evidence. This check compares the registry with
 * a committed, secret-free machine-readable evidence snapshot (docs/operations/live-facts.evidence.json)
 * and the human-readable view's authority date. It is fully offline and never contacts Azure — the
 * credential-gated live comparison lives in scripts/checks/live-facts-azure-compare.mjs and the CI
 * `verify-live` job, not here.
 *
 * It fails on: a malformed snapshot, a digest mismatch against LIVE_FACTS.authority.machineEvidence, a
 * snapshot whose capture time does not match LIVE_FACTS.lastVerified, a governed numeric field with no
 * mapping, a registry/snapshot value mismatch, or a human-readable view whose verified date disagrees
 * with the registry.
 *
 * The analysis is a pure function so the negative cases are exercised by check-live-facts.test.mjs.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../maintenance/ticket-system.mjs";

const GOVERNED_NUMERIC_LEAVES = new Set(["functionCount", "baseTableCount"]);

export function getPath(object, path) {
  return path.split(".").reduce((current, key) => (current == null ? undefined : current[key]), object);
}

/** Every numeric leaf under `deployables` whose key is a governed count must be mapped by the snapshot. */
export function collectGovernedNumericPaths(liveFacts) {
  const paths = [];
  const deployables = liveFacts?.deployables ?? {};
  for (const [name, surface] of Object.entries(deployables)) {
    if (!surface || typeof surface !== "object") continue;
    for (const [key, value] of Object.entries(surface)) {
      if (GOVERNED_NUMERIC_LEAVES.has(key) && typeof value === "number") {
        paths.push(`deployables.${name}.${key}`);
      }
    }
  }
  return paths.sort();
}

function parseDocVerifiedDate(docText) {
  return docText.match(/last verified there on\s+(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

/**
 * @param {object} args
 * @param {object} args.liveFacts        parsed LIVE_FACTS.json
 * @param {object} args.evidence         parsed evidence snapshot
 * @param {string} args.evidenceSha256   sha256 of the on-disk evidence bytes
 * @param {string} args.evidencePath     repo-relative snapshot path (for the mapping assertion)
 * @param {string} args.docText          docs/operations/live-environment.md contents
 */
export function analyzeLiveFacts({ liveFacts, evidence, evidenceSha256, evidencePath, docText }) {
  const findings = [];
  const fail = (detail) => findings.push(detail);

  // Schema.
  if (!evidence || typeof evidence !== "object") return ["evidence snapshot is not an object"];
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(evidence.capturedAt ?? ""))) fail("evidence snapshot missing a valid capturedAt");
  if (!Array.isArray(evidence.fields) || evidence.fields.length === 0) {
    return [...findings, "evidence snapshot has no fields[]"];
  }
  for (const [index, field] of evidence.fields.entries()) {
    for (const key of ["path", "value", "comparison", "evidenceSource", "probe"]) {
      if (field?.[key] === undefined || field?.[key] === "") fail(`evidence fields[${index}] missing ${key}`);
    }
  }

  // Digest + path reference.
  const machineEvidence = liveFacts?.authority?.machineEvidence;
  if (!machineEvidence) fail("LIVE_FACTS.authority.machineEvidence is missing (path + sha256 expected)");
  else {
    if (machineEvidence.path !== evidencePath) {
      fail(`LIVE_FACTS.authority.machineEvidence.path '${machineEvidence.path}' does not equal the snapshot path '${evidencePath}'`);
    }
    if (machineEvidence.sha256 !== evidenceSha256) {
      fail(`LIVE_FACTS.authority.machineEvidence.sha256 does not match the snapshot digest (recorded ${machineEvidence.sha256 ?? "none"}, actual ${evidenceSha256})`);
    }
  }

  // Freshness — the snapshot must be captured at the registry's declared verification time.
  if (evidence.capturedAt !== liveFacts?.lastVerified) {
    fail(`snapshot capturedAt '${evidence.capturedAt}' does not match LIVE_FACTS.lastVerified '${liveFacts?.lastVerified}' (stale snapshot)`);
  }

  // Mapping coverage — every governed numeric field must have exactly one snapshot mapping.
  const mapped = new Map();
  for (const field of evidence.fields) if (field?.path) mapped.set(field.path, field);
  for (const path of collectGovernedNumericPaths(liveFacts)) {
    if (!mapped.has(path)) fail(`governed field '${path}' has no evidence-snapshot mapping`);
  }
  for (const field of evidence.fields) {
    if (getPath(liveFacts, field.path) === undefined) fail(`evidence field '${field.path}' does not resolve in LIVE_FACTS.json`);
  }

  // Registry ↔ snapshot parity.
  for (const field of evidence.fields) {
    const registryValue = getPath(liveFacts, field.path);
    if (registryValue === undefined) continue;
    if (field.comparison === "exact" && registryValue !== field.value) {
      fail(`registry/snapshot mismatch at '${field.path}': registry ${registryValue} vs snapshot ${field.value}`);
    }
  }

  // Doc authority — the readable view's verified date is derived from the registry.
  const docDate = parseDocVerifiedDate(docText);
  const registryDate = String(liveFacts?.lastVerified ?? "").slice(0, 10);
  if (!docDate) fail("docs/operations/live-environment.md: could not parse a 'last verified there on' date");
  else if (docDate !== registryDate) {
    fail(`docs/operations/live-environment.md verified date '${docDate}' disagrees with LIVE_FACTS.lastVerified '${registryDate}'`);
  }

  return findings;
}

function main() {
  const liveFactsPath = join(ROOT, "LIVE_FACTS.json");
  const evidencePath = "docs/operations/live-facts.evidence.json";
  const liveFacts = JSON.parse(readFileSync(liveFactsPath, "utf8"));
  const evidenceBytes = readFileSync(join(ROOT, evidencePath));
  const evidence = JSON.parse(evidenceBytes.toString("utf8"));
  const evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex");
  const docText = readFileSync(join(ROOT, "docs", "operations", "live-environment.md"), "utf8");

  const findings = analyzeLiveFacts({ liveFacts, evidence, evidenceSha256, evidencePath, docText });

  if (findings.length > 0) {
    console.log("--- LIVE_FACTS integrity failures ---");
    for (const finding of findings) console.log(`  ${finding}`);
    console.log("\nLIVE_FACTS integrity: FAILED");
    process.exit(1);
  }
  console.log(
    `LIVE_FACTS integrity: OK (${evidence.fields.length} governed field(s) match the committed evidence snapshot; doc authority date and digest verified). This is an OFFLINE check and is not live verification.`,
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
