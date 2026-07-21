/* ============================================================
   Collision Engineers — intake-engine provider registry SCHEMA.

   This is a from-scratch design for a new provider registry (it does not port or
   reference any existing ADR/ticket field-rule schema). One JSON file per provider
   under src/registry/providers/*.json is the ONLY authoring surface — see loader.ts
   for the merge contract and README.md for "how do I add provider #26".

   Two shapes on purpose:
     - `ProviderRegistryEntryInput` (via `providerRegistryEntryInputSchema`) — the
       PERMISSIVE shape a provider JSON file may contain. Only `principalCode` is
       required; every other field is optional and falls back to defaults.ts.
     - `ProviderRegistryEntry` — the FULLY MERGED, fully-typed shape every pipeline
       stage actually consumes (produced by loader.ts, never read from disk directly).

   PURE TYPES + a zod validator. No I/O here — reading files is loader.ts's job alone.
   ============================================================ */

import { z } from 'zod';

/** 'direct' — the sender IS the instructing principal. 'intermediary' — the sender is
 * a broker/portal that may route to one of several actual instructing principals (see
 * `candidatePrincipals` + resolve-intermediary-principal.ts). */
export const RELATIONSHIPS = ['direct', 'intermediary'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

/** The audit verdict markers this package can classify. Also doubles as the registry's
 * declaration of which verdicts a given provider's audits are actually known to
 * produce (`caseTypeMarkers`) — see classify-email-type.ts for how that gates a
 * detected verdict. */
export const AUDIT_VERDICT_MARKERS = ['audit_repairable', 'audit_total_loss'] as const;
export type AuditVerdictMarker = (typeof AUDIT_VERDICT_MARKERS)[number];

/** One intermediary candidate: a principal this intermediary might be routing to, plus
 * the literal content-signal phrases (case-insensitive substring match) that identify
 * THIS candidate in a message's body/document text. */
export interface CandidatePrincipal {
  principalCode: string;
  contentSignals: string[];
}

/** Phrase-signal configuration for classify-email-type.ts's Stage 2 decision. All
 * phrase lists are matched case-insensitively as plain substrings — no regex, no
 * fuzzy matching (kept deliberately simple; a provider needing more can still only
 * express it as literal phrases here, by design — see README.md). */
export interface EmailTypeRules {
  /** Presence of ANY of these phrases is the dual-commissioning signal ("REPORT +
   * AUDIT REPORT" style) that alone decides '1c_inspection_and_audit', independent of
   * the audit-signal/verdict phrases below. */
  dualCommissioningPhrases: string[];
  /** Presence of ANY of these phrases means "this is an audit instruction" (but not
   * dual-commissioning) — necessary before a repairable/total-loss verdict is even
   * looked for. */
  auditSignalPhrases: string[];
  /** Presence of ANY of these phrases resolves an audit's verdict to repairable. */
  auditRepairableVerdictPhrases: string[];
  /** Presence of ANY of these phrases resolves an audit's verdict to total loss. */
  auditTotalLossVerdictPhrases: string[];
}

/** The fully-merged registry entry every pipeline stage consumes. */
export interface ProviderRegistryEntry {
  principalCode: string;
  relationship: Relationship;
  active: boolean;
  knownEmailDomains: string[];
  knownEmailAddresses: string[];
  /** Only meaningful when `relationship === 'intermediary'`. */
  candidatePrincipals: CandidatePrincipal[];
  /** Which audit verdict markers this provider's audits are known to produce. Empty
   * means "not declared" — classify-email-type.ts treats an empty list as
   * non-restrictive (no gating), not as "no markers allowed". */
  caseTypeMarkers: AuditVerdictMarker[];
  emailTypeRules: EmailTypeRules;
}

const candidatePrincipalInputSchema = z
  .object({
    principalCode: z.string().min(1),
    contentSignals: z.array(z.string()).default([]),
  })
  .strict();

const emailTypeRulesInputSchema = z
  .object({
    dualCommissioningPhrases: z.array(z.string()).optional(),
    auditSignalPhrases: z.array(z.string()).optional(),
    auditRepairableVerdictPhrases: z.array(z.string()).optional(),
    auditTotalLossVerdictPhrases: z.array(z.string()).optional(),
  })
  .strict();

/** The permissive shape a provider JSON file may contain. `_comment` is accepted and
 * ignored (mirrors the `_comment` convention already used by tools/box-scope.json) so
 * seed/illustrative entries can document themselves inline. */
export const providerRegistryEntryInputSchema = z
  .object({
    _comment: z.string().optional(),
    principalCode: z.string().min(1, 'principalCode is required'),
    relationship: z.enum(RELATIONSHIPS).optional(),
    active: z.boolean().optional(),
    knownEmailDomains: z.array(z.string()).optional(),
    knownEmailAddresses: z.array(z.string()).optional(),
    candidatePrincipals: z.array(candidatePrincipalInputSchema).optional(),
    caseTypeMarkers: z.array(z.enum(AUDIT_VERDICT_MARKERS)).optional(),
    emailTypeRules: emailTypeRulesInputSchema.optional(),
  })
  .strict();

export type ProviderRegistryEntryInput = z.infer<typeof providerRegistryEntryInputSchema>;
