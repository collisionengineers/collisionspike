#!/usr/bin/env node
/**
 * Distillation-boundary reviewability guard (TKT-274 / PLAN-012).
 *
 * User-owned governance drafts are often unchanged in the pull request that distils them, so a diff
 * cannot make them reviewable and editing them merely to create a diff is forbidden. Instead every plan
 * from PLAN-012 onward declares a repository-tracked `derivation-summary` that records its source paths
 * and immutable commit/blob references, the adopted/changed/dropped decisions, and the revalidation of
 * volatile claims. This guard fails on a missing, unresolved, or structurally incomplete summary.
 *
 * It validates the SUMMARY's structure — it never `existsSync`-es the user-owned source paths cited
 * inside it, because those are content-addressed references (recorded by blob OID) and are intentionally
 * absent from the checkout. Editing `workingspace/` or `.gitattributes` is out of scope.
 *
 * Earlier plans (PLAN-001..011) predate this doctrine and are grandfathered; their distillation is
 * recorded centrally in PLAN-012's derivation summary and their ticket evidence.
 *
 * The analysis is a pure function so the negative cases are exercised by
 * check-derivation-summaries.test.mjs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, discoverPlans } from "../maintenance/ticket-system.mjs";

// The doctrine is introduced by PLAN-012 (TKT-274); it applies from that plan onward.
export const DERIVATION_REQUIRED_FROM = 12;

// A structurally complete derivation summary carries these sections and at least one immutable
// (git blob OID / commit SHA) reference — proof it pins its sources by content, not by a mutable path.
export const REQUIRED_SECTIONS = [
  "Review boundary",
  "Immutable source references",
  "Adopted, changed, and dropped decisions",
  "Volatile-claim revalidation",
];
const IMMUTABLE_REFERENCE = /\b[0-9a-f]{40}\b/;

export function planNumber(id) {
  const match = /^PLAN-(\d{3})$/.exec(id ?? "");
  return match ? Number(match[1]) : null;
}

export function structuralGaps(summaryText) {
  const gaps = [];
  for (const section of REQUIRED_SECTIONS) {
    const heading = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
    if (!heading.test(summaryText)) gaps.push(`missing "## ${section}"`);
  }
  if (!IMMUTABLE_REFERENCE.test(summaryText)) gaps.push("no immutable blob/commit reference");
  return gaps;
}

/**
 * @param {Array} plans  plan objects with a `.frontmatter`
 * @param {object} deps
 * @param {number} [deps.requiredFrom]   lowest plan number that must carry a summary
 * @param {(path: string) => (string|null)} deps.resolve  repo-relative path -> absolute, or null if absent
 * @param {(absolute: string) => string} deps.read        read a resolved summary's text
 */
export function analyzeDerivations(plans, { requiredFrom = DERIVATION_REQUIRED_FROM, resolve, read }) {
  const findings = [];
  for (const plan of plans) {
    const id = plan.frontmatter?.id;
    const number = planNumber(id);
    if (number == null || number < requiredFrom) continue;
    const path = plan.frontmatter?.["derivation-summary"];
    if (!path) {
      findings.push({
        plan: id,
        detail: "missing derivation-summary (required from PLAN-012 onward, even when the source draft is unchanged)",
      });
      continue;
    }
    const absolute = resolve(path);
    if (!absolute) {
      findings.push({ plan: id, detail: `derivation-summary does not resolve -> ${path}` });
      continue;
    }
    const gaps = structuralGaps(read(absolute));
    if (gaps.length > 0) {
      findings.push({ plan: id, detail: `derivation-summary is structurally incomplete: ${gaps.join("; ")}` });
    }
  }
  return findings;
}

function main() {
  const plans = discoverPlans();
  const resolve = (path) => {
    const absolute = join(ROOT, path);
    return existsSync(absolute) ? absolute : null;
  };
  const read = (absolute) => readFileSync(absolute, "utf8");
  const findings = analyzeDerivations(plans, { resolve, read });

  if (findings.length > 0) {
    console.log("--- derivation-summary failures ---");
    for (const finding of findings) console.log(`  ${finding.plan}: ${finding.detail}`);
    console.log("\nDerivation-summary reviewability: FAILED");
    process.exit(1);
  }
  const required = plans.filter((plan) => (planNumber(plan.frontmatter?.id) ?? -1) >= DERIVATION_REQUIRED_FROM);
  console.log(
    `Derivation-summary reviewability: OK (${required.length} plan(s) from PLAN-${String(DERIVATION_REQUIRED_FROM).padStart(3, "0")} onward carry a resolvable, structurally complete summary).`,
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
