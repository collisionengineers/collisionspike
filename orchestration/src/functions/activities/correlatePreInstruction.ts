/**
 * orchestration/src/functions/activities/correlatePreInstruction.ts  (TKT-084, taxonomy v3)
 *
 * Durable activity: after a case mints, correlate HELD pre-instruction rows onto it.
 * A pre-instruction email ("when you receive an instruction from X on this one please
 * hold off obtaining images") is classified into the `pre_instruction` lane and held —
 * no case minted, `triage_state` stays 'new'. When the OFFICIAL instruction later
 * arrives and mints its case, this activity finds held rows whose extracted
 * body_vrm / body_caseref / body_jobref match the new case's identifiers and raises a
 * `case_link` ai_suggestion per match — SUGGEST-FIRST, never an auto-attach (the
 * correlation key is typically VRM-only, which never promotes past a suggestion under
 * the ADR-0019 doctrine). Staff accept the suggestion from the inbox banner, which
 * performs the reversible attach (promoteAcceptedSuggestion's case_link branch) and
 * surfaces the held directions on the case's linked-mail rail.
 *
 * GATED: TRIAGE_PRE_INSTRUCTION_ENABLED — read INSIDE the activity (orchestrator
 * determinism: the orchestrator never reads env). Gate off => honest no-op
 * `{ skipped: true }`. Best-effort at the call site (a correlation failure must never
 * block intake). Idempotent: the suggest-link endpoint's PENDING-subject idempotency
 * absorbs Durable at-least-once retries.
 */

import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { dataApi } from '../../lib/data-api.js';

export interface CorrelatePreInstructionInput {
  caseId: string;
  casePo?: string | null;
  vrm?: string;
  caseRef?: string;
  jobRef?: string;
}

export interface CorrelatePreInstructionResult {
  skipped: boolean;
  matches: number;
  suggested: number;
}

/** Handler-language rationale rendered in the SPA inbox banner — no engineering terms. */
export function preInstructionRationale(casePo: string | null | undefined): string {
  const target = casePo ? `case ${casePo}` : 'this case';
  return `Directions received before the instruction arrived appear to relate to ${target} — review and attach so they are not missed.`;
}

df.app.activity('correlatePreInstruction', {
  handler: async (input: CorrelatePreInstructionInput, ctx): Promise<CorrelatePreInstructionResult> => {
    if (!gates.triagePreInstruction()) {
      return { skipped: true, matches: 0, suggested: 0 };
    }
    const vrm = (input.vrm ?? '').trim();
    const caseRef = (input.caseRef ?? '').trim();
    const jobRef = (input.jobRef ?? '').trim();
    if (!vrm && !caseRef && !jobRef) {
      return { skipped: true, matches: 0, suggested: 0 };
    }

    const { held } = await dataApi.heldPreInstruction({
      ...(vrm ? { vrm } : {}),
      ...(caseRef ? { caseRef } : {}),
      ...(jobRef ? { jobRef } : {}),
    });

    let suggested = 0;
    for (const row of held) {
      const res = await dataApi.triageSuggestLink({
        inboundEmailId: row.inboundEmailId,
        ...(row.sourceMessageId ? { sourceMessageId: row.sourceMessageId } : {}),
        targetCaseId: input.caseId,
        suggestionType: 'case_link',
        rationale: preInstructionRationale(input.casePo),
        confidence: 0.6,
        decisionInputs: {
          lane: 'pre_instruction',
          matchedOn: row.matchedOn,
          policy: 'pre-instruction-correlate-v1',
        },
      });
      if (res.created) suggested += 1;
    }

    ctx.log(
      JSON.stringify({
        evt: 'correlatePreInstruction',
        caseId: input.caseId,
        matches: held.length,
        suggested,
      }),
    );
    return { skipped: false, matches: held.length, suggested };
  },
});
