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

const { AUDIT_ACTION } = await import('../lib/audit.js');
await import('./ai-suggestions.js'); // registers the routes against the captured app.http
const generate = registrations.get('generateAiSuggestions')!.handler;

// eva_claimant_address is intentionally present on the raw row but is NEVER selected/sent by the
// route (claimant-PII minimisation — test (e) pins that the model never receives it).
const CLAIMANT_ADDRESS = '221B Baker Street, London NW1 6XE';
const CASE_ROW = { vrm: 'WN14XPZ', eva_accident_circumstances: 'Struck from behind at lights.', eva_claimant_address: CLAIMANT_ADDRESS };

function req(): HttpRequest {
  return { params: { id: 'case-1' }, json: async () => ({}) } as unknown as HttpRequest;
}
const ctx = {} as InvocationContext;

const insertSqls = (): string[] => sqls.filter((s) => /INSERT INTO ai_suggestion/i.test(s));

beforeEach(() => {
  sqls.length = 0;
  params.length = 0;
  auditCalls.length = 0;
  model.callSuggestionModel.mockReset();
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
    // (the DB DEFAULT 'pending' owns it — a draft can never arrive pre-accepted). The idempotency
    // guard's NOT EXISTS clause MAY reference review_state, so assert only against the inserted
    // COLUMN TUPLE (everything before the SELECT/VALUES), never the whole statement.
    const idx = sqls.findIndex((s) => /INSERT INTO ai_suggestion/i.test(s));
    expect(idx).toBeGreaterThanOrEqual(0);
    const insertColumns = sqls[idx].slice(0, sqls[idx].search(/\b(SELECT|VALUES)\b/i));
    expect(insertColumns).not.toMatch(/review_state/i);
    const p = params[idx];
    expect(p).toContain(0.8); // confidence
    expect(p).toContain('gpt-5:gpt-5-2025-08-07'); // model_version
    expect(p).toContain('accident_summary'); // suggestion_type

    // ai_suggestion_created audited.
    expect(auditCalls.some((a) => a.action === AUDIT_ACTION.ai_suggestion_created)).toBe(true);
  });
});

describe('generateAiSuggestions — (c) failed/malformed model response degrades honestly', () => {
  it('callSuggestionModel throws → { generated: 0, reason: error }; NO ai_suggestion INSERT (no partial write)', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    model.callSuggestionModel.mockRejectedValue(new Error('AOAI suggestions 500'));
    const res = await generate(req(), ctx, {});
    expect(res.jsonBody).toEqual({ generated: 0, reason: 'error' });
    expect(insertSqls()).toHaveLength(0);
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

describe('generateAiSuggestions — (e) claimant PII minimisation (P1: address never leaves the tenant)', () => {
  it('the model context carries the accident circumstances + VRM but NEVER the claimant address', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    model.callSuggestionModel.mockResolvedValue([]);
    await generate(req(), ctx, {});
    expect(model.callSuggestionModel).toHaveBeenCalledTimes(1);
    const input = model.callSuggestionModel.mock.calls[0][0] as { vrm: string; scrubbedText: string };
    // The claimant address is a dedicated PII field with no assessment value — it is not selected,
    // so it can never reach the external model even though scrubPii would miss its unanchored form.
    expect(input.scrubbedText).not.toContain('Baker Street');
    expect(input.scrubbedText).not.toContain('NW1 6XE');
    expect(input.scrubbedText).toContain('Struck from behind'); // the assessment text IS present
    expect(input.vrm).toBe('WN14XPZ');
    // And the SELECT never asks for the address column in the first place.
    const caseSelect = sqls.find((s) => /FROM case_/i.test(s)) ?? '';
    expect(caseSelect).not.toMatch(/eva_claimant_address/i);
  });
});

describe('generateAiSuggestions — (f) idempotent generate (no duplicate pending rows on rerun)', () => {
  it('calling generate twice with the same draft inserts ONE pending suggestion', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    model.callSuggestionModel.mockResolvedValue([
      { suggestionType: 'accident_summary', suggestedValue: { summary: 'Rear-end shunt.' }, confidence: 0.8, modelVersion: 'gpt-5:x' },
    ]);

    // Stateful fake that emulates the SQL NOT EXISTS guard: an equivalent pending row is inserted
    // once (keyed by case/evidence/type/value); a rerun's INSERT…WHERE NOT EXISTS returns no row.
    const seen = new Set<string>();
    rowsFor.mockImplementation((sql: string, p?: unknown[]) => {
      if (/FROM case_/i.test(sql)) return [CASE_ROW];
      if (/INSERT INTO ai_suggestion/i.test(sql)) {
        const key = JSON.stringify([p?.[0], p?.[1], p?.[2], p?.[3]]);
        if (seen.has(key)) return []; // NOT EXISTS → no insert (idempotent)
        seen.add(key);
        return [{ id: 'sug-1' }];
      }
      return [];
    });

    const first = await generate(req(), ctx, {});
    const second = await generate(req(), ctx, {});
    expect(first.jsonBody).toEqual({ generated: 1 });
    expect(second.jsonBody).toEqual({ generated: 0 });
    // Exactly one ai_suggestion_created audit across both runs (the dedup skips the second).
    expect(auditCalls.filter((a) => a.action === AUDIT_ACTION.ai_suggestion_created)).toHaveLength(1);
    // Both runs run the guarded INSERT statement — the guard, not the caller, drops the duplicate.
    expect(insertSqls()).toHaveLength(2);
    // The insert is the NOT EXISTS form (idempotency lives in SQL, not a pre-SELECT).
    expect(insertSqls()[0]).toMatch(/NOT EXISTS/i);
  });
});
