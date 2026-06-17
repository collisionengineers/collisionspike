#!/usr/bin/env node
// Offline linter for the collisionspike M1 Power Automate flow definitions.
// Run:  node flows/validate-flows.mjs
// ZERO tenant contact. Pure static analysis over flows/definitions/*.definition.json,
// flows/connection-references.json and flows/flow-state.json.
//
// Checks (per the Phase-1 §8 build-verification + the slice boundary rules):
//   1. Each definition is valid JSON with non-empty triggers + actions.
//   2. References ONLY connection refs declared in connection-references.json.
//   3. NO secret literals (client_secret / api-key / x-functions-key / bearer token literals).
//   4. NO hardcoded live mailbox address or Box id (only parameters / env-vars).
//   5. Every definition is listed in flow-state.json as state=off.
//   6. Every Dataverse ListRecords on cr1bd_cases in the dedup/finalize flows includes the
//      _cr1bd_workproviderid_value provider scoping (cross-provider guard) OR a documented exception.
//   7. Balanced @-expression parentheses across the whole definition.
//
// Exit nonzero on ANY fail.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFS_DIR = join(HERE, 'definitions');
const CONN_REFS_PATH = join(HERE, 'connection-references.json');
const FLOW_STATE_PATH = join(HERE, 'flow-state.json');

let failures = 0;
let checks = 0;

function pass(msg) { checks++; console.log(`PASS  ${msg}`); }
function fail(msg) { checks++; failures++; console.log(`FAIL  ${msg}`); }

// --- load the two manifests (themselves must be valid JSON) ---
let connRefs, flowState;
try {
  connRefs = JSON.parse(readFileSync(CONN_REFS_PATH, 'utf8'));
  pass('connection-references.json is valid JSON');
} catch (e) {
  fail(`connection-references.json is NOT valid JSON: ${e.message}`);
  console.log('\nFATAL: cannot continue without connection-references.json');
  process.exit(1);
}
try {
  flowState = JSON.parse(readFileSync(FLOW_STATE_PATH, 'utf8'));
  pass('flow-state.json is valid JSON');
} catch (e) {
  fail(`flow-state.json is NOT valid JSON: ${e.message}`);
  console.log('\nFATAL: cannot continue without flow-state.json');
  process.exit(1);
}

const declaredConnNames = new Set((connRefs.connectionReferences ?? []).map((r) => r.connectionName));
const flowStateByFile = new Map((flowState.flows ?? []).map((f) => [f.definition, f]));

// Flows where a cr1bd_cases ListRecords MUST carry the provider scope (cross-provider guard).
// finalize lists Evidence (not cases) but resolves under a single case, so its cases reads are by id.
const PROVIDER_SCOPE_REQUIRED = new Set(['case-resolve.definition.json']);

// Draft-only flows: ADR-0003 requires the send boundary be enforced by the ABSENCE of any send op.
const DRAFT_ONLY = new Set(['chaser-draft.definition.json']);
// operationIds that actually SEND/post outbound to a person (not the connectorName, which may appear in prose).
const SEND_OPERATION_RE = /"operationId"\s*:\s*"(SendEmail[^"]*|SendEmailV2|SendApprovalEmail|PostMessage[^"]*|SendMessage[^"]*|SendChatMessage[^"]*|ReplyTo[^"]*)"/i;

// Secret-literal patterns: a KEY followed by an actual VALUE (not a Key Vault reference / connection note).
// We flag assignments like "client_secret": "abc123" but tolerate the words in comments.
const SECRET_VALUE_PATTERNS = [
  { name: 'client_secret literal', re: /"client_secret"\s*:\s*"[^"]+"/i },
  { name: 'api-key literal', re: /"api[-_]?key"\s*:\s*"[^"]+"/i },
  { name: 'x-functions-key literal', re: /"x-functions-key"\s*:\s*"[^"]+"/i },
  { name: 'bearer token literal', re: /"?authorization"?\s*:\s*"bearer\s+[A-Za-z0-9._-]+"/i },
  { name: 'inline bearer literal', re: /bearer\s+ey[A-Za-z0-9._-]{10,}/i },
  { name: 'EVA_CLIENT_SECRET value', re: /EVA_CLIENT_SECRET"\s*:\s*"[^"]+"/i },
];

// A hardcoded live mailbox = an email literal that is NOT inside an @-expression / parameter reference.
// Allowed: "@parameters('IntakeMailbox')", "mailbox / WhatsApp group" prose, schema words.
const EMAIL_LITERAL_RE = /"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"/g;
// A hardcoded Box id = a "parentId"/"folderId" assigned a literal (digits) rather than a parameter/@-expr.
const BOX_ID_LITERAL_RE = /"(?:parentId|folderId)"\s*:\s*"(?!@)[0-9]{3,}"/i;

function expressionStringsAreBalanced(raw) {
  // Check parentheses balance only within @-expression strings (values beginning with @).
  // Scan JSON string literals; for any that start with '@', count ( and ) ignoring those inside
  // nested single-quoted literals.
  const stringLiteral = /"((?:\\.|[^"\\])*)"/g;
  let m;
  let firstBad = null;
  while ((m = stringLiteral.exec(raw)) !== null) {
    const val = m[1];
    if (!val.startsWith('@')) continue;
    let depth = 0;
    let inSingle = false;
    for (let i = 0; i < val.length; i++) {
      const c = val[i];
      if (c === "'" && val[i - 1] !== '\\') inSingle = !inSingle;
      if (inSingle) continue;
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth < 0) break; }
    }
    if (depth !== 0 && firstBad === null) {
      firstBad = val.length > 80 ? val.slice(0, 80) + '...' : val;
      return { ok: false, sample: firstBad };
    }
  }
  return { ok: true };
}

function collectConnectionNames(node, acc) {
  if (Array.isArray(node)) { for (const x of node) collectConnectionNames(x, acc); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'connectionName' && typeof v === 'string') acc.add(v);
      else collectConnectionNames(v, acc);
    }
  }
}

function casesListRecordsActions(def) {
  // Walk every action recursively; return those that are a Dataverse ListRecords on cr1bd_cases.
  const found = [];
  function walk(actions) {
    if (!actions || typeof actions !== 'object') return;
    for (const [name, action] of Object.entries(actions)) {
      const inputs = action?.inputs;
      const op = inputs?.host?.operationId;
      const entity = inputs?.parameters?.entityName;
      if (op === 'ListRecords' && entity === 'cr1bd_cases') {
        found.push({ name, filter: inputs?.parameters?.$filter ?? '' });
      }
      // recurse into nested action containers
      if (action?.actions) walk(action.actions);
      if (action?.else?.actions) walk(action.else.actions);
      if (action?.cases) {
        for (const c of Object.values(action.cases)) walk(c.actions);
      }
      if (action?.default?.actions) walk(action.default.actions);
    }
  }
  walk(def.actions);
  return found;
}

const files = readdirSync(DEFS_DIR).filter((f) => f.endsWith('.definition.json')).sort();

if (files.length === 0) {
  fail('no *.definition.json files found in flows/definitions/');
}

for (const file of files) {
  const raw = readFileSync(join(DEFS_DIR, file), 'utf8');
  let def;

  // Check 1: valid JSON + triggers + actions
  try {
    def = JSON.parse(raw);
  } catch (e) {
    fail(`[${file}] not valid JSON: ${e.message}`);
    continue;
  }
  const hasTriggers = def.triggers && typeof def.triggers === 'object' && Object.keys(def.triggers).length > 0;
  const hasActions = def.actions && typeof def.actions === 'object' && Object.keys(def.actions).length > 0;
  if (hasTriggers && hasActions) pass(`[${file}] valid JSON with non-empty triggers + actions`);
  else fail(`[${file}] missing non-empty triggers and/or actions`);

  // Check 2: only declared connection refs
  const used = new Set();
  collectConnectionNames(def, used);
  const undeclared = [...used].filter((c) => !declaredConnNames.has(c));
  if (undeclared.length === 0) pass(`[${file}] references only declared connection refs (${[...used].join(', ') || 'none'})`);
  else fail(`[${file}] uses UNDECLARED connection refs: ${undeclared.join(', ')}`);

  // Check 3: no secret literals
  const secretHits = SECRET_VALUE_PATTERNS.filter((p) => p.re.test(raw)).map((p) => p.name);
  if (secretHits.length === 0) pass(`[${file}] no secret literals (client_secret / api-key / token)`);
  else fail(`[${file}] contains secret literal(s): ${secretHits.join(', ')}`);

  // Check 4a: no hardcoded live mailbox address
  const emailHits = (raw.match(EMAIL_LITERAL_RE) ?? []).filter((s) => {
    // tolerate schema/$schema/connector URLs that are not emails (they won't match EMAIL_LITERAL_RE anyway)
    return true;
  });
  if (emailHits.length === 0) pass(`[${file}] no hardcoded mailbox address literal (uses @parameters/env-var)`);
  else fail(`[${file}] hardcoded email/mailbox literal(s): ${emailHits.join(', ')}`);

  // Check 4b: no hardcoded Box id
  if (!BOX_ID_LITERAL_RE.test(raw)) pass(`[${file}] no hardcoded Box folder id (parentId/folderId via parameter/@-expr)`);
  else fail(`[${file}] hardcoded Box folder id literal in parentId/folderId`);

  // Check 5: listed in flow-state as state=off
  const fs = flowStateByFile.get(file);
  if (fs && fs.state === 'off') pass(`[${file}] flow-state.json lists it as state=off`);
  else if (!fs) fail(`[${file}] NOT listed in flow-state.json`);
  else fail(`[${file}] flow-state.json state is '${fs.state}', expected 'off'`);

  // Check 6: provider scoping on cr1bd_cases ListRecords where required
  const caseLists = casesListRecordsActions(def);
  if (PROVIDER_SCOPE_REQUIRED.has(file)) {
    const unscoped = caseLists.filter((a) => !a.filter.includes('_cr1bd_workproviderid_value'));
    if (caseLists.length > 0 && unscoped.length === 0) {
      pass(`[${file}] every cr1bd_cases ListRecords carries _cr1bd_workproviderid_value (cross-provider guard)`);
    } else if (caseLists.length === 0) {
      fail(`[${file}] expected a provider-scoped cr1bd_cases ListRecords but found none`);
    } else {
      fail(`[${file}] cr1bd_cases ListRecords MISSING provider scope: ${unscoped.map((a) => a.name).join(', ')}`);
    }
  } else if (caseLists.length > 0) {
    // documented exception: case lookups outside the dedup ladder are by Message-ID/id, not provider-scoped.
    const messageIdScoped = caseLists.every((a) =>
      a.filter.includes('cr1bd_sourcemessageid') || a.filter.includes('_cr1bd_workproviderid_value'));
    if (messageIdScoped) pass(`[${file}] cr1bd_cases ListRecords are Message-ID-scoped (documented exception, not a dedup-by-VRM query)`);
    else fail(`[${file}] cr1bd_cases ListRecords lacks both provider scope and a documented Message-ID exception`);
  } else {
    pass(`[${file}] no cr1bd_cases ListRecords (provider-scope check N/A)`);
  }

  // Check 6b: draft-only flows contain NO send operation (ADR-0003 structural enforcement).
  if (DRAFT_ONLY.has(file)) {
    if (!SEND_OPERATION_RE.test(raw)) pass(`[${file}] draft-only: contains NO send operation (ADR-0003 enforced by absence)`);
    else fail(`[${file}] draft-only flow contains a SEND operation (ADR-0003 violation)`);
  }

  // Check 7: balanced @-expression parentheses
  const bal = expressionStringsAreBalanced(raw);
  if (bal.ok) pass(`[${file}] balanced @-expression parentheses`);
  else fail(`[${file}] unbalanced parentheses in @-expression near: ${bal.sample}`);

  // Check 8: flow-vs-domain semantic parity (the running flow must mirror the pure domain logic;
  // a green linter + green vitest must actually cover the two layers agreeing, not each alone).
  // 8a — provider-match must NOT use an OData contains() over the knownEmailDomains Memo: that is an
  //      unanchored substring test (alias match), e.g. sender 'co.uk' false-matching 'carcompany.co.uk'
  //      -> an unsafe Case/PO. It must do anchored EXACT membership (mirror domain provider-match.ts).
  if (file === 'provider-match.definition.json') {
    if (/contains\(\s*cr1bd_knownemaildomains/i.test(raw)) {
      fail(`[${file}] provider domain match uses OData contains() over the knownEmailDomains memo — unanchored substring/alias match (must mirror domain provider-match.ts: exact membership)`);
    } else if (/"type"\s*:\s*"Query"/.test(raw) && /contains\(split\(/i.test(raw)) {
      pass(`[${file}] provider domain match uses anchored exact membership (split + contains), not OData substring`);
    } else {
      fail(`[${file}] provider domain match: expected an anchored exact-membership Filter-array (Query with contains(split(...)))`);
    }
  }
  // 8b — case-resolve rung-2 reference equality must be case/whitespace-insensitive (mirror dedup.refEquals),
  //      otherwise 'ref-100' vs 'REF-100' needlessly forks a case instead of attaching.
  if (file === 'case-resolve.definition.json') {
    const fmWhere = def.actions?.Filter_matching_ref?.inputs?.where ?? '';
    if (fmWhere.includes('toLower(') && fmWhere.includes('trim(')) {
      pass(`[${file}] Filter_matching_ref reference equality is case/whitespace-insensitive (toLower+trim, mirrors domain refEquals)`);
    } else {
      fail(`[${file}] Filter_matching_ref reference equality must normalize with toLower( + trim( to mirror domain refEquals`);
    }
  }
}

// Cross-manifest checks ------------------------------------------------------

// Every flow listed in flow-state must have a definition file present.
for (const f of flowState.flows ?? []) {
  if (files.includes(f.definition)) pass(`[flow-state] ${f.definition} has a definition file`);
  else fail(`[flow-state] lists ${f.definition} but no such definition file exists`);
}

// Every connectionName used anywhere is declared (global cross-check already per-file; confirm none orphaned).
const allUsed = new Set();
for (const file of files) {
  const def = JSON.parse(readFileSync(join(DEFS_DIR, file), 'utf8'));
  collectConnectionNames(def, allUsed);
}
const declaredButUnused = [...declaredConnNames].filter((c) => !allUsed.has(c));
if (declaredButUnused.length === 0) pass('every declared connection reference is used by at least one flow');
else console.log(`WARN  declared-but-unused connection refs: ${declaredButUnused.join(', ')}`);

// flow-state global assertion: all off, all reserved-for-user activation.
const anyOn = (flowState.flows ?? []).some((f) => f.state !== 'off');
if (!anyOn) pass('flow-state: ALL flows ship state=off');
else fail('flow-state: at least one flow is not state=off');

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${checks - failures}/${checks} checks passed, ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
