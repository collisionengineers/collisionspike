/* ============================================================================
 * Case Status parity test (Vitest).
 *
 * Asserts the deployable Dataverse choice set `choicesets/case-status.json`
 * matches the contracts' CaseStatus union 1:1 -- same value labels, no extras
 * on either side. This is the "small consumable for the parity test" the schema
 * spec keeps importable.
 *
 * Run once Vitest is wired into the Code App (Phase 0/1, §8.1). Until then the
 * equivalent assertion runs offline via `node dataverse/verify-parity.mjs`.
 *
 * Source of truth for the union: mockup-app/src/mock/types.ts (the prototype
 * CaseStatus union) -- which itself mirrors data-model.md and the ported
 * src/contracts/case-status.ts. Swap the import below to the ported contract
 * once it exists.
 * ========================================================================== */
import { describe, it, expect } from "vitest";
import caseStatus from "./choicesets/case-status.json";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** Extract the CaseStatus string-literal union from the prototype types file. */
function prototypeCaseStatusUnion(): string[] {
  const types = readFileSync(
    resolve(here, "../mockup-app/src/mock/types.ts"),
    "utf8",
  );
  const body = types.match(/export type CaseStatus\s*=([\s\S]*?);/)?.[1] ?? "";
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("Case Status choice set <-> CaseStatus union parity", () => {
  const optionNames = caseStatus.options.map((o) => o.name);
  const union = prototypeCaseStatusUnion();

  it("has exactly 11 options", () => {
    expect(optionNames).toHaveLength(11);
    expect(union).toHaveLength(11);
  });

  it("option names equal the CaseStatus union 1:1 (set equality)", () => {
    expect([...optionNames].sort()).toEqual([...union].sort());
  });

  it("preserves the canonical pipeline order in integer values", () => {
    const ascByValue = [...caseStatus.options]
      .sort((a, b) => a.value - b.value)
      .map((o) => o.name);
    expect(ascByValue).toEqual([
      "new_email",
      "ingested",
      "needs_review",
      "missing_required_fields",
      "missing_images",
      "duplicate_risk",
      "linked_to_instruction",
      "ready_for_eva",
      "eva_submitted",
      "box_synced",
      "error",
    ]);
  });

  it("every option carries a non-empty human label", () => {
    for (const o of caseStatus.options) {
      expect(o.label.length).toBeGreaterThan(0);
    }
  });

  it("integer values are unique and stable identifiers", () => {
    const values = caseStatus.options.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
