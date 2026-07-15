/**
 * services/data-api/src/features/assistant/suggestion-review-routes.test.ts — OFFLINE acceptance proof for the TKT-015 generic
 * generate route (`POST /api/cases/{id}/ai-suggestions/generate`) with the model call WIRED. No
 * Functions host, no Postgres, no network: `@azure/functions` registration is captured, `db`/`audit`
 * are mocked, and the model (`callSuggestionModel`) is a controllable double.
 *
 * Pins the acceptance:
 *   (a) gate OFF or model-unconfigured → { generated: 0, reason: 'disabled' } — NO model call, NO DB write;
 *   (b) gate ON + configured + strict-JSON drafts → persisted as ai_suggestion rows carrying
 *       model_version + confidence, review_state left to the DB DEFAULT 'pending', ai_suggestion_created audited;
 *   (c) a failed/malformed model response (callSuggestionModel throws) → { generated: 0, reason: 'error' }, no partial write;
 *   (d) the NO-SILENT-MUTATION invariant: the generate path issues ONLY INSERT ai_suggestion (never an
 *       UPDATE to evidence/case_/inbound_email) — promotion is exclusively the human review route.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// auth.ts / mappers are pulled in transitively; give them the env they read at import.
vi.hoisted(() => {
  process.env.ENTRA_TENANT_ID = '858cf5b3-1111-2222-3333-444455556666';
  process.env.API_AUDIENCE = 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72';
});

/* ---- @azure/functions: capture registrations (no Functions host) ---- */
interface Reg { handler: (req: HttpRequest, ctx: InvocationContext, claims: unknown) => Promise<HttpResponseInit> }
const registrations = vi.hoisted(() => new Map<string, Reg>());
const timerRegistrations = vi.hoisted(() => new Set<string>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, opts: Reg) => { registrations.set(name, opts); },
    timer: (name: string) => timerRegistrations.add(name),
  },
}));

/* ---- auth: withRole passthrough (the bearer gate is exercised by auth.test.ts) ---- */
vi.mock('../../platform/auth/staff-auth.js', () => ({ withRole: (_r: string, h: unknown) => h }));

/* ---- the model call: a controllable double so the route is isolated from the network ---- */
const model = vi.hoisted(() => ({ callSuggestionModel: vi.fn() }));
vi.mock('./suggestion-client.js', () => ({ callSuggestionModel: model.callSuggestionModel }));

/* ---- db: record every SQL + params; canned rows per statement ---- */
const sqls: string[] = [];
const params: unknown[][] = [];
const rowsFor = vi.fn<(sql: string, p?: unknown[]) => Record<string, unknown>[]>(() => []);
const txMock = vi.hoisted(() => vi.fn());
vi.mock('../../platform/db/client.js', () => ({
  query: vi.fn(async (sql: string, p?: unknown[]) => { sqls.push(sql); params.push(p ?? []); return rowsFor(sql, p); }),
  getPool: vi.fn(),
  tx: txMock,
}));
vi.mock('../cases/mutation-locks.js', () => ({
  lockCaseForMutation: vi.fn(async (_q: unknown, caseId: string) => ({
    kind: 'active',
    caseId,
  })),
}));

/* ---- audit: keep AUDIT_ACTION + actorFromClaims real; spy writeAudit ---- */
const auditCalls = vi.hoisted(() => [] as Array<{ action: number }>);
vi.mock('../../shared/audit.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, writeAudit: vi.fn(async (a: { action: number }) => { auditCalls.push(a); }) };
});

/* ---- internal.js: mock the TKT-023 chaser hook (avoid loading the whole internal
        route module; the hook's own behaviour is pinned in internal-guards.test.ts) ---- */
const chaserHook = vi.hoisted(() => ({ markOutstandingChasersResponded: vi.fn(async () => 1) }));
vi.mock('../inbound/internal/service-support.js', () => ({
  markOutstandingChasersResponded: chaserHook.markOutstandingChasersResponded,
}));

/* ---- evidence-backfill queue (TKT-145): a controllable double — the real module needs a
        managed identity; its enqueue mechanics are outlook-queue.ts's, pinned there ---- */
const backfill = vi.hoisted(() => ({ enqueueEvidenceBackfill: vi.fn(async () => {}) }));
vi.mock('../evidence/backfill-queue.js', () => ({
  enqueueEvidenceBackfill: backfill.enqueueEvidenceBackfill,
  EVIDENCE_BACKFILL_QUEUE_NAME: 'evidence-backfill',
}));

await import('./register-suggestion-routes.js');
const aiSuggestions = await import('./evidence-backfill.js');
const review = registrations.get('reviewAiSuggestion')!.handler;
const { drainEvidenceBackfillRequests } = aiSuggestions;

const CASE_ROW = { vrm: 'WN14XPZ', eva_accident_circumstances: 'Struck from behind at lights.', eva_claimant_address: 'redacted' };

// The route logs every outcome (TKT-127 telemetry) — give it real log/error spies.
const ctx = { log: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

it('does not rely on a plain FC1 timer to recover pending evidence-backfill publications', () => {
  expect(timerRegistrations.has('evidence-backfill-request-drain')).toBe(false);
});

beforeEach(() => {
  sqls.length = 0;
  params.length = 0;
  auditCalls.length = 0;
  chaserHook.markOutstandingChasersResponded.mockClear();
  backfill.enqueueEvidenceBackfill.mockReset();
  backfill.enqueueEvidenceBackfill.mockResolvedValue(undefined);
  model.callSuggestionModel.mockReset();
  (ctx.log as unknown as ReturnType<typeof vi.fn>).mockReset();
  (ctx.error as unknown as ReturnType<typeof vi.fn>).mockReset();
  rowsFor.mockReset();
  rowsFor.mockImplementation((sql: string) => {
    if (/FROM case_/i.test(sql)) return [CASE_ROW];
    if (/INSERT INTO ai_suggestion/i.test(sql)) return [{ id: 'sug-1' }];
    return [];
  });
  process.env.AI_MODEL_ENDPOINT = 'https://digital-3339-resource.openai.azure.com/';
  process.env.AI_MODEL_DEPLOYMENT = 'gpt-5';
});
afterEach(() => {
  delete process.env.AI_ASSIST_ENABLED;
  delete process.env.AI_MODEL_ENDPOINT;
  delete process.env.AI_MODEL_DEPLOYMENT;
});

function reviewReq(decision = 'accepted'): HttpRequest {
  return { params: { id: 'sug-1' }, json: async () => ({ decision }) } as unknown as HttpRequest;
}

const IMAGE_ROLE_ROW = {
  id: 'sug-1',
  case_id: 'case-1',
  evidence_id: 'ev-1',
  inbound_email_id: null,
  suggestion_type: 'image_role',
  suggested_value: { role: 'overview' },
  review_state: 'pending',
};

const REGISTRATION_ROW = {
  ...IMAGE_ROLE_ROW,
  suggestion_type: 'registration',
  suggested_value: { visible: true },
};

describe('reviewAiSuggestion — atomic readiness promotion', () => {
  it('CAS-overwrites a classifier race, converts ownership, and durably schedules an eligible archive mirror', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM ai_suggestion[\s\S]*WHERE id/i.test(sql)) return [IMAGE_ROLE_ROW];
      if (/SELECT case_id FROM evidence/i.test(sql)) return [{ case_id: 'case-1' }];
      if (/SELECT id FROM evidence/i.test(sql)) return [{ id: 'ev-1' }];
      if (/UPDATE evidence/i.test(sql)) return [{
        id: 'ev-1',
        case_id: 'case-1',
        excluded: false,
        storage_path: 'msg-1/photo.jpg',
        box_file_id: null,
      }];
      if (/INSERT INTO archive_mirror_outbox/i.test(sql)) {
        return [{ requested_generation: '1' }];
      }
      if (/UPDATE case_/i.test(sql)) return [{ status_recompute_requested_generation: '8' }];
      if (/UPDATE ai_suggestion/i.test(sql)) return [{ id: 'sug-1', review_state: 'accepted' }];
      return [];
    });

    const response = await review(reviewReq(), ctx, {});

    expect(response.jsonBody).toMatchObject({
      reviewState: 'accepted',
      promoted: true,
      promotedField: 'evidence.image_role_code',
    });
    expect(txMock).toHaveBeenCalledTimes(1);
    const evidenceSql = sqls.find((sql) => /UPDATE evidence/i.test(sql))!;
    expect(evidenceSql).toContain("image_role_source = 'staff'");
    expect(evidenceSql).toContain("accepted_for_eva_source = 'staff'");
    expect(evidenceSql).toContain("exclusion_decision_source = 'classifier'");
    expect(evidenceSql).toContain(
      "image_role_source IS NULL OR image_role_source = 'classifier'",
    );
    expect(evidenceSql).toContain(
      "accepted_for_eva_source IS NULL OR accepted_for_eva_source = 'classifier'",
    );
    expect(evidenceSql).not.toContain('image_role_code = $3');
    const outboxSql = sqls.find((sql) => /INSERT INTO archive_mirror_outbox/i.test(sql))!;
    expect(outboxSql).toContain(
      'requested_generation = archive_mirror_outbox.requested_generation + 1',
    );
    expect(params[sqls.indexOf(outboxSql)]).toEqual(['ev-1', 'case-1']);
    expect(sqls.some((sql) => /UPDATE case_[\s\S]*status_recompute_requested_generation/.test(sql))).toBe(true);
    expect(sqls.findIndex((sql) => /UPDATE evidence/i.test(sql))).toBeLessThan(
      sqls.findIndex((sql) => /UPDATE ai_suggestion/i.test(sql)),
    );
  });

  it('accepts a registration suggestion with staff ownership and status work in the same transaction', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM ai_suggestion[\s\S]*WHERE id/i.test(sql)) return [REGISTRATION_ROW];
      if (/SELECT case_id FROM evidence/i.test(sql)) return [{ case_id: 'case-1' }];
      if (/SELECT id FROM evidence/i.test(sql)) return [{ id: 'ev-1' }];
      if (/UPDATE evidence/i.test(sql)) return [{ id: 'ev-1', case_id: 'case-1' }];
      if (/UPDATE case_/i.test(sql)) return [{ status_recompute_requested_generation: 9 }];
      if (/UPDATE ai_suggestion/i.test(sql)) return [{ id: 'sug-1', review_state: 'accepted' }];
      return [];
    });

    const response = await review(reviewReq(), ctx, {});
    expect(response.jsonBody).toMatchObject({
      promoted: true,
      promotedField: 'evidence.registration_visible',
    });
    expect(sqls.find((sql) => /UPDATE evidence/i.test(sql))).toContain(
      "registration_visible_source = 'staff'",
    );
    expect(sqls.find((sql) => /UPDATE evidence/i.test(sql))).toContain(
      "registration_visible_source = 'classifier'",
    );
    expect(sqls.find((sql) => /UPDATE evidence/i.test(sql))).not.toContain(
      'registration_visible IS NULL',
    );
  });

  it.each([
    ['image role', IMAGE_ROLE_ROW],
    ['registration', REGISTRATION_ROW],
  ])('returns a conflict and leaves %s pending when a protected owner wins', async (_label, suggestion) => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM ai_suggestion[\s\S]*WHERE id/i.test(sql)) return [suggestion];
      if (/SELECT case_id FROM evidence/i.test(sql)) return [{ case_id: 'case-1' }];
      if (/SELECT id FROM evidence/i.test(sql)) return [{ id: 'ev-1' }];
      if (/UPDATE evidence/i.test(sql)) return []; // staff/provider/cleanup/legacy CAS miss
      return [];
    });

    const response = await review(reviewReq(), ctx, {});

    expect(response.status).toBe(409);
    expect(response.jsonBody).toEqual({
      error: 'suggestion target changed; refresh and review again',
    });
    expect(sqls.some((sql) => /UPDATE ai_suggestion/i.test(sql))).toBe(false);
    expect(sqls.some((sql) => /status_recompute_requested_generation/.test(sql))).toBe(false);
    expect(auditCalls).toHaveLength(0);
  });

  it('leaves the suggestion pending/retryable when evidence promotion fails', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM ai_suggestion[\s\S]*WHERE id/i.test(sql)) return [IMAGE_ROLE_ROW];
      if (/SELECT case_id FROM evidence/i.test(sql)) return [{ case_id: 'case-1' }];
      if (/SELECT id FROM evidence/i.test(sql)) return [{ id: 'ev-1' }];
      if (/UPDATE evidence/i.test(sql)) throw new Error('evidence write failed');
      return [];
    });

    await expect(review(reviewReq(), ctx, {})).rejects.toThrow('evidence write failed');
    expect(sqls.some((sql) => /UPDATE ai_suggestion/i.test(sql))).toBe(false);
    expect(auditCalls).toHaveLength(0);
  });
});

const CASE_LINK_ROW = {
  id: 'sug-1',
  case_id: null,
  evidence_id: null,
  inbound_email_id: 'ie-1',
  suggestion_type: 'case_link',
  suggested_value: { targetCaseId: 'case-target' },
  review_state: 'pending',
};

describe('reviewAiSuggestion — TKT-023 case_link accept marks outstanding chasers responded', () => {
  it('a successful case_link promotion calls markOutstandingChasersResponded(targetCaseId, "suggestion accepted")', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM ai_suggestion WHERE id/i.test(sql)) return [CASE_LINK_ROW];
      if (/UPDATE ai_suggestion/i.test(sql)) return [{ id: 'sug-1', review_state: 'accepted' }];
      if (/UPDATE inbound_email/i.test(sql)) return [{ id: 'ie-1' }]; // FILL-IF-EMPTY hit
      return [];
    });
    const res = await review(reviewReq(), ctx, {});
    expect(res.jsonBody).toMatchObject({ reviewState: 'accepted', promoted: true });
    expect(chaserHook.markOutstandingChasersResponded).toHaveBeenCalledTimes(1);
    expect(chaserHook.markOutstandingChasersResponded).toHaveBeenCalledWith(
      'case-target',
      'suggestion accepted',
    );
  });

  it('a no-op promotion (email already linked — FILL-IF-EMPTY miss) does NOT touch chasers', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM ai_suggestion WHERE id/i.test(sql)) return [CASE_LINK_ROW];
      if (/UPDATE ai_suggestion/i.test(sql)) return [{ id: 'sug-1', review_state: 'accepted' }];
      if (/UPDATE inbound_email/i.test(sql)) return []; // case_id already set — no attach
      return [];
    });
    const res = await review(reviewReq(), ctx, {});
    expect(res.jsonBody).toMatchObject({ reviewState: 'accepted', promoted: false });
    expect(chaserHook.markOutstandingChasersResponded).not.toHaveBeenCalled();
  });

  it('a rejection never touches chasers', async () => {
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM ai_suggestion WHERE id/i.test(sql)) return [CASE_LINK_ROW];
      if (/UPDATE ai_suggestion/i.test(sql)) return [{ id: 'sug-1', review_state: 'rejected' }];
      return [];
    });
    const res = await review(reviewReq('rejected'), ctx, {});
    expect(res.jsonBody).toMatchObject({ reviewState: 'rejected', promoted: false });
    expect(chaserHook.markOutstandingChasersResponded).not.toHaveBeenCalled();
  });
});

/* ============================================================
   PR46 / #53 + PR46 idempotency — re-incorporated on the stack merge so the
   operator-adjudicated "keep the claimant address" decision and the idempotent-insert
   guard stay pinned alongside the TKT-127/132 generate contract above.
   ============================================================ */

/* ============================================================
   TKT-145 — accepted case_link on an attachment-bearing, previously-uncased
   email ENQUEUES the evidence backfill (strictly after the link commit) and
   the "attach by hand" note INVERTS to the enqueue-failure fallback only.
   Double-accept safety: a re-review is idempotent (no re-promote), so the
   backfill is enqueued at most once per suggestion; the evidence-route side
   of double-delivery is TKT-133's (case_id, sha256) dedup
   (internal-evidence-dedup.test.ts), deliberately not rebuilt here.
   ============================================================ */

const noteSqls = (): string[] => sqls.filter((s) => /INSERT INTO note/i.test(s));

/** The case_link row whose inbound email carries attachments + mailbox provenance. */
const ATTACHED_LINK_UPDATE_ROW = {
  id: 'ie-1',
  has_attachments: true,
  source_mailbox: 'info@collisionengineers.co.uk',
  source_message_id: '<lead-123@tractable.ai>',
  subject: 'New completed lead for Collision Engineers',
};

function linkRows(updRow: Record<string, unknown> | null, reviewState = 'pending') {
  let linked = false;
  return (sql: string): Record<string, unknown>[] => {
    if (/FROM ai_suggestion WHERE id/i.test(sql)) return [{ ...CASE_LINK_ROW, review_state: reviewState }];
    if (/UPDATE ai_suggestion/i.test(sql)) return [{ id: 'sug-1', review_state: 'accepted' }];
    if (/UPDATE inbound_email[\s\S]*SET case_id/i.test(sql)) {
      linked = Boolean(updRow);
      return updRow ? [{ ...updRow, evidence_backfill_requested_generation: 1 }] : [];
    }
    if (/SELECT NULLIF\(btrim\(s\.suggested_value/i.test(sql)) {
      return [{ target_case_id: 'case-target' }];
    }
    if (/SELECT ie\.id, ie\.case_id/i.test(sql)) {
      const sourceMailbox = updRow?.source_mailbox;
      const sourceMessageId = updRow?.source_message_id;
      return linked && updRow?.has_attachments === true && sourceMailbox && sourceMessageId
        ? [{
            id: 'ie-1',
            case_id: 'case-target',
            target_case_id: 'case-target',
            source_mailbox: sourceMailbox,
            source_message_id: sourceMessageId,
            subject: updRow.subject ?? null,
            evidence_backfill_requested_generation: 1,
            evidence_backfill_enqueued_generation: 0,
          }]
        : [];
    }
    return [];
  };
}

describe('reviewAiSuggestion — TKT-145 case_link accept enqueues the evidence backfill', () => {
  it('reconciles the valid accepted target when a newer unrelated no-op acceptance also exists', async () => {
    let legacyPromoted = false;
    let enqueued = false;
    rowsFor.mockImplementation((sql: string, queryParams?: unknown[]) => {
      if (/evidence_backfill_requested_generation = 0/i.test(sql) && /FROM inbound_email ie/i.test(sql) && !legacyPromoted) {
        return [{
          id: 'ie-legacy',
          case_id: 'case-b',
          source_mailbox: 'info@collisionengineers.co.uk',
          source_message_id: '<legacy@message>',
          subject: 'Legacy accepted link',
          evidence_backfill_requested_generation: 0,
          evidence_backfill_enqueued_generation: 0,
        }];
      }
      if (/SELECT NULLIF\(btrim\(s\.suggested_value/i.test(sql)) {
        // Newer A was accepted as a no-op after the row was already linked. Older B
        // is the valid acceptance that actually owns the inbound row.
        return [{ target_case_id: 'case-a' }, { target_case_id: 'case-b' }];
      }
      if (/SELECT id, duplicate_keys FROM case_/i.test(sql)) {
        const id = String(queryParams?.[0] ?? '');
        return [{ id, duplicate_keys: null }];
      }
      if (/SET evidence_backfill_requested_generation = 1/i.test(sql)) {
        legacyPromoted = true;
        return [];
      }
      if (/SELECT ie\.id, ie\.case_id/i.test(sql) && !enqueued && legacyPromoted) {
        return [{
          id: 'ie-legacy',
          case_id: 'case-b',
          source_mailbox: 'info@collisionengineers.co.uk',
          source_message_id: '<legacy@message>',
          subject: 'Legacy accepted link',
          evidence_backfill_requested_generation: 1,
          evidence_backfill_enqueued_generation: 0,
        }];
      }
      if (/evidence_backfill_enqueued_generation = GREATEST/i.test(sql)) enqueued = true;
      return [];
    });

    expect(await drainEvidenceBackfillRequests('ie-legacy', 1)).toEqual({ published: 1, failed: 0 });
    expect(backfill.enqueueEvidenceBackfill).toHaveBeenCalledTimes(1);
    expect(backfill.enqueueEvidenceBackfill).toHaveBeenCalledWith(expect.objectContaining({
      inboundEmailId: 'ie-legacy',
      generation: 1,
      targetCaseId: 'case-b',
    }));
    // The enqueue acknowledgement is guarded against the CURRENT merged owner B.
    expect(params.some((p) => p[0] === 'ie-legacy' && p[1] === 1 && p[2] === 'case-b')).toBe(true);

    expect(await drainEvidenceBackfillRequests('ie-legacy', 1)).toEqual({ published: 0, failed: 0 });
    expect(backfill.enqueueEvidenceBackfill).toHaveBeenCalledTimes(1);
  });

  it('pages past a full poison page of lineage-ineligible legacy rows', async () => {
    let legacyPage = 0;
    let promoted = false;
    let enqueued = false;
    const invalidRows = Array.from({ length: 50 }, (_, index) => ({
      id: `invalid-${String(index).padStart(2, '0')}`,
      case_id: 'case-current',
      source_mailbox: 'info@collisionengineers.co.uk',
      source_message_id: `<invalid-${index}@message>`,
      subject: 'Invalid old link',
      evidence_backfill_requested_generation: 0,
      evidence_backfill_enqueued_generation: 0,
      scan_updated_at: new Date(2026, 0, 1, 0, index).toISOString(),
    }));
    const validRow = {
      id: 'valid-after-poison-page',
      case_id: 'case-current',
      source_mailbox: 'info@collisionengineers.co.uk',
      source_message_id: '<valid@message>',
      subject: 'Valid old link',
      evidence_backfill_requested_generation: 0,
      evidence_backfill_enqueued_generation: 0,
      scan_updated_at: new Date(2026, 0, 2).toISOString(),
    };
    rowsFor.mockImplementation((sql: string, queryParams?: unknown[]) => {
      if (/evidence_backfill_requested_generation = 0/i.test(sql) && /FROM inbound_email ie/i.test(sql)) {
        legacyPage++;
        if (legacyPage === 1) return invalidRows;
        if (legacyPage === 2 && !promoted) return [validRow];
        return [];
      }
      if (/SELECT NULLIF\(btrim\(s\.suggested_value/i.test(sql)) {
        return [{
          target_case_id: queryParams?.[0] === validRow.id ? 'case-current' : 'case-unrelated',
        }];
      }
      if (/SELECT id, duplicate_keys FROM case_/i.test(sql)) {
        const id = String(queryParams?.[0] ?? '');
        return [{ id, duplicate_keys: null }];
      }
      if (/SET evidence_backfill_requested_generation = 1/i.test(sql)) {
        promoted = true;
        return [{ id: validRow.id }];
      }
      if (/evidence_backfill_requested_generation > ie\.evidence_backfill_enqueued_generation/i.test(sql)) {
        return promoted && !enqueued
          ? [{ ...validRow, evidence_backfill_requested_generation: 1 }]
          : [];
      }
      if (/evidence_backfill_enqueued_generation = GREATEST/i.test(sql)) enqueued = true;
      return [];
    });

    expect(await drainEvidenceBackfillRequests(undefined, 1)).toEqual({ published: 1, failed: 0 });
    expect(legacyPage).toBe(2);
    expect(backfill.enqueueEvidenceBackfill).toHaveBeenCalledOnce();
    expect(backfill.enqueueEvidenceBackfill).toHaveBeenCalledWith(expect.objectContaining({
      inboundEmailId: validRow.id,
      targetCaseId: 'case-current',
    }));
  });

  it('binds later generations to an accepted target and follows only its real merge lineage', async () => {
    let merged = false;
    let enqueued = false;
    rowsFor.mockImplementation((sql: string, queryParams?: unknown[]) => {
      if (/evidence_backfill_requested_generation = 0/i.test(sql) && /FROM inbound_email ie/i.test(sql)) {
        return [];
      }
      if (/evidence_backfill_requested_generation > ie\.evidence_backfill_enqueued_generation/i.test(sql)) {
        return enqueued ? [] : [{
          id: 'ie-generation-2',
          case_id: 'case-c',
          source_mailbox: 'info@collisionengineers.co.uk',
          source_message_id: '<generation-2@message>',
          subject: 'Later accepted link',
          evidence_backfill_requested_generation: 2,
          evidence_backfill_enqueued_generation: 1,
        }];
      }
      if (/SELECT NULLIF\(btrim\(s\.suggested_value/i.test(sql)) {
        return [{ target_case_id: 'case-b' }];
      }
      if (/SELECT id, duplicate_keys FROM case_/i.test(sql)) {
        const id = String(queryParams?.[0] ?? '');
        return [{
          id,
          duplicate_keys: merged && id === 'case-b' ? { mergedInto: 'case-c' } : null,
        }];
      }
      if (/evidence_backfill_enqueued_generation = GREATEST/i.test(sql)) enqueued = true;
      return [];
    });

    // Manual B→unrelated-C relink: do not publish or permanently acknowledge gen 2.
    expect(await drainEvidenceBackfillRequests('ie-generation-2', 1)).toEqual({ published: 0, failed: 0 });
    expect(backfill.enqueueEvidenceBackfill).not.toHaveBeenCalled();
    expect(enqueued).toBe(false);

    // A real B→merged-C lineage preserves the accepted target; the consumer resolves C.
    merged = true;
    expect(await drainEvidenceBackfillRequests('ie-generation-2', 1)).toEqual({ published: 1, failed: 0 });
    expect(backfill.enqueueEvidenceBackfill).toHaveBeenCalledWith(expect.objectContaining({
      generation: 2,
      targetCaseId: 'case-b',
    }));
    expect(params.some((p) => p[0] === 'ie-generation-2' && p[1] === 2 && p[2] === 'case-c')).toBe(true);
  });

  it('accept → ONE enqueue with the exact job (after the link commit); NO manual note', async () => {
    rowsFor.mockImplementation(linkRows(ATTACHED_LINK_UPDATE_ROW));
    // Enqueue-after-commit ordering: when the enqueue fires, the inbound_email UPDATE
    // must already have been issued (the link is committed — each query auto-commits).
    let updateCommittedFirst = false;
    backfill.enqueueEvidenceBackfill.mockImplementation(async () => {
      updateCommittedFirst = sqls.some((s) => /UPDATE inbound_email/i.test(s));
    });

    const res = await review(reviewReq(), ctx, {});
    expect(res.jsonBody).toMatchObject({ reviewState: 'accepted', promoted: true });
    expect(backfill.enqueueEvidenceBackfill).toHaveBeenCalledTimes(1);
    expect(backfill.enqueueEvidenceBackfill).toHaveBeenCalledWith({
      inboundEmailId: 'ie-1',
      generation: 1,
      sourceMailbox: 'info@collisionengineers.co.uk',
      sourceMessageId: '<lead-123@tractable.ai>',
      targetCaseId: 'case-target',
      subject: 'New completed lead for Collision Engineers',
    });
    expect(updateCommittedFirst).toBe(true);
    // The inversion: a QUEUED backfill writes no "attach by hand" note.
    expect(noteSqls()).toHaveLength(0);
  });

  it('enqueue failure leaves the durable generation pending and the accept still succeeds', async () => {
    rowsFor.mockImplementation(linkRows(ATTACHED_LINK_UPDATE_ROW));
    backfill.enqueueEvidenceBackfill.mockRejectedValue(new Error('evidence-backfill enqueue → 404: QueueNotFound'));

    const res = await review(reviewReq(), ctx, {});
    // A backfill failure must NEVER unwind or fail the accept itself.
    expect(res.jsonBody).toMatchObject({ reviewState: 'accepted', promoted: true });
    expect(noteSqls()).toHaveLength(0);
    expect(sqls.some((sql) => /evidence_backfill_requested_generation = CASE/i.test(sql))).toBe(true);
    expect(sqls.some((sql) => /evidence_backfill_enqueued_generation = GREATEST/i.test(sql))).toBe(false);
  });

  it('NO mailbox provenance (retro/synthetic row) → no enqueue; the note degrades in directly', async () => {
    rowsFor.mockImplementation(
      linkRows({ id: 'ie-1', has_attachments: true, source_mailbox: null, source_message_id: null, subject: null }),
    );
    const res = await review(reviewReq(), ctx, {});
    expect(res.jsonBody).toMatchObject({ reviewState: 'accepted', promoted: true });
    expect(backfill.enqueueEvidenceBackfill).not.toHaveBeenCalled();
    expect(noteSqls()).toHaveLength(1);
  });
  txMock.mockReset();
  txMock.mockImplementation(
    async (
      fn: (
        q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>,
      ) => Promise<unknown>,
    ) =>
      fn(async (sql: string, p?: unknown[]) => {
        sqls.push(sql);
        params.push(p ?? []);
        return rowsFor(sql, p);
      }),
  );

  it('enqueue failure never unwinds the accepted link', async () => {
    rowsFor.mockImplementation(linkRows(ATTACHED_LINK_UPDATE_ROW));
    backfill.enqueueEvidenceBackfill.mockRejectedValue(new Error('queue unavailable'));
    const res = await review(reviewReq(), ctx, {});
    expect(res.jsonBody).toMatchObject({ reviewState: 'accepted', promoted: true });
    expect(sqls.some((s) => /UPDATE inbound_email/i.test(s))).toBe(true);
  });

  it('has_attachments FALSE → neither enqueue nor note (nothing to backfill)', async () => {
    rowsFor.mockImplementation(
      linkRows({ id: 'ie-1', has_attachments: false, source_mailbox: 'info@collisionengineers.co.uk', source_message_id: '<x@y>', subject: 's' }),
    );
    const res = await review(reviewReq(), ctx, {});
    expect(res.jsonBody).toMatchObject({ reviewState: 'accepted', promoted: true });
    expect(backfill.enqueueEvidenceBackfill).not.toHaveBeenCalled();
    expect(noteSqls()).toHaveLength(0);
  });

  it('DOUBLE ACCEPT → the second review is idempotent (no re-promote) so no second enqueue', async () => {
    rowsFor.mockImplementation(linkRows(ATTACHED_LINK_UPDATE_ROW));
    const first = await review(reviewReq(), ctx, {});
    expect(first.jsonBody).toMatchObject({ reviewState: 'accepted', promoted: true });

    // Second accept: the row is no longer pending — the route returns idempotently
    // WITHOUT re-promoting, so the backfill cannot be enqueued twice (and therefore no
    // duplicate evidence rows can even be requested; the queue-replay side is TKT-133).
    rowsFor.mockImplementation(linkRows(ATTACHED_LINK_UPDATE_ROW, 'accepted'));
    const second = await review(reviewReq(), ctx, {});
    expect(second.jsonBody).toMatchObject({ reviewState: 'accepted', promoted: false });
    expect(backfill.enqueueEvidenceBackfill).toHaveBeenCalledTimes(1);
    expect(noteSqls()).toHaveLength(0);
  });

  it('an accepted link whose first publish crashed is recovered by idempotent re-review', async () => {
    let reviewState = 'pending';
    let linked = false;
    let enqueued = false;
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM ai_suggestion WHERE id/i.test(sql)) {
        return [{ ...CASE_LINK_ROW, review_state: reviewState }];
      }
      if (/UPDATE ai_suggestion/i.test(sql)) {
        reviewState = 'accepted';
        return [{ id: 'sug-1', review_state: 'accepted' }];
      }
      if (/UPDATE inbound_email[\s\S]*SET case_id/i.test(sql)) {
        linked = true;
        return [{ ...ATTACHED_LINK_UPDATE_ROW, evidence_backfill_requested_generation: 1 }];
      }
      if (/SELECT NULLIF\(btrim\(s\.suggested_value/i.test(sql)) {
        return [{ target_case_id: 'case-target' }];
      }
      if (/SELECT ie\.id, ie\.case_id/i.test(sql)) {
        return linked && !enqueued ? [{
          id: 'ie-1',
          case_id: 'case-target',
          target_case_id: 'case-target',
          source_mailbox: ATTACHED_LINK_UPDATE_ROW.source_mailbox,
          source_message_id: ATTACHED_LINK_UPDATE_ROW.source_message_id,
          subject: ATTACHED_LINK_UPDATE_ROW.subject,
          evidence_backfill_requested_generation: 1,
          evidence_backfill_enqueued_generation: 0,
        }] : [];
      }
      if (/evidence_backfill_enqueued_generation = GREATEST/i.test(sql)) enqueued = true;
      return [];
    });
    backfill.enqueueEvidenceBackfill
      .mockRejectedValueOnce(new Error('worker recycled after commit'))
      .mockResolvedValueOnce(undefined);

    expect((await review(reviewReq(), ctx, {})).jsonBody).toMatchObject({
      reviewState: 'accepted', promoted: true,
    });
    expect(enqueued).toBe(false);

    expect((await review(reviewReq(), ctx, {})).jsonBody).toMatchObject({
      reviewState: 'accepted', promoted: false,
    });
    expect(backfill.enqueueEvidenceBackfill).toHaveBeenCalledTimes(2);
    expect(enqueued).toBe(true);
  });

  it('FILL-IF-EMPTY miss (email already linked) → no enqueue, no note', async () => {
    rowsFor.mockImplementation(linkRows(null));
    const res = await review(reviewReq(), ctx, {});
    expect(res.jsonBody).toMatchObject({ reviewState: 'accepted', promoted: false });
    expect(backfill.enqueueEvidenceBackfill).not.toHaveBeenCalled();
    expect(noteSqls()).toHaveLength(0);
  });
});
