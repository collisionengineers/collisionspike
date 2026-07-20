#!/usr/bin/env node
/**
 * Credential-gated, READ-ONLY live comparison of LIVE_FACTS.json against Azure (TKT-273 / PLAN-012).
 *
 * This is the ONLY LIVE_FACTS check that contacts Azure. It is separate from the offline
 * `check:live-facts` and from `verify-all.mjs` (which never touch the network). The CI `verify-live`
 * job invokes THIS command, not `verify-all.mjs`, so an offline run can never be reported as live proof.
 *
 * Behaviour:
 *   - Without Azure credentials (no `az`, or `az account show` fails): prints an explicit SKIP and exits 0.
 *     The skip line states plainly that no live verification was performed, so it cannot be cited as one.
 *   - With credentials: runs read-only `az functionapp function list` probes for every governed function
 *     count, builds an ephemeral sanitised snapshot (counts only — no settings, secrets, or identifiers
 *     beyond resource names already in LIVE_FACTS), and compares each governed field with BOTH the
 *     committed evidence snapshot and the registry. Any query failure or comparison mismatch fails closed
 *     (exit 1).
 *
 * It performs NO writes: only `az account show` and `az functionapp function list` are ever invoked, and
 * every argument list is asserted read-only before it runs.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const EVIDENCE_PATH = "docs/operations/live-facts.evidence.json";

// Read-only allowlist: only these az verbs may run. Anything mutating (create/update/delete/set/
// restart/keys/secrets/connectionstrings/publish) is refused before spawn.
const READ_ONLY_AZ = [
  ["account", "show"],
  ["functionapp", "function", "list"],
];
const FORBIDDEN_AZ = /(create|update|delete|remove|set|restart|start|stop|swap|publish|keys|secret|connection|login|logout|invoke|deploy|config)/i;

function assertReadOnly(args) {
  const allowed = READ_ONLY_AZ.some((prefix) => prefix.every((token, index) => args[index] === token));
  if (!allowed) throw new Error(`refusing a non-allowlisted az command: az ${args.join(" ")}`);
  for (const arg of args) {
    if (!arg.startsWith("-") && FORBIDDEN_AZ.test(arg)) {
      throw new Error(`refusing an az argument that is not read-only: ${arg}`);
    }
  }
}

function az(args) {
  assertReadOnly(args);
  const azExecutable = process.platform === "win32" ? "az.cmd" : "az";
  const result = spawnSync(azExecutable, [...args, "-o", "json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return result;
}

/** Pure comparison: azureCounts is { liveFactsPath: number }. Returns mismatch strings. */
export function compareGovernedFields({ evidence, liveFacts, azureCounts }) {
  const findings = [];
  const registryValue = (path) => path.split(".").reduce((current, key) => (current == null ? undefined : current[key]), liveFacts);
  for (const field of evidence.fields) {
    if (!(field.path in azureCounts)) continue; // only ARM-probable fields are compared here
    const live = azureCounts[field.path];
    if (live !== field.value) {
      findings.push(`${field.path}: Azure ${live} vs committed evidence ${field.value}`);
    }
    const registry = registryValue(field.path);
    if (live !== registry) {
      findings.push(`${field.path}: Azure ${live} vs LIVE_FACTS ${registry}`);
    }
  }
  return findings;
}

function haveCredentials() {
  const probe = az(["account", "show"]);
  return !probe.error && probe.status === 0;
}

function main() {
  const liveFacts = JSON.parse(readFileSync(join(ROOT, "LIVE_FACTS.json"), "utf8"));
  const evidence = JSON.parse(readFileSync(join(ROOT, EVIDENCE_PATH), "utf8"));

  if (!haveCredentials()) {
    console.log(
      "SKIP: Azure credentials are not present (az account show failed). No live verification was performed; this run is NOT proof of live-registry parity.",
    );
    process.exit(0);
  }

  const resourceGroup = liveFacts.environment?.resourceGroup;
  const azureCounts = {};
  const queryFailures = [];
  for (const field of evidence.fields) {
    if (!field.path.endsWith(".functionCount")) continue; // baseTableCount needs a DB read, not ARM
    const surface = field.path.split(".")[1];
    const resource = liveFacts.deployables?.[surface]?.resource;
    if (!resource) {
      queryFailures.push(`${field.path}: no resource name in LIVE_FACTS`);
      continue;
    }
    const result = az(["functionapp", "function", "list", "-n", resource, "-g", resourceGroup]);
    if (result.error || result.status !== 0) {
      queryFailures.push(`${field.path}: az query failed for ${resource} (${(result.stderr || result.error?.message || "").trim().slice(0, 200)})`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      queryFailures.push(`${field.path}: az returned non-JSON for ${resource}`);
      continue;
    }
    azureCounts[field.path] = Array.isArray(parsed) ? parsed.length : 0;
  }

  const mismatches = compareGovernedFields({ evidence, liveFacts, azureCounts });

  // Sanitised artifact — counts only, no settings/secrets/identifiers beyond resource names.
  const artifact = {
    comparedAt: liveFacts.lastVerified,
    resourceGroup,
    azureCounts,
    mismatches,
    queryFailures,
    result: mismatches.length === 0 && queryFailures.length === 0 ? "match" : "drift",
  };
  const artifactPath = join(ROOT, ".artifacts", "live-facts-compare.json");
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify(artifact, null, 2));

  if (queryFailures.length > 0 || mismatches.length > 0) {
    console.error("\nLIVE_FACTS live comparison: FAILED (fails closed on any query failure or mismatch).");
    process.exit(1);
  }
  console.log("\nLIVE_FACTS live comparison: OK — every ARM-probable governed count matches Azure and the registry.");
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
