/**
 * api/src/functions/ai-suggestions.test.ts — OFFLINE acceptance proof for the TKT-015 generic
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
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, opts: Reg) => { registrations.set(name, opts); }, timer: () => {} },
}));

/* ---- auth: withRole passthrough (the bearer gate is exercised by auth.test.ts) ---- */
vi.mock('../lib/auth.js', () => ({ withRole: (_r: string, h: unknown) => h }));

/* ---- the model call: a controllable double so the route is isolated from the network ---- */
const model = vi.hoisted(() => ({ callSuggestionModel: vi.fn() }));
vi.mock('../lib/aoai-suggestions.js', () => ({ callSuggestionModel: model.callSuggestionModel }));

/* ---- db: record every SQL + params; canned rows per statement ---- */
const sqls: string[] = [];
const params: unknown[][] = [];
const rowsFor = vi.fn<(sql: string, p?: unknown[]) => Record<string, unknown>[]>(() => []);
vi.mock('../lib/db.js', () => ({
  query: vi.fn(async (sql: string, p?: unknown[]) => { sqls.push(sql); params.push(p ?? []); return rowsFor(sql, p); }),
  getPool: vi.fn(),
  tx: vi.fn(),
}));

/* ---- audit: keep AUDIT_ACTION + actorFromClaims real; spy writeAudit ---- */
const auditCalls = vi.hoisted(() => [] as Array<{ action: number }>);
vi.mock('../lib/audit.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, writeAudit: vi.fn(async (a: { action: number }) => { auditCalls.push(a); }) };
});

/* ---- internal.js: mock the TKT-023 chaser hook (avoid loading the whole internal
        route module; the hook's own behaviour is pinned in internal-guards.test.ts) ---- */
const chaserHook = vi.hoisted(() => ({ markOutstandingChasersResponded: vi.fn(async () => 1) }));
vi.mock('./internal.js', () => ({
  markOutstandingChasersResponded: chaserHook.markOutstandingChasersResponded,
}));

const { AUDIT_ACTION } = await import('../lib/audit.js');
await import('./ai-suggestions.js'); // registers the routes against the captured app.http
const generate = registrations.get('generateAiSuggestions')!.handler;
const review = registrations.get('reviewAiSuggestion')!.handler;

const CASE_ROW = { vrm: 'WN14XPZ', eva_accident_circumstances: 'Struck from behind at lights.', eva_claimant_address: 'redacted' };

function req(): HttpRequest {
  return { params: { id: 'case-1' }, json: async () => ({}) } as unknown as HttpRequest;
}
// The route logs every outcome (TKT-127 telemetry) — give it real log/error spies.
const ctx = { log: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

const insertSqls = (): string[] => sqls.filter((s) => /INSERT INTO ai_suggestion/i.test(s));

beforeEach(() => {
  sqls.length = 0;
  params.length = 0;
  auditCalls.length = 0;
  chaserHook.markOutstandingChasersResponded.mockClear();
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

describe('generateAiSuggestions — (a) honest no-op when disabled', () => {
  it('gate OFF → { generated: 0, reason: disabled }; no model call, no DB write', async () => {
    // AI_ASSIST_ENABLED unset (default OFF), endpoint/deployment configured.
    const res = await generate(req(), ctx, {});
    expect(res.jsonBody).toEqual({ generated: 0, reason: 'disabled' });
    expect(model.callSuggestionModel).not.toHaveBeenCalled();
    expect(sqls.length).toBe(0);
  });

  it('gate ON but model UNCONFIGURED → { generated: 0, reason: disabled }; no model call, no DB write', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    delete process.env.AI_MODEL_ENDPOINT; // aiAssistConfigured() → false
    const res = await generate(req(), ctx, {});
    expect(res.jsonBody).toEqual({ generated: 0, reason: 'disabled' });
    expect(model.callSuggestionModel).not.toHaveBeenCalled();
    expect(sqls.length).toBe(0);
  });
});

describe('generateAiSuggestions — (b) persists drafts as pending ai_suggestion rows', () => {
  it('a strict-JSON draft → INSERT carrying model_version + confidence, review_state left to DEFAULT, audited', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    model.callSuggestionModel.mockResolvedValue([
      { suggestionType: 'accident_summary', suggestedValue: { summary: 'Rear-end shunt.' }, confidence: 0.8, modelVersion: 'gpt-5:gpt-5-2025-08-07' },
    ]);

    const res = await generate(req(), ctx, {});
    expect(res.jsonBody).toEqual({ generated: 1 });
    expect(model.callSuggestionModel).toHaveBeenCalledTimes(1);

    // The persist INSERT carries the confidence + model_version, and does NOT set review_state
    // (the DB DEFAULT 'pending' owns it — a draft can never arrive pre-accepted).
    const idx = sqls.findIndex((s) => /INSERT INTO ai_suggestion/i.test(s));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(sqls[idx]).not.toMatch(/review_state/i);
    const p = params[idx];
    expect(p).toContain(0.8); // confidence
    expect(p).toContain('gpt-5:gpt-5-2025-08-07'); // model_version
    expect(p).toContain('accident_summary'); // suggestion_type

    // ai_suggestion_created audited.
    expect(auditCalls.some((a) => a.action === AUDIT_ACTION.ai_suggestion_created)).toBe(true);
  });
});

describe('generateAiSuggestions — (c) failed/malformed model response degrades honestly', () => {
  it('callSuggestionModel throws → { generated: 0, reason: error }; NO ai_suggestion INSERT (no partial write); the failure is LOGGED', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    model.callSuggestionModel.mockRejectedValue(new Error('AOAI suggestions 500'));
    const res = await generate(req(), ctx, {});
    expect(res.jsonBody).toEqual({ generated: 0, reason: 'error' });
    expect(insertSqls()).toHaveLength(0);
    // TKT-127: the prior catch was silent — a live failure must reach App Insights.
    expect(ctx.error).toHaveBeenCalled();
  });
});

describe('generateAiSuggestions — (e) TKT-127 explicit zero-outcome reasons (never a silent nothing)', () => {
  it('a case with NO usable notes → { generated: 0, reason: no_input } WITHOUT a model call', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM case_/i.test(sql)) {
        return [{ vrm: 'WN14XPZ', eva_accident_circumstances: '  ', eva_claimant_address: null }];
      }
      return [];
    });
    const res = await generate(req(), ctx, {});
    expect(res.jsonBody).toEqual({ generated: 0, reason: 'no_input' });
    expect(model.callSuggestionModel).not.toHaveBeenCalled();
    expect(insertSqls()).toHaveLength(0);
  });

  it('a clean model run with nothing to suggest → { generated: 0, reason: empty } (distinct from disabled/error)', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    model.callSuggestionModel.mockResolvedValue([]);
    const res = await generate(req(), ctx, {});
    expect(res.jsonBody).toEqual({ generated: 0, reason: 'empty' });
    expect(model.callSuggestionModel).toHaveBeenCalledTimes(1);
    expect(insertSqls()).toHaveLength(0);
  });

  it('a generated > 0 outcome carries NO reason (the success shape)', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    model.callSuggestionModel.mockResolvedValue([
      { suggestionType: 'accident_summary', suggestedValue: { summary: 'Shunt.' }, confidence: 0.9, modelVersion: 'gpt-5:x' },
    ]);
    const res = await generate(req(), ctx, {});
    expect(res.jsonBody).toEqual({ generated: 1 });
  });
});

describe('generateAiSuggestions — (d) NO silent mutation (promotion is human-review only)', () => {
  it('the generate path issues ONLY INSERT ai_suggestion — never an UPDATE to a case/evidence column', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    model.callSuggestionModel.mockResolvedValue([
      { suggestionType: 'damage_area', suggestedValue: { area: 'rear' }, confidence: 0.7, modelVersion: 'gpt-5:x' },
      { suggestionType: 'damage_severity', suggestedValue: { severity: 'moderate' }, confidence: 0.6, modelVersion: 'gpt-5:x' },
    ]);
    await generate(req(), ctx, {});
    // No promotion / mutation of any domain field happens on generate.
    for (const sql of sqls) {
      expect(sql).not.toMatch(/UPDATE\s+(evidence|case_|inbound_email)/i);
    }
    // What it DID do: read the case + insert the two suggestions (nothing else that writes state).
    expect(insertSqls()).toHaveLength(2);
  });
});

/* ============================================================
   TKT-023 — the case_link ACCEPT seam satisfies outstanding chasers.
   The suggestion-review attach was the ONE attach seam that never called
   markOutstandingChasersResponded (auto-link reply / dedup attach / auto-attach
   all do — internal.ts). Pins: a successful case_link promotion calls the hook
   with the target case; a no-op promotion (email already linked) does not.
   ============================================================ */

function reviewReq(decision = 'accepted'): HttpRequest {
  return { params: { id: 'sug-1' }, json: async () => ({ decision }) } as unknown as HttpRequest;
}

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
