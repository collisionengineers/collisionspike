/* ============================================================
   intake-engine — Stage 1: identify the principal from the sender address.

   Reimplements the domain package's direct-address-to-domain matching approach
   (packages/domain/src/domain/provider-match.ts) against THIS package's own registry
   shape — deliberately not imported, since this is a from-scratch registry design
   with its own entry shape (relationship, candidatePrincipals, etc.).

   THE RULES:
     - Match on the DOMAIN AFTER the last '@' only. No alias/fuzzy/substring matching.
     - A full sender-ADDRESS match (`knownEmailAddresses[]`) is exact and takes
       PRECEDENCE over a domain match (for generic domains that can't be domain-keyed).
     - A domain/address matching >1 ACTIVE registry entries is AMBIGUOUS — never
       auto-pick. Surfaced as 'ambiguous' with the colliding principal codes.
     - A match against a 'direct' entry resolves straight to that principalCode.
     - A match against an 'intermediary' entry:
         - 0 candidates -> misconfigured; 'needs_review' (nothing to route to).
         - 1 candidate -> trivially resolved, no ambiguity; 'matched'.
         - >1 candidates -> 'intermediary' outcome; caller must run Stage 1b
           (resolve-intermediary-principal.ts) against document/body content — this
           stage NEVER auto-picks among them.
     - No match at all -> 'unmatched'. Callers still proceed (principal needs_review
       downstream), never blocked here.
     - Only ACTIVE registry entries are eligible.

   PURE + DETERMINISTIC + FRAMEWORK-FREE.
   ============================================================ */

import type { ProviderRegistryEntry } from '../registry/schema.js';

export type IdentifyPrincipalOutcome = 'matched' | 'unmatched' | 'ambiguous' | 'intermediary' | 'needs_review';

export interface IdentifyPrincipalResult {
  outcome: IdentifyPrincipalOutcome;
  /** The normalised domain looked up (lower-case, after '@'). '' if unparseable. */
  matchedDomain: string;
  /** The normalised full address looked up (lower-case). Only set when parseable. */
  matchedAddress?: string;
  /** Which signal produced the hit that led to this outcome. */
  matchedBy?: 'domain' | 'address';
  /** Set only on 'matched' — the single resolved principal (direct entry, or a
   * single-candidate intermediary). */
  principalCode?: string;
  /** Set only on 'ambiguous' — the colliding registry entries' principal codes. */
  ambiguousPrincipalCodes?: string[];
  /** Set on 'intermediary'/'needs_review' when the hit was an intermediary entry. */
  intermediaryCode?: string;
  /** Set on 'intermediary' — >1 candidates; run Stage 1b against this list. */
  candidatePrincipalCodes?: string[];
}

/** Extract the domain after the LAST '@', lower-cased. '' when unparseable. Unwraps a
 * `"Name" <addr>` display form first. */
export function domainOf(senderAddress: string): string {
  const raw = senderAddress.trim().toLowerCase();
  const lt = raw.lastIndexOf('<');
  const gt = raw.lastIndexOf('>');
  const addr = lt >= 0 && gt > lt ? raw.slice(lt + 1, gt).trim() : raw;
  const at = addr.lastIndexOf('@');
  if (at < 0 || at === addr.length - 1) return '';
  const domain = addr.slice(at + 1).trim();
  if (!domain.includes('.') || /\s/.test(domain)) return '';
  return domain;
}

/** Extract the full normalised `local@domain.tld` address, lower-cased. '' when
 * unparseable. */
export function addressOf(senderAddress: string): string {
  const raw = senderAddress.trim().toLowerCase();
  const lt = raw.lastIndexOf('<');
  const gt = raw.lastIndexOf('>');
  const addr = lt >= 0 && gt > lt ? raw.slice(lt + 1, gt).trim() : raw;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return '';
  return addr;
}

function resolveHit(
  entry: ProviderRegistryEntry,
  matchedDomain: string,
  matchedAddress: string,
  matchedBy: 'domain' | 'address',
): IdentifyPrincipalResult {
  const base = { matchedDomain, matchedAddress: matchedAddress || undefined, matchedBy };

  if (entry.relationship === 'direct') {
    return { ...base, outcome: 'matched', principalCode: entry.principalCode };
  }

  // intermediary
  const candidates = entry.candidatePrincipals;
  if (candidates.length === 0) {
    return { ...base, outcome: 'needs_review', intermediaryCode: entry.principalCode, candidatePrincipalCodes: [] };
  }
  if (candidates.length === 1) {
    return { ...base, outcome: 'matched', principalCode: candidates[0].principalCode };
  }
  return {
    ...base,
    outcome: 'intermediary',
    intermediaryCode: entry.principalCode,
    candidatePrincipalCodes: candidates.map((c) => c.principalCode),
  };
}

export function identifyPrincipal(
  senderAddress: string,
  registry: readonly ProviderRegistryEntry[],
): IdentifyPrincipalResult {
  const address = addressOf(senderAddress);
  const domain = domainOf(senderAddress);
  const active = registry.filter((e) => e.active);

  // 1) ADDRESS-LEVEL — exact, takes precedence.
  if (address) {
    const addrHits = active.filter((e) =>
      e.knownEmailAddresses.some((a) => a.trim().toLowerCase() === address),
    );
    if (addrHits.length === 1) {
      return resolveHit(addrHits[0], domain, address, 'address');
    }
    if (addrHits.length > 1) {
      return {
        outcome: 'ambiguous',
        matchedDomain: domain,
        matchedAddress: address,
        matchedBy: 'address',
        ambiguousPrincipalCodes: addrHits.map((e) => e.principalCode),
      };
    }
  }

  // 2) DOMAIN — the default path.
  if (!domain) {
    return { outcome: 'unmatched', matchedDomain: '' };
  }

  const domainHits = active.filter((e) => e.knownEmailDomains.some((d) => d.trim().toLowerCase() === domain));

  if (domainHits.length === 0) {
    return { outcome: 'unmatched', matchedDomain: domain };
  }
  if (domainHits.length > 1) {
    return {
      outcome: 'ambiguous',
      matchedDomain: domain,
      matchedBy: 'domain',
      ambiguousPrincipalCodes: domainHits.map((e) => e.principalCode),
    };
  }

  return resolveHit(domainHits[0], domain, address, 'domain');
}
