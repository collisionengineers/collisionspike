/**
 * services/data-api/src/features/assistant/usage.ts — the AI capacity ledger writer (TKT-113, PLAN-001 Phase 4).
 *
 * A best-effort, ATOMIC per-(day, actor, surface) tally of model calls + tokens across every AI
 * call site. Deliberately NOT a hard ceiling — the upsert is a single statement, so a concurrent
 * one-call overshoot is accepted rather than serialising model calls behind a lock. Never throws:
 * a ledger failure must not break the AI call it is measuring (mirrors writeAudit).
 */

import { query } from '../../platform/db/client.js';

/** Which AI surface spent the tokens (keeps assistant / classifier / vision usage separable). */
export type AiSurface =
  | 'assistant'
  | 'classifier'
  | 'vision'
  | 'email_ai'
  | 'location_ai'
  | 'suggestion';

export interface AiUsageInput {
  /** Entra oid/upn of the caller, or a service/agent identity (e.g. 'classifier'). */
  actor: string;
  surface: AiSurface;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Record one model call against the (UTC-day, actor, surface) tally: +1 call and += the tokens.
 * Atomic INSERT … ON CONFLICT DO UPDATE (best-effort). Never throws.
 */
export async function recordAiUsage(u: AiUsageInput): Promise<void> {
  try {
    await query(
      `INSERT INTO ai_usage_ledger
         (usage_day, actor, surface, model, calls, input_tokens, output_tokens)
       VALUES ((now() AT TIME ZONE 'utc')::date, $1, $2, $3, 1, $4, $5)
       ON CONFLICT (usage_day, actor, surface) DO UPDATE
         SET calls         = ai_usage_ledger.calls + 1,
             input_tokens  = ai_usage_ledger.input_tokens + EXCLUDED.input_tokens,
             output_tokens = ai_usage_ledger.output_tokens + EXCLUDED.output_tokens,
             model         = COALESCE(EXCLUDED.model, ai_usage_ledger.model),
             updated_at    = now()`,
      [
        u.actor && u.actor.trim() ? u.actor.trim() : 'unknown',
        u.surface,
        u.model ?? null,
        Math.max(0, Math.floor(u.inputTokens ?? 0)),
        Math.max(0, Math.floor(u.outputTokens ?? 0)),
      ],
    );
  } catch (e) {
    // Best-effort — a ledger failure must not break the model call it measures.
    console.error('[ai-usage] ledger write failed', e);
  }
}
