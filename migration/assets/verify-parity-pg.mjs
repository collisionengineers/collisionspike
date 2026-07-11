// migration/assets/verify-parity-pg.mjs
// Postgres parity harness — ported from dataverse/verify-parity.mjs.
//
// Asserts that the migration P2 artefacts are byte-for-byte parity with the
// Dataverse source-of-truth files (choicesets, env-var manifest, role JSONs,
// classifier, contract). Two modes:
//
//   Static (always — no DB contact, pure file reads):
//     §1  22 choice-set integer codes + names: JSON opts vs 000_enums_lookups.sql DDL
//     §2  26 non-secret gate defaults: environment-variables.json vs plan 10 §1.1
//     §3  2 secret env-vars: KV references with no literal defaultValue
//     §4  Status-machine: stateMachine.terminals == TERMINAL_STATUSES in case-status.ts;
//           CaseStatus union is 13 members 1:1 with choice-set names; linear path intact
//     §5  Inbound-email classifier: inbound-email-classification.json names ==
//           email_classifier.py CATEGORY_*/SUBTYPE_* constants 1:1
//     §6  Role invariants from role JSONs: audit_event Write=None for both roles;
//           four corpus tables Delete=None for both roles
//
//   NOTE (2026-07-10, TKT-094 reopen): §2/§3/§6 read dataverse-era artefacts
//   (dataverse/environment-variables.json, dataverse/roles/*.json) that were purged from
//   the tree in the Power Platform teardown (commit 44268b7, 2026-06-27 — the solution was
//   cold-exported off-repo first, so the files are gone from the tree permanently). Those
//   sections now gate on file existence and SKIP with an explicit line (verify-all.mjs
//   retired-gate style) so the script stays runnable on the post-purge tree; §1/§4/§5 stay
//   enforced. A reversible rebuild that restores dataverse/ re-arms §2/§3/§6 automatically.
//
//   Live (opt-in — needs DATABASE_URL or PGCONNECTIONSTRING + pg npm package):
//     §7  Every choice_* table: live-DB rows match JSON option codes + names exactly
//     §8  app_setting seed row: hold_new_cases_by_default = 'false'
//     §9  Dedup UNIQUE constraint exists on inbound_email.source_message_id
//     §10 Audit tamper-evidence: audit_event has NO UPDATE policy in pg_policies
//
// Run from repo root:
//   node migration/assets/verify-parity-pg.mjs
//   DATABASE_URL=postgres://user:pass@host/db node migration/assets/verify-parity-pg.mjs

import fs   from "node:fs";
import path from "node:path";
import url  from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");          // assets/ -> migration/ -> repo root

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(repo, rel), "utf8"));
const readText = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");

let fail = 0;
let skipped = 0;
const ok = (cond, msg) => {
  console.log((cond ? "PASS" : "FAIL") + " " + msg);
  if (!cond) fail++;
};
// Retired-input skip (verify-all.mjs style): the section's source files were purged from
// the tree, so it can neither pass nor fail — announce it explicitly, never throw.
const skip = (msg) => {
  console.log("SKIP — " + msg);
  skipped++;
};

// ===========================================================================
// LOAD SOURCES
// ===========================================================================

// --- JSON choice sets -------------------------------------------------------
// Map: cr1bd_logicalName -> { file, options: [{value, name, label}], parityKey?, stateMachine? }
const jsonSets = new Map();
const choiceDir = path.join(repo, "packages/domain/src/data/choicesets");
for (const f of fs.readdirSync(choiceDir).filter((x) => x.endsWith(".json"))) {
  const cs = JSON.parse(fs.readFileSync(path.join(choiceDir, f), "utf8"));
  const add = (s) => jsonSets.set(s.logicalName, {
    file: f, options: s.options, parityKey: s.parityKey, stateMachine: s.stateMachine,
  });
  if (cs.kind === "global-choice-set") add(cs);
  else if (cs.kind === "global-choice-set-bundle") cs.choiceSets.forEach(add);
}

// --- DDL: 000_enums_lookups.sql --------------------------------------------
// Build: logicalName -> tableName   and   tableName -> [{code, name, label}]
const sqlText   = readText("migration/assets/schema/000_enums_lookups.sql");
const sqlLines  = sqlText.split(/\r?\n/);

const logicalToTable = new Map();     // cr1bd_xxx -> choice_yyy
const tableRows      = new Map();     // choice_yyy -> [{code, name, label}]

let pendingLogical = null;

for (const raw of sqlLines) {
  const line = raw.trim();

  // Separator lines (-- ----...) must not clear pendingLogical.
  if (line.startsWith("-- -")) continue;

  // Detect logical-name header comment: "-- cr1bd_xxx  ..."
  if (line.startsWith("--")) {
    const m = line.match(/^-- (cr1bd_\w+)(?:\s|$)/);
    if (m) { pendingLogical = m[1]; }
    continue;
  }

  // Detect CREATE TABLE
  const ctm = line.match(/^CREATE TABLE (choice_\w+)/);
  if (ctm) {
    const tname = ctm[1];
    if (pendingLogical) { logicalToTable.set(pendingLogical, tname); pendingLogical = null; }
    if (!tableRows.has(tname)) tableRows.set(tname, []);
    continue;
  }
}

// Parse INSERT VALUES using a global regex over the full SQL text (cleaner than line-by-line).
//
// FIX (2026-07-10, TKT-094 reopen): the original non-greedy `[\s\S]*?;` terminator stopped
// at the FIRST `;` — including semicolons inside `--` comments embedded mid-VALUES-list
// (e.g. the terminal-status doc comment above `removed`/`done` in choice_case_status),
// silently truncating four sets and failing §1 against a DDL that is actually complete.
// Strip line comments first (no label in this DDL contains `--` or `;` — grep-verified
// 2026-07-10; if one ever must, upgrade to a quote-aware tokenizer), then scan with a
// quote-aware terminator so a `;` inside a quoted label can never truncate either.
const sqlNoComments = sqlText.replace(/--[^\n]*/g, "");
const insertRe = /INSERT INTO (choice_\w+) \(code, name, label\) VALUES((?:'[^']*'|[^';])*);/g;
let im;
while ((im = insertRe.exec(sqlNoComments)) !== null) {
  const tname = im[1];
  if (!tableRows.has(tname)) tableRows.set(tname, []);
  const tupleRe = /\((\d+),\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g;
  let tm;
  while ((tm = tupleRe.exec(im[2])) !== null) {
    tableRows.get(tname).push({ code: parseInt(tm[1], 10), name: tm[2], label: tm[3] });
  }
}

// --- Env-var manifest (dataverse-era — purged at 44268b7; §2/§3 SKIP when absent) ------
const ENV_MANIFEST = "dataverse/environment-variables.json";
const env = fs.existsSync(path.join(repo, ENV_MANIFEST)) ? readJson(ENV_MANIFEST) : null;
const byName = env ? Object.fromEntries(env.variables.map((v) => [v.schemaName, v])) : {};

// --- Contracts (case-status.ts) --------------------------------------------
const csTsText  = readText("packages/domain/src/contracts/case-status.ts");

// --- email_classifier.py ---------------------------------------------------
const classifierSrc = readText(
  "functions/parser/cedocumentmapper_v2/rules/email_classifier.py");

// --- Role JSONs (dataverse-era — purged at 44268b7; §6 SKIPs when absent) ---
const ADMIN_ROLE_JSON = "dataverse/roles/admin-role.json";
const USER_ROLE_JSON  = "dataverse/roles/user-role.json";
const adminRole = fs.existsSync(path.join(repo, ADMIN_ROLE_JSON)) ? readJson(ADMIN_ROLE_JSON) : null;
const userRole  = fs.existsSync(path.join(repo, USER_ROLE_JSON))  ? readJson(USER_ROLE_JSON)  : null;

// ===========================================================================
// §1  CHOICE-SET INTEGER-CODE + NAME PARITY (JSON vs SQL DDL)
// ===========================================================================
console.log("\n--- §1  Choice-set code parity (22 sets, all members) ---");

ok(jsonSets.size === 22, `JSON source contains 22 global choice sets (got ${jsonSets.size})`);
ok(tableRows.size === 22, `DDL contains 22 choice_* tables (got ${tableRows.size})`);

let codeMismatch  = false;
let unmappedSets  = [];

for (const [logicalName, { file, options }] of jsonSets) {
  const tableName = logicalToTable.get(logicalName);
  if (!tableName) {
    console.log(`  MISSING table mapping for ${logicalName} (from ${file})`);
    unmappedSets.push(logicalName);
    codeMismatch = true;
    continue;
  }
  const rows = tableRows.get(tableName) ?? [];
  const sqlByCode = new Map(rows.map((r) => [r.code, r]));

  // Code count parity
  if (rows.length !== options.length) {
    console.log(`  ${logicalName}: JSON has ${options.length} opts, SQL has ${rows.length} rows`);
    codeMismatch = true;
  }

  for (const opt of options) {
    const sqlRow = sqlByCode.get(opt.value);
    if (!sqlRow) {
      console.log(`  ${logicalName}: code ${opt.value} (${opt.name}) absent from ${tableName}`);
      codeMismatch = true;
    } else if (sqlRow.name !== opt.name) {
      console.log(
        `  ${logicalName}: code ${opt.value} name mismatch — ` +
        `JSON="${opt.name}" SQL="${sqlRow.name}" in ${tableName}`);
      codeMismatch = true;
    }
  }

  // No extra codes in SQL that aren't in JSON
  const jsonCodes = new Set(options.map((o) => o.value));
  for (const row of rows) {
    if (!jsonCodes.has(row.code)) {
      console.log(`  ${logicalName}: SQL has extra code ${row.code} (${row.name}) not in JSON`);
      codeMismatch = true;
    }
  }
}

ok(!codeMismatch,
  "all 22 choice sets: every JSON option.value exists in SQL with the same code and same name");

// ===========================================================================
// §2  GATE-DEFAULT PARITY (26 non-secret env-vars, plan 10 §1.1)
// ===========================================================================
console.log("\n--- §2  Gate-default parity (26 non-secret vars, plan 10 §1.1) ---");

// Documented solution defaults from plan 10 §1.1 (schemaName -> expected defaultValue).
// ENRICHMENT_ENABLED: solution default is "false" (Dev currentValue overrides to "true");
// HOLD_NEW_CASES_BY_DEFAULT: JSON default is "false" (the field is DB-backed in the
//   new world per plan 10 §1.3 but the JSON defaultValue must still reflect "false").
const expectedDefaults = {
  "cr1bd_PDF_MAPPER_ENABLED":             "true",
  "cr1bd_ENRICHMENT_ENABLED":             "false",
  "cr1bd_ENRICHMENT_API_BASE":            "",
  "cr1bd_EVA_API_ENABLED":               "false",
  "cr1bd_EVA_BASE_URL":                  "",
  "cr1bd_AZURE_MAPS_ENABLED":            "false",
  "cr1bd_VALUATION_ENABLED":             "false",
  "cr1bd_AZURE_VISION_ENABLED":          "false",
  "cr1bd_OCR_SCANNED_PDF_ENABLED":       "false",
  "cr1bd_PLATE_OCR_ENABLED":             "false",
  "cr1bd_VALUATION_API_BASE":            "",
  "cr1bd_AUDIT_CASES_ENABLED":           "false",
  "cr1bd_HOLD_NEW_CASES_BY_DEFAULT":     "false",
  "cr1bd_LOCATION_ASSIST_ENABLED":       "false",
  "cr1bd_LOCATION_ASSIST_API_BASE":      "",
  "cr1bd_CHASER_SEND_ENABLED":           "false",
  "cr1bd_CASE_DISPOSITION_ENABLED":      "false",
  "cr1bd_EMAIL_AI_ENABLED":              "false",
  "cr1bd_BOX_API_ENABLED":               "false",
  "cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED":  "false",
  "cr1bd_BOX_FILEREQUEST_ENABLED":       "false",
  "cr1bd_BOX_FOLDER_ROOT_ID":            "",
  "cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID":  "",
};

if (!env) {
  skip(`§2 unverifiable — ${ENV_MANIFEST} purged from the tree ` +
       "(Power Platform teardown, 44268b7 2026-06-27); retained for a reversible rebuild");
} else {
  let defaultsOk = true;
  for (const [key, want] of Object.entries(expectedDefaults)) {
    const v = byName[key];
    if (!v) {
      console.log(`  ${key} missing from environment-variables.json`);
      defaultsOk = false;
    } else if (v.defaultValue !== want) {
      console.log(`  ${key} default expected "${want}", got "${v.defaultValue}"`);
      defaultsOk = false;
    }
  }
  ok(defaultsOk, "all 26 non-secret env-var defaultValues match plan 10 §1.1");
}

// ===========================================================================
// §3  SECRET ENV-VARS: KV REFERENCES, NO LITERAL VALUE
// ===========================================================================
console.log("\n--- §3  Secret env-vars: KV references only ---");

if (!env) {
  skip(`§3 unverifiable — ${ENV_MANIFEST} purged from the tree ` +
       "(Power Platform teardown, 44268b7 2026-06-27); retained for a reversible rebuild");
} else {
  const secrets = env.variables.filter((v) => v.type === "Secret");
  ok(secrets.length === 2, `exactly 2 Secret env-vars (got ${secrets.length})`);
  ok(
    secrets.length > 0 &&
    secrets.every((v) => v.keyVault && v.keyVault.reference === true && !("defaultValue" in v)),
    `all ${secrets.length} secret vars are KV references with no literal defaultValue`);
}

// ===========================================================================
// §4  STATUS-MACHINE PARITY (JSON <-> contracts/case-status.ts)
// ===========================================================================
console.log("\n--- §4  Status-machine parity ---");

const csSet = jsonSets.get("cr1bd_casestatus");
ok(!!csSet, "cr1bd_casestatus choice set exists in JSON");

if (csSet) {
  // 4a. Count (13 since TKT-094 added `done`; was 11 pre-`removed`, 12 pre-`done`)
  ok(csSet.options.length === 13,
    `cr1bd_casestatus has 13 options (got ${csSet.options.length})`);

  // 4b. Unique integer values
  const vals = csSet.options.map((o) => o.value);
  ok(new Set(vals).size === vals.length, "cr1bd_casestatus integer values are unique");

  // 4c. Names 1:1 with CaseStatus union in contracts/case-status.ts
  const unionBody = csTsText.match(/export type CaseStatus\s*=([\s\S]*?);/)?.[1] ?? "";
  const contractNames = [...unionBody.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  const jsonNames = csSet.options.map((o) => o.name);
  const jSet = new Set(jsonNames), cSet = new Set(contractNames);
  const onlyJ = jsonNames.filter((n) => !cSet.has(n));
  const onlyC = contractNames.filter((n) => !jSet.has(n));
  ok(
    onlyJ.length === 0 && onlyC.length === 0,
    `cr1bd_casestatus names == CaseStatus union 1:1 ` +
    `(only-in-json=${JSON.stringify(onlyJ)}, only-in-contract=${JSON.stringify(onlyC)})`);

  // 4d. Terminal-set: JSON stateMachine.terminals == contract TERMINAL_STATUSES
  const termBody = csTsText.match(
    /export const TERMINAL_STATUSES[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  const contractTerminals = [...termBody.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
  const jsonTerminals = [...((csSet.stateMachine?.terminals) ?? [])].sort();
  ok(
    contractTerminals.length === 5 &&
    JSON.stringify(contractTerminals) === JSON.stringify(jsonTerminals),
    `TERMINAL_STATUSES == stateMachine.terminals ` +
    `(contract=${JSON.stringify(contractTerminals)}, json=${JSON.stringify(jsonTerminals)})`);

  // 4e. Linear path starts with the canonical pipeline prefix
  const expectedLinear = ["new_email", "ingested", "needs_review", "ready_for_eva", "eva_submitted"];
  const actualLinear   = csSet.stateMachine?.linear ?? [];
  const linearOk = expectedLinear.every((s, i) => actualLinear[i] === s);
  ok(linearOk,
    `stateMachine.linear starts new_email→ingested→needs_review→ready_for_eva→eva_submitted ` +
    `(got ${JSON.stringify(actualLinear.slice(0, 5))})`);
}

// ===========================================================================
// §5  INBOUND-EMAIL CLASSIFIER TAXONOMY PARITY
// ===========================================================================
console.log("\n--- §5  Inbound-email classifier parity ---");

const pyConst = (prefix) =>
  [...classifierSrc.matchAll(new RegExp(`^${prefix}_[A-Z_]+\\s*=\\s*"([a-z_]+)"`, "gm"))]
    .map((m) => m[1]).sort();

const pyCategories = pyConst("CATEGORY");
const pySubtypes   = pyConst("SUBTYPE");

const catSet = jsonSets.get("cr1bd_inboundcategory");
const subSet = jsonSets.get("cr1bd_inboundsubtype");

ok(!!catSet && !!subSet,
  "inbound-email-classification defines cr1bd_inboundcategory + cr1bd_inboundsubtype");

if (catSet && subSet) {
  const catNames = catSet.options.map((o) => o.name).slice().sort();
  const subNames = subSet.options.map((o) => o.name).slice().sort();

  // The persisted choice set is intentionally a superset of the deterministic
  // classifier: staff can apply the append-only diminution subtype manually, but
  // email_classifier.py does not emit it. Keep that one explicit exception visible
  // instead of weakening parity to a loose subset check.
  const staffOnlySubtypes = new Set(["existing_provider_diminution"]);
  const classifierSubNames = subNames.filter((name) => !staffOnlySubtypes.has(name));

  ok(
    pyCategories.length === 8 && JSON.stringify(catNames) === JSON.stringify(pyCategories),
    `cr1bd_inboundcategory names == CATEGORY_* 1:1 ` +
    `(json=${JSON.stringify(catNames)}, py=${JSON.stringify(pyCategories)})`);
  ok(
    pySubtypes.length === 14 && JSON.stringify(classifierSubNames) === JSON.stringify(pySubtypes),
    `classifier-emittable cr1bd_inboundsubtype names == SUBTYPE_* 1:1 ` +
    `(json-minus-staff-only=${JSON.stringify(classifierSubNames)}, ` +
    `staff-only=${JSON.stringify([...staffOnlySubtypes])}, py=${JSON.stringify(pySubtypes)})`);

  // Integer codes unique + labels present for both sets
  for (const s of [catSet, subSet]) {
    const v = s.options.map((o) => o.value);
    ok(new Set(v).size === v.length, `${s.file}/${s.options[0]?.name}: integer values are unique`);
    ok(s.options.every((o) => o.label?.length > 0), `every option in cr1bd_inbound* has a label`);
  }
}

// ===========================================================================
// §6  ROLE INVARIANTS (from dataverse/roles/*.json)
// ===========================================================================
console.log("\n--- §6  Role invariants ---");

if (!adminRole || !userRole) {
  skip("§6 unverifiable — dataverse/roles/*.json purged from the tree " +
       "(Power Platform teardown, 44268b7 2026-06-27); retained for a reversible rebuild");
} else {
  const tablePrivByName = (role) =>
    Object.fromEntries((role.tablePrivileges ?? []).map((tp) => [tp.table, tp.privileges]));

  const adminPriv = tablePrivByName(adminRole);
  const userPriv  = tablePrivByName(userRole);

  // 6a. audit_event Write=None for BOTH roles (tamper-evidence; the strongest invariant)
  ok(
    adminPriv["cr1bd_auditevent"]?.Write === "None" &&
    userPriv["cr1bd_auditevent"]?.Write  === "None",
    "cr1bd_auditevent Write=None for both Admin and User (audit is append-only, never updatable)");

  // 6b. audit_event Delete=None for User, Organization for Admin (governed cascade only)
  ok(
    userPriv["cr1bd_auditevent"]?.Delete === "None",
    "cr1bd_auditevent Delete=None for User (Admin has Delete for retention cascade only — not checked here)");

  // 6c. Four corpus tables Delete=None for BOTH roles (archive-not-delete invariant)
  const corpusTables = ["cr1bd_workprovider", "cr1bd_repairer", "cr1bd_inspectionaddress", "cr1bd_imagesource"];
  let corpusDeleteOk = true;
  for (const t of corpusTables) {
    const aD = adminPriv[t]?.Delete;
    const uD = userPriv[t]?.Delete;
    if (aD !== "None" || uD !== "None") {
      console.log(`  ${t}: Admin.Delete="${aD}", User.Delete="${uD}" — both must be "None"`);
      corpusDeleteOk = false;
    }
  }
  ok(corpusDeleteOk,
    "four corpus tables (workprovider, repairer, inspectionaddress, imagesource) Delete=None for both roles");

  // 6d. case_.Delete=None for both roles (disposition runs as job identity, not interactive)
  ok(
    adminPriv["cr1bd_case"]?.Delete === "None" &&
    userPriv["cr1bd_case"]?.Delete  === "None",
    "cr1bd_case Delete=None for both roles (disposition gate, ADR-0017)");
}

// ===========================================================================
// §7-10  LIVE DB CHECKS (opt-in: DATABASE_URL or PGCONNECTIONSTRING)
// ===========================================================================
const connStr = process.env.DATABASE_URL ?? process.env.PGCONNECTIONSTRING ?? null;

if (!connStr) {
  console.log("\n--- §7-10  Live DB checks SKIPPED (no DATABASE_URL / PGCONNECTIONSTRING) ---");
} else {
  console.log("\n--- §7-10  Live DB checks (connecting to Postgres) ---");

  let pgClient = null;
  try {
    // pg may not be installed in dev — dynamic import with graceful fallback.
    const pgModule = await import("pg").catch(() => null);
    if (!pgModule) throw new Error("pg package not installed — run npm install pg");
    const { default: pg } = pgModule;
    // pg exports Client either as a named export or on the default
    const Client = pg.Client ?? pg.default?.Client ?? pg;
    pgClient = new Client({ connectionString: connStr });
    await pgClient.connect();
    console.log("  Connected to Postgres.");
  } catch (e) {
    console.log(`  NOTE  Could not connect: ${e.message}`);
    console.log("  §7-10 skipped — set DATABASE_URL and ensure pg is installed.");
    pgClient = null;
  }

  if (pgClient) {
    const query = async (sql, params) => {
      try { return (await pgClient.query(sql, params)).rows; }
      catch (e) { return { __error: e.message }; }
    };

    // ---- §7: choice_* tables match JSON ----------------------------------------
    console.log("\n  §7  choice_* table code+name parity");
    let liveCodeOk = true;
    for (const [logicalName, { options }] of jsonSets) {
      const tableName = logicalToTable.get(logicalName);
      if (!tableName) continue;

      const rows = await query(`SELECT code, name FROM ${tableName} ORDER BY code`);
      if (rows.__error) {
        console.log(`    ${tableName}: query error — ${rows.__error}`);
        liveCodeOk = false;
        continue;
      }

      const liveByCode = new Map(rows.map((r) => [r.code, r.name]));
      for (const opt of options) {
        const liveName = liveByCode.get(opt.value);
        if (liveName === undefined) {
          console.log(`    ${tableName}: code ${opt.value} (${opt.name}) missing from live DB`);
          liveCodeOk = false;
        } else if (liveName !== opt.name) {
          console.log(
            `    ${tableName}: code ${opt.value} name mismatch — JSON="${opt.name}" DB="${liveName}"`);
          liveCodeOk = false;
        }
      }
      if (rows.length !== options.length) {
        console.log(
          `    ${tableName}: JSON has ${options.length} opts, DB has ${rows.length} rows`);
        liveCodeOk = false;
      }
    }
    ok(liveCodeOk, "§7  all 22 choice_* tables: live-DB rows match JSON codes + names");

    // ---- §8: app_setting seed row -----------------------------------------------
    console.log("\n  §8  app_setting seed row");
    const settingRows = await query(
      "SELECT value FROM app_setting WHERE key = $1", ["hold_new_cases_by_default"]);
    if (settingRows.__error) {
      // Table may not exist yet if §1.3 DDL hasn't been applied.
      ok(false, `§8  app_setting table query failed: ${settingRows.__error}`);
    } else {
      ok(
        settingRows.length === 1 && settingRows[0].value === "false",
        `§8  app_setting hold_new_cases_by_default = 'false' ` +
        `(got ${JSON.stringify(settingRows)})`);
    }

    // ---- §9: UNIQUE constraint on inbound_email.source_message_id ---------------
    console.log("\n  §9  Dedup UNIQUE constraint");
    const uqRows = await query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints  tc
      JOIN information_schema.key_column_usage   kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema    = kcu.table_schema
      WHERE tc.table_name     = 'inbound_email'
        AND tc.constraint_type = 'UNIQUE'
        AND kcu.column_name    = 'source_message_id'
    `);
    if (uqRows.__error) {
      ok(false, `§9  UNIQUE constraint query failed: ${uqRows.__error}`);
    } else {
      ok(
        uqRows.length === 1,
        `§9  UNIQUE constraint on inbound_email.source_message_id exists ` +
        `(found ${uqRows.length} match(es))`);
    }

    // ---- §10: audit_event has NO UPDATE RLS policy ------------------------------
    console.log("\n  §10  Audit tamper-evidence: no UPDATE RLS policy on audit_event");
    const rlsRows = await query(`
      SELECT policyname, cmd
      FROM pg_policies
      WHERE tablename = 'audit_event'
    `);
    if (rlsRows.__error) {
      ok(false, `§10  pg_policies query failed: ${rlsRows.__error}`);
    } else {
      const updatePolicies = rlsRows.filter((r) => r.cmd === "UPDATE");
      if (updatePolicies.length > 0) {
        console.log(`    UPDATE policies found: ${JSON.stringify(updatePolicies)}`);
      }
      ok(
        updatePolicies.length === 0,
        `§10  audit_event has no UPDATE RLS policy (append-only tamper-evidence) ` +
        `(${rlsRows.length} policies total, 0 UPDATE)`);
    }

    await pgClient.end();
  }
}

// ===========================================================================
// RESULT
// ===========================================================================
const skipNote = skipped
  ? ` (${skipped} dataverse-era section(s) SKIPPED — inputs purged at 44268b7)`
  : "";
console.log(
  fail === 0
    ? `\nALL CHECKS PASSED${skipNote}`
    : `\n${fail} CHECK(S) FAILED${skipNote}`
);
process.exit(fail === 0 ? 0 : 1);
