/**
 * services/data-api/src/features/assistant/suggestion-generation-routes.test.ts — OFFLINE acceptance proof for the TKT-015 generic
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

const { AUDIT_ACTION } = await import('../../shared/audit.js');
await import('./register-suggestion-routes.js');
const generate = registrations.get('generateAiSuggestions')!.handler;

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
    // in its column list (the DB DEFAULT 'pending' owns it — a draft can never arrive
    // pre-accepted). NB the idempotency guard's NOT EXISTS subquery legitimately references
    // review_state = 'pending' (PR46 dedup) — that's the guard, not a SET.
    const idx = sqls.findIndex((s) => /INSERT INTO ai_suggestion/i.test(s));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(sqls[idx]).not.toMatch(/INSERT INTO ai_suggestion\s*\([^)]*review_state/i);
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
   TKT-132 — the WIDENED generate inputs. Before: the prompt was built from
   eva_accident_circumstances + eva_claimant_address only, so a case with parsed
   instructions but empty circumstances was a permanent 'no_input'. Pins the
   acceptance: such a case now reaches the model with the instruction email text
   (and other real inputs) and generates; empty-everything stays an honest no_input.
   ============================================================ */

describe('generateAiSuggestions — TKT-132 widened inputs', () => {
  it('a case with parsed instructions but EMPTY circumstances reaches the model and generates', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM case_/i.test(sql)) {
        return [{ vrm: 'WN14XPZ', eva_accident_circumstances: '  ', eva_claimant_address: null }];
      }
      if (/FROM inbound_email/i.test(sql)) {
        return [{ subject: 'New instruction WN14XPZ', body_preview: 'Rear-end collision at lights, please assess the vehicle.' }];
      }
      if (/INSERT INTO ai_suggestion/i.test(sql)) return [{ id: 'sug-1' }];
      return [];
    });
    model.callSuggestionModel.mockResolvedValue([
      { suggestionType: 'accident_summary', suggestedValue: { summary: 'Rear-end shunt.' }, confidence: 0.8, modelVersion: 'gpt-5:x' },
    ]);

    const res = await generate(req(), ctx, {});
    expect(res.jsonBody).toEqual({ generated: 1 }); // NOT no_input any more
    expect(model.callSuggestionModel).toHaveBeenCalledTimes(1);
    // The model saw the instruction email text as a labelled section.
    const input = model.callSuggestionModel.mock.calls[0][0] as { scrubbedText: string };
    expect(input.scrubbedText).toContain('Instruction email text');
    expect(input.scrubbedText).toContain('Rear-end collision at lights');
  });

  it('image stamps alone (no free text anywhere) still count as input — compact photo facts', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM case_/i.test(sql)) {
        return [{ vrm: 'WN14XPZ', eva_accident_circumstances: null, eva_claimant_address: null }];
      }
      if (/FROM evidence/i.test(sql)) {
        return [
          { image_role_code: 100000000, registration_visible: true, excluded: false, person_reflection: false },
          { image_role_code: 100000001, registration_visible: null, excluded: false, person_reflection: false },
        ];
      }
      return [];
    });
    model.callSuggestionModel.mockResolvedValue([]);
    const res = await generate(req(), ctx, {});
    expect(res.jsonBody).toEqual({ generated: 0, reason: 'empty' }); // model WAS called
    const input = model.callSuggestionModel.mock.calls[0][0] as { scrubbedText: string };
    expect(input.scrubbedText).toContain('Photo analysis:');
    expect(input.scrubbedText).toContain('2 photos on file');
  });

  it('free text is scrubbed BEFORE the model call (email/phone gone, VRM kept)', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM case_/i.test(sql)) {
        return [{ vrm: 'WN14XPZ', eva_accident_circumstances: null, eva_claimant_address: null }];
      }
      if (/FROM inbound_email/i.test(sql)) {
        return [{ subject: 'Instruction', body_preview: 'Contact john.smith@example.com or 07700 900123 re WN14 XPZ.' }];
      }
      return [];
    });
    model.callSuggestionModel.mockResolvedValue([]);
    await generate(req(), ctx, {});
    const input = model.callSuggestionModel.mock.calls[0][0] as { scrubbedText: string };
    expect(input.scrubbedText).not.toContain('john.smith@example.com');
    expect(input.scrubbedText).not.toContain('07700 900123');
    expect(input.scrubbedText).toContain('[EMAIL]');
    expect(input.scrubbedText).toContain('[PHONE]');
    expect(input.scrubbedText).toContain('WN14 XPZ');
  });

  it('a failing EXTRAS read degrades to the narrower prompt, never an error (best-effort widening)', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    const { query } = await import('../../platform/db/client.js');
    const queryMock = query as unknown as ReturnType<typeof vi.fn>;
    /** The db-mock factory's own recording implementation — restored after this test so the
     *  throw-on-extras override never leaks into later tests (beforeEach only resets rowsFor). */
    const recordingImpl = async (sql: string, p?: unknown[]) => {
      sqls.push(sql);
      params.push(p ?? []);
      return rowsFor(sql, p);
    };
    queryMock.mockImplementation(async (sql: string, p?: unknown[]) => {
      sqls.push(sql);
      params.push(p ?? []);
      if (/FROM inbound_email/i.test(sql) || /FROM evidence/i.test(sql)) {
        throw new Error('column does not exist'); // e.g. an older DB
      }
      return rowsFor(sql, p);
    });
    try {
      rowsFor.mockImplementation((sql: string) => {
        if (/FROM case_/i.test(sql)) return [CASE_ROW]; // circumstances present
        if (/INSERT INTO ai_suggestion/i.test(sql)) return [{ id: 'sug-1' }];
        return [];
      });
      model.callSuggestionModel.mockResolvedValue([
        { suggestionType: 'accident_summary', suggestedValue: { summary: 'Shunt.' }, confidence: 0.9, modelVersion: 'gpt-5:x' },
      ]);
      const res = await generate(req(), ctx, {});
      expect(res.jsonBody).toEqual({ generated: 1 }); // circumstances alone still generated
      const input = model.callSuggestionModel.mock.calls[0][0] as { scrubbedText: string };
      expect(input.scrubbedText).toContain('Struck from behind at lights.');
    } finally {
      queryMock.mockImplementation(recordingImpl);
    }
  });
});

/* ============================================================
   TKT-023 — the case_link ACCEPT seam satisfies outstanding chasers.
   The suggestion-review attach was the ONE attach seam that never called
   markOutstandingChasersResponded (auto-link reply / dedup attach / auto-attach
   all do — internal.ts). Pins: a successful case_link promotion calls the hook
   with the target case; a no-op promotion (email already linked) does not.
   ============================================================ */

describe('generateAiSuggestions — (e-claimant) the SELECT keeps eva_claimant_address (operator-adjudicated #53: keep it, accept DPIA)', () => {
  it('the model-context SELECT still reads eva_claimant_address (never silently dropped)', async () => {
    process.env.AI_ASSIST_ENABLED = 'true';
    model.callSuggestionModel.mockResolvedValue([]);
    rowsFor.mockImplementation((sql: string) => {
      if (/FROM case_/i.test(sql)) return [CASE_ROW];
      return [];
    });
    await generate(req(), ctx, {});
    const caseSelect = sqls.find((s) => /FROM case_/i.test(s)) ?? '';
    // #53 / PR46: the claimant address is a deliberate geolocation clue kept under the DPIA
    // sign-off — it must remain in the context SELECT (the Codex P1 removal was withdrawn).
    expect(caseSelect).toMatch(/eva_claimant_address/i);
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
    // The stack's TKT-127 generate contract tags a zero-after-model-run with an explicit reason.
    expect(second.jsonBody).toEqual({ generated: 0, reason: 'empty' });
    // Exactly one ai_suggestion_created audit across both runs (the dedup skips the second).
    expect(auditCalls.filter((a) => a.action === AUDIT_ACTION.ai_suggestion_created)).toHaveLength(1);
    // Both runs run the guarded INSERT statement — the guard, not the caller, drops the duplicate.
    expect(insertSqls()).toHaveLength(2);
    // The insert is the NOT EXISTS form (idempotency lives in SQL, not a pre-SELECT).
    expect(insertSqls()[0]).toMatch(/NOT EXISTS/i);
  });
});
