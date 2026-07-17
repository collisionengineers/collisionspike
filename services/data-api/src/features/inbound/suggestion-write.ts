/**
 * suggestion-write — the ONE pending-suggestion writer (TKT-231 shared-helper refactor).
 *
 * Extracted verbatim from `internalTriageSuggestLink` (internal-triage-routes.ts) so the
 * retro ambiguous-resolution seam (retro-routes.ts) can mint the SAME `case_link`
 * suggestions the ref-gate does, feeding the existing "Attach to case" banner and review
 * routes with zero schema or SPA change. Behaviour is byte-compatible with the route it
 * was lifted from:
 *
 *  - IDEMPOTENT on (type, subject, targetCaseId): an existing PENDING twin returns
 *    `{ suggestionId, created: false }` and inserts nothing;
 *  - best-effort Case/PO enrichment so the banner renders a human-readable reference;
 *  - the type-specific audit rides the fresh insert (inbound_link_suggested /
 *    cancellation_proposed / ai_suggestion_created) exactly as before;
 *  - NEVER auto-attaches — accepting a suggestion is the caller's (or a human's) move.
 */

import { TRIAGE_POLICY_VERSION } from '@cs/domain';
import { query } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { deriveSuggestionIdempotencyKey, type Row } from '../../shared/mapping/index.js';

export interface PendingSuggestionInput {
  suggestionType: 'case_link' | 'cancellation' | 'triage_category';
  inboundEmailId: string | null;
  sourceMessageId: string | null;
  /** Forced null upstream for 'triage_category' (that type relabels, never links). */
  targetCaseId: string | null;
  rationale: string | null;
  confidence: number | null;
  decisionInputs?: unknown;
  /** 'triage_category' only — pre-validated against the shared name<->code maps. */
  triageCategory?: string | null;
  /** 'triage_category' only. */
  triageSubtype?: string | null;
  /** 'triage_category' only — the caller's model version; the deterministic types
   *  stamp TRIAGE_POLICY_VERSION regardless. */
  modelVersion?: string;
}

export interface PendingSuggestionResult {
  suggestionId: string | null;
  created: boolean;
}

/** Insert ONE pending ai_suggestion row (idempotent; audited). `suggestionId` is null
 *  only when the INSERT itself returned no id — callers decide how loud to be. */
export async function insertPendingSuggestion(
  input: PendingSuggestionInput,
): Promise<PendingSuggestionResult> {
  const {
    suggestionType, inboundEmailId, sourceMessageId, targetCaseId,
    rationale, confidence,
  } = input;
  const decisionInputs = input.decisionInputs ?? {};

  // Idempotency: a PENDING suggestion for the SAME (type, subject, targetCaseId) already
  // exists -> return it unchanged, created:false.
  const idemKey = deriveSuggestionIdempotencyKey({
    suggestionType,
    inboundEmailId,
    sourceMessageId,
    targetCaseId,
  });
  let existing: Row[] = [];
  if (idemKey) {
    existing =
      idemKey.subjectKind === 'inbound_email_id'
        ? await query<Row>(
            `SELECT id FROM ai_suggestion
              WHERE suggestion_type = $1 AND review_state = 'pending' AND inbound_email_id = $2
                AND (suggested_value->>'targetCaseId') IS NOT DISTINCT FROM $3
              LIMIT 1`,
            [idemKey.suggestionType, idemKey.subject, idemKey.targetCaseId],
          )
        : await query<Row>(
            `SELECT id FROM ai_suggestion
              WHERE suggestion_type = $1 AND review_state = 'pending' AND inbound_email_id IS NULL
                AND (suggested_value->>'sourceMessageId') IS NOT DISTINCT FROM $2
                AND (suggested_value->>'targetCaseId') IS NOT DISTINCT FROM $3
              LIMIT 1`,
            [idemKey.suggestionType, idemKey.subject, idemKey.targetCaseId],
          );
  }
  if (existing[0]) {
    return { suggestionId: existing[0].id as string, created: false };
  }

  // Best-effort enrichment: the target case's own Case/PO, so the suggestion can render
  // a human-readable reference without a second lookup. Absent when the target case has
  // no case_po yet (e.g. a Held new-client case) or no target was resolved at all
  // (always the case for 'triage_category' — targetCaseId is forced null upstream).
  let casePo: string | null = null;
  if (targetCaseId) {
    const caseRows = await query<Row>('SELECT case_po FROM case_ WHERE id = $1', [targetCaseId]);
    casePo = (caseRows[0]?.case_po as string | null) ?? null;
  }

  const suggestedValue =
    suggestionType === 'triage_category'
      ? {
          category: input.triageCategory ?? null,
          subtype: input.triageSubtype ?? null,
          // Carry sourceMessageId so the source_message_id-subject idempotency SELECT (used
          // when the inbound_email row isn't resolvable yet — inboundEmailId null) can match a
          // prior PENDING copy on a Durable at-least-once retry. Without it the dedup filters
          // on `suggested_value->>'sourceMessageId'`, a field this branch never wrote, so it
          // never matches and inserts a duplicate 'AI suggested category' banner.
          ...(sourceMessageId ? { sourceMessageId } : {}),
        }
      : {
          ...(targetCaseId ? { targetCaseId } : {}),
          ...(casePo ? { casePo } : {}),
          ...(sourceMessageId ? { sourceMessageId } : {}),
          decisionInputs,
        };
  // 'triage_category' stamps the CALLER's model_version ('<deployment>:<modelVersion>',
  // triage-classify.ts); the other two types are this writer's own deterministic
  // policy output, aligned with the current deterministic policy version.
  const modelVersion =
    suggestionType === 'triage_category'
      ? (input.modelVersion ?? '').trim() || 'unknown'
      : TRIAGE_POLICY_VERSION;
  const inserted = await query<Row>(
    `INSERT INTO ai_suggestion
       (inbound_email_id, suggestion_type, suggested_value, rationale, confidence, model_version)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING id`,
    [inboundEmailId, suggestionType, JSON.stringify(suggestedValue), rationale, confidence, modelVersion],
  );
  const suggestionId = (inserted[0]?.id as string | undefined) ?? null;
  if (!suggestionId) {
    return { suggestionId: null, created: false };
  }

  if (suggestionType === 'case_link') {
    await writeAudit({
      action: AUDIT_ACTION.inbound_link_suggested,
      ...(targetCaseId ? { caseId: targetCaseId } : {}),
      summary: 'A message was suggested for linking to an existing case',
      after: { suggestionId, targetCaseId, sourceMessageId, inboundEmailId },
    });
  } else if (suggestionType === 'cancellation') {
    await writeAudit({
      action: AUDIT_ACTION.cancellation_proposed,
      ...(targetCaseId ? { caseId: targetCaseId } : {}),
      summary: 'A message reported a case cancelled or closed — flagged for review',
      after: { suggestionId, targetCaseId, sourceMessageId, inboundEmailId },
    });
  } else {
    // 'triage_category' (rules-engine-v2 Phase 4, Stage C) — the GENERIC "an AI
    // producer created a suggestion" audit (the same code generateAiSuggestions writes
    // for every other AI-produced suggestion kind, ai-suggestions.ts). Distinct from
    // inbound_link_suggested/cancellation_proposed, which name the Stage-B ref-gate/
    // cancellation actions specifically — no new audit code minted for this one.
    await writeAudit({
      action: AUDIT_ACTION.ai_suggestion_created,
      summary: 'An AI-suggested category was proposed for a message',
      after: {
        suggestionId,
        sourceMessageId,
        inboundEmailId,
        category: input.triageCategory ?? null,
        subtype: input.triageSubtype ?? null,
      },
    });
  }

  return { suggestionId, created: true };
}
