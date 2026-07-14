#!/usr/bin/env node

/**
 * TKT-150 claimant remediation and durable status-recompute runner.
 *
 * `plan` is read-only. It snapshots Postgres in one READ ONLY, REPEATABLE READ
 * transaction, hashes every source byte it successfully fetches, seals an
 * explicit no-write failure fingerprint for every unreadable source, and writes
 * an immutable v2 plan outside the repository. The plan can propose one
 * case-column write only: fill an empty `eva_claimant_name`.
 *
 * `apply` is deliberately awkward to authorize. It requires the exact raw plan
 * SHA-256, an exact backup-manifest SHA-256, the actual pg_dump bytes, and a
 * named, unexpired approval that binds the environment, runner, counts, and
 * exact per-case claimant/status-recompute allowlists. Every fully observed,
 * unchanged baseline item requests the existing durable canonical status
 * recompute; an unreadable-source item authorizes no write, and only a
 * defensible claimant repair also fills the blank claimant column.
 *
 * Fresh plans, manifests, approvals, journals, and ledgers contain personal data.
 * This runner refuses to read or write those artifacts inside the Git checkout.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BlobServiceClient } from '@azure/storage-blob';
import { build } from 'esbuild';
import pg from 'pg';

const { Client } = pg;

export const PLAN_CONTRACT = 'tkt150-claimant-remediation-plan-v2';
export const BACKUP_CONTRACT = 'tkt150-claimant-backup-manifest-v1';
export const APPROVAL_CONTRACT = 'tkt150-claimant-remediation-approval-v1';
export const LEDGER_CONTRACT = 'tkt150-claimant-remediation-ledger-v2';
export const AUTHORIZED_SCOPE = Object.freeze({
  name: 'claimant-fill-plus-durable-status-recompute-request',
  caseColumns: Object.freeze([
    'eva_claimant_name',
    'status_recompute_requested_generation',
    'status_recompute_requested_at',
  ]),
  auxiliaryWrites: Object.freeze(['field_level_provenance:claimantName', 'audit_event:tkt150']),
});

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const RUNNER_PATH = fileURLToPath(import.meta.url);
const SHA256_RE = /^[a-f0-9]{64}$/;
const DOC_EXT = /\.(pdf|docx?|rtf)$/i;
const EMAIL_EXT = /\.(eml|msg)$/i;
const BODY_TEXT_FILE_RE = /^email-body-([0-9a-f]{8})\.txt$/;
const LEGACY_BODY_TEXT_FILE = 'email-body.txt';
const MAX_SOURCE_DOCUMENTS = 25;
const PARSER_FINGERPRINT_CONTRACT = 'ce-parser-fingerprint-v1';
const HTTP_TIMEOUT_MS = 30_000;
const PARSER_TIMEOUT_MS = 60_000;
const BLOB_TIMEOUT_MS = 30_000;
const CLAIMANT_COLUMN = 'eva_claimant_name';
const CLAIMANT_FIELD = 'claimantName';
const ALLOWED_SOURCES = new Set(['pdf_extraction', 'email_text']);
const BACKUP_CHECKSUM_TABLES = Object.freeze(['case_', 'field_level_provenance', 'audit_event']);
const AUDIT_ACTION_PARSER_CALLED = 100000009;
const AUDIT_INFO = 100000000;
const REVIEW_STATE_NEEDS_REVIEW = 100000001;
const ACTOR = 'codex-remediation:tkt-150:v2';

function blank(value) {
  return String(value ?? '').trim() === '';
}

function text(value) {
  return String(value ?? '').trim();
}

function iso(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new Error(`Invalid timestamp: ${String(value)}`);
  return date.toISOString();
}

function stable(value) {
  if (value === undefined || value === null) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function integrityHash(value) {
  return createHash('sha256').update(stable(value)).digest('hex');
}

export function rawSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hashText(value) {
  return rawSha256(Buffer.from(String(value ?? ''), 'utf8'));
}

function sameValue(left, right) {
  return integrityHash(left) === integrityHash(right);
}

function normalizedName(value) {
  return text(value).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');
}

function distinctNames(values) {
  const byKey = new Map();
  for (const value of values.map(text).filter(Boolean)) {
    const key = normalizedName(value);
    if (!byKey.has(key)) byKey.set(key, value);
  }
  return [...byKey.values()];
}

function sha(value, label) {
  const normalized = text(value).toLowerCase();
  if (!SHA256_RE.test(normalized)) throw new Error(`${label} must be a lowercase SHA-256`);
  return normalized;
}

function exactScope(scope) {
  return sameValue(scope, AUTHORIZED_SCOPE);
}

function sortAllowlist(items) {
  return [...items]
    .map((item) => ({ caseId: text(item.caseId), caseSha256: sha(item.caseSha256, 'allowlist caseSha256') }))
    .sort((a, b) => a.caseId.localeCompare(b.caseId));
}

async function canonicalPathIncludingMissingLeaf(path) {
  const absolute = resolve(path);
  let cursor = absolute;
  const missing = [];
  while (true) {
    try {
      const canonicalAncestor = await realpath(cursor);
      return resolve(canonicalAncestor, ...missing.reverse());
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(basename(cursor));
      cursor = parent;
    }
  }
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Resolve symlinks/junctions before checking every ancestor for a `.git`
 * directory or worktree pointer. Merely comparing against this checkout is not
 * sufficient: PII artifacts must not land in any repository, linked worktree,
 * or a common Git metadata directory reached through an alias.
 */
export async function assertOutsideRepository(path, label = 'artifact') {
  const canonical = await canonicalPathIncludingMissingLeaf(path);
  const repositoryRoot = await realpath(REPO_ROOT);
  const rel = relative(repositoryRoot, canonical);
  const outsideThisCheckout = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  if (!outsideThisCheckout) {
    throw new Error(`${label} must be outside every Git checkout: ${canonical}`);
  }

  let cursor;
  try {
    cursor = (await stat(canonical)).isDirectory() ? canonical : dirname(canonical);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    cursor = dirname(canonical);
  }
  while (true) {
    if (basename(cursor).toLowerCase() === '.git' || await pathExists(join(cursor, '.git'))) {
      throw new Error(`${label} must be outside every Git repository or worktree: ${canonical}`);
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return canonical;
}

export async function assertDistinctArtifactPaths(entries) {
  const resolvedEntries = [];
  for (const entry of entries) {
    const canonical = await assertOutsideRepository(entry.path, entry.label);
    let identity = null;
    try {
      const details = await stat(canonical);
      identity = `${details.dev}:${details.ino}`;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const comparisonPath = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    for (const previous of resolvedEntries) {
      if (previous.comparisonPath === comparisonPath || (identity && previous.identity === identity)) {
        throw new Error(`${entry.label} must be distinct from ${previous.label}`);
      }
    }
    resolvedEntries.push({ ...entry, canonical, comparisonPath, identity });
  }
  return resolvedEntries;
}

export async function hashFile(path) {
  const digest = createHash('sha256');
  let byteLength = 0;
  for await (const chunk of createReadStream(path)) {
    digest.update(chunk);
    byteLength += chunk.length;
  }
  return { sha256: digest.digest('hex'), byteLength };
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`Missing environment: ${name}`);
  return value;
}

function secureEndpoint(name) {
  const value = required(name).replace(/\/$/, '');
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${name} must use https`);
  return value;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = HTTP_TIMEOUT_MS, fetchImpl = fetch) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('fetch timeout must be a positive integer');
  return fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

export async function readJsonResponse(response, label) {
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`${label} returned malformed JSON: ${error.message}`);
  }
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${label} returned a non-object JSON payload`);
  }
  return payload;
}

export async function downloadBlobBytes(blockBlobClient, timeoutMs = BLOB_TIMEOUT_MS) {
  return blockBlobClient.downloadToBuffer(0, undefined, { abortSignal: AbortSignal.timeout(timeoutMs) });
}

function normalizedParserFingerprint(value) {
  return {
    contract: text(value?.contract),
    repository: text(value?.repository),
    ref: text(value?.ref),
    commit: text(value?.commit).toLowerCase(),
    vendoredFileCount: Number(value?.vendored_file_count ?? value?.vendoredFileCount),
    contentSha256: text(value?.content_sha256 ?? value?.contentSha256).toLowerCase(),
    providersSha256: text(value?.providers_sha256 ?? value?.providersSha256).toLowerCase(),
  };
}

export function validateParserFingerprint(payload, expectedLock) {
  const actual = normalizedParserFingerprint(payload);
  const expected = normalizedParserFingerprint(expectedLock);
  if (actual.contract !== PARSER_FINGERPRINT_CONTRACT) throw new Error('Parser fingerprint contract mismatch');
  if (!actual.repository || !actual.ref) throw new Error('Parser fingerprint repository/ref is missing');
  if (!/^[a-f0-9]{40}$/.test(actual.commit)) throw new Error('Parser fingerprint commit is invalid');
  if (!Number.isSafeInteger(actual.vendoredFileCount) || actual.vendoredFileCount < 1) {
    throw new Error('Parser fingerprint vendored file count is invalid');
  }
  sha(actual.contentSha256, 'parser contentSha256');
  sha(actual.providersSha256, 'parser providersSha256');
  if (!sameValue(actual, { ...expected, contract: PARSER_FINGERPRINT_CONTRACT })) {
    throw new Error('Deployed parser fingerprint does not match the committed vendor lock');
  }
  return actual;
}

export async function getParserFingerprint({ baseUrl, key, expectedLock, fetchImpl = fetch, timeoutMs = HTTP_TIMEOUT_MS }) {
  const response = await fetchWithTimeout(
    `${String(baseUrl).replace(/\/$/, '')}/api/fingerprint`,
    { method: 'GET', headers: { 'x-functions-key': key } },
    timeoutMs,
    fetchImpl,
  );
  const payload = await readJsonResponse(response, 'parser fingerprint');
  if (!response.ok) throw new Error(`parser fingerprint ${response.status}`);
  return validateParserFingerprint(payload, expectedLock);
}

async function deployedParserFingerprint() {
  const expectedLock = JSON.parse(await readFile(
    resolve(REPO_ROOT, 'functions/parser/cedocumentmapper_v2/VENDOR_LOCK.json'),
    'utf8',
  ));
  return getParserFingerprint({
    baseUrl: secureEndpoint('PARSER_FN_URL'),
    key: required('PARSER_FN_KEY'),
    expectedLock,
  });
}

function databaseLocation() {
  if (text(process.env.DATABASE_URL)) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname.toLocaleLowerCase('en-GB'),
      port: Number(url.port || 5432),
      requestedDatabase: decodeURIComponent(url.pathname.replace(/^\//, '')),
    };
  }
  return {
    host: required('PGHOST').toLocaleLowerCase('en-GB'),
    port: Number(process.env.PGPORT ?? 5432),
    requestedDatabase: required('PGDATABASE'),
  };
}

export function assertSecureDatabaseSettings(env = process.env) {
  const verifyingModes = new Set(['verify-ca', 'verify-full']);
  const pgMode = text(env.PGSSLMODE).toLowerCase();
  if (pgMode && !verifyingModes.has(pgMode)) {
    throw new Error('PGSSLMODE must verify the server certificate');
  }
  if (text(env.DATABASE_URL)) {
    const url = new URL(env.DATABASE_URL);
    const mode = text(url.searchParams.get('sslmode')).toLowerCase();
    if (mode && !verifyingModes.has(mode)) throw new Error('DATABASE_URL sslmode must verify the server certificate');
  }
}

export async function databaseSslOptions(env = process.env, readFileImpl = readFile) {
  const rootCert = text(env.PGSSLROOTCERT);
  if (!rootCert || rootCert.toLowerCase() === 'system') return { rejectUnauthorized: true };
  return { rejectUnauthorized: true, ca: await readFileImpl(resolve(rootCert), 'utf8') };
}

async function connect() {
  assertSecureDatabaseSettings();
  const ssl = await databaseSslOptions();
  let config;
  if (text(process.env.DATABASE_URL)) {
    const url = new URL(process.env.DATABASE_URL);
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(key);
    config = { connectionString: url.toString(), ssl };
  } else {
    config = {
      host: required('PGHOST'),
      port: Number(process.env.PGPORT ?? 5432),
      database: required('PGDATABASE'),
      user: required('PGUSER'),
      password: required('PGPASSWORD'),
      ssl,
    };
  }
  const client = new Client(config);
  await client.connect();
  await client.query('SET ROLE csadmin');
  await client.query("SET app.role = 'staff'");
  return client;
}

export function parseArgs(argv) {
  const args = { mode: 'plan', environment: text(process.env.TKT150_ENVIRONMENT) };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value == null || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === '--mode') args.mode = next();
    else if (arg === '--out') args.out = next();
    else if (arg === '--plan') args.plan = next();
    else if (arg === '--plan-sha256') args.planSha256 = next();
    else if (arg === '--backup-manifest') args.backupManifest = next();
    else if (arg === '--backup-manifest-sha256') args.backupManifestSha256 = next();
    else if (arg === '--backup-artifact') args.backupArtifact = next();
    else if (arg === '--approval') args.approval = next();
    else if (arg === '--case-po') args.casePo = next();
    else if (arg === '--environment') args.environment = next();
    else if (arg === '--journal') args.journal = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['plan', 'apply'].includes(args.mode)) throw new Error('--mode must be plan or apply');
  if (!args.out) throw new Error('--out is required');
  if (!text(args.environment)) throw new Error('--environment or TKT150_ENVIRONMENT is required');
  if (args.mode === 'plan') {
    if (
      args.plan
      || args.planSha256
      || args.backupManifest
      || args.backupManifestSha256
      || args.backupArtifact
      || args.approval
      || args.journal
    ) {
      throw new Error('apply authority arguments are not accepted in plan mode');
    }
  } else {
    for (const [key, flag] of [
      ['plan', '--plan'],
      ['planSha256', '--plan-sha256'],
      ['backupManifest', '--backup-manifest'],
      ['backupManifestSha256', '--backup-manifest-sha256'],
      ['backupArtifact', '--backup-artifact'],
      ['approval', '--approval'],
    ]) {
      if (!args[key]) throw new Error(`${flag} is required in apply mode`);
    }
    if (args.casePo) throw new Error('--case-po is plan-only; apply uses the approved allowlist');
  }
  return args;
}

export async function loadCanonicalHelpers() {
  const directory = await mkdtemp(join(tmpdir(), 'tkt150-v2-'));
  const outfile = join(directory, 'canonical.mjs');
  await build({
    stdin: {
      contents: `
        export { evaluateCaseReadiness, readinessInputForCase, statusForReviewCase } from './packages/domain/src/index.ts';
        export { CASE_SELECT, mergedIntoFrom, rowToCase, rowToEvidence } from './api/src/lib/mappers.ts';
        export { requestStatusRecompute } from './api/src/lib/status-recompute.ts';
        export { supplementClaimantNameFromBody } from './orchestration/src/lib/supplement-parse.ts';
        export { messageFileToken } from './orchestration/src/lib/evidence-names.ts';
      `,
      resolveDir: REPO_ROOT,
      sourcefile: 'tkt150-v2-canonical-entry.ts',
      loader: 'ts',
    },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });
  const helpers = await import(pathToFileURL(outfile).href);
  return { helpers, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

function cell(envelope, key) {
  return text(envelope?.extraction?.[key]?.value);
}

function isPdf(doc) {
  return /\.pdf$/i.test(doc.fileName) || /pdf/i.test(doc.contentType ?? '');
}

function exactFileName(value) {
  return typeof value === 'string' ? value : '';
}

function retainedPlainTextSource(row) {
  const contentType = text(row.content_type).toLowerCase();
  const fileName = exactFileName(row.file_name);
  return (BODY_TEXT_FILE_RE.test(fileName) || fileName === LEGACY_BODY_TEXT_FILE)
    && /^text\/plain(?:\s*;|$)/i.test(contentType);
}

function plainTextShapedSource(row) {
  return /\.txt$/i.test(text(row.file_name)) || /^text\/plain(?:\s*;|$)/i.test(text(row.content_type));
}

function retainedPlainTextError(message) {
  return Object.assign(new Error(message), { code: 'INVALID_RETAINED_PLAIN_TEXT' });
}

/**
 * Decode only an explicitly retained plain-text source. The raw bytes remain
 * the authority recorded in the plan; this decoder merely exposes those bytes
 * to the canonical conservative email-text claimant extractor. Charset
 * guessing and binary/control characters fail closed.
 */
export function decodeRetainedPlainText(row, bytes) {
  if (!retainedPlainTextSource(row)) throw retainedPlainTextError('retained source is not declared plain text');
  const contentType = text(row.content_type);
  const declaredCharset = /(?:^|;)\s*charset\s*=\s*"?([^;"\s]+)/i.exec(contentType)?.[1]?.toLowerCase() ?? '';
  if (declaredCharset && !['utf-8', 'utf8', 'us-ascii', 'ascii'].includes(declaredCharset)) {
    throw retainedPlainTextError(`retained plain text declares unsupported charset: ${declaredCharset}`);
  }
  const raw = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (['us-ascii', 'ascii'].includes(declaredCharset) && raw.some((value) => value > 0x7f)) {
    throw retainedPlainTextError('retained plain text contains bytes outside its declared ASCII charset');
  }
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw retainedPlainTextError('retained plain text is not valid UTF-8');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(decoded)) {
    throw retainedPlainTextError('retained plain text contains disallowed control characters');
  }
  return decoded;
}

function sanitizeEvidencePathSegment(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 200) || 'file';
}

function retainedBodyPathMatches(storagePath, graphMessageId, fileName) {
  const expected = `${sanitizeEvidencePathSegment(graphMessageId)}/${sanitizeEvidencePathSegment(fileName)}`;
  const actual = text(storagePath).replace(/\\/g, '/');
  return Boolean(actual) && (actual === expected || actual.endsWith(`/${expected}`));
}

function normalizedEvidenceStoragePath(value) {
  return text(value).replace(/\\/g, '/');
}

function storageDirectory(value) {
  const normalized = normalizedEvidenceStoragePath(value);
  const index = normalized.lastIndexOf('/');
  return index < 0 ? '' : normalized.slice(0, index);
}

function storagePathInDirectory(directory, fileName) {
  return directory ? `${directory}/${fileName}` : fileName;
}

function inboundRowsRelevantToRetainedPath(row, inboundRows, messageFileToken) {
  const fileName = exactFileName(row.file_name);
  const tokenized = BODY_TEXT_FILE_RE.exec(fileName);
  if (tokenized) return inboundRows;
  return fileName === LEGACY_BODY_TEXT_FILE ? inboundRows : [];
}

function retainedGraphPathProbes(row, inboundRows, messageFileToken) {
  return inboundRowsRelevantToRetainedPath(row, inboundRows, messageFileToken)
    .map((candidate) => ({
      inboundEmailId: text(candidate.id),
      graphMessageId: text(candidate.graph_message_id) || null,
    }))
    .sort((left, right) => left.inboundEmailId.localeCompare(right.inboundEmailId));
}

function directTokenPathMatches(row, inboundRows, messageFileToken) {
  const tokenized = BODY_TEXT_FILE_RE.exec(exactFileName(row.file_name));
  if (!tokenized) return [];
  return inboundRowsRelevantToRetainedPath(row, inboundRows, messageFileToken).filter((candidate) =>
    text(candidate.graph_message_id)
    && retainedBodyPathMatches(row.storage_path, candidate.graph_message_id, exactFileName(row.file_name)));
}

function rawEmlSiblingForRetainedText(row, sourceRows) {
  const tokenized = BODY_TEXT_FILE_RE.exec(exactFileName(row.file_name));
  if (!tokenized) throw new Error('retained text has no tokenized raw-email sibling convention');
  const bodyStoragePath = normalizedEvidenceStoragePath(row.storage_path);
  const directory = storageDirectory(bodyStoragePath);
  if (bodyStoragePath !== storagePathInDirectory(directory, exactFileName(row.file_name))) {
    throw new Error('retained text storage path does not end with its exact filename');
  }
  const expectedFileName = `message-${tokenized[1]}.eml`;
  const expectedPath = storagePathInDirectory(directory, expectedFileName);
  const matches = sourceRows.filter((candidate) =>
    exactFileName(candidate.file_name) === expectedFileName
    && normalizedEvidenceStoragePath(candidate.storage_path) === expectedPath
    && candidate.kind === 'email'
    && /^message\/rfc822(?:\s*;|$)/i.test(text(candidate.content_type)));
  if (matches.length === 0) throw new Error('retained text has no exact same-directory raw-email sibling');
  if (matches.length > 1) throw new Error('retained text has multiple exact same-directory raw-email siblings');
  return matches[0];
}

function validRfcMessageId(value) {
  return typeof value === 'string'
    && value.length > 2
    && value.length <= 400
    && /^<[\x21-\x3b\x3d\x3f-\x7e]+>$/.test(value);
}

/**
 * Read the one RFC Message-ID header used as a full-identity bridge between a
 * retained body-only text file and its exact same-directory raw `.eml` sibling.
 * Header unfolding is deliberately small and fail-closed: duplicate, malformed,
 * oversized, or non-ASCII Message-ID values never become remediation authority.
 */
export function extractRawEmlMessageId(bytes) {
  const raw = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const crlfBoundary = raw.indexOf(Buffer.from('\r\n\r\n', 'ascii'));
  const lfBoundary = raw.indexOf(Buffer.from('\n\n', 'ascii'));
  const boundary = crlfBoundary >= 0 && (lfBoundary < 0 || crlfBoundary <= lfBoundary)
    ? crlfBoundary
    : lfBoundary;
  if (boundary < 0 || boundary > 256 * 1024) throw new Error('raw email has no bounded header section');
  const headerText = raw.subarray(0, boundary).toString('latin1').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const headers = [];
  let current = null;
  for (const line of headerText.split('\n')) {
    if (/^[ \t]/.test(line)) {
      if (!current) throw new Error('raw email begins with a malformed folded header');
      current.value += ` ${line.trim()}`;
      continue;
    }
    if (current) headers.push(current);
    const colon = line.indexOf(':');
    if (colon <= 0 || !/^[!-9;-~]+$/.test(line.slice(0, colon))) {
      throw new Error('raw email contains a malformed header line');
    }
    current = { name: line.slice(0, colon).toLowerCase(), value: line.slice(colon + 1).trim() };
  }
  if (current) headers.push(current);
  const messageIds = headers.filter((header) => header.name === 'message-id').map((header) => header.value.trim());
  if (messageIds.length !== 1 || !validRfcMessageId(messageIds[0])) {
    throw new Error('raw email does not contain exactly one safe Message-ID header');
  }
  return messageIds[0];
}

function matchingInboundForRetainedText(
  row,
  inboundRows,
  messageFileToken,
  legacyBodySourceCount,
  rawEmlMessageId = '',
) {
  if (typeof messageFileToken !== 'function') throw new Error('retained text matching requires the canonical message token helper');
  const fileName = exactFileName(row.file_name);
  const tokenized = BODY_TEXT_FILE_RE.exec(fileName);
  let matches;
  let bindingMethod = 'graph_storage_path';
  if (tokenized) {
    const pathMatches = directTokenPathMatches(row, inboundRows, messageFileToken);
    if (!validRfcMessageId(rawEmlMessageId) || messageFileToken(rawEmlMessageId) !== tokenized[1]) {
      throw new Error('retained text lacks full raw-email Message-ID corroboration');
    }
    matches = inboundRows.filter((candidate) => text(candidate.source_message_id) === rawEmlMessageId);
    bindingMethod = 'raw_eml_message_id';
    if (
      pathMatches.length > 1
      || (
        pathMatches.length === 1
        && (matches.length !== 1 || text(pathMatches[0].id) !== text(matches[0].id))
      )
    ) {
      throw new Error('retained text raw-email identity disagrees with its Graph storage path');
    }
  } else if (fileName === LEGACY_BODY_TEXT_FILE) {
    matches = inboundRows.filter((candidate) =>
      text(candidate.graph_message_id)
      && retainedBodyPathMatches(row.storage_path, candidate.graph_message_id, fileName));
    if (
      matches.length === 0
      && legacyBodySourceCount === 1
      && inboundRows.length === 1
    ) {
      matches = [inboundRows[0]];
      bindingMethod = 'single_inbound_fallback';
    }
  } else {
    throw new Error('retained text filename is not an exact body-instruction convention');
  }
  if (matches.length === 0) throw new Error('retained text token has no matching inbound email row');
  if (matches.length > 1) throw new Error('retained text token maps to multiple inbound email rows');
  return { row: matches[0], bindingMethod };
}

export function orderDocuments(docs) {
  const supported = docs.filter((doc) => DOC_EXT.test(doc.fileName) || /pdf|msword|officedocument|rtf/i.test(doc.contentType ?? ''));
  return [...supported.filter((doc) => !isPdf(doc)), ...supported.filter(isPdf)];
}

function engineerLayout(value) {
  const normalized = normalizedName(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized === 'eva engineers' || normalized === 'cnx engineers';
}

export function selectInstructionIndex(parsed) {
  const provider = parsed.findIndex(({ envelope }) => {
    const value = cell(envelope, 'work_provider');
    return value
      && value.toUpperCase() !== 'UNKNOWN'
      && !engineerLayout(value)
      && !engineerLayout(envelope?.content_typing?.provider_name);
  });
  if (provider >= 0) return provider;
  const typed = parsed.findIndex(({ envelope }) =>
    text(envelope?.content_typing?.doc_type) === 'instruction'
    && !engineerLayout(envelope?.content_typing?.provider_name)
    && !engineerLayout(cell(envelope, 'work_provider')));
  if (typed >= 0) return typed;
  const acceptablePdf = parsed.findIndex(({ doc, envelope }) =>
    isPdf(doc)
    && !engineerLayout(envelope?.content_typing?.provider_name)
    && !engineerLayout(cell(envelope, 'work_provider')));
  if (acceptablePdf >= 0) return acceptablePdf;
  const acceptable = parsed.findIndex(({ envelope }) => !engineerLayout(envelope?.content_typing?.provider_name));
  if (acceptable >= 0) return acceptable;
  return -1;
}

export function selectClaimantDocuments(parsed) {
  const selectedInstructionIndex = parsed.length ? selectInstructionIndex(parsed) : -1;
  const eligible = parsed.filter(({ envelope }) =>
    !engineerLayout(envelope?.content_typing?.provider_name)
    && !engineerLayout(cell(envelope, 'work_provider')));
  const selectedInstruction = selectedInstructionIndex >= 0 ? parsed[selectedInstructionIndex] : null;
  // Only the selected instruction may supply a claimant. Parsing the other
  // retained documents is still recorded in the census, but treating every
  // report as a claimant source made the selector decorative and allowed an
  // EVA/CNX engineer report to become remediation authority.
  const ordered = selectedInstruction && eligible.includes(selectedInstruction)
    ? [selectedInstruction]
    : [];
  return { selectedInstructionIndex, selectedInstruction, eligible, ordered };
}

export function chooseClaimant(parsed, bodyInput, supplementClaimantNameFromBody) {
  if (typeof supplementClaimantNameFromBody !== 'function') {
    throw new Error('chooseClaimant requires the canonical email-body supplement function');
  }
  const documentCandidates = distinctNames(parsed.map(({ envelope }) => cell(envelope, 'claimant_name')));
  const bodySources = Array.isArray(bodyInput)
    ? bodyInput
    : [{ text: bodyInput ?? '', inboundEmailId: null }];
  const bodyObservations = bodySources.map((source) => ({
    ...source,
    result: supplementClaimantNameFromBody(source.text ?? ''),
  }));
  const bodyCandidates = distinctNames(bodyObservations.flatMap((item) => item.result.candidates ?? []));
  const allCandidates = distinctNames([...documentCandidates, ...bodyCandidates]);
  if (documentCandidates.length > 1 || bodyObservations.some((item) => item.result.status === 'conflict') || allCandidates.length > 1) {
    return { status: 'conflicting', value: '', source: '', candidates: allCandidates, documentCandidates, bodyCandidates };
  }
  if (documentCandidates.length === 1) {
    const evidenceIds = [...new Set(parsed
      .filter(({ envelope }) => normalizedName(cell(envelope, 'claimant_name')) === normalizedName(documentCandidates[0]))
      .map(({ doc }) => text(doc?.evidenceId))
      .filter(Boolean))].sort();
    return {
      status: 'matched',
      value: documentCandidates[0],
      source: 'pdf_extraction',
      candidates: allCandidates,
      inboundEmailIds: [],
      evidenceIds,
    };
  }
  if (bodyCandidates.length === 1) {
    const matchingBodyObservations = bodyObservations
      .filter((item) => (item.result.candidates ?? []).some((candidate) => normalizedName(candidate) === normalizedName(bodyCandidates[0])));
    const inboundEmailIds = [...new Set(matchingBodyObservations
      .map((item) => text(item.inboundEmailId))
      .filter(Boolean))].sort();
    const evidenceIds = [...new Set(matchingBodyObservations
      .map((item) => text(item.evidenceId))
      .filter(Boolean))].sort();
    return {
      status: 'matched',
      value: bodyCandidates[0],
      source: 'email_text',
      candidates: bodyCandidates,
      inboundEmailIds,
      evidenceIds,
    };
  }
  return { status: 'absent', value: '', source: '', candidates: [] };
}

export function classifyPlanOutcome(failures, claimant) {
  if (failures.length) return 'failed';
  if (claimant.status === 'conflicting') return 'conflicting';
  if (claimant.status === 'matched') return 'repair';
  return 'absent_in_source';
}

export function emptyTextParse(envelope) {
  return Object.values(envelope?.extraction ?? {}).every((entry) => blank(entry?.value))
    && blank(envelope?.vrm?.value)
    && blank(envelope?.reference?.value);
}

export function coalesceOcr(envelope, ocr) {
  const extraction = { ...(envelope.extraction ?? {}) };
  for (const [key, value] of Object.entries(ocr?.extraction ?? {})) {
    if (blank(extraction[key]?.value) && !blank(value?.value)) extraction[key] = value;
  }
  return {
    ...envelope,
    extraction,
    ...(blank(envelope?.vrm?.value) && !blank(ocr?.vrm?.value) ? { vrm: ocr.vrm } : {}),
    ...(blank(envelope?.reference?.value) && !blank(ocr?.reference?.value) ? { reference: ocr.reference } : {}),
  };
}

export function sourceMetadata(row) {
  return {
    evidenceId: text(row.id),
    fileName: exactFileName(row.file_name),
    contentType: text(row.content_type),
    sizeBytes: Number(row.size_bytes ?? 0),
    declaredSha256: text(row.sha256).toLowerCase(),
    storagePathSha256: hashText(row.storage_path),
    boxFileIdSha256: hashText(row.box_file_id),
    kind: text(row.kind),
    sourceMessageIdSha256: hashText(row.source_message_id),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function sourceMetadataFingerprint(rows) {
  return integrityHash(rows.map(sourceMetadata).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)));
}

export function inboundState(row) {
  const body = String(row.body_preview ?? '');
  return {
    inboundEmailId: text(row.id),
    sourceMessageIdSha256: hashText(row.source_message_id),
    sourceMessageToken: hashText(row.source_message_id).slice(0, 8),
    sourceMailboxSha256: hashText(row.source_mailbox),
    graphMessageIdSha256: hashText(row.graph_message_id),
    receivedOn: iso(row.received_on),
    bodyPreviewByteLength: Buffer.byteLength(body, 'utf8'),
    bodyPreviewSha256: rawSha256(Buffer.from(body, 'utf8')),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function inboundStateFingerprint(rows) {
  return integrityHash(rows.map(inboundState).sort((a, b) => a.inboundEmailId.localeCompare(b.inboundEmailId)));
}

function inboundBodyReadRecords(rows) {
  return rows
    .filter((row) => text(row.body_preview))
    .map((row) => {
      const body = text(row.body_preview);
      return {
        kind: 'inbound_body_preview',
        inboundEmailId: text(row.id),
        evidenceId: null,
        byteLength: Buffer.byteLength(body, 'utf8'),
        byteSha256: rawSha256(Buffer.from(body, 'utf8')),
      };
    })
    .sort((left, right) => left.inboundEmailId.localeCompare(right.inboundEmailId));
}

export function sourceReadRecord(row, bytes) {
  const metadata = sourceMetadata(row);
  const byteSha256 = rawSha256(bytes);
  const declaredSha256 = text(row.sha256).toLowerCase();
  return {
    evidenceId: text(row.id),
    metadataSha256: integrityHash(metadata),
    readStatus: 'readable',
    byteLength: bytes.length,
    byteSha256,
    declaredSha256,
    declaredShaMatches: !declaredSha256 || declaredSha256 === byteSha256,
  };
}

function sourceReadFailureDetails(error) {
  const numericStatus = Number(error?.status);
  return {
    stage: 'source_read',
    name: (text(error?.name) || 'Error').slice(0, 100),
    code: text(error?.code).slice(0, 100) || null,
    status: Number.isSafeInteger(numericStatus) && numericStatus >= 100 && numericStatus <= 599
      ? numericStatus
      : null,
    message: (text(error?.message ?? error) || 'unknown_source_read_failure').slice(0, 1_000),
  };
}

/**
 * A failed retained-source read is still a complete planning observation. It
 * binds the exact baseline metadata row to an actionable, sealed failure, but
 * deliberately contains no byte hash that could be mistaken for write
 * authority. A fresh plan is required after the source becomes readable.
 */
export function sourceReadFailureRecord(row, error) {
  const body = {
    evidenceId: text(row.id),
    metadataSha256: integrityHash(sourceMetadata(row)),
    readStatus: 'unreadable',
    failure: sourceReadFailureDetails(error),
  };
  return { ...body, failureFingerprintSha256: integrityHash(body) };
}

function provenanceState(row) {
  return {
    id: text(row.id),
    fieldName: text(row.field_name),
    valueSha256: hashText(row.value),
    sourceTypeCode: Number(row.source_type_code),
    sourceLabelSha256: hashText(row.source_label),
    sourceReferenceSha256: hashText(row.source_reference),
    confidence: row.confidence == null ? null : String(row.confidence),
    reviewStateCode: Number(row.review_state_code),
    reviewedBySha256: hashText(row.reviewed_by),
    reviewedAt: iso(row.reviewed_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function provenanceFingerprint(rows) {
  return integrityHash(rows.map(provenanceState).sort((a, b) => a.id.localeCompare(b.id)));
}

function evidenceForReadiness(row, canonical) {
  return canonical.rowToEvidence(row);
}

export function buildPreconditions(caseRow, allEvidenceRows, provenanceRows, sourceRows, inboundRows, canonical) {
  const domainCase = canonical.rowToCase(caseRow, {
    evidence: allEvidenceRows.map((row) => evidenceForReadiness(row, canonical)),
    provenanceRows,
  });
  const readinessInput = canonical.readinessInputForCase(domainCase);
  const readiness = canonical.evaluateCaseReadiness(readinessInput);
  const duplicateKeys = String(caseRow.duplicate_keys ?? '');
  const preconditions = {
    updatedAt: iso(caseRow.updated_at),
    claimant: caseRow.eva_claimant_name ?? null,
    status: { code: Number(caseRow.status_code), name: domainCase.status },
    hold: { onHold: Boolean(caseRow.on_hold) },
    submit: {
      requested: Boolean(caseRow.submit_requested),
      payloadHash: text(caseRow.submit_payload_hash),
      finalizedPayloadHash: text(caseRow.finalized_payload_hash),
      stagedPayloadSha256: hashText(caseRow.eva_payload12),
      submittedAt: iso(caseRow.submitted_at),
    },
    merge: {
      duplicateKeysSha256: hashText(duplicateKeys),
      mergedInto: canonical.mergedIntoFrom(duplicateKeys) ?? null,
    },
    statusRecompute: {
      requestedGeneration: Number(caseRow.status_recompute_requested_generation ?? 0),
      completedGeneration: Number(caseRow.status_recompute_completed_generation ?? 0),
      requestedAt: iso(caseRow.status_recompute_requested_at),
    },
    provenanceSha256: provenanceFingerprint(provenanceRows),
    claimantProvenanceSha256: provenanceFingerprint(
      provenanceRows.filter((row) => text(row.field_name) === CLAIMANT_FIELD),
    ),
    readiness: {
      inputSha256: integrityHash(readinessInput),
      resultSha256: integrityHash(readiness),
      derivedStatus: canonical.statusForReviewCase(readinessInput),
      ready: readiness.ready === true,
    },
    sourceMetadataSha256: sourceMetadataFingerprint(sourceRows),
    inboundStateSha256: inboundStateFingerprint(inboundRows),
  };
  return { ...preconditions, stateSha256: integrityHash(preconditions) };
}

function evidenceByCase(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.case_id)) grouped.set(row.case_id, []);
    grouped.get(row.case_id).push(row);
  }
  return grouped;
}

function rowsByCase(rows) {
  return evidenceByCase(rows);
}

async function environmentIdentity(client, label) {
  const result = await client.query('SELECT current_database() AS database_name');
  const location = databaseLocation();
  return {
    label: text(label),
    databaseName: text(result.rows[0]?.database_name),
    host: location.host,
    port: location.port,
  };
}

const ALL_EVIDENCE_SQL = `
  SELECT e.*, k.name AS kind
  FROM evidence e
  JOIN choice_evidence_kind k ON k.code = e.kind_code
  WHERE e.case_id = ANY($1::uuid[])
  ORDER BY e.case_id, e.created_at, e.id`;

const PROVENANCE_SQL = `
  SELECT * FROM field_level_provenance
  WHERE case_id = ANY($1::uuid[])
  ORDER BY case_id, created_at, id`;

const INBOUND_SQL = `
  SELECT id, case_id, source_message_id, source_mailbox, graph_message_id,
         received_on, created_at, updated_at, body_preview
  FROM inbound_email
  WHERE case_id = ANY($1::uuid[])
  ORDER BY case_id, received_on ASC NULLS LAST, created_at, id`;

const ACTIVE_BLANK_CLAIMANT_PREDICATE = `
  NULLIF(btrim(c.eva_claimant_name), '') IS NULL
  AND NOT (
    c.status_code = 100000006
    AND COALESCE(c.duplicate_keys, '') ~ '"mergedInto"[[:space:]]*:'
  )
  AND (
    c.on_hold
    OR c.status_code IN (
      SELECT code FROM choice_case_status WHERE name = ANY(ARRAY[
        'error', 'duplicate_risk', 'new_email', 'ingested', 'missing_images',
        'missing_required_fields', 'linked_to_instruction', 'needs_review', 'ready_for_eva'
      ])
    )
  )`;

export async function readPlanningSnapshot(client, args, canonical) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const environment = await environmentIdentity(client, args.environment);
    const baselineSql = `${canonical.CASE_SELECT}
      WHERE ${ACTIVE_BLANK_CLAIMANT_PREDICATE}
      ORDER BY c.id`;
    const caseResult = await client.query(baselineSql);
    const cases = args.casePo
      ? caseResult.rows.filter((row) => text(row.case_po).toUpperCase() === text(args.casePo).toUpperCase())
      : caseResult.rows;
    const ids = cases.map((row) => row.id);
    const allEvidence = ids.length ? (await client.query(ALL_EVIDENCE_SQL, [ids])).rows : [];
    const provenance = ids.length ? (await client.query(PROVENANCE_SQL, [ids])).rows : [];
    const inbound = ids.length ? (await client.query(INBOUND_SQL, [ids])).rows : [];
    await client.query('COMMIT');
    return {
      environment,
      cases,
      allEvidence,
      provenance,
      inbound,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function sourceFormat(row) {
  const extension = /\.([^.]+)$/.exec(text(row.file_name))?.[1]?.toLowerCase() ?? '';
  return { extension: extension || 'none', contentType: text(row.content_type).toLowerCase() || 'unknown' };
}

function earliest(rows, timestampFields) {
  return [...rows].sort((left, right) => {
    const leftTime = timestampFields.map((key) => iso(left[key])).find(Boolean) ?? '9999';
    const rightTime = timestampFields.map((key) => iso(right[key])).find(Boolean) ?? '9999';
    return leftTime.localeCompare(rightTime) || text(left.id).localeCompare(text(right.id));
  })[0] ?? null;
}

export function censusDimensions(caseRow, allEvidenceRows, provenanceRows, inboundRows, sourceRows, canonical, parserFingerprintSha256) {
  const domainCase = canonical.rowToCase(caseRow, {
    evidence: allEvidenceRows.map((row) => canonical.rowToEvidence(row)),
    provenanceRows,
  });
  const earliestMessage = earliest(inboundRows, ['received_on', 'created_at']);
  const earliestDocument = earliest(sourceRows.filter((row) => row.kind === 'instruction'), ['created_at']);
  const formats = new Map();
  for (const row of sourceRows) {
    const format = sourceFormat(row);
    formats.set(`${format.extension}:${format.contentType}`, format);
  }
  if (inboundRows.some((row) => text(row.body_preview))) {
    const emailBodyFormat = { extension: 'email-body', contentType: 'text/plain' };
    formats.set(`${emailBodyFormat.extension}:${emailBodyFormat.contentType}`, emailBodyFormat);
  }
  return {
    provider: {
      id: caseRow.work_provider_id ?? null,
      principalCode: caseRow.provider_principal ?? null,
      displayName: caseRow.provider_display ?? caseRow.eva_work_provider ?? null,
    },
    intakePath: {
      kind: domainCase.channel?.kind ?? 'unknown',
      mode: domainCase.channel?.mode ?? 'unknown',
      sourceMailbox: domainCase.channel?.sourceMailbox ?? caseRow.source_mailbox ?? null,
    },
    sourceFormats: [...formats.values()].sort((a, b) => `${a.extension}:${a.contentType}`.localeCompare(`${b.extension}:${b.contentType}`)),
    historicalParserVersion: {
      status: 'unavailable',
      reason: 'parser_version_was_not_persisted_with_the_historical_case_or_source',
    },
    replayParserFingerprintSha256: parserFingerprintSha256,
    earliestSourceMessage: earliestMessage
      ? {
          inboundEmailId: text(earliestMessage.id),
          sourceMessageId: earliestMessage.source_message_id ?? null,
          timestamp: iso(earliestMessage.received_on ?? earliestMessage.created_at),
        }
      : {
          inboundEmailId: null,
          sourceMessageId: caseRow.source_message_id ?? null,
          timestamp: null,
        },
    earliestSourceDocument: earliestDocument
      ? {
          evidenceId: text(earliestDocument.id),
          sourceMessageId: earliestDocument.source_message_id ?? null,
          timestamp: iso(earliestDocument.created_at),
        }
      : null,
  };
}

function blobClient() {
  return BlobServiceClient.fromConnectionString(required('EVIDENCE_BLOB_CONNECTION'))
    .getContainerClient(process.env.EVIDENCE_BLOB_CONTAINER ?? 'evidence');
}

async function fetchEvidenceBytes(row, blob) {
  if (text(row.storage_path)) return downloadBlobBytes(blob.getBlockBlobClient(row.storage_path));
  if (text(row.box_file_id)) {
    const url = `${secureEndpoint('BOX_FACADE_URL')}/api/box/files/${encodeURIComponent(row.box_file_id)}/content`;
    const response = await fetchWithTimeout(url, { headers: { 'x-functions-key': required('BOX_FACADE_KEY') } });
    if (!response.ok) throw new Error(`Archive read ${response.status}`);
    const body = await readJsonResponse(response, 'Archive source read');
    return Buffer.from(String(body.contentBase64 ?? ''), 'base64');
  }
  throw new Error('evidence has no readable byte source');
}

async function parserCall(route, payload) {
  const response = await fetchWithTimeout(`${secureEndpoint('PARSER_FN_URL')}/api/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-functions-key': required('PARSER_FN_KEY') },
    body: JSON.stringify(payload),
  }, PARSER_TIMEOUT_MS);
  const body = await readJsonResponse(response, `parser ${route}`);
  if (!response.ok) throw Object.assign(new Error(`parser ${route} ${response.status}`), { status: response.status });
  return body;
}

async function ocrCall(payload) {
  if (!text(process.env.OCR_FN_URL) || !text(process.env.OCR_FN_KEY)) return null;
  const response = await fetchWithTimeout(`${secureEndpoint('OCR_FN_URL')}/api/ocr-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-functions-key': required('OCR_FN_KEY') },
    body: JSON.stringify(payload),
  }, PARSER_TIMEOUT_MS);
  const body = await readJsonResponse(response, 'ocr ocr-pdf');
  if (!response.ok) throw Object.assign(new Error(`ocr ocr-pdf ${response.status}`), { status: response.status });
  return body;
}

async function explodeEmail(row, bytes) {
  const exploded = await parserCall('explode-eml', {
    document: bytes.toString('base64'),
    filename: row.file_name,
  });
  const attachments = [];
  const integrityFailures = [];
  for (const attachment of exploded.attachments ?? []) {
    const attachmentBytes = Buffer.from(String(attachment.content_base64 ?? ''), 'base64');
    const actualSha256 = rawSha256(attachmentBytes);
    const declaredSha256 = text(attachment.sha256).toLowerCase();
    const declaredShaMatches = !declaredSha256 || declaredSha256 === actualSha256;
    if (!declaredShaMatches) {
      integrityFailures.push({
        fileName: text(attachment.filename),
        declaredSha256,
        actualSha256,
      });
    }
    attachments.push({
      fileName: text(attachment.filename),
      contentType: text(attachment.content_type),
      bytes: attachmentBytes,
      evidenceId: row.id,
      derivedFromEmail: true,
      sha256: actualSha256,
      declaredSha256,
      declaredShaMatches,
    });
  }
  return { bodyText: text(exploded.body_text), attachments, integrityFailures };
}

async function parseDocument(doc) {
  let envelope = await parserCall('parse', { document: doc.bytes.toString('base64'), filename: doc.fileName });
  let ocrAttempted = false;
  let ocrApplied = false;
  let ocrError = '';
  if (isPdf(doc) && emptyTextParse(envelope) && process.env.OCR_FN_URL && process.env.OCR_FN_KEY) {
    ocrAttempted = true;
    try {
      const ocr = await ocrCall({ document: doc.bytes.toString('base64'), filename: doc.fileName });
      if (ocr) {
        const merged = coalesceOcr(envelope, ocr);
        ocrApplied = !emptyTextParse(merged);
        envelope = merged;
      }
    } catch (error) {
      ocrError = error.message;
    }
  }
  return {
    doc: { ...doc, byteLength: doc.bytes.length, bytes: undefined },
    envelope,
    ocrAttempted,
    ocrApplied,
    ocrError,
  };
}

export async function planOne(
  caseRow,
  allEvidenceRows,
  provenanceRows,
  inboundRows,
  blob,
  canonical,
  parserFingerprintSha256,
  {
    fetchEvidence = fetchEvidenceBytes,
    parseSourceDocument = parseDocument,
    explodeSourceEmail = explodeEmail,
  } = {},
) {
  const sourceRows = allEvidenceRows.filter((row) => row.kind === 'instruction' || row.kind === 'email');
  const preconditions = buildPreconditions(caseRow, allEvidenceRows, provenanceRows, sourceRows, inboundRows, canonical);
  const failures = [];
  const sourceReads = [];
  const attachments = [];
  const documents = [];
  const bodySources = inboundRows
    .filter((row) => text(row.body_preview))
    .map((row) => ({ text: text(row.body_preview), inboundEmailId: text(row.id) }));
  const bodyInputs = inboundBodyReadRecords(inboundRows);
  const legacyBodySourceCount = sourceRows.filter((row) =>
    exactFileName(row.file_name) === LEGACY_BODY_TEXT_FILE
    && /^text\/plain(?:\s*;|$)/i.test(text(row.content_type))).length;
  const seenSources = new Set();
  const sourceLoads = new Map();
  const loadSourceBytes = (row) => {
    const evidenceId = text(row.id);
    if (!sourceLoads.has(evidenceId)) {
      sourceLoads.set(evidenceId, Promise.resolve().then(() => fetchEvidence(row, blob)));
    }
    return sourceLoads.get(evidenceId);
  };

  for (const row of sourceRows) {
    const metadata = sourceMetadata(row);
    const metadataSha256 = integrityHash(metadata);
    if (seenSources.has(metadataSha256)) continue;
    seenSources.add(metadataSha256);
    let bytes;
    let read;
    try {
      bytes = await loadSourceBytes(row);
      read = sourceReadRecord(row, bytes);
    } catch (error) {
      const unreadable = sourceReadFailureRecord(row, error);
      sourceReads.push(unreadable);
      failures.push({
        evidenceId: unreadable.evidenceId,
        ...unreadable.failure,
        failureFingerprintSha256: unreadable.failureFingerprintSha256,
      });
      continue;
    }
    const actualSha256 = read.byteSha256;
    const declaredSha256 = read.declaredSha256;
    sourceReads.push(read);
    if (!read.declaredShaMatches) {
      failures.push({ evidenceId: row.id, stage: 'source_integrity', message: 'declared_sha_mismatch' });
      continue;
    }
    try {
      const plainTextLike = retainedPlainTextSource(row);
      const emailLike = row.kind === 'email' || EMAIL_EXT.test(row.file_name) || /rfc822|ms-outlook/i.test(row.content_type ?? '');
      if (plainTextLike) {
        let rawEmlProof = null;
        if (BODY_TEXT_FILE_RE.test(exactFileName(row.file_name))) {
          const rawEmlRow = rawEmlSiblingForRetainedText(row, sourceRows);
          const rawEmlBytes = await loadSourceBytes(rawEmlRow);
          const rawEmlRead = sourceReadRecord(rawEmlRow, rawEmlBytes);
          if (!rawEmlRead.declaredShaMatches) throw new Error('raw-email sibling declared SHA does not match its bytes');
          rawEmlProof = {
            row: rawEmlRow,
            read: rawEmlRead,
            messageId: extractRawEmlMessageId(rawEmlBytes),
            storagePath: normalizedEvidenceStoragePath(rawEmlRow.storage_path),
          };
        }
        const retainedBinding = matchingInboundForRetainedText(
          row,
          inboundRows,
          canonical.messageFileToken,
          legacyBodySourceCount,
          rawEmlProof?.messageId,
        );
        const matchingInbound = retainedBinding.row;
        const decoded = decodeRetainedPlainText(row, bytes);
        bodySources.push({
          text: decoded,
          inboundEmailId: text(matchingInbound.id),
          evidenceId: text(row.id),
        });
        bodyInputs.push({
          kind: 'retained_plain_text',
          evidenceId: text(row.id),
          inboundEmailId: text(matchingInbound.id),
          sourceMessageIdSha256: hashText(matchingInbound.source_message_id),
          sourceMailboxSha256: hashText(matchingInbound.source_mailbox),
          graphMessageIdSha256: hashText(matchingInbound.graph_message_id),
          bindingMethod: retainedBinding.bindingMethod,
          storagePath: text(row.storage_path).replace(/\\/g, '/'),
          graphMessageId: retainedBinding.bindingMethod === 'graph_storage_path'
            ? text(matchingInbound.graph_message_id)
            : null,
          graphPathProbes: retainedGraphPathProbes(row, inboundRows, canonical.messageFileToken),
          ...(retainedBinding.bindingMethod === 'raw_eml_message_id'
            ? {
                rawEmlEvidenceId: text(rawEmlProof.row.id),
                rawEmlStoragePath: rawEmlProof.storagePath,
                rawEmlMessageId: rawEmlProof.messageId,
                rawEmlByteLength: rawEmlProof.read.byteLength,
                rawEmlByteSha256: rawEmlProof.read.byteSha256,
              }
            : {}),
          byteLength: bytes.length,
          byteSha256: actualSha256,
        });
      } else if (plainTextShapedSource(row)) {
        failures.push({ evidenceId: row.id, stage: 'source_type', message: 'unsupported_retained_source' });
      } else if (emailLike) {
        const exploded = await explodeSourceEmail(row, bytes);
        for (const failure of exploded.integrityFailures) {
          failures.push({
            evidenceId: row.id,
            stage: 'attachment_integrity',
            message: 'declared_sha_mismatch',
            ...failure,
          });
        }
        if (exploded.bodyText) {
          const matchingInbound = inboundRows.find((candidate) =>
            text(candidate.source_message_id) === text(row.source_message_id)
            && (!text(row.source_mailbox) || text(candidate.source_mailbox) === text(row.source_mailbox)));
          bodySources.push({
            text: exploded.bodyText,
            inboundEmailId: matchingInbound ? text(matchingInbound.id) : '',
            evidenceId: text(row.id),
          });
          bodyInputs.push({
            kind: 'exploded_email_body',
            evidenceId: text(row.id),
            inboundEmailId: matchingInbound ? text(matchingInbound.id) : null,
            byteLength: Buffer.byteLength(exploded.bodyText, 'utf8'),
            byteSha256: rawSha256(Buffer.from(exploded.bodyText, 'utf8')),
          });
        }
        for (const attachment of exploded.attachments) {
          attachments.push({
            parentEvidenceId: text(row.id),
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            byteLength: attachment.bytes.length,
            byteSha256: attachment.sha256,
            declaredSha256: attachment.declaredSha256,
            declaredShaMatches: attachment.declaredShaMatches,
          });
          if (attachment.declaredShaMatches) documents.push(attachment);
        }
      } else if (DOC_EXT.test(row.file_name) || /pdf|msword|officedocument|rtf/i.test(row.content_type ?? '')) {
        documents.push({
          fileName: row.file_name,
          contentType: row.content_type ?? '',
          bytes,
          evidenceId: row.id,
          derivedFromEmail: false,
          sha256: actualSha256,
          declaredSha256,
        });
      } else {
        failures.push({ evidenceId: row.id, stage: 'source_type', message: 'unsupported_retained_source' });
      }
    } catch (error) {
      const details = sourceReadFailureDetails(error);
      failures.push({
        evidenceId: text(row.id),
        ...details,
        stage: 'source_processing',
      });
    }
  }

  const uniqueDocuments = [];
  const documentHashes = new Set();
  for (const document of orderDocuments(documents)) {
    if (documentHashes.has(document.sha256)) continue;
    documentHashes.add(document.sha256);
    uniqueDocuments.push(document);
  }
  if (uniqueDocuments.length > MAX_SOURCE_DOCUMENTS) {
    failures.push({ stage: 'source_limit', message: `more_than_${MAX_SOURCE_DOCUMENTS}_documents` });
  }

  const parsed = [];
  if (uniqueDocuments.length <= MAX_SOURCE_DOCUMENTS) {
    for (const document of uniqueDocuments) {
      try {
        const parsedDocument = await parseSourceDocument(document);
        parsed.push(parsedDocument);
        if (parsedDocument.ocrError) {
          failures.push({
            evidenceId: document.evidenceId,
            fileName: document.fileName,
            stage: 'ocr',
            message: parsedDocument.ocrError,
          });
        }
      } catch (error) {
        failures.push({
          evidenceId: document.evidenceId,
          fileName: document.fileName,
          stage: 'parse',
          status: error.status ?? null,
          message: error.message,
        });
      }
    }
  }

  const {
    selectedInstruction,
    eligible: eligibleClaimantDocuments,
    ordered: orderedClaimantDocuments,
  } = selectClaimantDocuments(parsed);
  const claimantDecision = chooseClaimant(orderedClaimantDocuments, bodySources, canonical.supplementClaimantNameFromBody);
  const claimant = claimantDecision.status === 'matched'
    ? { ...claimantDecision, value: text(claimantDecision.value) }
    : claimantDecision;
  if (claimant.status === 'matched' && claimant.value.length > 200) {
    failures.push({ stage: 'claimant_validation', message: 'claimant_exceeds_200_character_limit' });
  }
  const sourceEvidenceIds = claimant.source ? (claimant.evidenceIds ?? []) : [];
  const sourceInboundEmailIds = claimant.source === 'email_text' ? (claimant.inboundEmailIds ?? []) : [];
  if (claimant.source === 'email_text' && sourceInboundEmailIds.length === 0) {
    failures.push({ stage: 'email_provenance', message: 'matched_email_claimant_has_no_inbound_source_id' });
  }

  const outcome = classifyPlanOutcome(failures, claimant);

  const body = {
    caseId: text(caseRow.id),
    casePo: caseRow.case_po ?? null,
    vrm: caseRow.vrm ?? null,
    outcome,
    patch: outcome === 'repair' ? { [CLAIMANT_COLUMN]: claimant.value } : {},
    fieldSource: outcome === 'repair' ? claimant.source : null,
    sourceEvidenceIds,
    sourceInboundEmailIds,
    claimant,
    census: censusDimensions(
      caseRow,
      allEvidenceRows,
      provenanceRows,
      inboundRows,
      sourceRows,
      canonical,
      parserFingerprintSha256,
    ),
    preconditions,
    sources: {
      metadata: sourceRows.map(sourceMetadata).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
      reads: sourceReads.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
      inbound: inboundRows.map(inboundState).sort((a, b) => a.inboundEmailId.localeCompare(b.inboundEmailId)),
      bodyInputs: bodyInputs.sort((a, b) => `${a.kind}:${a.evidenceId ?? ''}`.localeCompare(`${b.kind}:${b.evidenceId ?? ''}`)),
      attachments: attachments.sort((a, b) => `${a.parentEvidenceId}:${a.fileName}`.localeCompare(`${b.parentEvidenceId}:${b.fileName}`)),
      parsedDocuments: parsed.map(({ doc, envelope, ocrAttempted, ocrApplied, ocrError }) => ({
        evidenceId: doc.evidenceId,
        fileName: doc.fileName,
        byteLength: doc.byteLength,
        byteSha256: doc.sha256,
        claimant: cell(envelope, 'claimant_name'),
        docType: text(envelope?.content_typing?.doc_type) || 'unknown',
        ocrAttempted,
        ocrApplied,
        ...(ocrError ? { ocrError } : {}),
      })),
      selectedInstruction: selectedInstruction
        ? {
            evidenceId: selectedInstruction.doc.evidenceId,
            byteSha256: selectedInstruction.doc.sha256,
            eligibleForClaimant: eligibleClaimantDocuments.includes(selectedInstruction),
          }
        : null,
    },
    failures,
  };
  return sealCase(body);
}

export function sealCase(body) {
  const { caseSha256: ignored, ...withoutHash } = body;
  return { ...withoutHash, caseSha256: integrityHash(withoutHash) };
}

function unreadableSourceReads(item) {
  return (item?.sources?.reads ?? []).filter((source) => source?.readStatus === 'unreadable');
}

function authorizesStatusRecompute(item) {
  return unreadableSourceReads(item).length === 0;
}

export function planCounts(cases) {
  return {
    baselineCount: cases.length,
    statusRecomputeCount: cases.filter(authorizesStatusRecompute).length,
    writeCount: cases.filter((item) => item.outcome === 'repair').length,
    absentCount: cases.filter((item) => item.outcome === 'absent_in_source').length,
    conflictCount: cases.filter((item) => item.outcome === 'conflicting').length,
    failedCount: cases.filter((item) => item.outcome === 'failed').length,
  };
}

export function sealPlan(body) {
  const { planSha256: ignored, ...withoutHash } = body;
  return { ...withoutHash, planSha256: integrityHash(withoutHash) };
}

async function createPlan(client, args, canonical) {
  required('EVIDENCE_BLOB_CONNECTION');
  secureEndpoint('PARSER_FN_URL');
  required('PARSER_FN_KEY');
  secureEndpoint('BOX_FACADE_URL');
  required('BOX_FACADE_KEY');
  const parserFingerprint = await deployedParserFingerprint();
  const parserFingerprintSha256 = integrityHash(parserFingerprint);
  const snapshot = await readPlanningSnapshot(client, args, canonical);
  const allEvidence = rowsByCase(snapshot.allEvidence);
  const provenance = rowsByCase(snapshot.provenance);
  const inbound = rowsByCase(snapshot.inbound);
  const blob = blobClient();
  const cases = [];
  for (const [index, caseRow] of snapshot.cases.entries()) {
    process.stderr.write(`[tkt150] plan ${index + 1}/${snapshot.cases.length} ${caseRow.case_po ?? caseRow.vrm ?? caseRow.id}\n`);
    cases.push(await planOne(
      caseRow,
      allEvidence.get(caseRow.id) ?? [],
      provenance.get(caseRow.id) ?? [],
      inbound.get(caseRow.id) ?? [],
      blob,
      canonical,
      parserFingerprintSha256,
    ));
  }
  const closingParserFingerprint = await deployedParserFingerprint();
  if (!sameValue(closingParserFingerprint, parserFingerprint)) {
    throw new Error('Parser fingerprint changed during remediation planning');
  }
  const runnerSha256 = rawSha256(await readFile(RUNNER_PATH));
  const counts = planCounts(cases);
  const plan = sealPlan({
    contract: PLAN_CONTRACT,
    scope: AUTHORIZED_SCOPE,
    createdAt: new Date().toISOString(),
    environment: snapshot.environment,
    environmentSha256: integrityHash(snapshot.environment),
    runnerSha256,
    parserFingerprint,
    parserFingerprintSha256,
    selection: args.casePo
      ? { kind: 'partial_case_po', casePo: text(args.casePo).toUpperCase() }
      : { kind: 'full_baseline' },
    counts,
    writeAllowlist: sortAllowlist(
      cases.filter((item) => item.outcome === 'repair').map((item) => ({ caseId: item.caseId, caseSha256: item.caseSha256 })),
    ),
    statusRecomputeAllowlist: sortAllowlist(
      cases
        .filter(authorizesStatusRecompute)
        .map((item) => ({ caseId: item.caseId, caseSha256: item.caseSha256 })),
    ),
    cases,
  });
  assertPlan(plan);
  return plan;
}

export function assertPlan(plan) {
  if (plan?.contract !== PLAN_CONTRACT || !Array.isArray(plan.cases)) throw new Error('Unrecognised v2 remediation plan');
  if (!exactScope(plan.scope)) throw new Error('Plan scope does not match the exact remediation scope');
  const { planSha256, ...body } = plan;
  if (integrityHash(body) !== sha(planSha256, 'planSha256')) throw new Error('Plan integrity hash mismatch');
  if (integrityHash(plan.environment) !== sha(plan.environmentSha256, 'environmentSha256')) {
    throw new Error('Plan environment hash mismatch');
  }
  const parserFingerprint = validateParserFingerprint(plan.parserFingerprint, plan.parserFingerprint);
  if (integrityHash(parserFingerprint) !== sha(plan.parserFingerprintSha256, 'parserFingerprintSha256')) {
    throw new Error('Plan parser fingerprint hash mismatch');
  }
  if (!sameValue(planCounts(plan.cases), plan.counts)) throw new Error('Plan counts mismatch');
  if (!['full_baseline', 'partial_case_po'].includes(plan.selection?.kind)) throw new Error('Plan selection is missing');
  const caseIds = new Set();
  for (const item of plan.cases) {
    if (!text(item.caseId) || caseIds.has(item.caseId)) throw new Error('Plan contains a blank or duplicate case id');
    caseIds.add(item.caseId);
    const { caseSha256, ...caseBody } = item;
    if (integrityHash(caseBody) !== sha(caseSha256, `caseSha256:${item.caseId}`)) throw new Error(`Case hash mismatch: ${item.caseId}`);
    if (!['repair', 'absent_in_source', 'conflicting', 'failed'].includes(item.outcome)) {
      throw new Error(`Invalid outcome: ${item.caseId}`);
    }
    if (classifyPlanOutcome(item.failures ?? [], item.claimant ?? { status: 'absent' }) !== item.outcome) {
      throw new Error(`Outcome classification mismatch: ${item.caseId}`);
    }
    const patchKeys = Object.keys(item.patch ?? {});
    if (item.outcome === 'repair') {
      if (
        patchKeys.length !== 1
        || patchKeys[0] !== CLAIMANT_COLUMN
        || blank(item.patch[CLAIMANT_COLUMN])
        || item.patch[CLAIMANT_COLUMN] !== text(item.patch[CLAIMANT_COLUMN])
        || item.patch[CLAIMANT_COLUMN].length > 200
      ) {
        throw new Error(`Repair is not claimant-only: ${item.caseId}`);
      }
      const claimantInboundIds = [...new Set((item.claimant?.inboundEmailIds ?? []).map(text).filter(Boolean))].sort();
      const claimantEvidenceIds = [...new Set((item.claimant?.evidenceIds ?? []).map(text).filter(Boolean))].sort();
      const claimantCandidates = Array.isArray(item.claimant?.candidates) ? item.claimant.candidates : [];
      if (
        item.claimant?.status !== 'matched'
        || item.claimant?.source !== item.fieldSource
        || item.claimant?.value !== item.patch[CLAIMANT_COLUMN]
        || !claimantCandidates.some((candidate) => normalizedName(candidate) === normalizedName(item.claimant.value))
        || (item.failures ?? []).length !== 0
        || !sameValue(item.sourceInboundEmailIds, claimantInboundIds)
        || !sameValue(item.sourceEvidenceIds, claimantEvidenceIds)
      ) {
        throw new Error(`Repair decision is not semantically bound to its claimant and exact sources: ${item.caseId}`);
      }
      if (!ALLOWED_SOURCES.has(item.fieldSource)) throw new Error(`Invalid claimant source: ${item.caseId}`);
      if (!blank(item.preconditions?.claimant)) throw new Error(`Repair would overwrite claimant: ${item.caseId}`);
      if (item.fieldSource === 'pdf_extraction') {
        if (!Array.isArray(item.sourceEvidenceIds) || item.sourceEvidenceIds.length === 0) {
          throw new Error(`Document repair has no retained evidence reference: ${item.caseId}`);
        }
        if (item.sources?.selectedInstruction?.eligibleForClaimant !== true) {
          throw new Error(`Document repair did not select an eligible instruction: ${item.caseId}`);
        }
      } else if (!Array.isArray(item.sourceInboundEmailIds) || item.sourceInboundEmailIds.length === 0) {
        throw new Error(`Email repair has no inbound source reference: ${item.caseId}`);
      }
    } else if (patchKeys.length !== 0) {
      throw new Error(`No-write outcome contains a patch: ${item.caseId}`);
    }
    const { stateSha256, ...stateBody } = item.preconditions ?? {};
    if (integrityHash(stateBody) !== sha(stateSha256, `stateSha256:${item.caseId}`)) {
      throw new Error(`Precondition hash mismatch: ${item.caseId}`);
    }
    sha(item.preconditions?.inboundStateSha256, `inboundStateSha256:${item.caseId}`);
    if (item.census?.historicalParserVersion?.status !== 'unavailable') {
      throw new Error(`Historical parser availability is not explicit: ${item.caseId}`);
    }
    if (
      !item.census?.provider
      || !item.census?.intakePath
      || !Array.isArray(item.census?.sourceFormats)
      || !item.census?.earliestSourceMessage
    ) throw new Error(`Census dimensions are incomplete: ${item.caseId}`);
    if (item.census?.replayParserFingerprintSha256 !== plan.parserFingerprintSha256) {
      throw new Error(`Replay parser fingerprint mismatch: ${item.caseId}`);
    }
    const metadataRows = item.sources?.metadata ?? [];
    const readRows = item.sources?.reads ?? [];
    const plannedInboundRows = item.sources?.inbound ?? [];
    if (!Array.isArray(metadataRows) || !Array.isArray(readRows) || !Array.isArray(plannedInboundRows)) {
      throw new Error(`Retained source observations are missing: ${item.caseId}`);
    }
    const inboundIds = plannedInboundRows.map((source) => text(source.inboundEmailId)).sort();
    if (inboundIds.some((id) => !id) || new Set(inboundIds).size !== inboundIds.length) {
      throw new Error(`Planned inbound identity set is invalid: ${item.caseId}`);
    }
    const normalizedInboundRows = [...plannedInboundRows]
      .sort((left, right) => text(left.inboundEmailId).localeCompare(text(right.inboundEmailId)));
    if (integrityHash(normalizedInboundRows) !== item.preconditions.inboundStateSha256) {
      throw new Error(`Planned inbound identities do not match the precondition state: ${item.caseId}`);
    }
    const plannedInboundById = new Map(plannedInboundRows.map((source) => [text(source.inboundEmailId), source]));
    const metadataIds = metadataRows.map((source) => text(source.evidenceId)).sort();
    const readIds = readRows.map((source) => text(source.evidenceId)).sort();
    if (
      metadataIds.some((id) => !id)
      || new Set(metadataIds).size !== metadataIds.length
      || new Set(readIds).size !== readIds.length
      || !sameValue(metadataIds, readIds)
    ) {
      throw new Error(`Every retained raw source must have exactly one planned observation: ${item.caseId}`);
    }
    const metadataById = new Map(metadataRows.map((source) => [text(source.evidenceId), source]));
    const unreadable = [];
    for (const source of readRows) {
      const metadata = metadataById.get(text(source.evidenceId));
      if (integrityHash(metadata) !== sha(source.metadataSha256, `source metadataSha256:${item.caseId}`)) {
        throw new Error(`Retained source observation does not match its baseline row: ${item.caseId}`);
      }
      if (source.readStatus === 'readable') {
        sha(source.byteSha256, `consumed source byteSha256:${item.caseId}`);
        if (!Number.isSafeInteger(source.byteLength) || source.byteLength < 0) {
          throw new Error(`Invalid consumed source byte length: ${item.caseId}`);
        }
        const declaredSha256 = text(source.declaredSha256).toLowerCase();
        if (declaredSha256) sha(declaredSha256, `declared source SHA-256:${item.caseId}`);
        if (source.declaredShaMatches !== (!declaredSha256 || declaredSha256 === source.byteSha256)) {
          throw new Error(`Retained source declared SHA result is inconsistent: ${item.caseId}`);
        }
        if (Object.hasOwn(source, 'failure') || Object.hasOwn(source, 'failureFingerprintSha256')) {
          throw new Error(`Readable source contains failure authority: ${item.caseId}`);
        }
      } else if (source.readStatus === 'unreadable') {
        const { failureFingerprintSha256, ...failureBody } = source;
        if (integrityHash(failureBody) !== sha(failureFingerprintSha256, `source failure fingerprint:${item.caseId}`)) {
          throw new Error(`Unreadable source failure fingerprint mismatch: ${item.caseId}`);
        }
        if (
          source.failure?.stage !== 'source_read'
          || blank(source.failure?.name)
          || blank(source.failure?.message)
          || (
            source.failure?.status != null
            && (!Number.isSafeInteger(source.failure.status) || source.failure.status < 100 || source.failure.status > 599)
          )
        ) throw new Error(`Unreadable source failure is not actionable: ${item.caseId}`);
        if (['byteSha256', 'byteLength', 'declaredSha256', 'declaredShaMatches'].some((key) => Object.hasOwn(source, key))) {
          throw new Error(`Unreadable source must not contain byte authority: ${item.caseId}`);
        }
        const recordedFailure = (item.failures ?? []).some((failure) =>
          text(failure.evidenceId) === text(source.evidenceId)
          && failure.stage === 'source_read'
          && failure.failureFingerprintSha256 === source.failureFingerprintSha256);
        if (!recordedFailure) throw new Error(`Unreadable source has no matching case failure: ${item.caseId}`);
        unreadable.push(source);
      } else {
        throw new Error(`Retained source observation status is invalid: ${item.caseId}`);
      }
    }
    if (unreadable.length) {
      if (item.outcome !== 'failed' || patchKeys.length !== 0 || item.fieldSource != null) {
        throw new Error(`Unreadable source cannot authorize a write: ${item.caseId}`);
      }
    }
    if (
      item.outcome === 'repair'
      && item.fieldSource === 'pdf_extraction'
      && item.sourceEvidenceIds.some((id) => readRows.find((source) => text(source.evidenceId) === text(id))?.readStatus !== 'readable')
    ) throw new Error(`Document repair source was not read successfully: ${item.caseId}`);
    for (const source of [
      ...(item.sources?.bodyInputs ?? []),
      ...(item.sources?.attachments ?? []),
      ...(item.sources?.parsedDocuments ?? []),
    ]) {
      sha(source.byteSha256, `consumed source byteSha256:${item.caseId}`);
      if (!Number.isSafeInteger(source.byteLength) || source.byteLength < 0) {
        throw new Error(`Invalid consumed source byte length: ${item.caseId}`);
      }
    }
    const retainedTextInputs = (item.sources?.bodyInputs ?? [])
      .filter((source) => source.kind === 'retained_plain_text');
    const retainedTextMetadataRows = metadataRows.filter((source) =>
      (BODY_TEXT_FILE_RE.test(exactFileName(source.fileName)) || exactFileName(source.fileName) === LEGACY_BODY_TEXT_FILE)
      && /^text\/plain(?:\s*;|$)/i.test(text(source.contentType)));
    const retainedTextEvidenceIds = new Set();
    for (const source of retainedTextInputs) {
      const evidenceId = text(source.evidenceId);
      if (!evidenceId || retainedTextEvidenceIds.has(evidenceId)) {
        throw new Error(`Retained plain-text body has invalid evidence identity: ${item.caseId}`);
      }
      retainedTextEvidenceIds.add(evidenceId);
      const read = readRows.find((candidate) => text(candidate.evidenceId) === evidenceId);
      const metadata = metadataById.get(evidenceId);
      if (
        read?.readStatus !== 'readable'
        || read.declaredShaMatches !== true
        || read.byteSha256 !== source.byteSha256
        || read.byteLength !== source.byteLength
      ) {
        throw new Error(`Retained plain-text body is not bound to its exact source bytes: ${item.caseId}`);
      }
      sha(source.sourceMessageIdSha256, `retained text sourceMessageIdSha256:${item.caseId}`);
      sha(source.sourceMailboxSha256, `retained text sourceMailboxSha256:${item.caseId}`);
      sha(source.graphMessageIdSha256, `retained text graphMessageIdSha256:${item.caseId}`);
      const inbound = plannedInboundById.get(text(source.inboundEmailId));
      if (
        !inbound
        || inbound.sourceMessageIdSha256 !== source.sourceMessageIdSha256
        || inbound.sourceMailboxSha256 !== source.sourceMailboxSha256
        || inbound.graphMessageIdSha256 !== source.graphMessageIdSha256
      ) {
        throw new Error(`Retained plain-text body is cross-bound to the wrong inbound identity: ${item.caseId}`);
      }
      const fileName = exactFileName(metadata?.fileName);
      const contentType = text(metadata?.contentType).toLowerCase();
      const tokenized = BODY_TEXT_FILE_RE.exec(fileName);
      const storagePath = text(source.storagePath).replace(/\\/g, '/');
      const graphMessageId = text(source.graphMessageId);
      if (
        (!tokenized && fileName !== LEGACY_BODY_TEXT_FILE)
        || !/^text\/plain(?:\s*;|$)/i.test(contentType)
        || (tokenized && tokenized[1] !== inbound.sourceMessageToken)
        || hashText(storagePath) !== metadata.storagePathSha256
      ) {
        throw new Error(`Retained plain-text body convention does not match its inbound identity: ${item.caseId}`);
      }
      const expectedProbeIds = plannedInboundRows
        .map((candidate) => text(candidate.inboundEmailId))
        .sort();
      const graphPathProbes = Array.isArray(source.graphPathProbes)
        ? [...source.graphPathProbes].sort((left, right) => text(left.inboundEmailId).localeCompare(text(right.inboundEmailId)))
        : [];
      const actualProbeIds = graphPathProbes.map((probe) => text(probe.inboundEmailId));
      const graphPathProbeInvalid = graphPathProbes.some((probe) => {
        const probeInbound = plannedInboundById.get(text(probe.inboundEmailId));
        const probeGraphMessageId = probe.graphMessageId == null ? '' : text(probe.graphMessageId);
        return !probeInbound || hashText(probeGraphMessageId) !== probeInbound.graphMessageIdSha256;
      });
      const graphPathMatchIds = graphPathProbes
        .filter((probe) =>
          text(probe.graphMessageId)
          && retainedBodyPathMatches(storagePath, text(probe.graphMessageId), fileName))
        .map((probe) => text(probe.inboundEmailId));
      if (
        !sameValue(actualProbeIds, expectedProbeIds)
        || new Set(actualProbeIds).size !== actualProbeIds.length
        || graphPathProbeInvalid
      ) throw new Error(`Retained plain-text Graph path probes are incomplete: ${item.caseId}`);
      if (source.bindingMethod === 'graph_storage_path') {
        if (
          tokenized
          || fileName !== LEGACY_BODY_TEXT_FILE
          || !graphMessageId
          || hashText(graphMessageId) !== inbound.graphMessageIdSha256
          || !retainedBodyPathMatches(storagePath, graphMessageId, fileName)
          || graphPathMatchIds.length !== 1
          || graphPathMatchIds[0] !== text(source.inboundEmailId)
        ) {
          throw new Error(`Retained plain-text body path does not match its inbound identity: ${item.caseId}`);
        }
      } else if (source.bindingMethod === 'raw_eml_message_id') {
        const rawEmlEvidenceId = text(source.rawEmlEvidenceId);
        const rawEmlMetadata = metadataById.get(rawEmlEvidenceId);
        const rawEmlRead = readRows.find((candidate) => text(candidate.evidenceId) === rawEmlEvidenceId);
        const rawEmlStoragePath = normalizedEvidenceStoragePath(source.rawEmlStoragePath);
        const expectedRawEmlFileName = tokenized ? `message-${tokenized[1]}.eml` : '';
        const bodyStorageDirectory = storageDirectory(storagePath);
        const expectedRawEmlMetadataRows = metadataRows.filter((candidate) =>
          exactFileName(candidate.fileName) === expectedRawEmlFileName
          && candidate.kind === 'email'
          && /^message\/rfc822(?:\s*;|$)/i.test(text(candidate.contentType))
          && candidate.storagePathSha256 === hashText(rawEmlStoragePath));
        const fullMessageIdMatches = validRfcMessageId(source.rawEmlMessageId)
          ? plannedInboundRows.filter((candidate) => candidate.sourceMessageIdSha256 === hashText(source.rawEmlMessageId))
          : [];
        if (
          !tokenized
          || source.graphMessageId !== null
          || storagePath !== storagePathInDirectory(bodyStorageDirectory, fileName)
          || !rawEmlEvidenceId
          || rawEmlEvidenceId === evidenceId
          || expectedRawEmlMetadataRows.length !== 1
          || text(expectedRawEmlMetadataRows[0]?.evidenceId) !== rawEmlEvidenceId
          || exactFileName(rawEmlMetadata?.fileName) !== expectedRawEmlFileName
          || rawEmlMetadata?.kind !== 'email'
          || !/^message\/rfc822(?:\s*;|$)/i.test(text(rawEmlMetadata?.contentType))
          || hashText(rawEmlStoragePath) !== rawEmlMetadata?.storagePathSha256
          || storageDirectory(rawEmlStoragePath) !== bodyStorageDirectory
          || rawEmlStoragePath !== storagePathInDirectory(bodyStorageDirectory, expectedRawEmlFileName)
          || rawEmlRead?.readStatus !== 'readable'
          || rawEmlRead.declaredShaMatches !== true
          || rawEmlRead.byteSha256 !== source.rawEmlByteSha256
          || rawEmlRead.byteLength !== source.rawEmlByteLength
          || !validRfcMessageId(source.rawEmlMessageId)
          || hashText(source.rawEmlMessageId) !== inbound.sourceMessageIdSha256
          || hashText(source.rawEmlMessageId).slice(0, 8) !== tokenized[1]
          || fullMessageIdMatches.length !== 1
          || text(fullMessageIdMatches[0]?.inboundEmailId) !== text(source.inboundEmailId)
          || graphPathMatchIds.length > 1
          || (graphPathMatchIds.length === 1 && graphPathMatchIds[0] !== text(source.inboundEmailId))
        ) {
          throw new Error(`Retained plain-text raw-email identity is not exactly bound: ${item.caseId}`);
        }
      } else if (source.bindingMethod === 'single_inbound_fallback') {
        const legacyMetadataCount = retainedTextMetadataRows
          .filter((candidate) => exactFileName(candidate.fileName) === LEGACY_BODY_TEXT_FILE).length;
        if (
          fileName !== LEGACY_BODY_TEXT_FILE
          || source.graphMessageId !== null
          || plannedInboundRows.length !== 1
          || legacyMetadataCount !== 1
          || text(plannedInboundRows[0].inboundEmailId) !== text(source.inboundEmailId)
          || graphPathMatchIds.length !== 0
        ) {
          throw new Error(`Legacy retained plain-text fallback is ambiguous: ${item.caseId}`);
        }
      } else {
        throw new Error(`Retained plain-text binding method is invalid: ${item.caseId}`);
      }
    }
    for (const metadata of retainedTextMetadataRows) {
      const evidenceId = text(metadata.evidenceId);
      const read = readRows.find((candidate) => text(candidate.evidenceId) === evidenceId);
      if (read?.readStatus !== 'readable') continue;
      const consumedCount = retainedTextInputs.filter((source) => text(source.evidenceId) === evidenceId).length;
      const blockingFailureCount = (item.failures ?? []).filter((failure) =>
        text(failure.evidenceId) === evidenceId
        && ['source_integrity', 'source_processing'].includes(failure.stage)).length;
      if (consumedCount + blockingFailureCount !== 1) {
        throw new Error(`Readable retained plain-text source lacks exact processing coverage: ${item.caseId}:${evidenceId}`);
      }
    }
    if (item.fieldSource === 'email_text') {
      const bodyInboundIds = new Set((item.sources?.bodyInputs ?? []).map((source) => text(source.inboundEmailId)).filter(Boolean));
      if (!item.sourceInboundEmailIds.every((id) => bodyInboundIds.has(text(id)))) {
        throw new Error(`Email repair source is not covered by a consumed body hash: ${item.caseId}`);
      }
      const retainedBodyEvidenceIds = new Set((item.sources?.bodyInputs ?? [])
        .filter((source) => ['retained_plain_text', 'exploded_email_body'].includes(source.kind))
        .map((source) => text(source.evidenceId))
        .filter(Boolean));
      if (!item.sourceEvidenceIds.every((id) =>
        retainedBodyEvidenceIds.has(text(id))
        && readRows.find((source) => text(source.evidenceId) === text(id))?.readStatus === 'readable')) {
        throw new Error(`Email repair evidence is not covered by readable retained body bytes: ${item.caseId}`);
      }
    }
  }
  const expectedAllowlist = sortAllowlist(
    plan.cases.filter((item) => item.outcome === 'repair').map((item) => ({ caseId: item.caseId, caseSha256: item.caseSha256 })),
  );
  if (!sameValue(sortAllowlist(plan.writeAllowlist ?? []), expectedAllowlist)) throw new Error('Plan write allowlist mismatch');
  const expectedStatusAllowlist = sortAllowlist(
    plan.cases
      .filter(authorizesStatusRecompute)
      .map((item) => ({ caseId: item.caseId, caseSha256: item.caseSha256 })),
  );
  if (!sameValue(sortAllowlist(plan.statusRecomputeAllowlist ?? []), expectedStatusAllowlist)) {
    throw new Error('Plan status-recompute allowlist mismatch');
  }
  return plan;
}

function assertTimestampOrder(approval, backupManifest, plan, now) {
  const approvedAt = new Date(approval.approvedAt);
  const expiresAt = new Date(approval.expiresAt);
  const plannedAt = new Date(plan.createdAt);
  const backupAt = new Date(backupManifest.completedAt);
  const restoredAt = new Date(backupManifest.restoreVerification?.completedAt);
  if (![approvedAt, expiresAt, plannedAt, backupAt, restoredAt].every((date) => Number.isFinite(date.valueOf()))) {
    throw new Error('Plan, approval, and backup timestamps must be valid ISO timestamps');
  }
  if (approvedAt.valueOf() > now.valueOf()) throw new Error('Approval is future-dated');
  if (expiresAt.valueOf() <= now.valueOf()) throw new Error('Approval has expired');
  if (expiresAt.valueOf() <= approvedAt.valueOf()) throw new Error('Approval expiry must follow approval time');
  if (backupAt.valueOf() < plannedAt.valueOf()) throw new Error('pg_dump must complete after the plan was frozen');
  if (backupAt.valueOf() > restoredAt.valueOf()) throw new Error('Backup restore verification must follow pg_dump completion');
  if (restoredAt.valueOf() > approvedAt.valueOf()) throw new Error('Backup restore verification must complete before approval');
}

function assertNamedApprover(value) {
  const name = text(value);
  if (name.length < 3 || /^(?:system|automation|codex|unknown|n\/?a)$/i.test(name)) {
    throw new Error('Approval must name a human approver');
  }
  return name;
}

function assertBackupRestore(backupManifest, plan, actualPgDumpSha256, actualPgDumpByteLength) {
  const pgDump = backupManifest.pgDump ?? {};
  const manifestPgDumpSha256 = sha(pgDump.sha256, 'pg_dump SHA-256');
  if (!Number.isSafeInteger(pgDump.byteLength) || pgDump.byteLength <= 0) {
    throw new Error('pg_dump byteLength must be a positive integer');
  }
  if (
    sha(actualPgDumpSha256, 'actual pg_dump SHA-256') !== manifestPgDumpSha256
    || actualPgDumpByteLength !== pgDump.byteLength
  ) throw new Error('Actual pg_dump artifact does not match the backup manifest');
  const restore = backupManifest.restoreVerification ?? {};
  if (Number(restore.postgresMajor) !== 16) throw new Error('Backup must be restored and verified on PostgreSQL 16');
  if (text(restore.databaseName) !== text(plan.environment.databaseName)) {
    throw new Error('Restored database name does not match the planned environment');
  }
  if (
    sha(restore.sourcePgDumpSha256, 'restore source pg_dump SHA-256') !== manifestPgDumpSha256
    || Number(restore.sourcePgDumpByteLength) !== pgDump.byteLength
  ) throw new Error('Restore verification is not bound to the supplied pg_dump artifact');
  for (const table of BACKUP_CHECKSUM_TABLES) {
    if (!Number.isSafeInteger(restore.rowCounts?.[table]) || restore.rowCounts[table] < 0) {
      throw new Error(`Restored row count is missing or invalid: ${table}`);
    }
    sha(restore.tableChecksums?.[table], `restored table checksum:${table}`);
    if (!Number.isSafeInteger(restore.sourceRowCounts?.[table]) || restore.sourceRowCounts[table] < 0) {
      throw new Error(`Source row count is missing or invalid: ${table}`);
    }
    sha(restore.sourceTableChecksums?.[table], `source table checksum:${table}`);
    if (
      restore.sourceRowCounts[table] !== restore.rowCounts[table]
      || restore.sourceTableChecksums[table].toLowerCase() !== restore.tableChecksums[table].toLowerCase()
    ) throw new Error(`Restored table does not match the source snapshot: ${table}`);
  }
  const repairIdsSha256 = integrityHash(plan.writeAllowlist.map((item) => item.caseId).sort());
  if (sha(backupManifest.repairCaseIdsSha256, 'backup repairCaseIdsSha256') !== repairIdsSha256) {
    throw new Error('Backup did not attest the exact repair case ids');
  }
  return repairIdsSha256;
}

export function validateApplyAuthority({
  plan,
  planRawSha256,
  expectedPlanRawSha256,
  backupManifest,
  backupManifestRawSha256,
  expectedBackupManifestRawSha256,
  approval,
  currentRunnerSha256,
  currentEnvironment,
  actualPgDumpSha256,
  actualPgDumpByteLength,
  now = new Date(),
}) {
  assertPlan(plan);
  if (plan.selection?.kind !== 'full_baseline') throw new Error('Apply requires a full-baseline plan; partial --case-po plans are read-only');
  const rawPlan = sha(planRawSha256, 'raw plan SHA-256');
  if (rawPlan !== sha(expectedPlanRawSha256, '--plan-sha256')) throw new Error('Raw plan SHA-256 mismatch');
  const rawBackup = sha(backupManifestRawSha256, 'raw backup-manifest SHA-256');
  if (rawBackup !== sha(expectedBackupManifestRawSha256, '--backup-manifest-sha256')) {
    throw new Error('Raw backup-manifest SHA-256 mismatch');
  }
  if (backupManifest?.contract !== BACKUP_CONTRACT) throw new Error('Unrecognised backup manifest');
  if (approval?.contract !== APPROVAL_CONTRACT) throw new Error('Unrecognised approval');
  if (!exactScope(backupManifest.scope) || !exactScope(approval.scope)) {
    throw new Error('Authority scope does not match the exact remediation scope');
  }
  assertNamedApprover(approval.approvedBy);
  assertTimestampOrder(approval, backupManifest, plan, now);
  const repairCaseIdsSha256 = assertBackupRestore(
    backupManifest,
    plan,
    actualPgDumpSha256,
    actualPgDumpByteLength,
  );

  const runnerSha256 = sha(currentRunnerSha256, 'current runner SHA-256');
  if (runnerSha256 !== sha(plan.runnerSha256, 'plan runnerSha256') || runnerSha256 !== sha(approval.runnerSha256, 'approval runnerSha256')) {
    throw new Error('Runner SHA-256 is not the planned and approved runner');
  }
  const environmentSha256 = integrityHash(currentEnvironment);
  if (
    environmentSha256 !== sha(plan.environmentSha256, 'plan environmentSha256')
    || environmentSha256 !== sha(backupManifest.environmentSha256, 'backup environmentSha256')
    || environmentSha256 !== sha(approval.environmentSha256, 'approval environmentSha256')
  ) throw new Error('Environment is not the planned, backed-up, and approved environment');

  const expectedAllowlist = sortAllowlist(plan.writeAllowlist);
  for (const [label, value] of [['backup', backupManifest.writeAllowlist], ['approval', approval.writeAllowlist]]) {
    if (!sameValue(sortAllowlist(value ?? []), expectedAllowlist)) throw new Error(`${label} write allowlist mismatch`);
  }
  const expectedStatusAllowlist = sortAllowlist(plan.statusRecomputeAllowlist);
  for (const [label, value] of [
    ['backup', backupManifest.statusRecomputeAllowlist],
    ['approval', approval.statusRecomputeAllowlist],
  ]) {
    if (!sameValue(sortAllowlist(value ?? []), expectedStatusAllowlist)) {
      throw new Error(`${label} status-recompute allowlist mismatch`);
    }
  }
  if (!sameValue(backupManifest.counts, plan.counts) || !sameValue(approval.counts, plan.counts)) {
    throw new Error('Authority counts do not match the plan');
  }
  if (sha(backupManifest.planRawSha256, 'backup planRawSha256') !== rawPlan) throw new Error('Backup did not bind the raw plan');
  if (sha(backupManifest.planSha256, 'backup planSha256') !== plan.planSha256) throw new Error('Backup did not bind the plan hash');
  if (sha(approval.planRawSha256, 'approval planRawSha256') !== rawPlan || sha(approval.planSha256, 'approval planSha256') !== plan.planSha256) {
    throw new Error('Approval did not bind the plan');
  }
  if (sha(approval.backupManifestSha256, 'approval backupManifestSha256') !== rawBackup) {
    throw new Error('Approval did not bind the backup manifest');
  }
  if (sha(approval.repairCaseIdsSha256, 'approval repairCaseIdsSha256') !== repairCaseIdsSha256) {
    throw new Error('Approval did not bind the exact repair case ids');
  }
  return {
    approvedBy: text(approval.approvedBy),
    rawPlanSha256: rawPlan,
    rawBackupManifestSha256: rawBackup,
    pgDumpSha256: sha(actualPgDumpSha256, 'actual pg_dump SHA-256'),
    pgDumpByteLength: actualPgDumpByteLength,
  };
}

async function audit(client, { caseId, summary, before, after }) {
  await client.query(
    `INSERT INTO audit_event
       (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [
      summary,
      caseId,
      ACTOR,
      AUDIT_ACTION_PARSER_CALLED,
      AUDIT_INFO,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
    ],
  );
}

export async function findCommitted(client, caseId, remediationKey) {
  return client.query(
    `SELECT id,
            CASE WHEN pg_input_is_valid(after, 'jsonb')
                 THEN after::jsonb ->> 'statusRecomputeGeneration' ELSE NULL END AS status_generation
       FROM audit_event
     WHERE case_id = $1
       AND actor = $2
       AND CASE
             WHEN pg_input_is_valid(after, 'jsonb') THEN after::jsonb ->> 'remediationKey'
             ELSE NULL
           END = $3
     LIMIT 1`,
    [caseId, ACTOR, remediationKey],
  );
}

async function currentCaseState(client, caseId, canonical) {
  const caseResult = await client.query(`${canonical.CASE_SELECT} WHERE c.id = $1 FOR UPDATE OF c`, [caseId]);
  if (!caseResult.rows[0]) throw beforeMismatch('case_not_found');
  const provenance = (await client.query(
    'SELECT * FROM field_level_provenance WHERE case_id = $1 ORDER BY created_at, id FOR SHARE',
    [caseId],
  )).rows;
  const evidence = (await client.query(
    `SELECT e.*, k.name AS kind
     FROM evidence e JOIN choice_evidence_kind k ON k.code = e.kind_code
     WHERE e.case_id = $1 ORDER BY e.created_at, e.id FOR SHARE OF e`,
    [caseId],
  )).rows;
  const inbound = (await client.query(
    `SELECT id, case_id, source_message_id, source_mailbox, graph_message_id, received_on,
            created_at, updated_at, body_preview
       FROM inbound_email
      WHERE case_id = $1
      ORDER BY received_on ASC NULLS LAST, created_at, id
      FOR SHARE`,
    [caseId],
  )).rows;
  const sources = evidence.filter((row) => row.kind === 'instruction' || row.kind === 'email');
  return {
    row: caseResult.rows[0],
    preconditions: buildPreconditions(caseResult.rows[0], evidence, provenance, sources, inbound, canonical),
    sources,
    inbound,
  };
}

function beforeMismatch(message) {
  const error = new Error(message);
  error.code = 'TKT150_BEFORE_MISMATCH';
  return error;
}

export async function revalidateRetainedSourceBytes(
  item,
  currentSourceRows,
  currentInboundRows,
  blob,
  fetcher = fetchEvidenceBytes,
) {
  // Plan metadata cannot prove that Blob/Archive bytes are still the bytes that
  // were replayed. Re-read and hash the retained raw objects immediately before
  // any claimant or generation write. Claimant extraction is never rerun here;
  // the only parsed value is a raw `.eml` Message-ID when that exact header is
  // the frozen plan's independent identity bridge for a retained body text.
  const plannedUnreadable = unreadableSourceReads(item);
  if (plannedUnreadable.length) {
    throw beforeMismatch(`planned_source_unreadable:${plannedUnreadable.map((source) => source.evidenceId).sort().join(',')}`);
  }
  if (sourceMetadataFingerprint(currentSourceRows) !== item.preconditions.sourceMetadataSha256) {
    throw beforeMismatch('source_metadata_changed_before_revalidation');
  }
  if (inboundStateFingerprint(currentInboundRows) !== item.preconditions.inboundStateSha256) {
    throw beforeMismatch('inbound_email_state_changed_before_revalidation');
  }
  const expectedInboundBodies = (item.sources?.bodyInputs ?? [])
    .filter((input) => input.kind === 'inbound_body_preview')
    .sort((left, right) => text(left.inboundEmailId).localeCompare(text(right.inboundEmailId)));
  const currentInboundBodies = inboundBodyReadRecords(currentInboundRows);
  if (!sameValue(currentInboundBodies, expectedInboundBodies)) {
    throw beforeMismatch('inbound_email_body_changed_before_revalidation');
  }
  const expectedReads = new Map((item.sources?.reads ?? []).map((read) => [read.evidenceId, read]));
  if (expectedReads.size !== currentSourceRows.length) throw beforeMismatch('source_hash_coverage_changed');
  const currentBytesByEvidenceId = new Map();
  const currentReadsByEvidenceId = new Map();
  const verified = await Promise.all(currentSourceRows.map(async (row) => {
    const expected = expectedReads.get(text(row.id));
    if (!expected) throw beforeMismatch(`source_hash_missing:${row.id}`);
    const bytes = await fetcher(row, blob);
    const actual = sourceReadRecord(row, bytes);
    if (actual.metadataSha256 !== expected.metadataSha256) throw beforeMismatch(`source_metadata_changed:${row.id}`);
    if (actual.byteSha256 !== expected.byteSha256 || actual.byteLength !== expected.byteLength) {
      throw beforeMismatch(`source_bytes_changed:${row.id}`);
    }
    currentBytesByEvidenceId.set(text(row.id), bytes);
    currentReadsByEvidenceId.set(text(row.id), actual);
    return { evidenceId: text(row.id), byteLength: actual.byteLength, byteSha256: actual.byteSha256 };
  }));
  const currentInboundById = new Map(currentInboundRows.map((row) => [text(row.id), row]));
  const currentSourceById = new Map(currentSourceRows.map((row) => [text(row.id), row]));
  const retainedTextInputs = (item.sources?.bodyInputs ?? []).filter((source) => source.kind === 'retained_plain_text');
  for (const input of retainedTextInputs) {
    if (currentReadsByEvidenceId.get(text(input.evidenceId))?.declaredShaMatches !== true) {
      throw beforeMismatch('retained_text_declared_sha_mismatch');
    }
    const bodyRow = currentSourceById.get(text(input.evidenceId));
    const fileName = exactFileName(bodyRow?.file_name);
    const tokenized = BODY_TEXT_FILE_RE.exec(fileName);
    const expectedInboundRows = tokenized || fileName === LEGACY_BODY_TEXT_FILE ? currentInboundRows : [];
    const expectedProbeIds = expectedInboundRows.map((row) => text(row.id)).sort();
    const graphPathProbes = Array.isArray(input.graphPathProbes)
      ? [...input.graphPathProbes].sort((left, right) => text(left.inboundEmailId).localeCompare(text(right.inboundEmailId)))
      : [];
    const actualProbeIds = graphPathProbes.map((probe) => text(probe.inboundEmailId));
    const invalidProbe = graphPathProbes.some((probe) => {
      const currentInbound = currentInboundById.get(text(probe.inboundEmailId));
      return !currentInbound || (text(probe.graphMessageId) || null) !== (text(currentInbound.graph_message_id) || null);
    });
    const graphPathMatchIds = graphPathProbes
      .filter((probe) =>
        text(probe.graphMessageId)
        && retainedBodyPathMatches(input.storagePath, text(probe.graphMessageId), fileName))
      .map((probe) => text(probe.inboundEmailId));
    const graphBindingValid = input.bindingMethod === 'graph_storage_path'
      ? !tokenized
        && fileName === LEGACY_BODY_TEXT_FILE
        && graphPathMatchIds.length === 1
        && graphPathMatchIds[0] === text(input.inboundEmailId)
      : input.bindingMethod === 'raw_eml_message_id'
        ? Boolean(tokenized)
          && (
            graphPathMatchIds.length === 0
            || (graphPathMatchIds.length === 1 && graphPathMatchIds[0] === text(input.inboundEmailId))
          )
        : input.bindingMethod === 'single_inbound_fallback'
          ? !tokenized && fileName === LEGACY_BODY_TEXT_FILE && graphPathMatchIds.length === 0
          : false;
    if (
      !bodyRow
      || !sameValue(actualProbeIds, expectedProbeIds)
      || new Set(actualProbeIds).size !== actualProbeIds.length
      || invalidProbe
      || !graphBindingValid
    ) throw beforeMismatch('retained_text_graph_path_binding_changed');
  }
  for (const input of retainedTextInputs.filter((source) => source.bindingMethod === 'raw_eml_message_id')) {
    const rawEmlBytes = currentBytesByEvidenceId.get(text(input.rawEmlEvidenceId));
    const inbound = currentInboundById.get(text(input.inboundEmailId));
    const rawEmlRead = currentReadsByEvidenceId.get(text(input.rawEmlEvidenceId));
    if (!rawEmlBytes || !inbound || rawEmlRead?.declaredShaMatches !== true) {
      throw beforeMismatch('raw_eml_identity_source_missing_or_untrusted');
    }
    let messageId;
    try {
      messageId = extractRawEmlMessageId(rawEmlBytes);
    } catch {
      throw beforeMismatch('raw_eml_message_id_invalid');
    }
    const fullMessageIdMatches = currentInboundRows.filter((row) => text(row.source_message_id) === messageId);
    if (
      messageId !== input.rawEmlMessageId
      || fullMessageIdMatches.length !== 1
      || text(fullMessageIdMatches[0]?.id) !== text(input.inboundEmailId)
      || text(inbound.source_message_id) !== messageId
      || hashText(messageId) !== input.sourceMessageIdSha256
    ) throw beforeMismatch('raw_eml_message_id_changed_before_revalidation');
  }
  const ordered = verified.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  return {
    outcome: 'matched',
    sourceCount: ordered.length,
    inboundBodyCount: currentInboundBodies.length,
    totalBytes: ordered.reduce((sum, row) => sum + row.byteLength, 0),
    inboundBodyBytes: currentInboundBodies.reduce((sum, row) => sum + row.byteLength, 0),
    fingerprintSha256: integrityHash({ retainedEvidence: ordered, inboundBodies: currentInboundBodies }),
  };
}

function groupedCounts(values) {
  const counts = new Map();
  for (const value of values) {
    const key = text(value) || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function residualCaseReadback(row, plannedItem, result, canonical, currentCensus = null) {
  const domainCase = canonical.rowToCase(row, { evidence: [], provenanceRows: [] });
  const requestedGeneration = Number(row.status_recompute_requested_generation ?? 0);
  const completedGeneration = Number(row.status_recompute_completed_generation ?? 0);
  if (![requestedGeneration, completedGeneration].every(Number.isSafeInteger)) {
    throw new Error(`Invalid status recompute readback: ${row.id}`);
  }
  if (
    Number.isSafeInteger(result?.statusRecomputeGeneration)
    && requestedGeneration < result.statusRecomputeGeneration
  ) throw new Error(`Status recompute generation regressed after apply: ${row.id}`);
  return {
    caseId: text(row.id),
    casePo: row.case_po ?? null,
    vrm: row.vrm ?? null,
    plannedOutcome: plannedItem?.outcome ?? null,
    applyOutcome: result?.applyOutcome ?? null,
    claimantBlank: blank(row.eva_claimant_name),
    claimantSha256: hashText(row.eva_claimant_name),
    status: { code: Number(row.status_code), name: domainCase.status },
    onHold: Boolean(row.on_hold),
    statusRecompute: {
      requestedGeneration,
      completedGeneration,
      requestedAt: iso(row.status_recompute_requested_at),
    },
    provider: currentCensus?.provider ?? {
      id: row.work_provider_id ?? null,
      principalCode: row.provider_principal ?? null,
      displayName: row.provider_display ?? row.eva_work_provider ?? null,
    },
    intakePath: currentCensus?.intakePath ?? {
      kind: domainCase.channel?.kind ?? String(row.intake_channel_kind_code ?? 'unknown'),
      mode: domainCase.channel?.mode ?? (row.intake_channel_manual ? 'manual' : 'auto'),
      sourceMailbox: domainCase.channel?.sourceMailbox ?? row.source_mailbox ?? null,
    },
    sourceFormats: currentCensus?.sourceFormats ?? plannedItem?.census?.sourceFormats ?? [],
    sourceCensus: currentCensus ?? plannedItem?.census ?? null,
  };
}

/**
 * Re-read every planned case plus the complete active blank-claimant baseline
 * after the run. This is deliberately a new query, not a projection of plan
 * metadata, so the final ledger proves both durable generation writes and the
 * residual population that still needs operator/actionable follow-up.
 */
export async function readResidualCensus(client, plan, results, canonical) {
  const planIds = plan.cases.map((item) => item.caseId);
  const plannedRows = planIds.length
    ? (await client.query(`${canonical.CASE_SELECT} WHERE c.id = ANY($1::uuid[]) ORDER BY c.id`, [planIds])).rows
    : [];
  if (plannedRows.length !== planIds.length) throw new Error('Post-run readback is missing one or more planned cases');
  const planById = new Map(plan.cases.map((item) => [item.caseId, item]));
  const resultById = new Map(results.map((item) => [item.caseId, item]));
  const plannedCases = plannedRows.map((row) => residualCaseReadback(
    row,
    planById.get(text(row.id)),
    resultById.get(text(row.id)),
    canonical,
  ));

  const residualRows = (await client.query(
    `${canonical.CASE_SELECT} WHERE ${ACTIVE_BLANK_CLAIMANT_PREDICATE} ORDER BY c.id`,
  )).rows;
  const residualIds = residualRows.map((row) => text(row.id));
  const residualEvidenceRows = residualIds.length ? (await client.query(ALL_EVIDENCE_SQL, [residualIds])).rows : [];
  const residualProvenanceRows = residualIds.length ? (await client.query(PROVENANCE_SQL, [residualIds])).rows : [];
  const residualInboundRows = residualIds.length ? (await client.query(INBOUND_SQL, [residualIds])).rows : [];
  const residualEvidence = rowsByCase(residualEvidenceRows);
  const residualProvenance = rowsByCase(residualProvenanceRows);
  const residualInbound = rowsByCase(residualInboundRows);
  const residualCases = residualRows.map((row) => residualCaseReadback(
    row,
    planById.get(text(row.id)),
    resultById.get(text(row.id)),
    canonical,
    censusDimensions(
      row,
      residualEvidence.get(text(row.id)) ?? [],
      residualProvenance.get(text(row.id)) ?? [],
      residualInbound.get(text(row.id)) ?? [],
      (residualEvidence.get(text(row.id)) ?? []).filter((item) => item.kind === 'instruction' || item.kind === 'email'),
      canonical,
      plan.parserFingerprintSha256,
    ),
  ));
  const residualPlanIds = new Set(residualCases.map((item) => item.caseId));
  const body = {
    createdAt: new Date().toISOString(),
    plannedCaseCount: plannedCases.length,
    plannedCases,
    residual: {
      count: residualCases.length,
      plannedResidualCount: planIds.filter((id) => residualPlanIds.has(id)).length,
      unplannedResidualCount: residualCases.filter((item) => !planById.has(item.caseId)).length,
      caseIdsSha256: integrityHash(residualCases.map((item) => item.caseId).sort()),
      byPlannedOutcome: groupedCounts(residualCases.map((item) => item.plannedOutcome ?? 'not_in_plan')),
      byProvider: groupedCounts(residualCases.map((item) => item.provider.principalCode ?? item.provider.displayName)),
      byIntakePath: groupedCounts(residualCases.map((item) => `${item.intakePath.kind}:${item.intakePath.mode}`)),
      byStatus: groupedCounts(residualCases.map((item) => item.status.name)),
      bySourceFormat: groupedCounts(residualCases.flatMap((item) =>
        item.sourceFormats.map((format) => `${format.extension}:${format.contentType}`))),
      cases: residualCases,
    },
  };
  return { ...body, censusSha256: integrityHash(body) };
}

function claimantNoWriteOutcome(item) {
  if (item.outcome === 'absent_in_source') return 'no_write_absent';
  if (item.outcome === 'conflicting') return 'no_write_conflict';
  if (item.outcome === 'failed') return 'no_write_source_failure';
  throw new Error(`Not a no-write outcome: ${item.outcome}`);
}

export async function applyOne(client, item, sourceTypes, canonical, planRawSha256, blob, sourceVerifier = revalidateRetainedSourceBytes) {
  const plannedUnreadable = unreadableSourceReads(item);
  if (plannedUnreadable.length) {
    return {
      caseId: item.caseId,
      caseSha256: item.caseSha256,
      plannedOutcome: item.outcome,
      applyOutcome: 'not_authorized_source_unreadable',
      writeAttempted: false,
      appliedFields: [],
      claimantOutcome: 'no_write_source_failure',
      statusGenerationOutcome: 'not_authorized_source_unreadable',
      sourceFailures: plannedUnreadable.map((source) => ({
        evidenceId: source.evidenceId,
        failure: source.failure,
        failureFingerprintSha256: source.failureFingerprintSha256,
      })),
    };
  }
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try {
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '45s'");
    const remediationKey = `${planRawSha256}:${item.caseId}:${item.caseSha256}`;
    // Lock and re-read first even on an idempotent replay. The audit marker proves
    // the prior transaction, but never substitutes for observing its current row.
    const current = await currentCaseState(client, item.caseId, canonical);
    const committed = await findCommitted(client, item.caseId, remediationKey);
    if (committed.rows.length) {
      const recordedGeneration = Number(committed.rows[0].status_generation);
      const currentGeneration = Number(current.row.status_recompute_requested_generation ?? 0);
      if (!Number.isSafeInteger(recordedGeneration) || currentGeneration < recordedGeneration) {
        throw new Error('idempotency_marker_state_mismatch');
      }
      await client.query('COMMIT');
      return {
        caseId: item.caseId,
        caseSha256: item.caseSha256,
        plannedOutcome: item.outcome,
        applyOutcome: 'committed',
        idempotentReplay: true,
        writeAttempted: false,
        appliedFields: [],
        claimantOutcome: item.outcome === 'repair' ? 'previously_filled' : claimantNoWriteOutcome(item),
        statusGenerationOutcome: 'already_requested',
        statusRecomputeGeneration: recordedGeneration,
        currentStateReadback: {
          claimantSha256: hashText(current.row.eva_claimant_name),
          requestedGeneration: currentGeneration,
        },
      };
    }

    if (!blank(current.row.eva_claimant_name)) {
      await client.query('COMMIT');
      return {
        caseId: item.caseId,
        caseSha256: item.caseSha256,
        plannedOutcome: item.outcome,
        applyOutcome: 'already_resolved_preserved',
        writeAttempted: false,
        appliedFields: [],
        preservedClaimantSha256: hashText(current.row.eva_claimant_name),
        statusGenerationOutcome: 'not_requested_precondition_mismatch',
      };
    }
    if (current.preconditions.stateSha256 !== item.preconditions.stateSha256) throw beforeMismatch('case_changed:state_fingerprint');
    if (current.preconditions.merge.mergedInto) throw beforeMismatch('case_retired_by_merge');
    if (current.preconditions.submit.requested || current.preconditions.submit.submittedAt) throw beforeMismatch('case_submit_state_changed');
    const sourceRevalidation = await sourceVerifier(item, current.sources, current.inbound, blob);

    let claimant = '';
    let claimantOutcome;
    const appliedFields = [];
    if (item.outcome === 'repair') {
      claimant = item.patch?.[CLAIMANT_COLUMN];
      if (
        typeof claimant !== 'string'
        || claimant !== text(claimant)
        || claimant.length > 200
        || Object.keys(item.patch).length !== 1
        || !ALLOWED_SOURCES.has(item.fieldSource)
      ) {
        throw new Error('runtime_allowlist_rejected');
      }
      const update = await client.query(
        `UPDATE case_
         SET eva_claimant_name = $2, updated_at = now()
         WHERE id = $1
           AND NULLIF(btrim(eva_claimant_name), '') IS NULL
           AND updated_at = $3::timestamptz
         RETURNING id`,
        [item.caseId, claimant, item.preconditions.updatedAt],
      );
      if (update.rows.length !== 1) throw beforeMismatch('fill_if_empty_guard_failed');

      const sourceCode = sourceTypes.get(item.fieldSource);
      if (sourceCode == null) throw new Error(`source type missing: ${item.fieldSource}`);
      const sourceIds = item.fieldSource === 'email_text' ? item.sourceInboundEmailIds : item.sourceEvidenceIds;
      const sourceReference = sourceIds.join(',').slice(0, 400);
      await client.query(
        `INSERT INTO field_level_provenance
           (name, case_id, field_name, value, source_type_code, source_label,
            source_reference, review_state_code)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8
         WHERE NOT EXISTS (
           SELECT 1 FROM field_level_provenance
           WHERE case_id = $2 AND field_name = $3
             AND value IS NOT DISTINCT FROM $4
             AND source_reference IS NOT DISTINCT FROM $7
         )`,
        [
          `${item.caseId}:${CLAIMANT_FIELD}:tkt150:v2`,
          item.caseId,
          CLAIMANT_FIELD,
          claimant,
          sourceCode,
          item.fieldSource === 'email_text' ? 'From retained email' : 'From retained instructions',
          sourceReference,
          REVIEW_STATE_NEEDS_REVIEW,
        ],
      );
      claimantOutcome = 'filled';
      appliedFields.push(CLAIMANT_COLUMN);
    } else {
      claimantOutcome = claimantNoWriteOutcome(item);
    }

    const statusRecomputeGeneration = await canonical.requestStatusRecompute(
      async (sql, params) => (await client.query(sql, params)).rows,
      item.caseId,
    );
    if (!Number.isSafeInteger(statusRecomputeGeneration) || statusRecomputeGeneration < 1) {
      throw new Error('invalid status recompute generation');
    }
    appliedFields.push('status_recompute_requested_generation', 'status_recompute_requested_at');
    await audit(client, {
      caseId: item.caseId,
      summary: item.outcome === 'repair'
        ? 'Retained source replay filled the blank claimant name and requested status review'
        : 'Retained source replay requested status review without changing the claimant name',
      before: {
        eva_claimant_name: current.row.eva_claimant_name ?? null,
        statusRecomputeGeneration: current.preconditions.statusRecompute.requestedGeneration,
      },
      after: {
        ...(item.outcome === 'repair' ? { eva_claimant_name: claimant } : {}),
        claimantOutcome,
        sourceEvidenceIds: item.sourceEvidenceIds,
        sourceInboundEmailIds: item.sourceInboundEmailIds,
        sourceRevalidation,
        statusRecomputeGeneration,
        remediationKey,
        planRawSha256,
      },
    });
    await client.query('COMMIT');
    return {
      caseId: item.caseId,
      caseSha256: item.caseSha256,
      plannedOutcome: item.outcome,
      applyOutcome: 'committed',
      writeAttempted: true,
      appliedFields,
      claimantOutcome,
      statusGenerationOutcome: 'requested',
      statusRecomputeGeneration,
      sourceRevalidation,
      before: { eva_claimant_name: current.row.eva_claimant_name ?? null },
      after: item.outcome === 'repair' ? { eva_claimant_name: claimant } : { eva_claimant_name: null },
      sourceEvidenceIds: item.sourceEvidenceIds,
      sourceInboundEmailIds: item.sourceInboundEmailIds,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    return {
      caseId: item.caseId,
      caseSha256: item.caseSha256,
      plannedOutcome: item.outcome,
      applyOutcome: error.code === 'TKT150_BEFORE_MISMATCH' ? 'before_mismatch' : 'failed',
      writeAttempted: false,
      appliedFields: [],
      failure: error.message,
      statusGenerationOutcome: error.code === 'TKT150_BEFORE_MISMATCH'
        ? 'not_requested_precondition_mismatch'
        : 'not_requested_failure',
    };
  }
}

function ledgerBody({ plan, authority, approval, results, complete, runId, residualCensus = null }) {
  const body = {
    contract: LEDGER_CONTRACT,
    createdAt: new Date().toISOString(),
    runId,
    complete,
    approvedBy: authority.approvedBy,
    approvedAt: approval.approvedAt,
    environmentSha256: plan.environmentSha256,
    runnerSha256: plan.runnerSha256,
    planRawSha256: authority.rawPlanSha256,
    planSha256: plan.planSha256,
    backupManifestSha256: authority.rawBackupManifestSha256,
    pgDumpSha256: authority.pgDumpSha256,
    pgDumpByteLength: authority.pgDumpByteLength,
    counts: plan.counts,
    checkpointCount: results.length,
    results,
    residualCensus,
  };
  return { ...body, ledgerSha256: integrityHash(body) };
}

export async function writeJsonExclusive(path, value) {
  const handle = await open(resolve(path), 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function initializeJournalExclusive(path, header) {
  const handle = await open(resolve(path), 'wx');
  try {
    await handle.write(`${JSON.stringify(header)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicWriteJson(path, value) {
  const target = resolve(path);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const handle = await open(temporary, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
  } catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'EPERM') {
      await rm(temporary, { force: true });
      throw error;
    }
    // The fsync'd append-only journal remains the crash-recovery source if
    // Windows cannot atomically replace an existing checkpoint file.
    await rm(target, { force: true });
    await rename(temporary, target);
  }
}

async function appendJournal(path, entry) {
  const handle = await open(resolve(path), 'a');
  try {
    await handle.write(`${JSON.stringify(entry)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function applyPlan(client, { plan, authority, approval, outPath, journalPath, canonical }) {
  const sourceRows = await client.query(
    "SELECT code, name FROM choice_field_provenance_source_type WHERE name = ANY(ARRAY['pdf_extraction', 'email_text'])",
  );
  const sourceTypes = new Map(sourceRows.rows.map((row) => [row.name, Number(row.code)]));
  if (![...ALLOWED_SOURCES].every((name) => sourceTypes.has(name))) throw new Error('Required claimant provenance source types are missing');

  const results = [];
  const runId = integrityHash({ planRawSha256: authority.rawPlanSha256, startedAt: new Date().toISOString() });
  const blob = blobClient();
  await writeJsonExclusive(outPath, ledgerBody({ plan, authority, approval, results, complete: false, runId }));
  await initializeJournalExclusive(journalPath, {
    contract: LEDGER_CONTRACT,
    runId,
    planRawSha256: authority.rawPlanSha256,
    createdAt: new Date().toISOString(),
  });
  for (const [index, item] of plan.cases.entries()) {
    process.stderr.write(`[tkt150] apply ${index + 1}/${plan.cases.length} ${item.casePo ?? item.vrm ?? item.caseId}\n`);
    const result = await applyOne(client, item, sourceTypes, canonical, authority.rawPlanSha256, blob);
    results.push(result);
    await appendJournal(journalPath, { runId, index, recordedAt: new Date().toISOString(), result });
    await atomicWriteJson(outPath, ledgerBody({ plan, authority, approval, results, complete: false, runId }));
  }
  const residualCensus = await readResidualCensus(client, plan, results, canonical);
  return ledgerBody({ plan, authority, approval, results, complete: true, runId, residualCensus });
}

async function readJsonArtifact(path, label) {
  const absolute = await assertOutsideRepository(path, label);
  const raw = await readFile(absolute);
  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  return { absolute, raw, parsed, rawSha256: rawSha256(raw) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let outPath;
  let applyPaths = null;
  if (args.mode === 'plan') {
    outPath = await assertOutsideRepository(args.out, '--out');
  } else {
    const resolvedEntries = await assertDistinctArtifactPaths([
      { label: '--out', path: args.out },
      { label: '--journal', path: args.journal ?? `${args.out}.journal.jsonl` },
      { label: '--plan', path: args.plan },
      { label: '--backup-manifest', path: args.backupManifest },
      { label: '--backup-artifact', path: args.backupArtifact },
      { label: '--approval', path: args.approval },
    ]);
    applyPaths = new Map(resolvedEntries.map((entry) => [entry.label, entry.canonical]));
    outPath = applyPaths.get('--out');
  }
  const canonicalBundle = await loadCanonicalHelpers();
  const client = await connect();
  try {
    if (args.mode === 'plan') {
      const plan = await createPlan(client, args, canonicalBundle.helpers);
      await writeJsonExclusive(outPath, plan);
      const raw = await readFile(outPath);
      process.stdout.write(`${JSON.stringify({
        out: outPath,
        count: plan.counts.baselineCount,
        counts: plan.counts,
        planSha256: plan.planSha256,
        rawPlanSha256: rawSha256(raw),
        runnerSha256: plan.runnerSha256,
      })}\n`);
      return;
    }

    const planArtifact = await readJsonArtifact(applyPaths.get('--plan'), '--plan');
    const backupManifestArtifact = await readJsonArtifact(applyPaths.get('--backup-manifest'), '--backup-manifest');
    const approvalArtifact = await readJsonArtifact(applyPaths.get('--approval'), '--approval');
    const pgDumpArtifact = await hashFile(applyPaths.get('--backup-artifact'));
    const currentEnvironment = await environmentIdentity(client, args.environment);
    const currentRunnerSha256 = rawSha256(await readFile(RUNNER_PATH));
    const authority = validateApplyAuthority({
      plan: planArtifact.parsed,
      planRawSha256: planArtifact.rawSha256,
      expectedPlanRawSha256: args.planSha256,
      backupManifest: backupManifestArtifact.parsed,
      backupManifestRawSha256: backupManifestArtifact.rawSha256,
      expectedBackupManifestRawSha256: args.backupManifestSha256,
      approval: approvalArtifact.parsed,
      currentRunnerSha256,
      currentEnvironment,
      actualPgDumpSha256: pgDumpArtifact.sha256,
      actualPgDumpByteLength: pgDumpArtifact.byteLength,
    });
    const journalPath = applyPaths.get('--journal');
    const ledger = await applyPlan(client, {
      plan: planArtifact.parsed,
      authority,
      approval: approvalArtifact.parsed,
      outPath,
      journalPath,
      canonical: canonicalBundle.helpers,
    });
    await atomicWriteJson(outPath, ledger);
    process.stdout.write(`${JSON.stringify({
      out: outPath,
      journal: journalPath,
      count: ledger.results.length,
      ledgerSha256: ledger.ledgerSha256,
      planRawSha256: authority.rawPlanSha256,
    })}\n`);
  } finally {
    await client.end();
    await canonicalBundle.cleanup();
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === RUNNER_PATH;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`[tkt150] ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
