import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  analyzeConsolidationGuards,
  analyzeFixtures,
  analyzePlanKinds,
  analyzeWiring,
  deriveGuardRegister,
  evaluateGuards,
  loadPlanRecords,
  makeFixtureProbe,
  toPlanRecord,
} from "./check-guard-register.mjs";

const readRepo = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

// A complete, valid consolidation record used as the baseline the negative cases mutate.
const VALID_CONSOLIDATION = {
  id: "PLAN-900",
  kind: "consolidation",
  terminalGuard: "TKT-901",
  terminalGuardCommand: "check:demo-guard",
  guardMode: "ast-import",
  members: ["TKT-900", "TKT-901"],
};

const okFixtureProbe = () => ({ ok: true, detail: "fixtures present" });
const wiredScripts = { "check:demo-guard": "node scripts/checks/check-demo-guard.mjs" };
const wiredVerifyAll = "  ['Demo', 'node scripts/checks/check-demo-guard.mjs'],\n";

test("the live plan corpus passes with zero findings", () => {
  const records = loadPlanRecords();
  const scripts = JSON.parse(readRepo("../../package.json")).scripts;
  const { register, findings } = evaluateGuards(records, {
    scripts,
    verifyAllText: readRepo("../../verify-all.mjs"),
    fixtureProbe: makeFixtureProbe({ scripts }),
  });
  assert.equal(findings.length, 0, JSON.stringify(findings));
  assert.ok(register.length >= 4, "expected the four series terminal guards");
});

test("A3: fails on a plan missing plan-kind", () => {
  const records = [toPlanRecord({ id: "PLAN-901" }, [])];
  const findings = analyzePlanKinds(records);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /missing plan-kind/);
});

test("plan-kind must be from the allowed set", () => {
  const findings = analyzePlanKinds([{ id: "PLAN-902", kind: "invented", members: [] }]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /invalid plan-kind/);
});

test("A3: fails on a consolidation plan missing guard metadata", () => {
  const record = { ...VALID_CONSOLIDATION, terminalGuardCommand: undefined, guardMode: undefined };
  const findings = analyzeConsolidationGuards([record]);
  const details = findings.map((f) => f.detail).join("\n");
  assert.match(details, /missing terminal-guard-command/);
  assert.match(details, /missing guard-mode/);
});

test("A3: fails on a non-member guard ticket", () => {
  const record = { ...VALID_CONSOLIDATION, terminalGuard: "TKT-999" };
  const findings = analyzeConsolidationGuards([record]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /TKT-999 is not a member of PLAN-900/);
});

test("guard-mode must be from the allowed set", () => {
  const record = { ...VALID_CONSOLIDATION, guardMode: "lexical-grep" };
  const findings = analyzeConsolidationGuards([record]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /invalid guard-mode/);
});

test("a non-consolidation plan must not declare terminal-guard fields", () => {
  const record = {
    id: "PLAN-903",
    kind: "feature",
    terminalGuard: "TKT-950",
    terminalGuardCommand: undefined,
    guardMode: undefined,
    members: ["TKT-950"],
  };
  const findings = analyzeConsolidationGuards([record]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /must not declare terminal-guard/);
});

test("A3: fails when a command is absent from the offline aggregate verifier", () => {
  const register = deriveGuardRegister([VALID_CONSOLIDATION]);
  assert.equal(register.length, 1);
  // Present as a script, but not wired into verify-all.
  const findings = analyzeWiring(register, {
    scripts: wiredScripts,
    verifyAllText: "// nothing wired here\n",
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /not wired into the offline aggregate verifier/);
});

test("fails when a command is not a package script at all", () => {
  const register = deriveGuardRegister([VALID_CONSOLIDATION]);
  const findings = analyzeWiring(register, { scripts: {}, verifyAllText: wiredVerifyAll });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /is not a package\.json script/);
});

test("a correctly wired command produces no wiring finding", () => {
  const register = deriveGuardRegister([VALID_CONSOLIDATION]);
  const findings = analyzeWiring(register, { scripts: wiredScripts, verifyAllText: wiredVerifyAll });
  assert.equal(findings.length, 0);
});

test("A4: fails when a registered guard lacks mode-appropriate fixtures", () => {
  const register = deriveGuardRegister([VALID_CONSOLIDATION]);
  const findings = analyzeFixtures(register, () => ({ ok: false, detail: "no fixtures directory" }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /lacks mode-appropriate fixtures/);
});

test("the real fixture probe resolves the shipped ast-import guard fixtures", () => {
  const probe = makeFixtureProbe({
    scripts: { "check:route-authority": "node scripts/checks/check-route-authority.mjs" },
  });
  const result = probe({ plan: "PLAN-008", mode: "ast-import", command: "check:route-authority" });
  assert.equal(result.ok, true, result.detail);
});

test("the real fixture probe resolves the behavioural-fixture parity corpus", () => {
  const probe = makeFixtureProbe({ scripts: { "check:parity": "npm run test -- parser-parity" } });
  const result = probe({ plan: "PLAN-011", mode: "behavioural-fixture", command: "check:parity" });
  assert.equal(result.ok, true, result.detail);
});
