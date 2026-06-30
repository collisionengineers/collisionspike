/* ============================================================
   Collision Engineers — Provider email-domain matching (DOMAIN LOGIC, M1).

   Phase-1 plan §5.8 (`Flow_ProviderMatch`). Resolves the sender's email domain
   to a WorkProvider via `knownEmailDomains[]`. Mirrors the collisioncc intake
   provider-by-domain correlation; never calls it.

   THE RULES (§5.8):
     - Match on the DOMAIN AFTER '@' only. NO alias matching, no fuzzy/substring.
     - EXCEPTION (address-level): a provider may also list FULL sender addresses
       (`knownEmailAddresses[]`) for generic domains that cannot be domain-keyed
       (e.g. a provider that emails from `someone@gmail.com`). A full-address hit
       is EXACT and takes PRECEDENCE over a domain hit. Same no-alias discipline;
       same >1-active-provider => 'ambiguous' guard.
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
  /**
   * Full sender addresses this provider sends from, e.g. ["networkhduk@gmail.com"].
   * For generic domains (gmail/outlook/etc.) that cannot be domain-keyed. Matched
   * verbatim (exact, case-insensitive); takes precedence over a domain match.
   * Optional — absent/empty on the vast majority of providers.
   */
  knownEmailAddresses?: readonly string[];
  /** Inactive providers are never matched. */
  active: boolean;
  /**
   * The provider's automation trust level (manual | review_auto | full_auto). Optional +
   * additive: it lets the intake orchestrator branch on the matched provider's mode
   * (work-todo-spike: automation-mode) without a second corpus read. Absent on records
   * that predate the field; callers treat absent as the live default 'review_auto'.
   */
  providerAutomationMode?: 'manual' | 'review_auto' | 'full_auto';
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
  /** Which signal produced a 'matched'/'ambiguous' outcome. */
  matchedBy?: 'domain' | 'address';
  /** The normalised full address that was looked up (lower-case). '' if unparseable. */
  matchedAddress?: string;
  /** On 'ambiguous', the providers that collided (on the domain OR the address). */
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
 * Extract the full normalised sender address (lower-cased, `<addr>` unwrapped).
 * Returns '' when there is no usable `local@domain.tld` address.
 */
export function addressOf(senderAddress: string): string {
  const raw = senderAddress.trim().toLowerCase();
  const lt = raw.lastIndexOf('<');
  const gt = raw.lastIndexOf('>');
  const addr = lt >= 0 && gt > lt ? raw.slice(lt + 1, gt).trim() : raw;
  // Shape check: local@domain.tld, no whitespace.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return '';
  return addr;
}

/**
 * Match a sender address to a WorkProvider.
 *
 * ORDER (§5.8 + address-level exception):
 *   1. ADDRESS-LEVEL — exact full-address hit in `knownEmailAddresses[]`. The only
 *      signal for generic domains (gmail/outlook) that can't be domain-keyed.
 *      Takes PRECEDENCE over a domain hit.
 *   2. DOMAIN — exact domain hit in `knownEmailDomains[]` (the default path).
 *
 * Both are exact, case-insensitive, no-alias. Ambiguity (signal → >1 ACTIVE
 * provider) NEVER auto-picks — it returns 'ambiguous' with the colliding ids.
 * (Name kept as `matchProviderByDomain` — the shared entry point the API/SPA/orch call.)
 */
export function matchProviderByDomain(
  senderAddress: string,
  providers: readonly ProviderMatchRecord[],
): ProviderMatchResult {
  const address = addressOf(senderAddress);
  const domain = domainOf(senderAddress);

  // 1) ADDRESS-LEVEL — exact, takes precedence (generic-domain providers).
  if (address) {
    const addrHits = providers.filter(
      (p) =>
        p.active &&
        (p.knownEmailAddresses ?? []).some((a) => a.trim().toLowerCase() === address),
    );
    if (addrHits.length === 1) {
      return {
        outcome: 'matched',
        matchedDomain: domain,
        matchedAddress: address,
        matchedBy: 'address',
        workProviderId: addrHits[0].workProviderId,
        principalCode: addrHits[0].principalCode,
      };
    }
    if (addrHits.length > 1) {
      return {
        outcome: 'ambiguous',
        matchedDomain: domain,
        matchedAddress: address,
        matchedBy: 'address',
        ambiguousProviderIds: addrHits.map((p) => p.workProviderId),
      };
    }
  }

  // 2) DOMAIN — the default path.
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
      matchedBy: 'domain',
      ambiguousProviderIds: hits.map((p) => p.workProviderId),
    };
  }

  return {
    outcome: 'matched',
    matchedDomain: domain,
    matchedBy: 'domain',
    workProviderId: hits[0].workProviderId,
    principalCode: hits[0].principalCode,
  };
}
