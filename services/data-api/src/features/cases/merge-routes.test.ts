/**
 * Atomic merge protocol tests. The DB is a deterministic journal: assertions pin
 * advisory/case/inbound lock order and prove every core mutation uses one tx query.
 * The in-memory journal double and fixtures live in ./merge-routes.harness.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { statusToInt } from '@cs/domain/codecs';
import { EVA_FIELD_ORDER, statusForReviewCase } from '@cs/domain';
import {
  CASE_A,
  CASE_B,
  CASE_C,
  EV_TARGET,
  EV_SOURCE_COPY,
  EV_SOURCE_UNIQUE,
  EV_SOURCE_SECOND,
  archiveHoldings,
  archiveOutbox,
  captureAssets,
  captureSessions,
  caseRow,
  cases,
  evidenceRows,
  fileRequestIntents,
  flags,
  manualOperations,
  mergeQueryImpl,
  mergeTxQueryImpl,
  poolSql,
  request,
  resetMergeState,
  staffUploadItems,
  staffUploads,
  txParams,
  txSql,
} from './merge-routes.harness.js';

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, opts: Registration) => registrations.set(name, opts),
    timer: vi.fn(),
  },
}));

vi.mock('../../platform/auth/staff-auth.js', () => ({
  withRole: (_role: string, handler: Function) =>
    (req: HttpRequest, ctx: InvocationContext) => handler(req, ctx, { sub: 'staff-1' }),
}));
vi.mock('../inbound/internal/unique-violation.js', () => ({ isUniqueViolation: () => false }));
vi.mock('./inspection-prefill.js', () => ({
  isPrefillApplicable: () => false,
  prefillImageBasedInspection: vi.fn(async () => false),
}));
vi.mock('./overview-chase.js', () => ({ maybeSuggestOverviewChase: vi.fn(async () => false) }));
vi.mock('../../platform/http/service-client.js', () => ({ listBoxFolderNames: vi.fn(async () => []) }));
const providerRecovery = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('../providers/recovery.js', () => ({
  completeProviderRecoveryUsing: providerRecovery.complete,
}));

const db = vi.hoisted(() => ({
  query: vi.fn(),
  tx: vi.fn(),
  txQuery: vi.fn(),
}));
vi.mock('../../platform/db/client.js', () => ({
  query: db.query,
  tx: db.tx,
  getPool: () => {
    throw new Error('no pool in tests');
  },
}));

await import('./register.js');
const { manualIntakeEvidenceState } = await import('./manual-intake-operation.js');

const merge = registrations.get('mergeCases')!.handler;
const mergeCandidates = registrations.get('mergeCandidates')!.handler;
const retryManualArchive = registrations.get('retryManualIntakeArchive')!.handler;

const ctx = { error: vi.fn(), warn: vi.fn() } as unknown as InvocationContext;

beforeEach(() => {
  resetMergeState();
  db.query.mockReset();
  db.tx.mockReset();
  db.txQuery.mockReset();
  providerRecovery.complete.mockReset();
  providerRecovery.complete.mockResolvedValue({ outcome: 'not_needed', holdCleared: false });
  (ctx.warn as ReturnType<typeof vi.fn>).mockClear();
  db.query.mockImplementation(mergeQueryImpl);
  db.txQuery.mockImplementation(mergeTxQueryImpl);
  db.tx.mockImplementation(async (fn: (q: typeof db.txQuery) => Promise<unknown>) => fn(db.txQuery));
});

describe('mergeCases atomic lock protocol', () => {
  it('remains merge-safe before the additive capture schema exists', async () => {
    const response = await merge(request(CASE_B, CASE_A), ctx);

    expect(response.status).toBe(200);
    expect(txSql.some((sql) => /to_regclass\('public\.capture_session'\)/i.test(sql))).toBe(true);
    expect(txSql.some((sql) => /UPDATE capture_session/i.test(sql))).toBe(false);
  });

  it('locks then reparents capture sessions immediately without rotating their tokens', async () => {
    flags.captureSchemaPresent = true;
    captureSessions.push(
      { id: '11111111-1111-4111-8111-111111111111', case_id: CASE_A, token_generation: 7 },
      { id: '22222222-2222-4222-8222-222222222222', case_id: CASE_A, token_generation: 3 },
    );

    const response = await merge(request(CASE_B, CASE_A), ctx);

    expect(response.status).toBe(200);
    expect(captureSessions.map((row) => [row.case_id, row.token_generation])).toEqual([
      [CASE_B, 7],
      [CASE_B, 3],
    ]);
    const captureLocked = txSql.findIndex((sql) =>
      /SELECT id FROM capture_session/i.test(sql) && /FOR UPDATE/i.test(sql));
    const captureAssetsLocked = txSql.findIndex((sql) =>
      /SELECT id FROM capture_asset/i.test(sql) && /FOR UPDATE/i.test(sql));
    const inboundLocked = txSql.findIndex((sql) =>
      /SELECT id FROM inbound_email/i.test(sql) && /FOR UPDATE/i.test(sql));
    const captureMoved = txSql.findIndex((sql) => /UPDATE capture_session/i.test(sql));
    const sourceRetired = txSql.findIndex((sql) => /duplicate_keys = \$3/i.test(sql));
    expect(captureLocked).toBeGreaterThanOrEqual(0);
    expect(captureAssetsLocked).toBeGreaterThan(captureLocked);
    expect(captureAssetsLocked).toBeLessThan(inboundLocked);
    expect(captureLocked).toBeLessThan(inboundLocked);
    expect(captureMoved).toBeGreaterThan(inboundLocked);
    expect(captureMoved).toBeLessThan(sourceRetired);
    expect(txParams.filter((params) => params.includes(100000061))).toHaveLength(2);
  });

  it('blocks different archive identities when only the survivor owns an adopted holding',async()=>{
    cases.set(CASE_A,caseRow(CASE_A,{box_folder_id:'source-folder',box_folder_url:'source-url'}));
    cases.set(CASE_B,caseRow(CASE_B,{box_folder_id:'target-folder',box_folder_url:'target-url'}));
    archiveHoldings.push({id:'holding-b',adopted_case_id:CASE_B,box_folder_id:'old-held',canonical_folder_id:'target-folder',normalized_vrm:'AB12CDE',state:'adopted'});
    const res=await merge(request(CASE_B,CASE_A),ctx);
    expect(res.status).toBe(409);
    expect(res.jsonBody).toMatchObject({error:expect.stringContaining('different archive folders')});
    expect(txSql.some((sql)=>/UPDATE evidence\s+SET case_id/i.test(sql))).toBe(false);
  });

  it('preserves one shared adopted archive identity regardless of merge direction',async()=>{
    cases.set(CASE_A,caseRow(CASE_A,{box_folder_id:'shared-folder',box_folder_url:'shared-url'}));
    cases.set(CASE_B,caseRow(CASE_B,{box_folder_id:'shared-folder',box_folder_url:'shared-url'}));
    archiveHoldings.push({id:'holding-b',adopted_case_id:CASE_B,box_folder_id:'old-held',canonical_folder_id:'shared-folder',normalized_vrm:'AB12CDE',state:'adopted'});
    const res=await merge(request(CASE_B,CASE_A),ctx);
    expect(res.status).toBe(200);
    expect(cases.get(CASE_A)?.box_folder_id).toBeNull();
    expect(archiveHoldings[0].adopted_case_id).toBe(CASE_B);
  });

  it('does not race a merge through an active folder adoption claim',async()=>{
    cases.set(CASE_A,caseRow(CASE_A,{box_folder_id:'shared-folder'}));
    archiveHoldings.push({id:'holding-a',adopted_case_id:CASE_A,box_folder_id:'held',canonical_folder_id:'shared-folder',state:'adopting',claim_active:true});
    const res=await merge(request(CASE_B,CASE_A),ctx);
    expect(res.status).toBe(409);
    expect(res.jsonBody).toMatchObject({error:expect.stringContaining('still being filed')});
  });
  it('transfers an unresolved staff-selected registration folder to the survivor',async()=>{
    cases.set(CASE_A,caseRow(CASE_A,{vrm:'AB12 CDE'}));
    cases.set(CASE_B,caseRow(CASE_B,{vrm:'AB12CDE'}));
    archiveHoldings.push({id:'holding-a',adopted_case_id:null,resolved_case_id:CASE_A,
      box_folder_id:'vrm-folder',canonical_folder_id:null,normalized_vrm:'AB12CDE',state:'ambiguous',claim_active:false});
    const res=await merge(request(CASE_B,CASE_A),ctx);
    expect(res.status).toBe(200);
    expect(archiveHoldings[0].resolved_case_id).toBe(CASE_B);
  });
  it('refuses to strand a waiting registration folder on a survivor with another registration',async()=>{
    cases.set(CASE_A,caseRow(CASE_A,{vrm:'AB12CDE'}));
    cases.set(CASE_B,caseRow(CASE_B,{vrm:'XY99ZZZ'}));
    archiveHoldings.push({id:'holding-a',adopted_case_id:null,resolved_case_id:CASE_A,
      box_folder_id:'vrm-folder',canonical_folder_id:null,normalized_vrm:'AB12CDE',state:'ambiguous',claim_active:false});
    const res=await merge(request(CASE_B,CASE_A),ctx);
    expect(res.status).toBe(409);
    expect(res.jsonBody).toMatchObject({error:expect.stringContaining('different registration')});
    expect(archiveHoldings[0].resolved_case_id).toBe(CASE_A);
  });
  it('rekeys an unresolved candidate-only holding to the same-registration survivor',async()=>{
    cases.set(CASE_A,caseRow(CASE_A,{vrm:'AB12CDE'}));
    cases.set(CASE_B,caseRow(CASE_B,{vrm:'AB12 CDE'}));
    archiveHoldings.push({id:'holding-a',adopted_case_id:null,resolved_case_id:null,
      candidate_case_ids:[CASE_A,CASE_B],box_folder_id:'vrm-folder',canonical_folder_id:null,
      normalized_vrm:'AB12CDE',state:'ambiguous',claim_active:false});
    const res=await merge(request(CASE_B,CASE_A),ctx);
    expect(res.status).toBe(200);
    expect(archiveHoldings[0].candidate_case_ids).toEqual([CASE_B]);
  });
  it('offers a providerless twin but excludes a case with a different known provider', async () => {
    cases.set(CASE_A, caseRow(CASE_A, { provider_principal: 'P1' }));
    cases.set(CASE_B, caseRow(CASE_B, { provider_principal: '', work_provider_id: null }));
    cases.set(CASE_C, caseRow(CASE_C, { provider_principal: 'P2', work_provider_id: 'wp-other' }));

    const response = await mergeCandidates({ params: { id: CASE_A } } as unknown as HttpRequest, ctx);
    const ids = (response.jsonBody as Array<{ id: string }>).map((candidate) => candidate.id);

    expect(ids).toContain(CASE_B);
    expect(ids).not.toContain(CASE_C);
  });

  it('transfers a never-attempted pending image-upload intent to the survivor', async () => {
    fileRequestIntents.push({
      case_id: CASE_A,
      requested_generation: 1,
      completed_generation: 0,
      attempt_count: 0,
      claim_token: null,
    });
    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(200);
    expect(fileRequestIntents[0].case_id).toBe(CASE_B);
    expect(txSql.some((sql) => /UPDATE box_file_request_outbox[\s\S]*SET case_id = \$2/i.test(sql))).toBe(true);
  });

  it('blocks merge when source image-upload link creation may already have run remotely', async () => {
    archiveHoldings.push({
      id: 'holding-a',
      adopted_case_id: CASE_A,
      resolved_case_id: null,
      box_folder_id: 'folder-archive-a',
      canonical_folder_id: `folder-${CASE_A}`,
      state: 'adopted',
      claim_active: false,
    });
    fileRequestIntents.push({
      case_id: CASE_A,
      requested_generation: 1,
      completed_generation: 0,
      attempt_count: 1,
      claim_token: null,
    });
    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(409);
    expect(res.jsonBody).toMatchObject({
      error: expect.stringContaining('may already have started'),
    });
    // The raw transaction callback rejects so the real tx helper executes
    // ROLLBACK; a normal error return here would commit the holding re-key above.
    await expect(db.tx.mock.results[0]?.value).rejects.toThrow('may already have started');
    expect(txSql.some((sql) => /UPDATE evidence\s+SET case_id/i.test(sql))).toBe(false);
  });

  it('backfill-first-compatible order: advisory locks, case rows, inbound rows, then all writes in one tx', async () => {
    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: CASE_B, movedEvidence: 1 });
    expect(db.tx).toHaveBeenCalledTimes(2); // atomic merge + locked immediate recompute

    const advisory = txSql.findIndex((s) => /pg_advisory_xact_lock/i.test(s));
    const casesLocked = txSql.findIndex((s) => /FROM case_/i.test(s) && /FOR UPDATE/i.test(s));
    const inboundLocked = txSql.findIndex((s) => /FROM inbound_email/i.test(s) && /FOR UPDATE/i.test(s));
    const evidenceMoved = txSql.findIndex((s) => /UPDATE evidence\s+SET case_id/i.test(s));
    const outboxRekeyed = txSql.findIndex((s) =>
      /UPDATE archive_mirror_outbox[\s\S]*SET case_id = \$2/i.test(s));
    const inboundMoved = txSql.findIndex((s) => /UPDATE inbound_email SET case_id/i.test(s));
    const sourceRetired = txSql.findIndex((s) => /duplicate_keys = \$3/i.test(s));
    expect(advisory).toBeGreaterThanOrEqual(0);
    expect(advisory).toBeLessThan(casesLocked);
    expect(casesLocked).toBeLessThan(inboundLocked);
    expect(inboundLocked).toBeLessThan(evidenceMoved);
    expect(evidenceMoved).toBeLessThan(outboxRekeyed);
    expect(outboxRekeyed).toBeLessThan(inboundMoved);
    expect(evidenceMoved).toBeLessThan(inboundMoved);
    expect(inboundMoved).toBeLessThan(sourceRetired);
    expect(poolSql.some((s) => /UPDATE evidence|UPDATE inbound_email|duplicate_keys = \$3/i.test(s))).toBe(false);
    expect(txSql.some((s) => /INSERT INTO audit_event/i.test(s))).toBe(true);
    expect(
      txSql.some((s) =>
        /status_recompute_requested_generation = status_recompute_requested_generation \+ 1/i.test(s),
      ),
    ).toBe(true);
    expect(poolSql.some((s) => /INSERT INTO audit_event/i.test(s))).toBe(false);
    expect(poolSql.some((s) => /FROM case_ c/i.test(s))).toBe(true); // post-commit recompute attempted
    expect(poolSql.some((s) => /status_recompute_completed_generation = GREATEST/i.test(s))).toBe(true);
    expect(ctx.warn).not.toHaveBeenCalled();
  });

  it('reverse concurrent merge requests derive one lock order and the loser rejects the retired target', async () => {
    expect((await merge(request(CASE_B, CASE_A), ctx)).status).toBe(200);
    const writesAfterFirst = txSql.filter((s) => /UPDATE evidence\s+SET case_id/i.test(s)).length;

    const reverse = await merge(request(CASE_A, CASE_B), ctx);
    expect(reverse.status).toBe(409);
    expect(reverse.jsonBody).toEqual({
      error: 'One of these cases has already been merged. Refresh and try again.',
    });
    expect(txSql.filter((s) => /UPDATE evidence\s+SET case_id/i.test(s))).toHaveLength(writesAfterFirst);

    const advisoryKeys = txParams
      .filter((_, i) => /pg_advisory_xact_lock/i.test(txSql[i]))
      .map((p) => p[0]);
    expect(advisoryKeys.slice(0, 2)).toEqual(advisoryKeys.slice(2, 4));
  });

  it('preserves provider carry-over and keeps every provider mutation in the merge transaction', async () => {
    cases.set(CASE_A, caseRow(CASE_A, { work_provider_id: 'wp-source' }));
    cases.set(CASE_B, caseRow(CASE_B, { work_provider_id: null }));
    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(200);
    expect(txSql.some((s) => /UPDATE case_ SET work_provider_id/i.test(s))).toBe(true);
    expect(txSql.some((s) => /UPDATE case_ SET eva_work_provider/i.test(s))).toBe(true);
    expect(txSql.some((s) => /INSERT INTO field_level_provenance/i.test(s))).toBe(true);
    expect(
      poolSql.some((s) => /UPDATE case_ SET (work_provider_id|eva_work_provider)|INSERT INTO field_level_provenance/i.test(s)),
    ).toBe(false);
  });

  it('advances a provider-unresolved survivor to identity-ready and durably queues its Archive folder', async () => {
    cases.set(CASE_A, caseRow(CASE_A, { work_provider_id: 'wp-source' }));
    cases.set(CASE_B, caseRow(CASE_B, {
      work_provider_id: null,
      on_hold: true,
      on_hold_reason: 'provider_unresolved',
      case_po: null,
      box_folder_id: null,
    }));
    providerRecovery.complete.mockResolvedValueOnce({
      outcome: 'identity_ready',
      holdCleared: false,
      casePo: 'P126001',
      casePoSource: 'minted',
    });

    const res = await merge(request(CASE_B, CASE_A), ctx);

    expect(res.status).toBe(200);
    expect(providerRecovery.complete).toHaveBeenCalledWith(db.txQuery, {
      caseId: CASE_B,
      resolvedProviderId: 'wp-source',
      allowCasePoMint: true,
    });
    const queued = txSql.findIndex((sql) =>
      /provider_archive_requested_generation = provider_archive_requested_generation \+ 1/i.test(sql));
    expect(queued).toBeGreaterThanOrEqual(0);
    expect(txParams[queued]).toEqual([CASE_B]);
    const sourceCancelled = txSql.findIndex((sql) =>
      /provider_archive_completed_generation = provider_archive_requested_generation/i.test(sql));
    expect(sourceCancelled).toBeGreaterThan(queued);
    expect(txParams[sourceCancelled]).toEqual([CASE_A]);
    expect(poolSql.some((sql) => /provider_archive_/i.test(sql))).toBe(false);
  });

  it('rolls back through a typed conflict when provider recovery cannot safely bind identity', async () => {
    cases.set(CASE_A, caseRow(CASE_A, { work_provider_id: 'wp-source' }));
    cases.set(CASE_B, caseRow(CASE_B, { work_provider_id: null }));
    providerRecovery.complete.mockResolvedValueOnce({
      outcome: 'blocked',
      holdCleared: false,
      blockedReason: 'case_po_provider_mismatch',
    });

    const res = await merge(request(CASE_B, CASE_A), ctx);

    expect(res).toEqual({
      status: 409,
      jsonBody: { error: 'Provider recovery needs review before these cases can be merged.' },
    });
    expect(txSql.some((sql) =>
      /provider_archive_requested_generation = provider_archive_requested_generation \+ 1/i.test(sql))).toBe(false);
  });

  it('blocks before mutation while either case has remote Archive work in flight', async () => {
    cases.set(CASE_A, caseRow(CASE_A, {
      provider_archive_requested_generation: 2,
      provider_archive_completed_generation: 1,
    }));

    const res = await merge(request(CASE_B, CASE_A), ctx);

    expect(res).toEqual({
      status: 409,
      jsonBody: {
        error: 'Archive folder work is still finishing for one of these cases. Try the merge again shortly.',
      },
    });
    expect(txSql.some((sql) => /UPDATE evidence\s+SET case_id/i.test(sql))).toBe(false);
    expect(providerRecovery.complete).not.toHaveBeenCalled();
  });

  it('blocks a legacy Archive-pending hold even before its durable generation is backfilled', async () => {
    cases.set(CASE_A, caseRow(CASE_A, {
      on_hold: true,
      on_hold_reason: 'provider_archive_pending',
      provider_archive_requested_generation: 0,
      provider_archive_completed_generation: 0,
    }));

    const res = await merge(request(CASE_B, CASE_A), ctx);

    expect(res.status).toBe(409);
    expect(txSql.some((sql) => /UPDATE evidence\s+SET case_id/i.test(sql))).toBe(false);
  });

  it('fills a blank survivor claimant and carries the source provenance in the merge transaction', async () => {
    cases.set(CASE_A, caseRow(CASE_A, { eva_claimant_name: 'Jane Source' }));
    cases.set(CASE_B, caseRow(CASE_B, { eva_claimant_name: '' }));

    const res = await merge(request(CASE_B, CASE_A), ctx);

    expect(res.status).toBe(200);
    const fill = txSql.findIndex((sql) => /SET eva_claimant_name = \$2/i.test(sql));
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(txParams[fill]).toEqual([CASE_B, 'Jane Source']);
    expect(txSql.some((sql) => /UPDATE field_level_provenance[\s\S]*SET case_id = \$2/i.test(sql))).toBe(true);
    const fallback = txSql.findIndex((sql) =>
      /INSERT INTO field_level_provenance[\s\S]*Source not recorded/i.test(sql));
    expect(fallback).toBeGreaterThanOrEqual(0);
    expect(txParams[fallback]).toContain(100000011);
    expect(txParams[fallback]).not.toContain(100000000);
    expect(
      poolSql.some((sql) => /eva_claimant_name =|UPDATE field_level_provenance/i.test(sql)),
    ).toBe(false);
  });

  it('preserves a nonblank survivor claimant and carries a differing source as a conflict', async () => {
    cases.set(CASE_A, caseRow(CASE_A, { eva_claimant_name: 'Jane Source' }));
    cases.set(CASE_B, caseRow(CASE_B, { eva_claimant_name: 'Alex Survivor' }));

    const res = await merge(request(CASE_B, CASE_A), ctx);

    expect(res.status).toBe(200);
    expect(txSql.some((sql) => /SET eva_claimant_name = \$2/i.test(sql))).toBe(false);
    const provenanceMove = txSql.findIndex((sql) =>
      /UPDATE field_level_provenance[\s\S]*review_state_code = CASE/i.test(sql));
    expect(provenanceMove).toBeGreaterThanOrEqual(0);
    expect(txParams[provenanceMove]).toEqual([
      CASE_A,
      CASE_B,
      true,
      'Jane Source',
      100000003,
    ]);
    const fallback = txSql.findIndex((sql) =>
      /INSERT INTO field_level_provenance[\s\S]*Source not recorded/i.test(sql));
    expect(fallback).toBeGreaterThanOrEqual(0);
    expect(txParams[fallback]).toContain(100000003);
    expect(txParams[fallback]).toContain(100000011);
    expect(txParams[fallback]).not.toContain(100000000);
  });

  it('uses plain user language for a finalised target', async () => {
    cases.set(CASE_B, caseRow(CASE_B, { status_code: statusToInt('eva_submitted') }));
    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'Cannot merge into a finalised case.' });
  });

  it('does not move a case while an archive upload claim is active', async () => {
    archiveHoldings.push({
      id: 'holding-a',
      adopted_case_id: CASE_A,
      resolved_case_id: null,
      box_folder_id: 'folder-archive-a',
      canonical_folder_id: `folder-${CASE_A}`,
      state: 'adopted',
      claim_active: false,
    });
    evidenceRows[0].archive_mirror_claim_token = '11111111-1111-4111-8111-111111111111';
    evidenceRows[0].archive_mirror_claim_expires_at = new Date(Date.now() + 60_000).toISOString();
    fileRequestIntents.push({
      case_id: CASE_A,
      requested_generation: 1,
      completed_generation: 0,
      attempt_count: 0,
      claim_token: null,
    });

    const res = await merge(request(CASE_B, CASE_A), ctx);

    expect(res.status).toBe(409);
    expect(res.jsonBody).toEqual({
      error: 'Archive work is still finishing for one of these cases. Try the merge again shortly.',
    });
    expect(fileRequestIntents[0].case_id).toBe(CASE_A);
    expect(txSql.some((sql) => /UPDATE box_file_request_outbox[\s\S]*SET case_id = \$2/i.test(sql))).toBe(false);
    expect(txSql.some((sql) => /UPDATE evidence\s+SET case_id/i.test(sql))).toBe(false);
  });

  it('rejects an active image deletion before an upload-link intent can be transferred', async () => {
    evidenceRows[0].deletion_operation_id = '66666666-6666-4666-8666-666666666666';
    fileRequestIntents.push({
      case_id: CASE_A,
      requested_generation: 1,
      completed_generation: 0,
      attempt_count: 0,
      claim_token: null,
    });

    const res = await merge(request(CASE_B, CASE_A), ctx);

    expect(res.status).toBe(409);
    expect(res.jsonBody).toEqual({
      error: 'An image is being deleted from one of these cases. Try the merge again shortly.',
    });
    expect(fileRequestIntents[0].case_id).toBe(CASE_A);
    expect(txSql.some((sql) => /UPDATE box_file_request_outbox[\s\S]*SET case_id = \$2/i.test(sql))).toBe(false);
    expect(txSql.some((sql) => /UPDATE evidence\s+SET case_id/i.test(sql))).toBe(false);
  });

  it('blocks merge while either Manual Intake operation is incomplete', async () => {
    manualOperations.push({
      case_id: CASE_A,
      expected_file_count: 1,
      evidence_completed_at: null,
      side_effects_completed_at: new Date(),
    });
    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(409);
    expect(res.jsonBody).toEqual({
      error: 'Source files are still being added for one of these cases. Finish or retry them before merging.',
    });
    expect(txSql.some((sql) => /UPDATE evidence\s+SET case_id/i.test(sql))).toBe(false);
  });

  it('canonicalises UUID text before self-checks and provider carry-over', async () => {
    cases.set(CASE_A, caseRow(CASE_A, { work_provider_id: 'wp-source' }));
    cases.set(CASE_B, caseRow(CASE_B, { work_provider_id: null }));

    const res = await merge(request(CASE_B.toUpperCase(), CASE_A.toUpperCase()), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: CASE_B });
    expect(txParams.some((p) => p[0] === CASE_B && p[1] === 'wp-source')).toBe(true);

    db.tx.mockClear();
    const self = await merge(request(CASE_A.toUpperCase(), CASE_A), ctx);
    expect(self.status).toBe(400);
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('rejects malformed case identifiers before opening a transaction', async () => {
    const res = await merge(request(CASE_B, 'not-a-uuid'), ctx);
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'Case identifiers are invalid.' });
    expect(db.tx).not.toHaveBeenCalled();
  });

  it('absorbs target SHA collisions and moves only non-colliding source evidence', async () => {
    const sha = 'a'.repeat(64);
    evidenceRows.length = 0;
    evidenceRows.push(
      { id: EV_TARGET, case_id: CASE_B, sha256: sha.toUpperCase(), created_at: '2026-07-01' },
      { id: EV_SOURCE_COPY, case_id: CASE_A, sha256: sha, created_at: '2026-07-02' },
      { id: EV_SOURCE_UNIQUE, case_id: CASE_A, sha256: 'b'.repeat(64), created_at: '2026-07-03' },
    );

    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: CASE_B, movedEvidence: 1 });

    const absorb = txSql.findIndex((s) => /UPDATE evidence AS survivor/i.test(s));
    expect(absorb).toBeGreaterThanOrEqual(0);
    expect(txParams[absorb]).toEqual([EV_TARGET, EV_SOURCE_COPY]);
    expect(txSql[absorb]).toContain('storage_path = COALESCE');
    expect(txSql[absorb]).toContain('image_role_source IS NULL');
    expect(txSql[absorb]).toContain('exclusion_decision_source IS NULL');
    const cancelled = txSql.findIndex((s) =>
      /UPDATE archive_mirror_outbox[\s\S]*completed_generation = requested_generation/i.test(s));
    expect(cancelled).toBeGreaterThan(absorb);
    expect(txParams[cancelled]).toEqual([EV_SOURCE_COPY]);

    const move = txSql.findIndex((s) => /UPDATE evidence\s+SET case_id/i.test(s));
    expect(txParams[move]).toEqual([CASE_A, CASE_B, [EV_SOURCE_COPY]]);
    expect(evidenceRows.find((row) => row.id === EV_SOURCE_COPY)?.case_id).toBe(CASE_A);
    expect(evidenceRows.find((row) => row.id === EV_SOURCE_UNIQUE)?.case_id).toBe(CASE_B);
  });

  it('repoints completed capture assets from redundant same-hash Evidence to the survivor', async () => {
    const sha = '9'.repeat(64);
    const sessionId = '55555555-5555-4555-8555-555555555555';
    const assetId = '66666666-6666-4666-8666-666666666666';
    flags.captureSchemaPresent = true;
    captureSessions.push({
      id: sessionId,
      case_id: CASE_A,
      status: 'complete',
      token_generation: 4,
    });
    captureAssets.push({ id: assetId, session_id: sessionId, evidence_id: EV_SOURCE_COPY });
    evidenceRows.length = 0;
    evidenceRows.push(
      { id: EV_TARGET, case_id: CASE_B, sha256: sha, created_at: '2026-07-01' },
      { id: EV_SOURCE_COPY, case_id: CASE_A, sha256: sha, created_at: '2026-07-02' },
    );

    const response = await merge(request(CASE_B, CASE_A), ctx);

    expect(response.status).toBe(200);
    expect(captureSessions[0]).toMatchObject({
      case_id: CASE_B,
      status: 'complete',
      token_generation: 4,
    });
    expect(captureAssets[0]?.evidence_id).toBe(EV_TARGET);
    expect(evidenceRows.find((row) => row.id === EV_SOURCE_COPY)?.case_id).toBe(CASE_A);
    const assetLock = txSql.findIndex((sql) =>
      /SELECT id FROM capture_asset/i.test(sql) && /FOR UPDATE/i.test(sql));
    const evidenceLock = txSql.findIndex((sql) =>
      /SELECT id, case_id, sha256, created_at/i.test(sql) && /FROM evidence/i.test(sql));
    const assetRepoint = txSql.findIndex((sql) =>
      /UPDATE capture_asset[\s\S]*SET evidence_id = \$2/i.test(sql));
    expect(assetLock).toBeGreaterThanOrEqual(0);
    expect(assetLock).toBeLessThan(evidenceLock);
    expect(assetRepoint).toBeGreaterThan(evidenceLock);
    expect(txParams[assetRepoint]).toEqual([EV_SOURCE_COPY, EV_TARGET, [assetId]]);
  });

  it('requests the survivor mirror when a collision supplies its only blob path', async () => {
    const sha = 'e'.repeat(64);
    evidenceRows.length = 0;
    evidenceRows.push(
      {
        id: EV_TARGET, case_id: CASE_B, sha256: sha, created_at: '2026-07-01',
        excluded: false, storage_path: null, box_file_id: null,
      },
      {
        id: EV_SOURCE_COPY, case_id: CASE_A, sha256: sha, created_at: '2026-07-02',
        excluded: false, storage_path: 'msg/photo.jpg', box_file_id: null,
      },
    );

    await merge(request(CASE_B, CASE_A), ctx);

    const requestIndex = txSql.findIndex((sql) => /INSERT INTO archive_mirror_outbox/i.test(sql));
    expect(requestIndex).toBeGreaterThanOrEqual(0);
    expect(txParams[requestIndex]).toEqual([EV_TARGET, CASE_B]);
  });

  it('moves rebound/content-dedup source ownership so a later survivor dead-letter blocks and retries', async () => {
    const sha = 'f'.repeat(64);
    evidenceRows.length = 0;
    evidenceRows.push(
      {
        id: EV_TARGET, case_id: CASE_B, sha256: sha, created_at: '2026-07-01',
        excluded: false, storage_path: 'target/instruction.pdf', box_file_id: null,
      },
      {
        id: EV_SOURCE_COPY, case_id: CASE_A, sha256: sha, created_at: '2026-07-02',
        excluded: false, storage_path: 'source/instruction.pdf', box_file_id: null,
      },
      {
        id: EV_SOURCE_UNIQUE, case_id: CASE_A, sha256: 'e'.repeat(64), created_at: '2026-07-03',
        excluded: false, storage_path: 'source/extra.pdf', box_file_id: null,
      },
    );
    manualOperations.push({
      case_id: CASE_A,
      expected_file_count: 1,
      evidence_completed_at: new Date(),
      side_effects_completed_at: new Date(),
      upload_idempotency_key: 'manual-upload-new',
    });
    staffUploads.push(
      { idempotency_key: 'manual-upload-old', case_id: CASE_A, source: 'manual_intake' },
      { idempotency_key: 'manual-upload-new', case_id: CASE_A, source: 'manual_intake' },
    );
    staffUploadItems.push(
      {
        idempotency_key: 'manual-upload-old', case_id: CASE_A,
        evidence_id: EV_SOURCE_COPY,
      },
      {
        idempotency_key: 'manual-upload-new', case_id: CASE_A,
        evidence_id: EV_SOURCE_UNIQUE,
      },
    );

    const merged = await merge(request(CASE_B, CASE_A), ctx);
    expect(merged.status).toBe(200);
    expect(manualOperations.every((row) => row.case_id === CASE_B)).toBe(true);
    expect(staffUploads.every((row) => row.case_id === CASE_B)).toBe(true);
    expect(staffUploadItems.every((row) => row.case_id === CASE_B)).toBe(true);
    expect(staffUploadItems.find((row) => row.idempotency_key === 'manual-upload-old')?.evidence_id)
      .toBe(EV_TARGET);
    const batchTransfer = txSql.findIndex((sql) =>
      /UPDATE staff_evidence_upload\s+SET case_id = \$2/i.test(sql));
    const itemTransfer = txSql.findIndex((sql) =>
      /UPDATE staff_evidence_upload_item\s+SET case_id = \$2[\s\S]*WHERE case_id = \$1/i.test(sql));
    expect(batchTransfer).toBeGreaterThanOrEqual(0);
    expect(itemTransfer).toBeGreaterThan(batchTransfer);

    // The failure happens after merge. The old/rebound item now resolves through
    // the survivor evidence and therefore blocks the survivor, not the retired row.
    archiveOutbox.push({
      evidence_id: EV_TARGET,
      case_id: CASE_B,
      requested_generation: 2,
      completed_generation: 1,
      dead_lettered_at: new Date(),
    });
    const source = await manualIntakeEvidenceState(db.txQuery, CASE_B);
    expect(source).toEqual({ pending: false, archiveFailed: true });
    const evaFields = Object.fromEntries(EVA_FIELD_ORDER.map(({ key }) => [
      key,
      { value: key === 'inspectionAddress' ? '1 Test Road' : 'Complete', reviewState: 'reviewed' },
    ])) as any;
    expect(statusForReviewCase({
      status: 'ready_for_eva',
      evaFields,
      inspectionDecision: 'confirmed_physical',
      evidence: [
        {
          kind: 'image', imageRole: 'overview', registrationVisible: true,
          acceptedForEva: true, excluded: false,
        },
        {
          kind: 'image', imageRole: 'damage_closeup', registrationVisible: false,
          acceptedForEva: true, excluded: false,
        },
      ],
      hasIdentity: true,
      sourceEvidencePending: source.pending,
      sourceEvidenceArchiveFailed: source.archiveFailed,
    })).toBe('needs_review');

    const retried = await retryManualArchive(
      { params: { id: CASE_B }, json: async () => ({}) } as unknown as HttpRequest,
      ctx,
    );
    expect(retried).toMatchObject({ status: 200, jsonBody: { requeued: 1 } });
    expect(await manualIntakeEvidenceState(db.txQuery, CASE_B)).toEqual({
      pending: false,
      archiveFailed: false,
    });
  });

  it('moves one deterministic source SHA survivor and leaves later source twins retired', async () => {
    const sha = 'c'.repeat(64);
    evidenceRows.length = 0;
    evidenceRows.push(
      { id: EV_SOURCE_COPY, case_id: CASE_A, sha256: sha, created_at: '2026-07-01' },
      { id: EV_SOURCE_SECOND, case_id: CASE_A, sha256: sha.toUpperCase(), created_at: '2026-07-02' },
      { id: EV_SOURCE_UNIQUE, case_id: CASE_A, sha256: 'd'.repeat(64), created_at: '2026-07-03' },
    );

    const res = await merge(request(CASE_B, CASE_A), ctx);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: CASE_B, movedEvidence: 2 });

    const absorb = txSql.findIndex((s) => /UPDATE evidence AS survivor/i.test(s));
    expect(txParams[absorb]).toEqual([EV_SOURCE_COPY, EV_SOURCE_SECOND]);
    const move = txSql.findIndex((s) => /UPDATE evidence\s+SET case_id/i.test(s));
    expect(txParams[move]).toEqual([CASE_A, CASE_B, [EV_SOURCE_SECOND]]);
    expect(evidenceRows.find((row) => row.id === EV_SOURCE_COPY)?.case_id).toBe(CASE_B);
    expect(evidenceRows.find((row) => row.id === EV_SOURCE_SECOND)?.case_id).toBe(CASE_A);
  });

  it('returns merge success when the immediate status fast path fails', async () => {
    db.query.mockRejectedValueOnce(new Error('status read unavailable'));
    const res = await merge(request(CASE_B, CASE_A), ctx);

    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ targetCaseId: CASE_B, movedEvidence: 1 });
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringContaining('readiness recompute remains pending'));
    expect(
      txSql.some((s) =>
        /status_recompute_requested_generation = status_recompute_requested_generation \+ 1/i.test(s),
      ),
    ).toBe(true);
  });
});
