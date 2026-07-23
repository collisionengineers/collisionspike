/* ============================================================
   intake-engine — Stage 1b: resolve an intermediary's candidates to ONE principal.

   Only invoked when identify-principal.ts returned 'intermediary' (>1 candidate
   principals for the matched intermediary registry entry). Resolves using each
   candidate's own `contentSignals` (literal, case-insensitive substring phrases)
   against the message's document/body text.

   NEVER silently guesses among >1 candidates: if the text contains signals for more
   than one candidate (contradictory), or for none of them (undetermined), the result
   is 'needs_review' — only an EXACT single-candidate signal hit resolves.

   PURE + DETERMINISTIC + FRAMEWORK-FREE.
   ============================================================ */

import type { CandidatePrincipal } from '../registry/schema.js';

export type ResolveIntermediaryOutcome = 'resolved' | 'needs_review';

export interface ResolveIntermediaryResult {
  outcome: ResolveIntermediaryOutcome;
  /** Set only on 'resolved'. */
  principalCode?: string;
  /** Every candidate whose content signal matched — populated on BOTH outcomes for
   * diagnostics (empty on 'needs_review' when no signal fired, length > 1 on
   * 'needs_review' when signals for multiple candidates fired). */
  matchedCandidateCodes: string[];
}

export function resolveIntermediaryPrincipal(
  candidates: readonly CandidatePrincipal[],
  contentText: string,
): ResolveIntermediaryResult {
  const text = contentText.toLowerCase();

  const hits = candidates.filter((candidate) =>
    candidate.contentSignals.some((signal) => {
      const needle = signal.trim().toLowerCase();
      return needle !== '' && text.includes(needle);
    }),
  );

  if (hits.length === 1) {
    return { outcome: 'resolved', principalCode: hits[0].principalCode, matchedCandidateCodes: [hits[0].principalCode] };
  }

  // 0 hits (undetermined) or >1 hits (contradictory) — never guess.
  return { outcome: 'needs_review', matchedCandidateCodes: hits.map((c) => c.principalCode) };
}
