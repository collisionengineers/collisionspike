import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  analyzeDerivations,
  planNumber,
  structuralGaps,
} from "./check-derivation-summaries.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// A structurally complete summary body used by the positive synthetic cases.
const COMPLETE_SUMMARY = [
  "# PLAN-013 derivation summary",
  "## Review boundary",
  "Distilled at commit 6403f4eaed10cfbbb16dd3e5186b8ebfb0f094cf.",
  "## Immutable source references",
  "| path | 3421f7928d231e33b3d9c7a4a0ae06674d6981c7 |",
  "## Adopted, changed, and dropped decisions",
  "Adopted.",
  "## Volatile-claim revalidation",
  "No live state changed.",
].join("\n");

const plan = (id, derivationSummary) => ({
  frontmatter: derivationSummary === undefined ? { id } : { id, "derivation-summary": derivationSummary },
});

const resolveOk = () => "/virtual/summary.md";
const resolveMissing = () => null;

test("the real plan corpus passes", () => {
  const plans = [{ frontmatter: { id: "PLAN-012", "derivation-summary": "docs/tickets/plans/PLAN-012.derivation.md" } }];
  const findings = analyzeDerivations(plans, {
    resolve: (path) => (existsSync(join(REPO, path)) ? join(REPO, path) : null),
    read: (absolute) => readFileSync(absolute, "utf8"),
  });
  assert.deepEqual(findings, []);
});

test("A3: fails on a plan (>= PLAN-012) missing a derivation-summary — an unchanged source draft still needs one", () => {
  const findings = analyzeDerivations([plan("PLAN-013")], { resolve: resolveOk, read: () => COMPLETE_SUMMARY });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /missing derivation-summary/);
  assert.match(findings[0].detail, /even when the source draft is unchanged/);
});

test("A3: fails on an unresolved derivation-summary path", () => {
  const findings = analyzeDerivations([plan("PLAN-013", "docs/tickets/plans/PLAN-013.derivation.md")], {
    resolve: resolveMissing,
    read: () => COMPLETE_SUMMARY,
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /does not resolve/);
});

test("A3: fails on a structurally incomplete summary (missing a section)", () => {
  const withoutVolatile = COMPLETE_SUMMARY.replace("## Volatile-claim revalidation", "## Something else");
  const findings = analyzeDerivations([plan("PLAN-013", "x.md")], { resolve: resolveOk, read: () => withoutVolatile });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /structurally incomplete/);
  assert.match(findings[0].detail, /Volatile-claim revalidation/);
});

test("A3: fails a summary that has the sections but no immutable reference", () => {
  const noRef = COMPLETE_SUMMARY.replace("6403f4eaed10cfbbb16dd3e5186b8ebfb0f094cf", "recent").replace("3421f7928d231e33b3d9c7a4a0ae06674d6981c7", "some-path");
  const findings = analyzeDerivations([plan("PLAN-013", "x.md")], { resolve: resolveOk, read: () => noRef });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /no immutable blob\/commit reference/);
});

test("a complete summary passes", () => {
  const findings = analyzeDerivations([plan("PLAN-013", "x.md")], { resolve: resolveOk, read: () => COMPLETE_SUMMARY });
  assert.deepEqual(findings, []);
});

test("earlier plans (< PLAN-012) are grandfathered", () => {
  const findings = analyzeDerivations([plan("PLAN-005"), plan("PLAN-011")], { resolve: resolveMissing, read: () => "" });
  assert.deepEqual(findings, []);
});

test("planNumber parses plan ids", () => {
  assert.equal(planNumber("PLAN-012"), 12);
  assert.equal(planNumber("PLAN-007"), 7);
  assert.equal(planNumber("nope"), null);
});

test("structuralGaps reports every missing section and the reference", () => {
  const gaps = structuralGaps("# empty");
  assert.equal(gaps.length, 5);
  assert.ok(gaps.some((g) => /Review boundary/.test(g)));
  assert.ok(gaps.some((g) => /no immutable blob\/commit reference/.test(g)));
});
