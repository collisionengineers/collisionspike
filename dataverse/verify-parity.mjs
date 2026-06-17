// Offline parity/integrity check for the CollisionSpike schema-as-code.
// Run: node dataverse/verify-parity.mjs   (from repo root)
// No tenant contact -- pure file reads. This is the small consumable the
// Vitest parity test mirrors: case-status labels/names == prototype CaseStatus union 1:1.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(repo, p), "utf8"));
let fail = 0;
const ok = (c, msg) => { console.log((c ? "PASS" : "FAIL") + " " + msg); if (!c) fail++; };

// --- 1) CaseStatus parity vs prototype union --------------------------------
const cs = read("dataverse/choicesets/case-status.json");
const names = cs.options.map((o) => o.name);
// The CaseStatus union + TERMINAL_STATUSES now live in the canonical contract
// (mockup-app/src/contracts/case-status.ts); mock/types.ts re-exports them.
const contract = fs.readFileSync(path.join(repo, "mockup-app/src/contracts/case-status.ts"), "utf8");
const unionBody = contract.match(/export type CaseStatus\s*=([\s\S]*?);/)[1];
const union = [...unionBody.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
const setN = new Set(names), setU = new Set(union);
const onlyCs = names.filter((n) => !setU.has(n));
const onlyU = union.filter((n) => !setN.has(n));
ok(names.length === 11, `case-status has 11 options (got ${names.length})`);
ok(onlyCs.length === 0 && onlyU.length === 0,
   `case-status names == contract CaseStatus union 1:1 (extra-in-set=${JSON.stringify(onlyCs)}, extra-in-union=${JSON.stringify(onlyU)})`);
const vals = cs.options.map((o) => o.value);
ok(new Set(vals).size === vals.length, "case-status integer values are unique");
ok(cs.options.every((o) => o.label && o.label.length > 0), "every case-status option has a label");

// --- 1b) Terminal-set parity: contract TERMINAL_STATUSES == choiceset stateMachine.terminals ---
const termBody = contract.match(/export const TERMINAL_STATUSES[^=]*=\s*\[([\s\S]*?)\]/)[1];
const contractTerminals = [...termBody.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
const csTerminals = [...((cs.stateMachine && cs.stateMachine.terminals) || [])].sort();
ok(contractTerminals.length === 3 &&
   JSON.stringify(contractTerminals) === JSON.stringify(csTerminals),
   `contract TERMINAL_STATUSES == choiceset stateMachine.terminals (contract=${JSON.stringify(contractTerminals)}, choiceset=${JSON.stringify(csTerminals)})`);

// --- 2) Case carries exactly the 13 EVA fields in order ---------------------
const caseTable = read("dataverse/schema/case.json");
const eva = caseTable.columns.filter((c) => c.evaField);
const orders = eva.map((c) => c.evaOrder).sort((a, b) => a - b);
ok(eva.length === 13, `Case has 13 EVA fields (got ${eva.length})`);
ok(orders.join(",") === "1,2,3,4,5,6,7,8,9,10,11,12,13", "EVA fields are evaOrder 1..13 with no gaps/dupes");

// --- 3) Overview-only columns are flagged must-not-drive-workflow -----------
const ov = caseTable.columns.filter((c) => c.logicalName.startsWith("cr1bd_ov"));
ok(ov.length > 0 && ov.every((c) => c.mustNotDriveWorkflow === true),
   `all ${ov.length} overview-only columns flagged mustNotDriveWorkflow`);

// --- 4) Every lookup column references an existing table + matching reln ----
const tableFiles = fs.readdirSync(path.join(repo, "dataverse/schema"))
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const tables = tableFiles.map((f) => read("dataverse/schema/" + f));
const logicalNames = new Set(tables.map((t) => t.logicalName));
const rel = read("dataverse/relationships.json");
const relSchemaNames = new Set([...rel.oneToMany.map((r) => r.schemaName)]);
let lookupCheck = true;
for (const t of tables) {
  for (const c of (t.columns || []).filter((c) => c.type === "Lookup")) {
    if (!logicalNames.has(c.target)) { console.log(`  lookup ${t.logicalName}.${c.logicalName} -> unknown target ${c.target}`); lookupCheck = false; }
    if (!relSchemaNames.has(c.relationshipSchemaName)) { console.log(`  lookup ${t.logicalName}.${c.logicalName} -> reln ${c.relationshipSchemaName} not in relationships.json`); lookupCheck = false; }
  }
}
ok(lookupCheck, "every Lookup column targets an existing table and a declared 1:N relationship");

// --- 5) Exactly 10 business tables + the provenance table, 4 m1-live --------
ok(tables.length === 11, `11 table files present (10 business tables + FieldLevelProvenance) (got ${tables.length})`);
const m1 = tables.filter((t) => t.lifecycle.state === "m1-live").map((t) => t.logicalName).sort();
ok(m1.length === 4 && m1.join(",") === "cr1bd_auditevent,cr1bd_case,cr1bd_evidence,cr1bd_workprovider",
   `exactly the 4 M1-live tables (got ${JSON.stringify(m1)})`);

// --- 6) Env-var manifest: frozen M1 defaults + secrets are references only ---
const env = read("dataverse/environment-variables.json");
const byName = Object.fromEntries(env.variables.map((v) => [v.schemaName, v]));
const expect = {
  "cr1bd_PDF_MAPPER_ENABLED": "true", "cr1bd_ENRICHMENT_ENABLED": "true",
  "cr1bd_EVA_API_ENABLED": "false", "cr1bd_AZURE_MAPS_ENABLED": "false",
  "cr1bd_VALUATION_ENABLED": "false", "cr1bd_COPILOT_ENABLED": "false",
  "cr1bd_AZURE_VISION_ENABLED": "false",
};
let envOk = true;
for (const [k, want] of Object.entries(expect)) {
  if (!byName[k] || byName[k].defaultValue !== want) { console.log(`  env ${k} default expected ${want}, got ${byName[k] && byName[k].defaultValue}`); envOk = false; }
}
ok(envOk, "frozen M1 env-var defaults match");
const secrets = env.variables.filter((v) => v.type === "Secret");
ok(secrets.length > 0 && secrets.every((v) => v.keyVault && v.keyVault.reference === true && !("defaultValue" in v)),
   `all ${secrets.length} secret env-vars are Key Vault references with no literal value`);

// --- 6b) Structural conformance: prefixes, required enums, choiceSet refs ----
const choiceFiles = fs.readdirSync(path.join(repo, "dataverse/choicesets")).filter((f) => f.endsWith(".json"));
const declaredChoiceSets = new Set();
for (const f of choiceFiles) {
  const c = read("dataverse/choicesets/" + f);
  if (c.kind === "global-choice-set") declaredChoiceSets.add(c.logicalName);
  if (c.kind === "global-choice-set-bundle") c.choiceSets.forEach((s) => declaredChoiceSets.add(s.logicalName));
}
let structOk = true;
const reqEnum = new Set(["none", "recommended", "required"]);
for (const t of tables) {
  if (!/^cr1bd_[a-z0-9]+$/.test(t.logicalName)) { console.log("  bad table logicalName " + t.logicalName); structOk = false; }
  if (!["m1-live", "staged"].includes(t.lifecycle.state)) { console.log("  bad lifecycle on " + t.logicalName); structOk = false; }
  for (const c of (t.columns || [])) {
    if (!/^cr1bd_[a-z0-9]+$/.test(c.logicalName)) { console.log(`  bad column logicalName ${t.logicalName}.${c.logicalName}`); structOk = false; }
    if (c.required && !reqEnum.has(c.required)) { console.log(`  bad required on ${t.logicalName}.${c.logicalName}`); structOk = false; }
    if ((c.type === "Choice" || c.type === "Choices") && !declaredChoiceSets.has(c.choiceSet)) {
      console.log(`  ${t.logicalName}.${c.logicalName} references undeclared choiceSet ${c.choiceSet}`); structOk = false;
    }
  }
}
ok(structOk, "all table/column logical names match cr1bd_ pattern and all Choice columns resolve to a declared choice set");

// --- 7) Print-red #c80a32 must never appear as a COLOR VALUE in the spec ----
// (Docs that name the token to forbid it are fine; we flag the actual hex color.)
let redHit = false;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p);
  else if (e.name.endsWith(".json")) {
    if (fs.readFileSync(p, "utf8").toLowerCase().includes("#c80a32")) { console.log("  print-red color used in " + p); redHit = true; }
  }
});
walk(path.join(repo, "dataverse"));
ok(!redHit, "no print-red #c80a32 used as a color value in any dataverse spec file");

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
