import assert from "node:assert/strict";
import test from "node:test";

import { compareGovernedFields } from "./live-facts-azure-compare.mjs";

const evidence = {
  fields: [
    { path: "deployables.parser.functionCount", value: 5 },
    { path: "deployables.dataApi.functionCount", value: 144 },
    { path: "deployables.database.baseTableCount", value: 78 },
  ],
};
const liveFacts = {
  deployables: {
    parser: { functionCount: 5 },
    dataApi: { functionCount: 144 },
    database: { baseTableCount: 78 },
  },
};

test("no mismatch when Azure agrees with evidence and registry", () => {
  const azureCounts = { "deployables.parser.functionCount": 5, "deployables.dataApi.functionCount": 144 };
  assert.deepEqual(compareGovernedFields({ evidence, liveFacts, azureCounts }), []);
});

test("reports a mismatch against both evidence and registry", () => {
  const azureCounts = { "deployables.parser.functionCount": 6 };
  const findings = compareGovernedFields({ evidence, liveFacts, azureCounts });
  assert.ok(findings.some((f) => /Azure 6 vs committed evidence 5/.test(f)));
  assert.ok(findings.some((f) => /Azure 6 vs LIVE_FACTS 5/.test(f)));
});

test("only ARM-probed fields are compared (baseTableCount skipped without an Azure value)", () => {
  const azureCounts = { "deployables.parser.functionCount": 5 };
  assert.deepEqual(compareGovernedFields({ evidence, liveFacts, azureCounts }), []);
});
