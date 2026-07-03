import type { AiSuggestion } from '@cs/domain';

/* ============================================================
   inbox-suggestions — PURE helpers for the inbox email-preview panel's
   suggested-match banners (rules-engine-v2 Phase 2 ref-gate: "this looks like
   an open case" / "this may be a cancellation"). No React — Inbox.tsx renders
   whatever these selectors return.

   Suggest-first: every match starts as a PENDING ai_suggestion row (case_link
   or cancellation), reviewed via the existing accept/reject lifecycle
   (reviewAiSuggestion) — nothing here ever links or closes a case on its own.
   ============================================================ */

/** The two suggestionType values the inbox preview banner understands. */
export const CASE_LINK_SUGGESTION_TYPE = 'case_link';
export const CANCELLATION_SUGGESTION_TYPE = 'cancellation';

/** A case-link/cancellation suggestion's proposed value, narrowed out of the jsonb
 *  `suggestedValue` (typed `unknown` on the DTO). Defensive — never throws on a
 *  malformed or absent value. */
export interface RefGateSuggestionValue {
  targetCaseId?: string;
  casePo?: string;
}

/** Narrow an AiSuggestion's `suggestedValue` into `{ targetCaseId, casePo? }`. */
export function refGateValue(s: AiSuggestion): RefGateSuggestionValue {
  const v = s.suggestedValue as Record<string, unknown> | null | undefined;
  if (!v || typeof v !== 'object') return {};
  return {
    targetCaseId: typeof v.targetCaseId === 'string' ? v.targetCaseId : undefined,
    casePo: typeof v.casePo === 'string' ? v.casePo : undefined,
  };
}

/**
 * The first PENDING suggestion of `type` in `suggestions` — the presence check
 * that decides whether the preview banner renders at all. A `case_link` must carry
 * a `targetCaseId` (there is nothing to attach/open without one, so a malformed row
 * degrades to "no banner" rather than a dead-end action). A `cancellation` is valid
 * WITHOUT a target — the domain explicitly supports a target-less cancellation
 * ("this may be telling us to close a case — please find the right one"), which is
 * exactly the case a person most needs to see; its headline degrades gracefully.
 */
export function pendingRefGateSuggestion(
  suggestions: readonly AiSuggestion[],
  type: string,
): AiSuggestion | undefined {
  // Computed on the un-narrowed `type` param: inside the predicate, `s.suggestionType === type`
  // narrows `type` to the DTO's suggestionType union (which does not list 'cancellation'), so the
  // comparison must live out here to stay a plain string check.
  const targetOptional = type === CANCELLATION_SUGGESTION_TYPE;
  return suggestions.find(
    (s) =>
      s.reviewState === 'pending' &&
      s.suggestionType === type &&
      (targetOptional || !!refGateValue(s).targetCaseId),
  );
}

/** "Looks like this email belongs to an open case — <CasePo>." (degrades
 *  gracefully when the suggestion doesn't carry a Case/PO yet). */
export function caseLinkHeadline(s: AiSuggestion): string {
  const { casePo } = refGateValue(s);
  return casePo
    ? `Looks like this email belongs to an open case — ${casePo}.`
    : 'Looks like this email belongs to an open case.';
}

/** "This email may be telling us to close <CasePo>." (same fallback). */
export function cancellationHeadline(s: AiSuggestion): string {
  const { casePo } = refGateValue(s);
  return casePo
    ? `This email may be telling us to close ${casePo}.`
    : 'This email may be telling us to close an open case.';
}
