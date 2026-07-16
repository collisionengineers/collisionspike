import {
  INBOUND_CATEGORIES,
  INBOUND_SUBTYPES,
  type AiSuggestion,
  type InboundCategory,
  type InboundSubtype,
} from '@cs/domain';
import { CATEGORY_LABEL, SUBTYPE_LABEL } from './inbox-email-type';

/* ============================================================
   inbox-suggestions — PURE helpers for the inbox email-preview panel's
   suggested-match banners (rules-engine-v2 Phase 2 ref-gate: "this looks like
   an open case" / "this may be a cancellation"; Phase 4 Stage C: "the assistant
   thinks this is …", TKT-137). No React — Inbox.tsx renders whatever these
   selectors return.

   Suggest-first: every match starts as a PENDING ai_suggestion row (case_link,
   cancellation, or triage_category), reviewed via the existing accept/reject
   lifecycle (reviewAiSuggestion) — nothing here ever links, closes, or
   relabels on its own.
   ============================================================ */

/** The three suggestionType values the inbox preview banner understands. */
export const CASE_LINK_SUGGESTION_TYPE = 'case_link';
export const CANCELLATION_SUGGESTION_TYPE = 'cancellation';
export const TRIAGE_CATEGORY_SUGGESTION_TYPE = 'triage_category';

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

/* ----------  triage_category — the AI email-identification verdict (TKT-137)  ----------
   rules-engine-v2 Phase 4 (ADR-0019 Stage C): the EMAIL_AI rung proposes a TYPE for the
   message — a relabel, never a case link (targetCaseId is always absent). The producer
   (api internal.ts internalTriageSuggestLink) writes suggestedValue
   { category, subtype, sourceMessageId? } with both tokens validated against the
   taxonomy at write time; the narrowing below still tolerates anything. */

/** A triage_category suggestion's proposed value, narrowed out of the jsonb
 *  `suggestedValue`. Defensive — never throws on a malformed or absent value. */
export interface TriageCategorySuggestionValue {
  category?: string;
  subtype?: string;
}

/** Narrow an AiSuggestion's `suggestedValue` into `{ category?, subtype? }`. */
export function triageCategoryValue(s: AiSuggestion): TriageCategorySuggestionValue {
  const v = s.suggestedValue as Record<string, unknown> | null | undefined;
  if (!v || typeof v !== 'object') return {};
  return {
    category: typeof v.category === 'string' ? v.category : undefined,
    subtype: typeof v.subtype === 'string' ? v.subtype : undefined,
  };
}

/**
 * The first PENDING triage_category suggestion — no target case required (it proposes a
 * relabel of the message, never a link), but it must carry at least one category/subtype
 * token: with nothing proposed the banner would have nothing to say and Accept nothing
 * to apply, so a malformed row degrades to "no banner" (the same doctrine as the
 * target-less case_link in pendingRefGateSuggestion).
 */
export function pendingTriageCategorySuggestion(
  suggestions: readonly AiSuggestion[],
): AiSuggestion | undefined {
  return suggestions.find((s) => {
    if (s.reviewState !== 'pending' || s.suggestionType !== TRIAGE_CATEGORY_SUGGESTION_TYPE) {
      return false;
    }
    const { category, subtype } = triageCategoryValue(s);
    return !!category || !!subtype;
  });
}

/** 'payment_remittance' → 'Payment remittance' — the fallback for a token the display
 *  maps don't know yet (a producer ahead of this build). NEVER render the raw token. */
function humaniseToken(token: string): string {
  const words = token.replace(/_+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

/** Plain-language label for the proposed type — the SAME display maps the E-mail type
 *  column uses (SUBTYPE_LABEL preferred: it is the more specific read), humanised when
 *  the token is unknown. undefined only when the value carries no token at all. */
export function triageCategoryLabel(s: AiSuggestion): string | undefined {
  const { category, subtype } = triageCategoryValue(s);
  if (subtype) {
    return (SUBTYPE_LABEL as Record<string, string | undefined>)[subtype] ?? humaniseToken(subtype);
  }
  if (category) {
    return (CATEGORY_LABEL as Record<string, string | undefined>)[category] ?? humaniseToken(category);
  }
  return undefined;
}

/** 'The assistant thinks this is “Images received”.' — plain handler English, never an
 *  enum token (the label fallback humanises unknown tokens). */
export function triageCategoryHeadline(s: AiSuggestion): string {
  const label = triageCategoryLabel(s);
  return label
    ? `The assistant thinks this is “${label}”.`
    : 'The assistant suggested a type for this email.';
}

/**
 * The category/subtype pair an ACCEPT will apply to the row — both tokens present AND
 * known to the taxonomy (mirrors the server's promote guard, which only relabels on a
 * valid pair). undefined for a partial/unknown pair: the caller then relies on the grid
 * refetch alone rather than patching the row with a value the server may not have applied.
 */
export function appliedEmailType(
  s: AiSuggestion,
): { category: InboundCategory; subtype: InboundSubtype } | undefined {
  const { category, subtype } = triageCategoryValue(s);
  if (
    category &&
    (INBOUND_CATEGORIES as readonly string[]).includes(category) &&
    subtype &&
    (INBOUND_SUBTYPES as readonly string[]).includes(subtype)
  ) {
    return { category: category as InboundCategory, subtype: subtype as InboundSubtype };
  }
  return undefined;
}
