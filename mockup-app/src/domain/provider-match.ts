/* ============================================================
   Collision Engineers — Provider email-domain matching (DOMAIN LOGIC, M1).

   Phase-1 plan §5.8 (`Flow_ProviderMatch`). Resolves the sender's email domain
   to a WorkProvider via `knownEmailDomains[]`. Mirrors the collisioncc intake
   provider-by-domain correlation; never calls it.

   THE RULES (§5.8):
     - Match on the DOMAIN AFTER '@' only. NO alias matching, no fuzzy/substring.
     - Unique-domain discipline keeps Case/PO generation safe.
     - A domain mapping to >1 ACTIVE provider is AMBIGUOUS -> never auto-pick
       (an auto-picked principalCode would mint an unsafe Case/PO). Surface for
       staff review instead.
     - No match -> 'unmatched'; the case still proceeds (provider field
       needs_review), never blocks intake.
     - Only ACTIVE providers are eligible.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No React, no I/O, no live calls.
   ============================================================ */

/** The minimum a provider corpus record must expose for domain matching. */
export interface ProviderMatchRecord {
  workProviderId: string;
  /** One code: lowercase = EVA code, UPPERCASE = Box code & Case/PO. */
  principalCode: string;
  /** Domains this provider sends from, e.g. ["acme.co.uk"]. Matched verbatim, no aliasing. */
  knownEmailDomains: readonly string[];
  /** Inactive providers are never matched. */
  active: boolean;
}

export type ProviderMatchOutcome = 'matched' | 'unmatched' | 'ambiguous';

export interface ProviderMatchResult {
  /** Set only on 'matched'. */
  workProviderId?: string;
  /** Set only on 'matched'. */
  principalCode?: string;
  outcome: ProviderMatchOutcome;
  /** The normalised domain that was looked up (lower-case, after '@'). '' if unparseable. */
  matchedDomain: string;
  /** On 'ambiguous', the providers that collided on the domain (for the review UI). */
  ambiguousProviderIds?: string[];
}

/**
 * Extract the domain after the LAST '@' (display-name addresses like
 * `"A B" <a@b.com>` are handled by the caller's address parse; here we take the
 * raw address). Lower-cased, trimmed. Returns '' when there is no usable domain.
 */
export function domainOf(senderAddress: string): string {
  const raw = senderAddress.trim().toLowerCase();
  // Strip a `<addr>` wrapper if present.
  const lt = raw.lastIndexOf('<');
  const gt = raw.lastIndexOf('>');
  const addr = lt >= 0 && gt > lt ? raw.slice(lt + 1, gt).trim() : raw;
  const at = addr.lastIndexOf('@');
  if (at < 0 || at === addr.length - 1) return '';
  const domain = addr.slice(at + 1).trim();
  // Reject a domain with no dot or with stray whitespace.
  if (!domain.includes('.') || /\s/.test(domain)) return '';
  return domain;
}

/**
 * Match a sender address to a WorkProvider by exact domain.
 * Exact, case-insensitive, no-alias. Ambiguity (domain → >1 active provider)
 * NEVER auto-picks — it returns 'ambiguous' with the colliding ids.
 */
export function matchProviderByDomain(
  senderAddress: string,
  providers: readonly ProviderMatchRecord[],
): ProviderMatchResult {
  const domain = domainOf(senderAddress);
  if (!domain) {
    return { outcome: 'unmatched', matchedDomain: '' };
  }

  const hits = providers.filter(
    (p) =>
      p.active &&
      p.knownEmailDomains.some((d) => d.trim().toLowerCase() === domain),
  );

  if (hits.length === 0) {
    return { outcome: 'unmatched', matchedDomain: domain };
  }

  if (hits.length > 1) {
    return {
      outcome: 'ambiguous',
      matchedDomain: domain,
      ambiguousProviderIds: hits.map((p) => p.workProviderId),
    };
  }

  return {
    outcome: 'matched',
    matchedDomain: domain,
    workProviderId: hits[0].workProviderId,
    principalCode: hits[0].principalCode,
  };
}
