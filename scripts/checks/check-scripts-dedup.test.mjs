import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyzeGeneratedDirectoryPolicy,
  analyzeHashCore,
  evaluateGeneratedDirectoryPolicy,
  evaluateHashCore,
  scanTree,
} from "./check-scripts-dedup.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "fixtures", "scripts-dedup");
const readFixture = (name) => fs.readFileSync(path.join(FIXTURES, name), "utf8");
const HASH_FIXTURE = "reimplemented-hash-core.fixture.mjs";
const POLICY_FIXTURE = "duplicate-generated-directory-policy.fixture.mjs";

// --- A3: the hash-core re-implementation fixture FAILS -------------------------------------------

test("A3 the hash-core re-implementation fixture is flagged as a re-implemented hash core", () => {
  const { findings } = analyzeHashCore(HASH_FIXTURE, readFixture(HASH_FIXTURE));
  assert.ok(findings.length >= 1);
  assert.ok(findings.every((finding) => finding.kind === "reimplemented-hash-core"));
});

test("A3 evaluateHashCore flags a required importer that re-implements instead of importing", () => {
  const findings = evaluateHashCore(HASH_FIXTURE, readFixture(HASH_FIXTURE), { requireSharedImport: true });
  assert.ok(findings.some((finding) => finding.kind === "reimplemented-hash-core"));
  assert.ok(findings.some((finding) => finding.kind === "missing-shared-hash-import"));
});

// --- A4: the generated-directory policy re-declaration fixture FAILS -----------------------------

test("A4 the generated-directory policy fixture re-declares both the set and the predicate", () => {
  const { definedNames } = analyzeGeneratedDirectoryPolicy(POLICY_FIXTURE, readFixture(POLICY_FIXTURE));
  assert.deepEqual([...definedNames].sort(), ["GENERATED_DIRECTORY_SEGMENTS", "generatedDirectorySegment"]);
});

test("A4 evaluateGeneratedDirectoryPolicy flags the fixture as a duplicate consumer definition", () => {
  const findings = evaluateGeneratedDirectoryPolicy(POLICY_FIXTURE, readFixture(POLICY_FIXTURE), { role: "consumer" });
  assert.ok(findings.some((finding) => finding.kind === "duplicate-generated-directory-policy"));
});

// --- A2: AST precision — comments / strings / imports are not false-flagged ----------------------

test("A2 a comment or string mentioning createHash('sha256') is NOT flagged (AST, not grep)", () => {
  const source = [
    "// legacy note: this once used createHash(\"sha256\") directly",
    "import { sha256File } from \"../checks/content-hash.mjs\";",
    "const doc = \"call createHash('sha256') here\";",
    "export const hash = (absolute) => sha256File(absolute);",
  ].join("\n");
  const { findings, importedSharedHashExports } = analyzeHashCore("scripts/maintenance/generate-repository-inventory.mjs", source);
  assert.deepEqual(findings, []);
  assert.ok(importedSharedHashExports.has("sha256File"));
});

test("A2 importing generatedDirectorySegment is NOT flagged as a re-declaration", () => {
  const source = [
    "import { generatedDirectorySegment, listRepositoryFiles } from \"./repository-files.mjs\";",
    "export const bad = listRepositoryFiles().filter(generatedDirectorySegment);",
  ].join("\n");
  const findings = evaluateGeneratedDirectoryPolicy("scripts/checks/check-tracked-outputs.mjs", source, { role: "consumer" });
  assert.deepEqual(findings, []);
});

// --- A3 (extended): the Node one-shot hash("sha256", …) API is also a re-implementation ----------

test("A3 a one-shot hash(\"sha256\", bytes) call and its { hash } import are flagged", () => {
  const source = [
    "import { hash } from \"node:crypto\";",
    "export const sha = (bytes) => hash(\"sha256\", bytes);",
  ].join("\n");
  const { findings } = analyzeHashCore("scripts/maintenance/generate-repository-inventory.mjs", source);
  assert.ok(findings.some((f) => f.kind === "reimplemented-hash-core" && /hash\("sha256"/.test(f.detail)));
  assert.ok(findings.some((f) => f.kind === "reimplemented-hash-core" && /imports \{ hash \}/.test(f.detail)));
});

// --- A1 (path half): the shared path normaliser must be imported, not reimplemented ---------------

test("A1 a required importer that reimplements normalizeRepositoryPath and drops the shared import is flagged", () => {
  const source = [
    "import { createContentHash } from \"../checks/content-hash.mjs\";",
    "function normalizeRepositoryPath(value) { return value.replaceAll(\"\\\\\", \"/\"); }",
    "export const run = () => normalizeRepositoryPath(String(createContentHash()));",
  ].join("\n");
  const findings = evaluateHashCore("scripts/maintenance/generate-repository-inventory.mjs", source, {
    requireSharedImport: true,
    requirePathImport: true,
  });
  assert.ok(findings.some((f) => f.kind === "reimplemented-inventory-core"), "local path normaliser re-decl flagged");
  assert.ok(findings.some((f) => f.kind === "missing-shared-path-import"), "dropped shared normalizeRepositoryPath import flagged");
});

// --- A1 (predicate half): a consumer must import the predicate, not just the raw set --------------

test("A1 a consumer importing only the raw set and rebuilding the predicate is flagged", () => {
  const source = [
    "import { GENERATED_DIRECTORY_SEGMENTS } from \"./repository-files.mjs\";",
    "const seg = (p) => p.split(\"/\").some((s) => GENERATED_DIRECTORY_SEGMENTS.has(s.toLowerCase()));",
    "export const blocked = (p) => seg(p);",
  ].join("\n");
  const findings = evaluateGeneratedDirectoryPolicy("scripts/checks/check-tracked-outputs.mjs", source, { role: "consumer" });
  assert.ok(findings.some((f) => f.kind === "missing-generated-directory-import"));
});

// --- A1/A5: the current tree keeps both shared internals single-source ---------------------------

test("A1 the current tree keeps the inventory hash core and generated-directory policy single-source", () => {
  const { findings } = scanTree();
  assert.deepEqual(
    findings,
    [],
    "Unexpected scripts-dedup drift:\n"
      + findings.map((finding) => `  ${finding.path}:${finding.line} [${finding.kind}] ${finding.detail}`).join("\n"),
  );
});
