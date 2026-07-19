import assert from "node:assert/strict";
import { test } from "node:test";

import { violationFor } from "./check-tracked-outputs.mjs";
import { GENERATED_DIRECTORY_SEGMENTS, generatedDirectorySegment } from "./repository-files.mjs";

test("accepts an ordinary source path", () => {
  assert.equal(violationFor("apps/web/src/main.ts"), null);
});

test("rejects mixed-case and backslash generated directories via the shared predicate", () => {
  assert.equal(violationFor("apps/web/.VENV/pyvenv.cfg"), "generated directory: .venv");
  assert.equal(violationFor("packages\\domain\\Dist\\index.js"), "generated directory: dist");
  assert.equal(violationFor("scripts/.Ruff_Cache/CACHEDB"), "generated directory: .ruff_cache");
});

test("rejects the reconciled .artifacts segment inherited from the layout policy", () => {
  assert.equal(violationFor("docs/.Artifacts/report.json"), "generated directory: .artifacts");
});

test("still enforces the non-directory tracked-output rules", () => {
  assert.equal(violationFor("deploy/functions/host.json"), "deployment staging tree");
  assert.equal(violationFor("scripts/checks/local/run.txt"), "local run output");
  assert.equal(violationFor("packages/domain/model.generated.ts"), "generated source artifact");
  assert.equal(violationFor("apps/web/build.tsbuildinfo"), "generated extension: .tsbuildinfo");
});

test("the shared predicate normalises separators and case-folds segments", () => {
  assert.equal(generatedDirectorySegment("A\\B\\.MyPy_Cache\\x"), ".mypy_cache");
  assert.equal(generatedDirectorySegment("apps/web/src/main.ts"), null);
  for (const segment of GENERATED_DIRECTORY_SEGMENTS) {
    assert.equal(segment, segment.toLowerCase(), `set entry must be lower-case: ${segment}`);
  }
});
