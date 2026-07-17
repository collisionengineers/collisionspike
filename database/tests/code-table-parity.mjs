import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
// Updated only for append-only additions — most recently the TKT-226 retro_related inbound
// subtype (100000016); before that the TKT-200 capture and TKT-160 image-deletion audit codes
// (100000056–100000065). The per-table assertions below still prove every numeric mapping.
const EXPECTED_MAPPING_SHA256 = '43cbbb67be004b2704430607750ab891f8c874a913d01237a1fd6d8180644d3d';

let failures = 0;
function assert(condition, message) {
  process.stdout.write(`${condition ? 'PASS' : 'FAIL'} ${message}\n`);
  if (!condition) failures += 1;
}

function loadCodeTables() {
  const directory = path.join(root, 'packages/domain/src/data/code-tables');
  const tables = new Map();
  for (const filename of fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort()) {
    const document = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
    if (document.kind !== 'code-table' && document.kind !== 'code-table-bundle') {
      throw new Error(`${filename} has unsupported kind ${String(document.kind)}`);
    }
    const entries = document.kind === 'code-table' ? [document] : document.codeTables;
    for (const entry of entries) {
      tables.set(entry.codeTableId, {
        filename,
        options: entry.options,
        stateMachine: entry.stateMachine,
      });
    }
  }
  return tables;
}

function loadSqlTables() {
  const source = read('database/baseline/000_enums_lookups.sql');
  const codeTableIdToSqlTable = new Map();
  const rowsByTable = new Map();
  let pendingCodeTableId;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = line.match(/^-- ([a-z][a-z0-9_]*)\s+(?:\(|--)/);
    if (header) pendingCodeTableId = header[1];
    const create = line.match(/^CREATE TABLE (choice_[a-z0-9_]+)/);
    if (create) {
      if (pendingCodeTableId) codeTableIdToSqlTable.set(pendingCodeTableId, create[1]);
      pendingCodeTableId = undefined;
      rowsByTable.set(create[1], []);
    }
  }

  const withoutComments = source.replace(/--[^\n]*/g, '');
  const inserts = /INSERT INTO (choice_[a-z0-9_]+) \(code, name, label\) VALUES((?:'[^']*'|[^';])*);/g;
  for (const insert of withoutComments.matchAll(inserts)) {
    const rows = rowsByTable.get(insert[1]) ?? [];
    const tuples = /\((\d+),\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g;
    for (const tuple of insert[2].matchAll(tuples)) {
      rows.push({ code: Number(tuple[1]), name: tuple[2], label: tuple[3] });
    }
    rowsByTable.set(insert[1], rows);
  }
  return { codeTableIdToSqlTable, rowsByTable };
}

const codeTables = loadCodeTables();
const { codeTableIdToSqlTable, rowsByTable } = loadSqlTables();
const canonicalMappingJson = `${JSON.stringify(
  Object.fromEntries(
    [...codeTables].map(([codeTableId, definition]) => [
      codeTableId,
      definition.options.map(({ value, name }) => ({ value, name })),
    ]),
  ),
  null,
  2,
)}\n`;
const mappingSha256 = crypto.createHash('sha256').update(canonicalMappingJson, 'utf8').digest('hex');

process.stdout.write('\n--- Code-table parity ---\n');
process.stdout.write(`Canonical mapping SHA-256: ${mappingSha256}\n`);
assert(mappingSha256 === EXPECTED_MAPPING_SHA256, 'canonical mapping snapshot is unchanged');
assert(codeTables.size === 22, `JSON defines 22 code tables (got ${codeTables.size})`);
assert(rowsByTable.size === 22, `baseline SQL defines 22 code tables (got ${rowsByTable.size})`);

for (const [codeTableId, definition] of codeTables) {
  const tableName = codeTableIdToSqlTable.get(codeTableId);
  assert(Boolean(tableName), `${codeTableId} maps to a baseline SQL table`);
  if (!tableName) continue;
  const rows = rowsByTable.get(tableName) ?? [];
  const actual = rows.map(({ code, name }) => ({ value: code, name }));
  const expected = definition.options.map(({ value, name }) => ({ value, name }));
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${codeTableId} preserves option order, names, and numeric codes`,
  );
  assert(
    definition.options.every((option) => typeof option.label === 'string' && option.label.length > 0),
    `${codeTableId} gives every option a label`,
  );
}

process.stdout.write('\n--- Status contract parity ---\n');
const statusDefinition = codeTables.get('case_status');
assert(Boolean(statusDefinition), 'case_status code table exists');
if (statusDefinition) {
  const contract = read('packages/domain/src/contracts/case-status.ts');
  const unionBlock = contract.match(/export type CaseStatus\s*=([\s\S]*?);/)?.[1] ?? '';
  const unionMembers = [...unionBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const optionNames = statusDefinition.options.map((option) => option.name);
  assert(JSON.stringify(unionMembers) === JSON.stringify(optionNames), 'CaseStatus union matches case_status 1:1');

  const terminalBlock = contract.match(/TERMINAL_STATUSES[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  const terminals = [...terminalBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert(
    JSON.stringify(terminals) === JSON.stringify(statusDefinition.stateMachine?.terminals ?? []),
    'terminal statuses match the code-table state machine',
  );
}

process.stdout.write('\n--- Inbound classifier parity ---\n');
const classifier = read('services/functions/parser/cedocumentmapper_v2/rules/email_classifier.py');
const constantValues = (prefix) => [...classifier.matchAll(new RegExp(`^${prefix}_[A-Z0-9_]+\\s*=\\s*["']([^"']+)["']`, 'gm'))]
  .map((match) => match[1]);
const categoryNames = codeTables.get('inbound_category')?.options.map((option) => option.name) ?? [];
const subtypeNames = codeTables.get('inbound_subtype')?.options
  .filter((option) => option.classifierEmits !== false)
  .map((option) => option.name) ?? [];
assert(
  JSON.stringify([...new Set(constantValues('CATEGORY'))].sort()) === JSON.stringify([...categoryNames].sort()),
  'classifier category constants match inbound_category',
);
assert(
  JSON.stringify([...new Set(constantValues('SUBTYPE'))].sort()) === JSON.stringify([...subtypeNames].sort()),
  'classifier-emitted subtype constants match inbound_subtype',
);

async function checkLiveDatabase() {
  const connectionString = process.env.DATABASE_URL || process.env.PGCONNECTIONSTRING;
  if (!connectionString) {
    process.stdout.write('\nSKIP live database parity: no connection string supplied.\n');
    return;
  }

  const { Client } = await import('pg');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    process.stdout.write('\n--- Live database parity (read-only) ---\n');
    for (const [codeTableId, definition] of codeTables) {
      const tableName = codeTableIdToSqlTable.get(codeTableId);
      const result = await client.query(`SELECT code, name FROM ${tableName} ORDER BY code`);
      const actual = result.rows.map((row) => ({ value: Number(row.code), name: row.name }));
      const expected = definition.options.map(({ value, name }) => ({ value, name }));
      assert(JSON.stringify(actual) === JSON.stringify(expected), `${tableName} matches the repository baseline`);
    }

    const setting = await client.query(
      "SELECT value FROM app_setting WHERE key = 'hold_new_cases_by_default' LIMIT 1",
    );
    assert(setting.rows[0]?.value === 'false', 'hold_new_cases_by_default remains false');

    const dedup = await client.query(`
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'inbound_email' AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid) LIKE '%source_message_id%'
    `);
    assert(dedup.rowCount > 0, 'inbound_email source_message_id remains unique');

    const updatePolicies = await client.query(
      "SELECT 1 FROM pg_policies WHERE tablename = 'audit_event' AND cmd = 'UPDATE'",
    );
    assert(updatePolicies.rowCount === 0, 'audit_event has no update policy');
  } finally {
    await client.end();
  }
}

await checkLiveDatabase();

if (failures > 0) {
  process.stderr.write(`\n${failures} database parity assertion(s) failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\nDatabase parity checks passed.\n');
}
