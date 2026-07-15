#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRuntimeContractSnapshot,
  compareRuntimeContractSnapshots,
  validateApprovedDeltas,
} from "./runtime-contract-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SNAPSHOT = path.join(ROOT, "contracts/runtime-contract.snapshot.json");
const APPROVALS = path.join(ROOT, "contracts/runtime-contract.approved-deltas.json");

function serialized(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function main() {
  const current = buildRuntimeContractSnapshot(ROOT);
  if (process.argv.includes("--write")) {
    writeFileSync(SNAPSHOT, serialized(current), "utf8");
    console.log("Wrote " + path.relative(ROOT, SNAPSHOT).replaceAll("\\", "/"));
  }

  const expected = readJson(SNAPSHOT);
  const approvals = readJson(APPROVALS);
  const differences = compareRuntimeContractSnapshots(expected, current);
  const approvalIssues = validateApprovedDeltas(current, approvals);
  if (differences.length || approvalIssues.length) {
    console.error("Runtime-contract check failed.");
    for (const difference of differences) console.error("- snapshot " + difference);
    for (const issue of approvalIssues) console.error("- approval " + issue);
    process.exitCode = 1;
    return;
  }
  console.log(
    "Runtime-contract check passed: "
      + current.httpRoutes.count
      + " routes, "
      + current.domainDtos.count
      + " DTO declarations, "
      + current.jsonSchemas.count
      + " JSON schemas, "
      + current.postgresBaseline.tables.length
      + " Postgres tables, "
      + current.numericCodes.tableCount
      + " numeric code tables.",
  );
}

main();
