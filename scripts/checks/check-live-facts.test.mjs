import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { analyzeLiveFacts, collectGovernedNumericPaths, getPath } from "./check-live-facts.mjs";

const EVIDENCE_PATH = "docs/operations/live-facts.evidence.json";

function validInputs() {
  const liveFacts = {
    lastVerified: "2026-07-19T22:40:05Z",
    deployables: {
      dataApi: { functionCount: 144 },
      parser: { functionCount: 5 },
      database: { baseTableCount: 78 },
    },
    authority: { machineEvidence: { path: EVIDENCE_PATH, sha256: "deadbeef" } },
  };
  const evidence = {
    capturedAt: "2026-07-19T22:40:05Z",
    fields: [
      { path: "deployables.dataApi.functionCount", value: 144, comparison: "exact", evidenceSource: "s", probe: "p" },
      { path: "deployables.parser.functionCount", value: 5, comparison: "exact", evidenceSource: "s", probe: "p" },
      { path: "deployables.database.baseTableCount", value: 78, comparison: "exact", evidenceSource: "s", probe: "p" },
    ],
  };
  return {
    liveFacts,
    evidence,
    evidenceSha256: "deadbeef",
    evidencePath: EVIDENCE_PATH,
    docText: "last verified there on\n2026-07-19. The registry wins.",
  };
}

test("the real committed registry, snapshot, and doc pass", () => {
  const repo = (relative) => fileURLToPath(new URL(relative, import.meta.url));
  const liveFacts = JSON.parse(readFileSync(repo("../../LIVE_FACTS.json"), "utf8"));
  const evidenceBytes = readFileSync(repo(`../../${EVIDENCE_PATH}`));
  const findings = analyzeLiveFacts({
    liveFacts,
    evidence: JSON.parse(evidenceBytes.toString("utf8")),
    evidenceSha256: createHash("sha256").update(evidenceBytes).digest("hex"),
    evidencePath: EVIDENCE_PATH,
    docText: readFileSync(repo("../../docs/operations/live-environment.md"), "utf8"),
  });
  assert.deepEqual(findings, []);
});

test("valid synthetic inputs pass", () => {
  assert.deepEqual(analyzeLiveFacts(validInputs()), []);
});

test("A2: fails on a stale snapshot (capturedAt != lastVerified)", () => {
  const input = validInputs();
  input.evidence.capturedAt = "2026-07-18T00:00:00Z";
  const findings = analyzeLiveFacts(input);
  assert.ok(findings.some((f) => /stale snapshot/.test(f)), findings.join("\n"));
});

test("A2: fails on a digest mismatch", () => {
  const input = validInputs();
  input.evidenceSha256 = "feedface";
  const findings = analyzeLiveFacts(input);
  assert.ok(findings.some((f) => /sha256 does not match/.test(f)), findings.join("\n"));
});

test("A2: fails on a missing mapping for a governed numeric field", () => {
  const input = validInputs();
  input.liveFacts.deployables.orchestration = { functionCount: 105 };
  const findings = analyzeLiveFacts(input);
  assert.ok(findings.some((f) => /deployables\.orchestration\.functionCount' has no evidence-snapshot mapping/.test(f)), findings.join("\n"));
});

test("A2: fails on a registry/snapshot value mismatch", () => {
  const input = validInputs();
  input.liveFacts.deployables.parser.functionCount = 4;
  const findings = analyzeLiveFacts(input);
  assert.ok(findings.some((f) => /registry\/snapshot mismatch at 'deployables\.parser\.functionCount'/.test(f)), findings.join("\n"));
});

test("A2: fails on a tracked-doc / registry date disagreement", () => {
  const input = validInputs();
  input.docText = "last verified there on\n2026-07-16.";
  const findings = analyzeLiveFacts(input);
  assert.ok(findings.some((f) => /disagrees with LIVE_FACTS\.lastVerified/.test(f)), findings.join("\n"));
});

test("collectGovernedNumericPaths enumerates every functionCount + baseTableCount leaf", () => {
  const paths = collectGovernedNumericPaths(validInputs().liveFacts);
  assert.deepEqual(paths, [
    "deployables.dataApi.functionCount",
    "deployables.database.baseTableCount",
    "deployables.parser.functionCount",
  ]);
});

test("getPath resolves nested LIVE_FACTS paths", () => {
  assert.equal(getPath(validInputs().liveFacts, "deployables.parser.functionCount"), 5);
  assert.equal(getPath(validInputs().liveFacts, "deployables.missing.functionCount"), undefined);
});
