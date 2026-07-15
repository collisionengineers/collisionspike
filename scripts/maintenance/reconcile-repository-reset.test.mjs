import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReconciliation, validateReconciliation } from "./reconcile-repository-reset.mjs";

function entry(path, sha256, owner = "repository") {
  return { path, mediaType: "text/plain", size: 1, sha256, category: "source", owner, lifecycle: "active" };
}

test("accounts for retained, moved, deleted and created paths", () => {
  const baseline = { entries: [entry("README.md", "a"), entry("api/a.ts", "b"), entry("gone.txt", "c")] };
  const final = { entries: [entry("README.md", "a"), entry("services/data-api/a.ts", "b"), entry("docs/new.md", "d", "documentation")] };
  const result = buildReconciliation(baseline, final);
  assert.equal(result.summary.unexplained, 0);
  assert.deepEqual(result.baselineEntries.map((item) => item.disposition), ["keep", "move", "delete"]);
  assert.deepEqual(result.finalEntries.map((item) => item.state), ["retained", "moved", "created"]);
});

test("fails an unowned final row", () => {
  const document = buildReconciliation({ entries: [] }, { entries: [entry("docs/new.md", "d", "")] });
  assert.ok(validateReconciliation(document).some((issue) => issue.includes("unexplained final entry")));
});
