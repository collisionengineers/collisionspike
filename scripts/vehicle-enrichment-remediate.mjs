#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import {
  VEHICLE_ENRICHMENT_CANDIDATE_SQL,
  defensibleRegistration,
} from './lib/vehicle-enrichment-remediation.mjs';

const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const value = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const execute = has('--execute');
const backupReference = value('--backup-confirmed', '');
const outputPath = resolve(value('--out', `artifacts/vehicle-remediation-${execute ? 'live' : 'dry'}.json`));
const limit = Math.max(1, Number(value('--limit', '10000')) || 10000);

if (execute && !backupReference.trim()) {
  throw new Error('--execute requires --backup-confirmed <restorable backup reference>');
}
if (execute && (!process.env.DATA_API_URL || !process.env.DATA_API_TOKEN)) {
  throw new Error('--execute requires DATA_API_URL and DATA_API_TOKEN');
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: true },
  options: '-c app.role=staff',
  max: 2,
});

async function caseState(id) {
  const result = await pool.query(
    `SELECT id, vrm, eva_vehicle_model, eva_mileage, vehicle_lookup_status,
            vehicle_mileage_status, vehicle_lookup_warning, vehicle_lookup_attempted_at
       FROM case_ WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function retryCase(id) {
  const response = await fetch(`${process.env.DATA_API_URL.replace(/\/$/, '')}/api/vehicle-data/lookup`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DATA_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ caseId: id }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return {
    runId: body?.lookup?.run_id ?? null,
    lookupStatus: body?.lookup?.status ?? null,
    mileageStatus: body?.mileage?.status ?? null,
  };
}

const startedAt = new Date().toISOString();
const before = (await pool.query(VEHICLE_ENRICHMENT_CANDIDATE_SQL, [limit])).rows;
const results = [];
try {
  for (const row of before) {
    if (!defensibleRegistration(row.vrm)) {
      results.push({ caseId: row.id, vrm: row.vrm, outcome: 'skipped', reason: 'registration_not_defensible', before: row });
      continue;
    }
    if (!execute) {
      results.push({ caseId: row.id, vrm: row.vrm, outcome: 'dry_run_candidate', before: row });
      continue;
    }
    try {
      const response = await retryCase(row.id);
      results.push({ caseId: row.id, vrm: row.vrm, outcome: 'attempted', response, before: row, after: await caseState(row.id) });
    } catch (error) {
      results.push({ caseId: row.id, vrm: row.vrm, outcome: 'failed', error: error instanceof Error ? error.message : String(error), before: row, after: await caseState(row.id) });
    }
  }
  const residual = execute ? (await pool.query(VEHICLE_ENRICHMENT_CANDIDATE_SQL, [limit])).rows : before;
  const ledger = {
    mode: execute ? 'execute' : 'dry_run',
    startedAt,
    completedAt: new Date().toISOString(),
    backupReference: execute ? backupReference : null,
    candidateCount: before.length,
    attemptedCount: results.filter((row) => row.outcome === 'attempted').length,
    failedCount: results.filter((row) => row.outcome === 'failed').length,
    skippedCount: results.filter((row) => row.outcome === 'skipped').length,
    residualCount: residual.length,
    results,
    residual,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputPath, mode: ledger.mode, candidateCount: ledger.candidateCount, residualCount: ledger.residualCount }));
} finally {
  await pool.end();
}
