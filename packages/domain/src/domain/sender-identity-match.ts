/* ============================================================
   Collision Engineers — Sender identity matching (DOMAIN LOGIC, rules-engine-v2 Phase 3).

   ADR-0011 "as written" (CONTEXT.md canon: the entity is Image Source — never a new
   "intermediary" table): a sender's domain/address may resolve to a WorkProvider
   DIRECTLY (today's `matchProviderByDomain`), or to an INTERMEDIARY — an `ImageSource`
   row (`kind=intermediary`) that routes work on behalf of several WorkProviders
   (`connexus.co.uk` → {PCH, SBL}), or to neither.

   `matchSenderIdentity` sits ON TOP of `matchProviderByDomain` — it does NOT change that
   function's signature or behaviour, and every existing caller of
   `matchProviderByDomain` keeps working unchanged. This module is the new, richer entry
   point for a caller (the orchestration `providerMatch` activity) that also wants to
   know about the intermediary case.

   PRECEDENCE (top wins; documented, tested):
     1. ADDRESS-LEVEL provider match (`knownEmailAddresses`, e.g. a generic gmail.com
        sender pinned to one provider — seed/915_corpus_email_address_match.sql shows
        this override is a real, live corpus signal) — ALWAYS wins. It is an exact,
        deliberately-curated override; nothing should out-rank it.
     2. INTERMEDIARY — a domain-level `ImageSource(kind=intermediary)` match. Checked
        BEFORE a domain-level WorkProvider match/ambiguity so that a de-collision miss
        (an intermediary domain that, by data-hygiene accident, is ALSO still present on
        some WorkProvider's `knownEmailDomains`) can never mis-resolve the sender as — or
        confuse it with — a direct provider. ADR-0011: "Intermediary domains are
        therefore not WorkProvider domains" — this is the defensive belt-and-braces read
        of that rule, not just the happy path where de-collision has already run.
     3. DOMAIN-LEVEL provider match/ambiguity (`matchProviderByDomain`'s own domain rung)
        — today's behaviour, unchanged, when neither of the above fired.
     4. NONE — nothing matched.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No React, no I/O, no live calls.
   ============================================================ */

import {
  matchProviderByDomain,
  domainOf,
  type ProviderMatchRecord,
  type ProviderMatchResult,
} from './provider-match';

/**
 * The minimum an Image-Source intermediary record must expose for sender matching —
 * the corpus subset `GET /api/internal/provider-match-records`' new `imageSources` field
 * returns (image_source WHERE kind=intermediary, joined through imagesource_workprovider).
 */
export interface ImageSourceMatchRecord {
  imageSourceId: string;
  name: string;
  /** Matched verbatim (exact, case-insensitive) against the sender's domain — same
   *  no-alias discipline as WorkProvider domain matching. '' never matches. */
  emailDomain: string;
  /** Descriptive only — this module re-asserts 'intermediary' itself rather than
   *  trusting the caller filtered correctly (see the module-level "never trust the
   *  caller blindly" discipline used across dedup.ts / triage-policy.ts). */
  kind: string;
  /** The WorkProviders this intermediary routes work for (imagesource_workprovider
   *  N:N). May be empty (a registered intermediary with no linked providers yet) —
   *  callers must be empty-tolerant, never treat that as an error. */
  candidateProviderIds: readonly string[];
}

/** Discriminated sender-identity outcome. 'provider' wraps `matchProviderByDomain`'s OWN
 *  result verbatim (so its matched/unmatched/ambiguous vocabulary is preserved exactly —
 *  "direct provider match (as today)"); 'intermediary' is the new Phase-3 case; 'none' is
 *  the shared "nothing at all" outcome (an unparseable sender, or a domain that matched
 *  neither corpus). */
export type SenderIdentityMatch =
  | { kind: 'provider'; result: ProviderMatchResult }
  | {
      kind: 'intermediary';
      imageSourceId: string;
      name: string;
      candidateProviderIds: readonly string[];
      matchedDomain: string;
    }
  | { kind: 'none'; matchedDomain: string };

/**
 * Resolve a sender address to its full identity — a direct WorkProvider, an
 * ImageSource intermediary, or neither. See the module doc for the precedence order.
 *
 * Does NOT change `matchProviderByDomain`'s signature or behaviour — it is called
 * exactly as any other caller would, and its own outcome (matched/unmatched/ambiguous,
 * matchedBy, ambiguousProviderIds, …) is threaded through unchanged inside the
 * `{ kind: 'provider' }` arm.
 */
export function matchSenderIdentity(
  senderAddress: string,
  providers: readonly ProviderMatchRecord[],
  imageSources: readonly ImageSourceMatchRecord[],
): SenderIdentityMatch {
  const domain = domainOf(senderAddress);
  const providerResult = matchProviderByDomain(senderAddress, providers);

  // 1) ADDRESS-LEVEL provider match always wins — an exact, curated override for
  //    generic domains (gmail/outlook) that cannot be domain-keyed (915's OAK/YML
  //    precedent). Whatever `matchProviderByDomain` decided at address level (matched
  //    OR ambiguous) is authoritative; nothing below re-litigates it.
  if (providerResult.matchedBy === 'address') {
    return { kind: 'provider', result: providerResult };
  }

  // 2) INTERMEDIARY — domain-level ImageSource(kind=intermediary) match, checked BEFORE
  //    a domain-level provider outcome (defensive precedence — see module doc).
  //    Re-asserts kind==='intermediary' itself rather than trusting the caller's filter.
  if (domain) {
    const hit = imageSources.find(
      (s) => s.kind === 'intermediary' && s.emailDomain.trim().toLowerCase() === domain,
    );
    if (hit) {
      return {
        kind: 'intermediary',
        imageSourceId: hit.imageSourceId,
        name: hit.name,
        candidateProviderIds: hit.candidateProviderIds,
        matchedDomain: domain,
      };
    }
  }

  // 3) DOMAIN-LEVEL provider match/ambiguity — today's behaviour, unchanged.
  if (providerResult.outcome === 'matched' || providerResult.outcome === 'ambiguous') {
    return { kind: 'provider', result: providerResult };
  }

  // 4) Nothing matched either corpus.
  return { kind: 'none', matchedDomain: domain };
}
