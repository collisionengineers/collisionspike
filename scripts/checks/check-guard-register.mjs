#!/usr/bin/env node
/**
 * Anti-drift guard register meta-guard (TKT-271 / PLAN-012).
 *
 * The consolidation series (PLAN-007/008/010/011) each specify a terminal drift guard, but plan
 * frontmatter did not identify consolidation plans or their guard ticket/command. A future plan could
 * omit itself from a hand-maintained registry with nothing to catch it. This meta-guard closes that
 * gap: the canonical guard register is DERIVED from plan metadata (never hand-maintained), and every
 * registered guard is checked for (a) a real, present terminal-guard ticket that is a member of the
 * plan, (b) a command that resolves to a package script wired into the offline aggregate verifier
 * (`verify-all.mjs`), and (c) mode-appropriate negative fixtures.
 *
 * Guard modes are modality-appropriate by design (see ADR-0033 and docs/governance/anti-drift-guards.md):
 *   ast-import          — AST/import analysis of TypeScript source syntax.
 *   import-reference    — import/reference analysis of shared-source policy.
 *   behavioural-fixture — cross-language behavioural fixtures.
 *   machine-evidence    — machine-readable evidence comparison for live state.
 * A naive lexical ban is never an accepted mode.
 *
 * The analysis functions are pure and dependency-injected so the negative cases (missing plan-kind,
 * a consolidation plan missing guard metadata, a non-member guard ticket, a command absent from the
 * aggregate verifier, and a guard missing mode-appropriate fixtures) are exercised by the sibling
 * check-guard-register.test.mjs.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CONSOLIDATION_PLAN_KIND,
  GUARD_MODES,
  PLAN_KINDS,
  ROOT,
  TERMINAL_GUARD_FIELDS,
  discoverPlans,
  discoverTickets,
  ticketsByPlan,
} from "../maintenance/ticket-system.mjs";

// --- normalization ---------------------------------------------------------

/** Build the analysis record a plan contributes: kind, guard fields, and member ticket ids. */
export function toPlanRecord(frontmatter, memberIds) {
  return {
    id: frontmatter?.id ?? "(unknown plan)",
    kind: frontmatter?.["plan-kind"],
    terminalGuard: frontmatter?.["terminal-guard"],
    terminalGuardCommand: frontmatter?.["terminal-guard-command"],
    guardMode: frontmatter?.["guard-mode"],
    members: Array.isArray(memberIds) ? memberIds : [],
  };
}

const TERMINAL_GUARD_FIELD_BY_KEY = {
  "terminal-guard": (record) => record.terminalGuard,
  "terminal-guard-command": (record) => record.terminalGuardCommand,
  "guard-mode": (record) => record.guardMode,
};

// --- pure analysis ---------------------------------------------------------

/** Every plan must declare a valid plan-kind. */
export function analyzePlanKinds(records) {
  const findings = [];
  for (const record of records) {
    if (!record.kind) {
      findings.push({ plan: record.id, detail: "missing plan-kind" });
    } else if (!PLAN_KINDS.includes(record.kind)) {
      findings.push({
        plan: record.id,
        detail: `invalid plan-kind '${record.kind}' (expected one of ${PLAN_KINDS.join(", ")})`,
      });
    }
  }
  return findings;
}

/**
 * A consolidation plan must carry every terminal-guard field, a valid guard-mode, and a terminal-guard
 * ticket that is a member of the plan. A non-consolidation plan must NOT carry terminal-guard fields.
 */
export function analyzeConsolidationGuards(records) {
  const findings = [];
  for (const record of records) {
    const isConsolidation = record.kind === CONSOLIDATION_PLAN_KIND;
    if (isConsolidation) {
      for (const field of TERMINAL_GUARD_FIELDS) {
        if (!TERMINAL_GUARD_FIELD_BY_KEY[field](record)) {
          findings.push({ plan: record.id, detail: `consolidation plan missing ${field}` });
        }
      }
      if (record.guardMode && !GUARD_MODES.includes(record.guardMode)) {
        findings.push({
          plan: record.id,
          detail: `invalid guard-mode '${record.guardMode}' (expected one of ${GUARD_MODES.join(", ")})`,
        });
      }
      if (record.terminalGuard && !record.members.includes(record.terminalGuard)) {
        findings.push({
          plan: record.id,
          detail: `terminal-guard ticket ${record.terminalGuard} is not a member of ${record.id}`,
        });
      }
    } else {
      for (const field of TERMINAL_GUARD_FIELDS) {
        if (TERMINAL_GUARD_FIELD_BY_KEY[field](record)) {
          findings.push({
            plan: record.id,
            detail: `non-consolidation plan (plan-kind '${record.kind ?? "?"}') must not declare ${field}`,
          });
        }
      }
    }
  }
  return findings;
}

/** The canonical guard register: one entry per consolidation plan that carries a complete guard triple. */
export function deriveGuardRegister(records) {
  return records
    .filter(
      (record) =>
        record.kind === CONSOLIDATION_PLAN_KIND &&
        record.terminalGuard &&
        record.terminalGuardCommand &&
        record.guardMode,
    )
    .map((record) => ({
      plan: record.id,
      ticket: record.terminalGuard,
      command: record.terminalGuardCommand,
      mode: record.guardMode,
    }))
    .sort((left, right) => left.plan.localeCompare(right.plan, "en", { numeric: true }));
}

/** Each registered command must resolve to a package script wired into the offline aggregate verifier. */
export function analyzeWiring(register, { scripts, verifyAllText }) {
  const findings = [];
  for (const entry of register) {
    const resolved = scripts[entry.command];
    if (!resolved) {
      findings.push({
        plan: entry.plan,
        detail: `terminal-guard-command '${entry.command}' is not a package.json script`,
      });
      continue;
    }
    if (!verifyAllText.includes(resolved)) {
      findings.push({
        plan: entry.plan,
        detail: `terminal-guard-command '${entry.command}' ('${resolved}') is not wired into the offline aggregate verifier (verify-all.mjs)`,
      });
    }
  }
  return findings;
}

/** Each registered guard must ship mode-appropriate negative fixtures. */
export function analyzeFixtures(register, fixtureProbe) {
  const findings = [];
  for (const entry of register) {
    const probe = fixtureProbe(entry);
    if (!probe.ok) {
      findings.push({
        plan: entry.plan,
        detail: `guard-mode '${entry.mode}' lacks mode-appropriate fixtures: ${probe.detail}`,
      });
    }
  }
  return findings;
}

// --- real-filesystem fixture probe -----------------------------------------

function collectCorpusVectors(corpus) {
  if (!corpus || typeof corpus !== "object") return [];
  return Object.values(corpus)
    .filter(Array.isArray)
    .flat();
}

/**
 * Build the production fixture probe. Fixture conventions per mode:
 *   ast-import / import-reference / machine-evidence — a non-empty `scripts/checks/fixtures/<name>/`
 *     directory and a sibling `scripts/checks/check-<name>.test.mjs`, where <name> is derived from the
 *     command's backing `check-<name>.mjs` script.
 *   behavioural-fixture — at least one `scripts/checks/*-parity-vectors.json` corpus that carries an
 *     `allowedDivergence` vector (the negative fixture that fails closed if a side is reconciled without
 *     editing the corpus).
 */
export function makeFixtureProbe({ scripts, root = ROOT } = {}) {
  return (entry) => {
    if (entry.mode === "behavioural-fixture") {
      const checksDir = join(root, "scripts", "checks");
      const vectorFiles = existsSync(checksDir)
        ? readdirSync(checksDir).filter((name) => /-parity-vectors\.json$/.test(name))
        : [];
      for (const file of vectorFiles) {
        try {
          const corpus = JSON.parse(readFileSync(join(checksDir, file), "utf8"));
          if (collectCorpusVectors(corpus).some((vector) => vector && vector.allowedDivergence)) {
            return { ok: true, detail: `scripts/checks/${file} (allowed-divergence negative vectors)` };
          }
        } catch {
          // Not a usable corpus; try the next candidate.
        }
      }
      return {
        ok: false,
        detail: "no scripts/checks/*-parity-vectors.json with an allowedDivergence negative vector",
      };
    }

    const scriptPath = (scripts?.[entry.command] ?? "").match(/([^\s'"]+\.mjs)/)?.[1];
    if (!scriptPath) {
      return { ok: false, detail: `cannot resolve a check-<name>.mjs script for command '${entry.command}'` };
    }
    const name = scriptPath.replace(/^.*\/check-/, "").replace(/\.mjs$/, "");
    const fixturesDir = join(root, "scripts", "checks", "fixtures", name);
    const testFile = join(root, "scripts", "checks", `check-${name}.test.mjs`);
    if (!existsSync(fixturesDir) || readdirSync(fixturesDir).length === 0) {
      return { ok: false, detail: `missing or empty negative-fixture directory scripts/checks/fixtures/${name}/` };
    }
    if (!existsSync(testFile)) {
      return { ok: false, detail: `missing guard unit test scripts/checks/check-${name}.test.mjs` };
    }
    return { ok: true, detail: `scripts/checks/fixtures/${name}/ + check-${name}.test.mjs` };
  };
}

// --- orchestration ---------------------------------------------------------

/** Assemble plan records from the live ticket corpus. */
export function loadPlanRecords() {
  const plans = discoverPlans();
  const { tickets } = discoverTickets();
  const byPlan = ticketsByPlan(tickets);
  return plans.map((plan) =>
    toPlanRecord(
      plan.frontmatter,
      (byPlan.get(plan.frontmatter?.id) ?? []).map((ticket) => ticket.frontmatter.id),
    ),
  );
}

export function evaluateGuards(records, { scripts, verifyAllText, fixtureProbe }) {
  const register = deriveGuardRegister(records);
  const findings = [
    ...analyzePlanKinds(records),
    ...analyzeConsolidationGuards(records),
    ...analyzeWiring(register, { scripts, verifyAllText }),
    ...analyzeFixtures(register, fixtureProbe),
  ];
  findings.sort((left, right) => left.plan.localeCompare(right.plan, "en", { numeric: true }));
  return { register, findings };
}

function main() {
  const json = process.argv.slice(2).includes("--json");
  const unknown = process.argv.slice(2).filter((argument) => argument !== "--json");
  if (unknown.length > 0) throw new Error(`Unknown option(s): ${unknown.join(", ")}`);

  const records = loadPlanRecords();
  const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts ?? {};
  const verifyAllText = readFileSync(join(ROOT, "verify-all.mjs"), "utf8");
  const fixtureProbe = makeFixtureProbe({ scripts });
  const { register, findings } = evaluateGuards(records, { scripts, verifyAllText, fixtureProbe });

  if (json) {
    process.stdout.write(`${JSON.stringify({ register, findings }, null, 2)}\n`);
    process.exit(findings.length === 0 ? 0 : 1);
  }

  console.log("Anti-drift guard register (derived from plan metadata):");
  for (const entry of register) {
    console.log(`  ${entry.plan}  ${entry.ticket}  ${entry.mode.padEnd(19)}  ${entry.command}`);
  }
  if (findings.length > 0) {
    console.log("\n--- failures ---");
    for (const finding of findings) console.log(`  ${finding.plan}: ${finding.detail}`);
  }
  console.log(
    `\nGuard register: ${register.length} registered guard(s); ${findings.length} failure(s).`,
  );
  console.log(findings.length === 0 ? "OK" : "FAILED");
  process.exit(findings.length === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
