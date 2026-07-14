import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';

import {
  APPROVAL_CONTRACT,
  AUTHORIZED_SCOPE,
  BACKUP_CONTRACT,
  PLAN_CONTRACT,
  applyOne,
  assertDistinctArtifactPaths,
  assertOutsideRepository,
  assertPlan,
  assertSecureDatabaseSettings,
  buildPreconditions,
  censusDimensions,
  chooseClaimant,
  classifyPlanOutcome,
  coalesceOcr,
  emptyTextParse,
  getParserFingerprint,
  hashFile,
  integrityHash,
  loadCanonicalHelpers,
  orderDocuments,
  parseArgs,
  planOne,
  planCounts,
  rawSha256,
  readJsonResponse,
  readPlanningSnapshot,
  readResidualCensus,
  revalidateRetainedSourceBytes,
  sealCase,
  sealPlan,
  selectClaimantDocuments,
  selectInstructionIndex,
  sourceMetadata,
  sourceReadRecord,
  validateApplyAuthority,
  writeJsonExclusive,
} from './remediate-blank-claimants.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const CASE_ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_ID = '22222222-2222-4222-8222-222222222222';
const INBOUND_ID = '33333333-3333-4333-8333-333333333333';
const PARSER_FINGERPRINT = Object.freeze({
  contract: 'ce-parser-fingerprint-v1',
  repository: 'collisionengineers/cedocumentmapper_v2.0',
  ref: 'engine-v2.24',
  commit: 'c'.repeat(40),
  vendoredFileCount: 36,
  contentSha256: HASH_A,
  providersSha256: HASH_B,
});
const PARSER_FINGERPRINT_SHA = integrityHash(PARSER_FINGERPRINT);

let sourceBundle;

before(async () => {
  sourceBundle = await loadCanonicalHelpers();
});

after(async () => {
  await sourceBundle?.cleanup();
});

function envelope({ claimant = '', provider = '', docType = 'unknown', typingProvider = null } = {}) {
  return {
    extraction: {
      claimant_name: { value: claimant },
      work_provider: { value: provider },
    },
    content_typing: { doc_type: docType, provider_name: typingProvider },
  };
}

function fakeCanonical() {
  return {
    CASE_SELECT: 'SELECT c.* FROM case_ c',
    mergedIntoFrom(raw) {
      try {
        const parsed = JSON.parse(String(raw ?? ''));
        return typeof parsed.mergedInto === 'string' ? parsed.mergedInto : undefined;
      } catch {
        return undefined;
      }
    },
    rowToEvidence(row) {
      return {
        id: row.id,
        fileName: row.file_name ?? '',
        kind: row.kind,
        imageRole: 'unknown',
        registrationVisible: false,
        acceptedForEva: false,
      };
    },
    rowToCase(row, options) {
      return {
        id: row.id,
        vrm: row.vrm ?? '',
        providerCode: '',
        status: row.status_name ?? 'needs_review',
        onHold: row.on_hold === true,
        mergedInto: this.mergedIntoFrom(row.duplicate_keys),
        channel: {
          kind: row.intake_channel_kind ?? 'email',
          mode: row.intake_channel_manual ? 'manual' : 'auto',
          sourceMailbox: row.source_mailbox ?? '',
        },
        evidence: options.evidence,
        evaFields: {
          claimantName: { value: row.eva_claimant_name ?? '', reviewState: 'needs_review' },
        },
      };
    },
    readinessInputForCase(value) {
      return {
        status: value.status,
        onHold: value.onHold,
        claimant: value.evaFields.claimantName.value,
        evidenceIds: value.evidence.map((item) => item.id),
        mergedInto: value.mergedInto ?? null,
      };
    },
    evaluateCaseReadiness(input) {
      return { ready: Boolean(input.claimant), checks: [{ key: 'claimant', ok: Boolean(input.claimant) }] };
    },
    statusForReviewCase(input) {
      return input.claimant ? 'ready_for_eva' : 'needs_review';
    },
    async requestStatusRecompute(q, caseId) {
      const rows = await q(
        `UPDATE case_
            SET status_recompute_requested_generation = status_recompute_requested_generation + 1,
                status_recompute_requested_at = now()
          WHERE id = $1
          RETURNING status_recompute_requested_generation`,
        [caseId],
      );
      if (!rows[0]) throw new Error('status recompute target case disappeared');
      return Number(rows[0].status_recompute_requested_generation);
    },
  };
}

function caseRow(overrides = {}) {
  return {
    id: CASE_ID,
    case_po: 'QDOS26001',
    vrm: 'AB12CDE',
    status_name: 'needs_review',
    status_code: 100000007,
    on_hold: false,
    submit_requested: false,
    submit_payload_hash: null,
    finalized_payload_hash: null,
    eva_payload12: null,
    submitted_at: null,
    duplicate_keys: null,
    eva_claimant_name: null,
    work_provider_id: '44444444-4444-4444-8444-444444444444',
    provider_principal: 'QDOS',
    provider_display: 'QDOS',
    eva_work_provider: 'QDOS',
    intake_channel_kind: 'email',
    intake_channel_kind_code: 100000000,
    intake_channel_manual: false,
    source_mailbox: 'info@example.test',
    source_message_id: 'message-1',
    status_recompute_requested_generation: 0,
    status_recompute_completed_generation: 0,
    status_recompute_requested_at: null,
    updated_at: new Date('2026-07-14T00:00:00.000Z'),
    ...overrides,
  };
}

function evidenceRow(overrides = {}) {
  return {
    id: EVIDENCE_ID,
    case_id: CASE_ID,
    file_name: 'instruction.pdf',
    content_type: 'application/pdf',
    size_bytes: 4,
    sha256: rawSha256(Buffer.from('test')),
    storage_path: 'cases/source.pdf',
    box_file_id: null,
    source_message_id: 'message-1',
    kind: 'instruction',
    kind_code: 100000000,
    created_at: new Date('2026-07-13T00:00:00.000Z'),
    updated_at: new Date('2026-07-13T00:00:00.000Z'),
    ...overrides,
  };
}

function inboundRow(overrides = {}) {
  return {
    id: INBOUND_ID,
    case_id: CASE_ID,
    source_message_id: 'inbound-message-1',
    source_mailbox: 'info@example.test',
    received_on: new Date('2026-07-13T00:00:00.000Z'),
    body_preview: 'Claimant: Ms Jane Example',
    created_at: new Date('2026-07-13T00:00:00.000Z'),
    updated_at: new Date('2026-07-13T00:00:00.000Z'),
    ...overrides,
  };
}

function repairCase(overrides = {}) {
  const canonical = fakeCanonical();
  const row = caseRow();
  const evidence = [evidenceRow()];
  const bytes = Buffer.from('test');
  const preconditions = buildPreconditions(row, evidence, [], evidence, [], canonical);
  return sealCase({
    caseId: CASE_ID,
    casePo: row.case_po,
    vrm: row.vrm,
    outcome: 'repair',
    patch: { eva_claimant_name: 'Ms Jane Example' },
    fieldSource: 'pdf_extraction',
    sourceEvidenceIds: [EVIDENCE_ID],
    sourceInboundEmailIds: [],
    claimant: {
      status: 'matched',
      value: 'Ms Jane Example',
      source: 'pdf_extraction',
      candidates: ['Ms Jane Example'],
    },
    census: {
      provider: { id: row.work_provider_id, principalCode: 'QDOS', displayName: 'QDOS' },
      intakePath: { kind: 'email', mode: 'auto', sourceMailbox: row.source_mailbox },
      sourceFormats: [{ extension: 'pdf', contentType: 'application/pdf' }],
      historicalParserVersion: {
        status: 'unavailable',
        reason: 'parser_version_was_not_persisted_with_the_historical_case_or_source',
      },
      replayParserFingerprintSha256: PARSER_FINGERPRINT_SHA,
      earliestSourceMessage: { inboundEmailId: null, sourceMessageId: row.source_message_id, timestamp: null },
      earliestSourceDocument: {
        evidenceId: EVIDENCE_ID,
        sourceMessageId: 'message-1',
        timestamp: '2026-07-13T00:00:00.000Z',
      },
    },
    preconditions,
    sources: {
      metadata: evidence.map(sourceMetadata),
      reads: [sourceReadRecord(evidence[0], bytes)],
      bodyInputs: [],
      attachments: [],
      parsedDocuments: [{
        evidenceId: EVIDENCE_ID,
        fileName: 'instruction.pdf',
        byteLength: bytes.length,
        byteSha256: rawSha256(bytes),
        claimant: 'Ms Jane Example',
        docType: 'instruction',
        ocrAttempted: false,
        ocrApplied: false,
      }],
      selectedInstruction: {
        evidenceId: EVIDENCE_ID,
        byteSha256: rawSha256(bytes),
        eligibleForClaimant: true,
      },
    },
    failures: [],
    ...overrides,
  });
}

function emailRepairCase(overrides = {}) {
  const canonical = fakeCanonical();
  const row = caseRow();
  const inbound = [inboundRow()];
  const body = 'Claimant: Ms Jane Example';
  const base = repairCase();
  return sealCase({
    ...base,
    fieldSource: 'email_text',
    sourceEvidenceIds: [],
    sourceInboundEmailIds: [INBOUND_ID],
    claimant: {
      status: 'matched',
      value: 'Ms Jane Example',
      source: 'email_text',
      candidates: ['Ms Jane Example'],
      inboundEmailIds: [INBOUND_ID],
    },
    census: {
      ...base.census,
      sourceFormats: [{ extension: 'email-body', contentType: 'text/plain' }],
      earliestSourceMessage: {
        inboundEmailId: INBOUND_ID,
        sourceMessageId: 'inbound-message-1',
        timestamp: '2026-07-13T00:00:00.000Z',
      },
      earliestSourceDocument: null,
    },
    preconditions: buildPreconditions(row, [], [], [], inbound, canonical),
    sources: {
      metadata: [],
      reads: [],
      bodyInputs: [{
        kind: 'inbound_body_preview',
        inboundEmailId: INBOUND_ID,
        evidenceId: null,
        byteLength: Buffer.byteLength(body, 'utf8'),
        byteSha256: rawSha256(Buffer.from(body, 'utf8')),
      }],
      attachments: [],
      parsedDocuments: [],
      selectedInstruction: null,
    },
    ...overrides,
  });
}

function authorityFixture() {
  const item = repairCase();
  const environment = {
    label: 'production-readiness-remediation',
    databaseName: 'collisionspike',
    host: 'database.example.test',
    port: 5432,
  };
  const counts = planCounts([item]);
  const writeAllowlist = [{ caseId: item.caseId, caseSha256: item.caseSha256 }];
  const statusRecomputeAllowlist = [...writeAllowlist];
  const plan = sealPlan({
    contract: PLAN_CONTRACT,
    scope: AUTHORIZED_SCOPE,
    createdAt: '2026-07-14T00:00:00.000Z',
    environment,
    environmentSha256: integrityHash(environment),
    runnerSha256: HASH_A,
    parserFingerprint: PARSER_FINGERPRINT,
    parserFingerprintSha256: PARSER_FINGERPRINT_SHA,
    selection: { kind: 'full_baseline' },
    counts,
    writeAllowlist,
    statusRecomputeAllowlist,
    cases: [item],
  });
  const planRaw = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  const planRawHash = rawSha256(planRaw);
  const backupManifest = {
    contract: BACKUP_CONTRACT,
    scope: AUTHORIZED_SCOPE,
    completedAt: '2026-07-14T00:05:00.000Z',
    environmentSha256: plan.environmentSha256,
    planRawSha256: planRawHash,
    planSha256: plan.planSha256,
    counts,
    writeAllowlist,
    statusRecomputeAllowlist,
    repairCaseIdsSha256: integrityHash(writeAllowlist.map((entry) => entry.caseId).sort()),
    pgDump: { sha256: HASH_B, byteLength: 4096 },
    restoreVerification: {
      postgresMajor: 16,
      completedAt: '2026-07-14T00:08:00.000Z',
      databaseName: environment.databaseName,
      sourcePgDumpSha256: HASH_B,
      sourcePgDumpByteLength: 4096,
      rowCounts: { case_: 140, field_level_provenance: 850, audit_event: 1200 },
      tableChecksums: { case_: HASH_A, field_level_provenance: HASH_B, audit_event: HASH_A },
      sourceRowCounts: { case_: 140, field_level_provenance: 850, audit_event: 1200 },
      sourceTableChecksums: { case_: HASH_A, field_level_provenance: HASH_B, audit_event: HASH_A },
    },
  };
  const backupRaw = Buffer.from(`${JSON.stringify(backupManifest, null, 2)}\n`);
  const backupRawHash = rawSha256(backupRaw);
  const approval = {
    contract: APPROVAL_CONTRACT,
    scope: AUTHORIZED_SCOPE,
    approvedBy: 'Alex Reviewer',
    approvedAt: '2026-07-14T00:10:00.000Z',
    expiresAt: '2026-07-14T01:10:00.000Z',
    environmentSha256: plan.environmentSha256,
    runnerSha256: HASH_A,
    planRawSha256: planRawHash,
    planSha256: plan.planSha256,
    backupManifestSha256: backupRawHash,
    counts,
    writeAllowlist,
    statusRecomputeAllowlist,
    repairCaseIdsSha256: backupManifest.repairCaseIdsSha256,
  };
  return {
    item,
    environment,
    plan,
    planRawHash,
    backupManifest,
    backupRawHash,
    approval,
    actualPgDumpSha256: HASH_B,
    actualPgDumpByteLength: 4096,
  };
}

function validAuthorityArgs(fixture, overrides = {}) {
  return {
    plan: fixture.plan,
    planRawSha256: fixture.planRawHash,
    expectedPlanRawSha256: fixture.planRawHash,
    backupManifest: fixture.backupManifest,
    backupManifestRawSha256: fixture.backupRawHash,
    expectedBackupManifestRawSha256: fixture.backupRawHash,
    approval: fixture.approval,
    currentRunnerSha256: HASH_A,
    currentEnvironment: fixture.environment,
    actualPgDumpSha256: fixture.actualPgDumpSha256,
    actualPgDumpByteLength: fixture.actualPgDumpByteLength,
    now: new Date('2026-07-14T00:30:00.000Z'),
    ...overrides,
  };
}

test('integrity hashes are deterministic, key-order stable, and content-sensitive', () => {
  assert.equal(integrityHash({ b: 2, a: 1 }), integrityHash({ a: 1, b: 2 }));
  assert.notEqual(integrityHash({ a: 1 }), integrityHash({ a: 2 }));
  assert.equal(rawSha256(Buffer.from('source bytes')), rawSha256(Buffer.from('source bytes')));
});

test('deployed parser fingerprint is function-key protected, timeout bounded, and vendor-lock exact', async () => {
  let request;
  const payload = {
    contract: PARSER_FINGERPRINT.contract,
    repository: PARSER_FINGERPRINT.repository,
    ref: PARSER_FINGERPRINT.ref,
    commit: PARSER_FINGERPRINT.commit,
    vendored_file_count: PARSER_FINGERPRINT.vendoredFileCount,
    content_sha256: PARSER_FINGERPRINT.contentSha256,
    providers_sha256: PARSER_FINGERPRINT.providersSha256,
  };
  const fingerprint = await getParserFingerprint({
    baseUrl: 'https://parser.example.test',
    key: 'function-key',
    expectedLock: PARSER_FINGERPRINT,
    timeoutMs: 250,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => payload };
    },
  });
  assert.deepEqual(fingerprint, PARSER_FINGERPRINT);
  assert.equal(request.url, 'https://parser.example.test/api/fingerprint');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers['x-functions-key'], 'function-key');
  assert.equal(request.options.signal instanceof AbortSignal, true);

  await assert.rejects(getParserFingerprint({
    baseUrl: 'https://parser.example.test',
    key: 'function-key',
    expectedLock: PARSER_FINGERPRINT,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ...payload, content_sha256: HASH_B }),
    }),
  }), /does not match the committed vendor lock/);
});

test('malformed parser/OCR JSON is a failure, never an absent claimant', async () => {
  await assert.rejects(
    readJsonResponse({ json: async () => { throw new SyntaxError('bad json'); } }, 'parser parse'),
    /returned malformed JSON/,
  );
  assert.equal(
    classifyPlanOutcome(
      [{ stage: 'ocr', message: 'ocr ocr-pdf returned malformed JSON' }],
      { status: 'absent' },
    ),
    'failed',
  );
});

test('every fetched source record uses the actual bytes even when metadata already has a SHA', () => {
  const bytes = Buffer.from('actual retained bytes');
  const row = evidenceRow({ sha256: HASH_A, size_bytes: bytes.length });
  const record = sourceReadRecord(row, bytes);
  assert.equal(record.readStatus, 'readable');
  assert.equal(record.byteSha256, rawSha256(bytes));
  assert.equal(record.byteLength, bytes.length);
  assert.equal(record.declaredSha256, HASH_A);
  assert.equal(record.declaredShaMatches, false);
  assert.match(record.metadataSha256, /^[a-f0-9]{64}$/);
});

test('an unreadable retained source remains a sealed failed baseline row and authorizes no write', async () => {
  const fetchError = Object.assign(new Error('retained object is missing'), {
    name: 'RestError',
    code: 'BlobNotFound',
    status: 404,
  });
  const canonical = {
    ...fakeCanonical(),
    supplementClaimantNameFromBody: sourceBundle.helpers.supplementClaimantNameFromBody,
  };
  const item = await planOne(
    caseRow(),
    [evidenceRow()],
    [],
    [],
    null,
    canonical,
    PARSER_FINGERPRINT_SHA,
    { fetchEvidence: async () => { throw fetchError; } },
  );

  assert.equal(item.outcome, 'failed');
  assert.deepEqual(item.patch, {});
  assert.equal(item.fieldSource, null);
  assert.equal(item.sources.metadata.length, 1);
  assert.equal(item.sources.metadata[0].evidenceId, EVIDENCE_ID);
  assert.equal(item.sources.reads.length, 1);
  const observation = item.sources.reads[0];
  assert.equal(observation.evidenceId, EVIDENCE_ID);
  assert.equal(observation.readStatus, 'unreadable');
  assert.equal(observation.metadataSha256, integrityHash(item.sources.metadata[0]));
  assert.deepEqual(observation.failure, {
    stage: 'source_read',
    name: 'RestError',
    code: 'BlobNotFound',
    status: 404,
    message: 'retained object is missing',
  });
  assert.match(observation.failureFingerprintSha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(observation, 'byteSha256'), false);
  assert.equal(Object.hasOwn(observation, 'byteLength'), false);
  assert.deepEqual(item.failures, [{
    evidenceId: EVIDENCE_ID,
    ...observation.failure,
    failureFingerprintSha256: observation.failureFingerprintSha256,
  }]);

  const environment = {
    label: 'production-readiness-remediation',
    databaseName: 'collisionspike',
    host: 'database.example.test',
    port: 5432,
  };
  const plan = sealPlan({
    contract: PLAN_CONTRACT,
    scope: AUTHORIZED_SCOPE,
    createdAt: '2026-07-14T00:00:00.000Z',
    environment,
    environmentSha256: integrityHash(environment),
    runnerSha256: HASH_A,
    parserFingerprint: PARSER_FINGERPRINT,
    parserFingerprintSha256: PARSER_FINGERPRINT_SHA,
    selection: { kind: 'full_baseline' },
    counts: planCounts([item]),
    writeAllowlist: [],
    statusRecomputeAllowlist: [],
    cases: [item],
  });
  assert.equal(plan.counts.baselineCount, 1);
  assert.equal(plan.counts.failedCount, 1);
  assert.equal(plan.counts.writeCount, 0);
  assert.equal(plan.counts.statusRecomputeCount, 0);
  assert.equal(assertPlan(plan), plan);

  const mislabeledItem = sealCase({ ...item, outcome: 'absent_in_source' });
  const mislabeledPlan = sealPlan({
    ...plan,
    counts: planCounts([mislabeledItem]),
    cases: [mislabeledItem],
  });
  assert.throws(() => assertPlan(mislabeledPlan), /Unreadable source cannot authorize a write/);

  const tamperedItem = sealCase({
    ...item,
    sources: {
      ...item.sources,
      reads: [{
        ...observation,
        failure: { ...observation.failure, message: 'different failure reason' },
      }],
    },
  });
  const tamperedPlan = sealPlan({
    ...plan,
    counts: planCounts([tamperedItem]),
    cases: [tamperedItem],
  });
  assert.throws(() => assertPlan(tamperedPlan), /failure fingerprint mismatch/);

  const unauthorizedStatus = sealPlan({
    ...plan,
    statusRecomputeAllowlist: [{ caseId: item.caseId, caseSha256: item.caseSha256 }],
  });
  assert.throws(() => assertPlan(unauthorizedStatus), /status-recompute allowlist mismatch/);

  let queryCount = 0;
  let verifierCalled = false;
  const result = await applyOne(
    { async query() { queryCount += 1; throw new Error('unreadable plan must not touch the database'); } },
    item,
    new Map([['pdf_extraction', 100000001], ['email_text', 100000002]]),
    fakeCanonical(),
    HASH_A,
    null,
    async () => { verifierCalled = true; throw new Error('unreadable plan must not revalidate for apply'); },
  );
  assert.equal(result.applyOutcome, 'not_authorized_source_unreadable');
  assert.equal(result.writeAttempted, false);
  assert.deepEqual(result.appliedFields, []);
  assert.equal(result.statusGenerationOutcome, 'not_authorized_source_unreadable');
  assert.equal(result.sourceFailures[0].failureFingerprintSha256, observation.failureFingerprintSha256);
  assert.equal(queryCount, 0);
  assert.equal(verifierCalled, false);
  await assert.rejects(
    revalidateRetainedSourceBytes(item, [evidenceRow()], [], null, async () => Buffer.from('now readable')),
    /planned_source_unreadable/,
  );
});

test('apply re-reads retained raw bytes and refuses changed content without reparsing', async () => {
  const item = repairCase();
  const row = evidenceRow();
  const matched = await revalidateRetainedSourceBytes(
    item,
    [row],
    [],
    null,
    async () => Buffer.from('test'),
  );
  assert.equal(matched.outcome, 'matched');
  assert.equal(matched.sourceCount, 1);
  assert.equal(matched.totalBytes, 4);
  await assert.rejects(
    revalidateRetainedSourceBytes(item, [row], [], null, async () => Buffer.from('changed')),
    /source_bytes_changed/,
  );
});

test('email-body claimant authority is locked and hash-revalidated before apply', async () => {
  const item = emailRepairCase();
  const currentInbound = inboundRow();
  const matched = await revalidateRetainedSourceBytes(
    item,
    [],
    [currentInbound],
    null,
    async () => { throw new Error('body-only replay must not fetch evidence'); },
  );
  assert.equal(matched.sourceCount, 0);
  assert.equal(matched.inboundBodyCount, 1);
  assert.equal(matched.inboundBodyBytes, Buffer.byteLength(currentInbound.body_preview));

  const changedInbound = inboundRow({
    body_preview: 'Claimant: Mr Changed Person',
    updated_at: new Date('2026-07-14T00:00:00.000Z'),
  });
  await assert.rejects(
    revalidateRetainedSourceBytes(item, [], [changedInbound], null),
    /inbound_email_state_changed_before_revalidation/,
  );
  const changedPreconditions = buildPreconditions(caseRow(), [], [], [], [changedInbound], fakeCanonical());
  assert.notEqual(changedPreconditions.stateSha256, item.preconditions.stateSha256);
});

test('body-only inbound sources are explicit in census source formats', () => {
  const census = censusDimensions(
    caseRow(),
    [],
    [],
    [inboundRow()],
    [],
    fakeCanonical(),
    PARSER_FINGERPRINT_SHA,
  );
  assert.deepEqual(census.sourceFormats, [{ extension: 'email-body', contentType: 'text/plain' }]);
  assert.equal(census.earliestSourceMessage.inboundEmailId, INBOUND_ID);
});

test('Word and RTF documents remain ahead of PDFs', () => {
  const docs = orderDocuments([
    { fileName: 'report.pdf', contentType: 'application/pdf' },
    { fileName: 'instruction.doc', contentType: 'application/msword' },
    { fileName: 'photo.jpg', contentType: 'image/jpeg' },
    { fileName: 'letter.rtf', contentType: 'application/rtf' },
  ]);
  assert.deepEqual(docs.map((item) => item.fileName), ['instruction.doc', 'letter.rtf', 'report.pdf']);
});

test('instruction selection prefers a real provider over misleading report typing', () => {
  const parsed = [
    { doc: { fileName: 'report.pdf', contentType: 'application/pdf' }, envelope: envelope({ provider: 'QDOS', docType: 'instruction', typingProvider: 'EVA (Engineers)' }) },
    { doc: { fileName: 'instruction.doc', contentType: 'application/msword' }, envelope: envelope({ provider: 'QDOS', docType: 'report' }) },
  ];
  assert.equal(selectInstructionIndex(parsed), 1);
});

test('instruction selection is authoritative and an EVA engineer report alone cannot repair', () => {
  const engineerOnly = [{
    doc: { fileName: 'EVA-engineer-report.pdf', contentType: 'application/pdf' },
    envelope: envelope({ claimant: 'Wrong Report Name', provider: 'EVA Engineers', docType: 'report', typingProvider: 'EVA Engineers' }),
  }];
  assert.equal(selectInstructionIndex(engineerOnly), -1);
  const selected = selectClaimantDocuments(engineerOnly);
  assert.equal(selected.selectedInstruction, null);
  assert.deepEqual(selected.ordered, []);
  assert.equal(
    chooseClaimant(selected.ordered, '', sourceBundle.helpers.supplementClaimantNameFromBody).status,
    'absent',
  );

  const providerInstruction = {
    doc: { fileName: 'instruction.doc', contentType: 'application/msword' },
    envelope: envelope({ claimant: 'Correct Instruction Name', provider: 'QDOS', docType: 'instruction' }),
  };
  const withInstruction = selectClaimantDocuments([...engineerOnly, providerInstruction]);
  assert.equal(withInstruction.selectedInstruction, providerInstruction);
  assert.deepEqual(withInstruction.ordered, [providerInstruction]);
});

test('claimant selection abstains on any cross-source conflict and uses canonical source helper', () => {
  const supplement = sourceBundle.helpers.supplementClaimantNameFromBody;
  assert.deepEqual(
    chooseClaimant([{ envelope: envelope({ claimant: 'Ms Jane Example' }) }], '', supplement),
    {
      status: 'matched',
      value: 'Ms Jane Example',
      source: 'pdf_extraction',
      candidates: ['Ms Jane Example'],
    },
  );
  assert.equal(chooseClaimant([], 'Claimant: Ms Jane Example', supplement).value, 'Ms Jane Example');
  assert.equal(
    chooseClaimant([{ envelope: envelope({ claimant: 'Ms Jane Example' }) }], 'Claimant: Mr John Other', supplement).status,
    'conflicting',
  );
  assert.equal(
    chooseClaimant([
      { envelope: envelope({ claimant: 'Ms Jane Example' }) },
      { envelope: envelope({ claimant: 'Mr John Other' }) },
    ], '', supplement).status,
    'conflicting',
  );
  assert.equal(chooseClaimant([], 'Kind regards\nClaimant: Ms Signature Person', supplement).status, 'absent');
});

test('email claimant provenance binds only the inbound source rows that supplied the match', () => {
  const supplement = sourceBundle.helpers.supplementClaimantNameFromBody;
  const result = chooseClaimant([], [
    { text: 'Claimant: Ms Jane Example', inboundEmailId: INBOUND_ID },
    { text: 'Please review the attached instruction.', inboundEmailId: 'unrelated-email' },
  ], supplement);
  assert.equal(result.source, 'email_text');
  assert.deepEqual(result.inboundEmailIds, [INBOUND_ID]);
  assert.equal(Object.hasOwn(result, 'evidenceIds'), false);
});

test('canonical helpers bundle directly from TypeScript sources, never stale dist output', async () => {
  assert.equal(typeof sourceBundle.helpers.CASE_SELECT, 'string');
  assert.equal(typeof sourceBundle.helpers.rowToCase, 'function');
  assert.equal(typeof sourceBundle.helpers.evaluateCaseReadiness, 'function');
  assert.equal(typeof sourceBundle.helpers.requestStatusRecompute, 'function');
  assert.equal(typeof sourceBundle.helpers.supplementClaimantNameFromBody, 'function');
  const runner = await readFile(new URL('./remediate-blank-claimants.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(runner, /orchestration\/dist\//);
  assert.match(runner, /orchestration\/src\/lib\/supplement-parse\.ts/);
});

test('OCR coalescing fills blanks only and does not overwrite parser values', () => {
  const parsed = {
    extraction: { claimant_name: { value: '' }, vehicle_model: { value: 'Ford Focus' } },
    vrm: { value: '' },
    reference: { value: '' },
  };
  assert.equal(emptyTextParse(parsed), false);
  const merged = coalesceOcr(parsed, {
    extraction: { claimant_name: { value: 'Jane Example' }, vehicle_model: { value: 'Wrong model' } },
    vrm: { value: 'AB12CDE' },
    reference: { value: 'REF/1' },
  });
  assert.equal(merged.extraction.claimant_name.value, 'Jane Example');
  assert.equal(merged.extraction.vehicle_model.value, 'Ford Focus');
  assert.equal(merged.vrm.value, 'AB12CDE');
  assert.equal(merged.reference.value, 'REF/1');
});

test('v2 plan accepts claimant-only repairs and rejects every non-claimant case patch', () => {
  const fixture = authorityFixture();
  assert.equal(assertPlan(fixture.plan), fixture.plan);

  const emailItem = emailRepairCase();
  const emailAllowlist = [{ caseId: emailItem.caseId, caseSha256: emailItem.caseSha256 }];
  const emailPlan = sealPlan({
    ...fixture.plan,
    counts: planCounts([emailItem]),
    writeAllowlist: emailAllowlist,
    statusRecomputeAllowlist: emailAllowlist,
    cases: [emailItem],
  });
  assert.equal(assertPlan(emailPlan), emailPlan);
  const uncoveredEmail = sealCase({
    ...emailItem,
    sources: { ...emailItem.sources, bodyInputs: [] },
  });
  const uncoveredAllowlist = [{ caseId: uncoveredEmail.caseId, caseSha256: uncoveredEmail.caseSha256 }];
  assert.throws(() => assertPlan(sealPlan({
    ...fixture.plan,
    counts: planCounts([uncoveredEmail]),
    writeAllowlist: uncoveredAllowlist,
    statusRecomputeAllowlist: uncoveredAllowlist,
    cases: [uncoveredEmail],
  })), /not covered by a consumed body hash/);

  const evil = sealCase({
    ...fixture.item,
    patch: { eva_claimant_name: 'Ms Jane Example', eva_work_provider: 'Forbidden Provider' },
  });
  const evilPlan = sealPlan({
    ...fixture.plan,
    counts: planCounts([evil]),
    writeAllowlist: [{ caseId: evil.caseId, caseSha256: evil.caseSha256 }],
    cases: [evil],
  });
  assert.throws(() => assertPlan(evilPlan), /not claimant-only/);
});

test('plan snapshot uses one read-only repeatable-read transaction', async () => {
  const old = { DATABASE_URL: process.env.DATABASE_URL, PGHOST: process.env.PGHOST, PGDATABASE: process.env.PGDATABASE };
  delete process.env.DATABASE_URL;
  process.env.PGHOST = 'database.example.test';
  process.env.PGDATABASE = 'collisionspike';
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(String(sql).trim());
      if (/current_database\(\)/i.test(sql)) return { rows: [{ database_name: 'collisionspike' }] };
      if (/^SELECT c\.\*/i.test(String(sql).trim())) return { rows: [] };
      return { rows: [] };
    },
  };
  try {
    const snapshot = await readPlanningSnapshot(
      client,
      { environment: 'production-readiness-remediation' },
      fakeCanonical(),
    );
    assert.deepEqual(snapshot.cases, []);
    assert.equal(queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    assert.equal(queries.at(-1), 'COMMIT');
    assert.equal(queries.some((sql) => /\b(?:UPDATE|INSERT|DELETE|ALTER|DROP)\b/i.test(sql)), false);
  } finally {
    if (old.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old.DATABASE_URL;
    if (old.PGHOST === undefined) delete process.env.PGHOST; else process.env.PGHOST = old.PGHOST;
    if (old.PGDATABASE === undefined) delete process.env.PGDATABASE; else process.env.PGDATABASE = old.PGDATABASE;
  }
});

test('apply authority binds raw plan, backup, runner, environment, counts, and exact allowlist', () => {
  const fixture = authorityFixture();
  const result = validateApplyAuthority({
    plan: fixture.plan,
    planRawSha256: fixture.planRawHash,
    expectedPlanRawSha256: fixture.planRawHash,
    backupManifest: fixture.backupManifest,
    backupManifestRawSha256: fixture.backupRawHash,
    expectedBackupManifestRawSha256: fixture.backupRawHash,
    approval: fixture.approval,
    currentRunnerSha256: HASH_A,
    currentEnvironment: fixture.environment,
    actualPgDumpSha256: fixture.actualPgDumpSha256,
    actualPgDumpByteLength: fixture.actualPgDumpByteLength,
    now: new Date('2026-07-14T00:30:00.000Z'),
  });
  assert.equal(result.approvedBy, 'Alex Reviewer');

  assert.throws(() => validateApplyAuthority({
    plan: fixture.plan,
    planRawSha256: fixture.planRawHash,
    expectedPlanRawSha256: HASH_B,
    backupManifest: fixture.backupManifest,
    backupManifestRawSha256: fixture.backupRawHash,
    expectedBackupManifestRawSha256: fixture.backupRawHash,
    approval: fixture.approval,
    currentRunnerSha256: HASH_A,
    currentEnvironment: fixture.environment,
    actualPgDumpSha256: fixture.actualPgDumpSha256,
    actualPgDumpByteLength: fixture.actualPgDumpByteLength,
    now: new Date('2026-07-14T00:30:00.000Z'),
  }), /Raw plan SHA-256 mismatch/);

  assert.throws(() => validateApplyAuthority({
    plan: fixture.plan,
    planRawSha256: fixture.planRawHash,
    expectedPlanRawSha256: fixture.planRawHash,
    backupManifest: fixture.backupManifest,
    backupManifestRawSha256: fixture.backupRawHash,
    expectedBackupManifestRawSha256: fixture.backupRawHash,
    approval: fixture.approval,
    currentRunnerSha256: HASH_A,
    currentEnvironment: fixture.environment,
    actualPgDumpSha256: fixture.actualPgDumpSha256,
    actualPgDumpByteLength: fixture.actualPgDumpByteLength,
    now: new Date('2026-07-14T02:00:00.000Z'),
  }), /expired/);
});

test('approval cannot expand scope or the exact per-case allowlist', () => {
  const fixture = authorityFixture();
  const common = {
    plan: fixture.plan,
    planRawSha256: fixture.planRawHash,
    expectedPlanRawSha256: fixture.planRawHash,
    backupManifest: fixture.backupManifest,
    backupManifestRawSha256: fixture.backupRawHash,
    expectedBackupManifestRawSha256: fixture.backupRawHash,
    currentRunnerSha256: HASH_A,
    currentEnvironment: fixture.environment,
    actualPgDumpSha256: fixture.actualPgDumpSha256,
    actualPgDumpByteLength: fixture.actualPgDumpByteLength,
    now: new Date('2026-07-14T00:30:00.000Z'),
  };
  assert.throws(() => validateApplyAuthority({
    ...common,
    approval: { ...fixture.approval, scope: { ...AUTHORIZED_SCOPE, caseColumns: ['eva_claimant_name', 'on_hold'] } },
  }), /exact remediation scope/);
  assert.throws(() => validateApplyAuthority({
    ...common,
    approval: {
      ...fixture.approval,
      writeAllowlist: [...fixture.approval.writeAllowlist, { caseId: 'extra-case', caseSha256: HASH_B }],
    },
  }), /allowlist mismatch/);
  assert.throws(() => validateApplyAuthority({
    ...common,
    approval: {
      ...fixture.approval,
      statusRecomputeAllowlist: [],
    },
  }), /status-recompute allowlist mismatch/);
});

test('backup authority requires a hashed pg_dump restored and checksummed on PostgreSQL 16', () => {
  const fixture = authorityFixture();
  const invalidBackup = {
    ...fixture.backupManifest,
    restoreVerification: { ...fixture.backupManifest.restoreVerification, postgresMajor: 15 },
  };
  const invalidBackupHash = rawSha256(Buffer.from(`${JSON.stringify(invalidBackup, null, 2)}\n`));
  assert.throws(() => validateApplyAuthority({
    plan: fixture.plan,
    planRawSha256: fixture.planRawHash,
    expectedPlanRawSha256: fixture.planRawHash,
    backupManifest: invalidBackup,
    backupManifestRawSha256: invalidBackupHash,
    expectedBackupManifestRawSha256: invalidBackupHash,
    approval: { ...fixture.approval, backupManifestSha256: invalidBackupHash },
    currentRunnerSha256: HASH_A,
    currentEnvironment: fixture.environment,
    actualPgDumpSha256: fixture.actualPgDumpSha256,
    actualPgDumpByteLength: fixture.actualPgDumpByteLength,
    now: new Date('2026-07-14T00:30:00.000Z'),
  }), /PostgreSQL 16/);
});

test('apply rejects partial plans, stale backups, and a different actual pg_dump artifact', () => {
  const fixture = authorityFixture();
  const partialPlan = sealPlan({ ...fixture.plan, selection: { kind: 'partial_case_po', casePo: 'QDOS26001' } });
  assert.throws(
    () => validateApplyAuthority(validAuthorityArgs(fixture, { plan: partialPlan })),
    /full-baseline plan/,
  );
  assert.throws(
    () => validateApplyAuthority(validAuthorityArgs(fixture, { actualPgDumpSha256: HASH_A })),
    /Actual pg_dump artifact does not match/,
  );

  const staleBackup = { ...fixture.backupManifest, completedAt: '2026-07-13T23:59:59.000Z' };
  const staleBackupRawHash = rawSha256(Buffer.from(`${JSON.stringify(staleBackup, null, 2)}\n`));
  assert.throws(() => validateApplyAuthority(validAuthorityArgs(fixture, {
    backupManifest: staleBackup,
    backupManifestRawSha256: staleBackupRawHash,
    expectedBackupManifestRawSha256: staleBackupRawHash,
    approval: { ...fixture.approval, backupManifestSha256: staleBackupRawHash },
  })), /pg_dump must complete after the plan was frozen/);
});

test('apply SQL harness rejects text JSON operators and proves the real apply is claimant-only', async () => {
  const canonical = fakeCanonical();
  const item = repairCase();
  const queries = [];
  const auditParameters = [];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      queries.push(normalized);
      if (/\bafter\s*->>/i.test(normalized)) {
        throw new Error('operator does not exist: text ->> unknown');
      }
      if (/INSERT INTO audit_event/i.test(normalized) && /::jsonb/i.test(normalized)) {
        throw new Error('audit_event before/after are text, not jsonb');
      }
      if (/SELECT id,/i.test(normalized) && /FROM audit_event/i.test(normalized)) return { rows: [] };
      if (/SELECT c\.\* FROM case_ c WHERE c\.id/i.test(normalized)) return { rows: [caseRow()] };
      if (/^SELECT \* FROM field_level_provenance/i.test(normalized)) return { rows: [] };
      if (/FROM evidence e JOIN choice_evidence_kind/i.test(normalized)) return { rows: [evidenceRow()] };
      if (/SET status_recompute_requested_generation/i.test(normalized)) {
        return { rows: [{ status_recompute_requested_generation: 1 }] };
      }
      if (/^UPDATE case_/i.test(normalized)) return { rows: [{ id: CASE_ID }] };
      if (/INSERT INTO audit_event/i.test(normalized)) auditParameters.push(params);
      return { rows: [] };
    },
  };

  await assert.rejects(
    client.query("SELECT after->>'remediationKey' FROM audit_event"),
    /operator does not exist/,
  );
  const result = await applyOne(
    client,
    item,
    new Map([['pdf_extraction', 100000001], ['email_text', 100000002]]),
    canonical,
    HASH_A,
    null,
    async () => ({ outcome: 'matched', sourceCount: 1, totalBytes: 4, fingerprintSha256: HASH_A }),
  );
  assert.equal(result.applyOutcome, 'committed');
  assert.deepEqual(result.appliedFields, [
    'eva_claimant_name',
    'status_recompute_requested_generation',
    'status_recompute_requested_at',
  ]);
  assert.equal(result.statusGenerationOutcome, 'requested');
  assert.equal(result.statusRecomputeGeneration, 1);

  const idempotency = queries.find((sql) => /SELECT id,/i.test(sql) && /FROM audit_event/i.test(sql));
  assert.match(idempotency, /pg_input_is_valid\(after, 'jsonb'\)/);
  assert.match(idempotency, /after::jsonb ->> 'remediationKey'/);
  const update = queries.find((sql) => /^UPDATE case_/i.test(sql) && /eva_claimant_name = \$2/i.test(sql));
  assert.match(update, /SET eva_claimant_name = \$2, updated_at = now\(\)/);
  assert.doesNotMatch(update, /\b(?:status_code|on_hold|case_po|work_provider_id|box_folder_id|submit_requested)\s*=/i);
  const recompute = queries.find((sql) => /SET status_recompute_requested_generation/i.test(sql));
  assert.match(recompute, /status_recompute_requested_generation = status_recompute_requested_generation \+ 1/);
  assert.doesNotMatch(recompute, /\b(?:status_code|on_hold)\s*=/i);
  const auditSql = queries.find((sql) => /INSERT INTO audit_event/i.test(sql));
  assert.doesNotMatch(auditSql, /::jsonb/i);
  assert.equal(typeof auditParameters[0][5], 'string');
  assert.equal(typeof auditParameters[0][6], 'string');
  assert.equal(JSON.parse(auditParameters[0][6]).remediationKey, `${HASH_A}:${CASE_ID}:${item.caseSha256}`);
  assert.equal(queries.at(-1), 'COMMIT');
});

test('email claimant audit/provenance writes the inbound-email id, not an evidence-row id', async () => {
  const item = emailRepairCase();
  let provenanceParams;
  const queries = [];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      queries.push(normalized);
      if (/SELECT id,/i.test(normalized) && /FROM audit_event/i.test(normalized)) return { rows: [] };
      if (/SELECT c\.\* FROM case_ c WHERE c\.id/i.test(normalized)) return { rows: [caseRow()] };
      if (/^SELECT \* FROM field_level_provenance/i.test(normalized)) return { rows: [] };
      if (/FROM evidence e JOIN choice_evidence_kind/i.test(normalized)) return { rows: [] };
      if (/FROM inbound_email/i.test(normalized)) return { rows: [inboundRow()] };
      if (/INSERT INTO field_level_provenance/i.test(normalized)) {
        provenanceParams = params;
        return { rows: [] };
      }
      if (/SET status_recompute_requested_generation/i.test(normalized)) {
        return { rows: [{ status_recompute_requested_generation: 1 }] };
      }
      if (/^UPDATE case_/i.test(normalized)) return { rows: [{ id: CASE_ID }] };
      return { rows: [] };
    },
  };
  const result = await applyOne(
    client,
    item,
    new Map([['pdf_extraction', 100000001], ['email_text', 100000002]]),
    fakeCanonical(),
    HASH_A,
    null,
    async () => ({ outcome: 'matched', sourceCount: 1, totalBytes: 4, fingerprintSha256: HASH_A }),
  );
  assert.equal(result.applyOutcome, 'committed');
  assert.equal(provenanceParams[6], INBOUND_ID);
  assert.notEqual(provenanceParams[6], EVIDENCE_ID);
  assert.deepEqual(result.sourceInboundEmailIds, [INBOUND_ID]);
  assert.match(queries.find((sql) => /FROM inbound_email/i.test(sql)), /FOR SHARE/);
});

test('apply distinguishes idempotent commit, preserved resolution, and before mismatch without writes', async () => {
  const canonical = fakeCanonical();
  const item = repairCase();
  const sourceTypes = new Map([['pdf_extraction', 100000001], ['email_text', 100000002]]);
  const makeClient = ({ row = caseRow(), committed = false } = {}) => {
    const queries = [];
    return {
      queries,
      async query(sql) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        queries.push(normalized);
        if (/SELECT id,/i.test(normalized) && /FROM audit_event/i.test(normalized)) {
          return { rows: committed ? [{ id: 'audit-1', status_generation: '1' }] : [] };
        }
        if (/SELECT c\.\* FROM case_ c WHERE c\.id/i.test(normalized)) return { rows: [row] };
        if (/^SELECT \* FROM field_level_provenance/i.test(normalized)) return { rows: [] };
        if (/FROM evidence e JOIN choice_evidence_kind/i.test(normalized)) return { rows: [evidenceRow()] };
        if (/SET status_recompute_requested_generation/i.test(normalized)) {
          return { rows: [{ status_recompute_requested_generation: 1 }] };
        }
        if (/^UPDATE case_/i.test(normalized)) return { rows: [{ id: CASE_ID }] };
        return { rows: [] };
      },
    };
  };

  const sourceVerifier = async () => ({ outcome: 'matched', sourceCount: 1, totalBytes: 4, fingerprintSha256: HASH_A });
  const replayClient = makeClient({
    committed: true,
    row: caseRow({ status_recompute_requested_generation: 1 }),
  });
  const replay = await applyOne(replayClient, item, sourceTypes, canonical, HASH_A, null, sourceVerifier);
  assert.equal(replay.applyOutcome, 'committed');
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.writeAttempted, false);
  assert.equal(replayClient.queries.some((sql) => /^UPDATE case_/i.test(sql)), false);

  const preservedClient = makeClient({ row: caseRow({ eva_claimant_name: 'Staff Saved Name' }) });
  const preserved = await applyOne(preservedClient, item, sourceTypes, canonical, HASH_A, null, sourceVerifier);
  assert.equal(preserved.applyOutcome, 'already_resolved_preserved');
  assert.equal(preserved.writeAttempted, false);
  assert.match(preserved.preservedClaimantSha256, /^[a-f0-9]{64}$/);
  assert.equal(preservedClient.queries.some((sql) => /^UPDATE case_/i.test(sql)), false);

  const mismatchClient = makeClient({ row: caseRow({ updated_at: new Date('2026-07-14T00:00:01.000Z') }) });
  const mismatch = await applyOne(mismatchClient, item, sourceTypes, canonical, HASH_A, null, sourceVerifier);
  assert.equal(mismatch.applyOutcome, 'before_mismatch');
  assert.equal(mismatch.writeAttempted, false);
  assert.equal(mismatchClient.queries.some((sql) => /^UPDATE case_/i.test(sql)), false);
  assert.equal(mismatchClient.queries.at(-1), 'ROLLBACK');
});

test('absent, conflict, and failed baseline entries request durable status recompute without claimant writes', async () => {
  for (const [outcome, expected] of [
    ['absent_in_source', 'no_write_absent'],
    ['conflicting', 'no_write_conflict'],
    ['failed', 'no_write_source_failure'],
  ]) {
    const item = sealCase({
      ...repairCase(),
      outcome,
      patch: {},
      fieldSource: null,
      claimant: { status: outcome === 'conflicting' ? 'conflicting' : 'absent', candidates: [] },
      failures: outcome === 'failed' ? [{ stage: 'parse', message: 'malformed_json' }] : [],
    });
    const queries = [];
    const client = {
      async query(sql) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        queries.push(normalized);
        if (/SELECT id,/i.test(normalized) && /FROM audit_event/i.test(normalized)) return { rows: [] };
        if (/SELECT c\.\* FROM case_ c WHERE c\.id/i.test(normalized)) return { rows: [caseRow()] };
        if (/^SELECT \* FROM field_level_provenance/i.test(normalized)) return { rows: [] };
        if (/FROM evidence e JOIN choice_evidence_kind/i.test(normalized)) return { rows: [evidenceRow()] };
        if (/SET status_recompute_requested_generation/i.test(normalized)) {
          return { rows: [{ status_recompute_requested_generation: 1 }] };
        }
        return { rows: [] };
      },
    };
    const result = await applyOne(
      client,
      item,
      new Map([['pdf_extraction', 100000001], ['email_text', 100000002]]),
      fakeCanonical(),
      HASH_A,
      null,
      async () => ({ outcome: 'matched', sourceCount: 1, totalBytes: 4, fingerprintSha256: HASH_A }),
    );
    assert.equal(result.applyOutcome, 'committed');
    assert.equal(result.claimantOutcome, expected);
    assert.equal(result.writeAttempted, true);
    assert.equal(result.statusGenerationOutcome, 'requested');
    assert.deepEqual(result.appliedFields, [
      'status_recompute_requested_generation',
      'status_recompute_requested_at',
    ]);
    assert.equal(queries.some((sql) => /eva_claimant_name = \$2/i.test(sql)), false);
    assert.equal(queries.some((sql) => /SET status_recompute_requested_generation/i.test(sql)), true);
  }
});

test('post-run census re-reads every planned case and the complete residual baseline', async () => {
  const fixture = authorityFixture();
  const plannedReadback = caseRow({
    eva_claimant_name: 'Ms Jane Example',
    status_recompute_requested_generation: 1,
    status_recompute_requested_at: new Date('2026-07-14T00:20:00.000Z'),
  });
  const residualId = '55555555-5555-4555-8555-555555555555';
  const residualRow = caseRow({
    id: residualId,
    case_po: 'PCH26002',
    provider_principal: 'PCH',
    provider_display: 'Prestige Claims Handling',
    eva_claimant_name: null,
  });
  const queries = [];
  const client = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      queries.push(normalized);
      if (/c\.id = ANY\(\$1::uuid\[\]\)/i.test(normalized)) return { rows: [plannedReadback] };
      if (/NULLIF\(btrim\(c\.eva_claimant_name\)/i.test(normalized)) return { rows: [residualRow] };
      if (/FROM evidence e/i.test(normalized)) return {
        rows: [evidenceRow({
          id: '66666666-6666-4666-8666-666666666666',
          case_id: residualId,
          file_name: 'residual-instruction.pdf',
        })],
      };
      if (/FROM field_level_provenance/i.test(normalized)) return { rows: [] };
      if (/FROM inbound_email/i.test(normalized)) return { rows: [] };
      throw new Error(`Unexpected census query: ${normalized}`);
    },
  };
  const census = await readResidualCensus(
    client,
    fixture.plan,
    [{
      caseId: CASE_ID,
      applyOutcome: 'committed',
      statusGenerationOutcome: 'requested',
      statusRecomputeGeneration: 1,
    }],
    fakeCanonical(),
  );
  assert.equal(census.plannedCaseCount, 1);
  assert.equal(census.plannedCases[0].claimantBlank, false);
  assert.equal(census.plannedCases[0].statusRecompute.requestedGeneration, 1);
  assert.equal(census.residual.count, 1);
  assert.equal(census.residual.plannedResidualCount, 0);
  assert.equal(census.residual.unplannedResidualCount, 1);
  assert.deepEqual(census.residual.byProvider, [{ name: 'PCH', count: 1 }]);
  assert.deepEqual(census.residual.bySourceFormat, [{ name: 'pdf:application/pdf', count: 1 }]);
  assert.equal(census.residual.cases[0].sourceCensus.earliestSourceDocument.evidenceId, '66666666-6666-4666-8666-666666666666');
  assert.match(census.censusSha256, /^[a-f0-9]{64}$/);
  assert.equal(queries.length, 5);

  const regressed = {
    query: async (sql) => (/c\.id = ANY/i.test(String(sql))
      ? { rows: [caseRow({ status_recompute_requested_generation: 0 })] }
      : { rows: [] }),
  };
  await assert.rejects(
    readResidualCensus(regressed, fixture.plan, [{
      caseId: CASE_ID,
      applyOutcome: 'committed',
      statusRecomputeGeneration: 1,
    }], fakeCanonical()),
    /generation regressed/,
  );
});

test('CLI authority and PII guards reject every Git path, aliases, collisions, and overwrites', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tkt150-artifacts-'));
  try {
    const parsed = parseArgs([
      '--mode', 'apply',
      '--environment', 'production-readiness-remediation',
      '--out', join(root, 'ledger.json'),
      '--plan', join(root, 'plan.json'),
      '--plan-sha256', HASH_A,
      '--backup-manifest', join(root, 'backup.json'),
      '--backup-manifest-sha256', HASH_B,
      '--backup-artifact', join(root, 'backup.dump'),
      '--approval', join(root, 'approval.json'),
    ]);
    assert.equal(parsed.mode, 'apply');
    assert.throws(() => parseArgs([
      '--mode', 'apply', '--environment', 'x', '--out', join(root, 'ledger.json'), '--plan', 'p',
    ]), /--plan-sha256 is required/);
    await assert.rejects(
      assertOutsideRepository(fileURLToPath(new URL('./inside-plan.json', import.meta.url)), 'plan'),
      /outside every Git checkout/,
    );
    assert.equal((await assertOutsideRepository(join(root, 'tkt150-plan.json'))).startsWith(resolve(root)), true);

    const foreignRepo = join(root, 'foreign-repo');
    await mkdir(join(foreignRepo, '.git'), { recursive: true });
    await assert.rejects(
      assertOutsideRepository(join(foreignRepo, 'artifact.json'), 'foreign artifact'),
      /outside every Git repository or worktree/,
    );
    const alias = join(root, 'repo-alias');
    try {
      await symlink(foreignRepo, alias, process.platform === 'win32' ? 'junction' : 'dir');
      await assert.rejects(
        assertOutsideRepository(join(alias, 'through-junction.json'), 'aliased artifact'),
        /outside every Git repository or worktree/,
      );
    } catch (error) {
      if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
      t.diagnostic(`junction/symlink creation unavailable: ${error.code}`);
    }

    await assert.rejects(
      assertDistinctArtifactPaths([
        { label: '--out', path: join(root, 'same.json') },
        { label: '--journal', path: join(root, '.', 'same.json') },
      ]),
      /must be distinct/,
    );
    const exclusive = join(root, 'exclusive.json');
    await writeJsonExclusive(exclusive, { first: true });
    await assert.rejects(writeJsonExclusive(exclusive, { second: true }), /EEXIST/);
    assert.deepEqual(JSON.parse(await readFile(exclusive, 'utf8')), { first: true });
    const dumpPath = join(root, 'actual.dump');
    await writeFile(dumpPath, Buffer.from('actual pg_dump bytes'));
    assert.deepEqual(await hashFile(dumpPath), {
      sha256: rawSha256(Buffer.from('actual pg_dump bytes')),
      byteLength: Buffer.byteLength('actual pg_dump bytes'),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('database TLS configuration rejects all non-verifying modes', () => {
  for (const mode of ['disable', 'allow', 'prefer', 'no-verify']) {
    assert.throws(
      () => assertSecureDatabaseSettings({ DATABASE_URL: `postgresql://user:pass@db.example/test?sslmode=${mode}` }),
      /must verify/,
    );
  }
  assert.doesNotThrow(() => assertSecureDatabaseSettings({
    DATABASE_URL: 'postgresql://user:pass@db.example/test?sslmode=verify-full',
  }));
});

test('runner dependencies are declared and the focused suite is part of the normal root test gate', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(packageJson.scripts.test, /npm run test:tkt150-remediation/);
  assert.equal(packageJson.dependencies['@azure/storage-blob'], '12.33.0');
  assert.equal(packageJson.dependencies.pg, '8.22.0');
  assert.equal(packageJson.devDependencies.esbuild, '0.21.5');
});
