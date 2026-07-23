/* ============================================================
   intake-engine — Stage 2: classify the email type from a resolved principal's
   registry entry + the email body/document text.

   DECISION ORDER (deliberate):
     1. Dual-commissioning phrase (registry-configurable, defaults to QDOS's real
        template phrase "REPORT + AUDIT REPORT") -> '1c_inspection_and_audit',
        REGARDLESS of any audit-signal phrase also being present. This is checked
        FIRST because a dual-commissioning instruction IS an audit instruction (it
        commissions both a report AND an audit of another report) — checking
        audit-signal first could never distinguish the two.
     2. No audit-signal phrase present at all -> '1a_standard' (the default, unless
        proven otherwise — never assume audit).
     3. Audit-signal phrase present -> look for a verdict phrase:
          - repairable phrase only -> '1b_audit_repairable'
          - total-loss phrase only -> '1b_audit_total_loss'
          - BOTH present (contradictory) -> 'needs_review'
          - NEITHER present (undetermined) -> 'needs_review'
        A resolved verdict is additionally gated by `caseTypeMarkers`: if the
        provider's registry entry DECLARES a non-empty `caseTypeMarkers` list and the
        detected verdict isn't in it, that is surfaced as 'needs_review' rather than
        silently trusted — a text match against a marker the provider's own registry
        entry says it doesn't produce is exactly the kind of surprise this pipeline
        must never paper over with a guess. An EMPTY `caseTypeMarkers` list is treated
        as non-restrictive (not yet declared), not as "no markers allowed".

   'needs_review' is used ONLY for the audit-detected-but-verdict-unresolved (or
   verdict-conflicts-with-declared-markers) cases above — it is NEVER a default and
   NEVER guessed into for any other reason.

   PURE + DETERMINISTIC + FRAMEWORK-FREE.
   ============================================================ */

import type { ProviderRegistryEntry } from '../registry/schema.js';

export type EmailType =
  | '1a_standard'
  | '1b_audit_repairable'
  | '1b_audit_total_loss'
  | '1c_inspection_and_audit'
  | 'needs_review';

export interface ClassifyEmailTypeResult {
  emailType: EmailType;
  /** Diagnostics — which literal phrase(s) fired, for an audit trail. Never
   * load-bearing for correctness beyond what already produced `emailType`. */
  matchedDualCommissioningPhrase?: string;
  matchedAuditSignalPhrase?: string;
  matchedVerdictPhrase?: string;
}

function findPhrase(text: string, phrases: readonly string[]): string | undefined {
  const lower = text.toLowerCase();
  return phrases.find((phrase) => {
    const needle = phrase.trim().toLowerCase();
    return needle !== '' && lower.includes(needle);
  });
}

export function classifyEmailType(entry: ProviderRegistryEntry, contentText: string): ClassifyEmailTypeResult {
  const rules = entry.emailTypeRules;

  const dualHit = findPhrase(contentText, rules.dualCommissioningPhrases);
  if (dualHit) {
    return { emailType: '1c_inspection_and_audit', matchedDualCommissioningPhrase: dualHit };
  }

  const auditHit = findPhrase(contentText, rules.auditSignalPhrases);
  if (!auditHit) {
    return { emailType: '1a_standard' };
  }

  const repairableHit = findPhrase(contentText, rules.auditRepairableVerdictPhrases);
  const totalLossHit = findPhrase(contentText, rules.auditTotalLossVerdictPhrases);

  if (repairableHit && totalLossHit) {
    // Contradictory content — never guess between two fired verdict signals.
    return { emailType: 'needs_review', matchedAuditSignalPhrase: auditHit };
  }

  const markersDeclared = entry.caseTypeMarkers.length > 0;

  if (repairableHit) {
    if (markersDeclared && !entry.caseTypeMarkers.includes('audit_repairable')) {
      return { emailType: 'needs_review', matchedAuditSignalPhrase: auditHit, matchedVerdictPhrase: repairableHit };
    }
    return { emailType: '1b_audit_repairable', matchedAuditSignalPhrase: auditHit, matchedVerdictPhrase: repairableHit };
  }

  if (totalLossHit) {
    if (markersDeclared && !entry.caseTypeMarkers.includes('audit_total_loss')) {
      return { emailType: 'needs_review', matchedAuditSignalPhrase: auditHit, matchedVerdictPhrase: totalLossHit };
    }
    return { emailType: '1b_audit_total_loss', matchedAuditSignalPhrase: auditHit, matchedVerdictPhrase: totalLossHit };
  }

  // Audit detected, verdict undetermined — NEVER guess.
  return { emailType: 'needs_review', matchedAuditSignalPhrase: auditHit };
}
