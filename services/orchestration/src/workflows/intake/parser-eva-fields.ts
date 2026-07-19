/**
 * Assemble the EVA persistence field set for an email-minted case from the parsed
 * instruction-document extraction, supplementing claimant name and accident
 * circumstances from the email body when the document left them empty. Pure over
 * the two checkpointed inputs (parser envelope + inbound envelope) so the intake
 * orchestrator stays replay-safe; the caller logs any claimant conflict.
 */

import {
  resolveClaimantInputs,
  supplementAccidentCircumstancesFromBody,
  supplementClaimantNameFromBody,
} from '../../platform/supplement-parse.js';

interface ParserExtractionEnvelope {
  extraction?: Record<string, { value?: string } | undefined>;
  // The instructing provider resolved across ALL parsed docs (parse.ts
  // resolveWorkProviderAcrossDocs) — preferred over the chosen envelope's extraction so an
  // audit email's PCH/QDOS provider survives when the EVA report is the selected envelope.
  resolvedWorkProvider?: string;
}

interface InboundEvaEnvelope {
  body?: string;
  internetMessageId?: string;
  messageId?: string;
}

export interface ParserEvaFields {
  source_reference: string;
  work_provider: string;
  vehicle_model: string;
  claimant_name: string;
  claimant_telephone: string;
  claimant_email: string;
  date_of_loss: string;
  date_of_instruction: string;
  accident_circumstances: string;
  vat_status: string;
  sources?: { claimant_name: 'email_text' };
  claimant_conflicts?: Array<{ value: string; source: 'email_text'; source_reference: string }>;
}

/**
 * Forward every parser-owned EVA field, not only VRM/reference/mileage, so an
 * email-minted case shows more than just its registration + Case/PO. caseResolve →
 * resolve-persist fills them fill-if-empty + constraint-guarded. inspection_address is
 * omitted (corpus picker — ADR-0013). work_provider is forwarded when present; UNKNOWN is
 * treated as empty and the Data API falls back to corpus display_name. Returns the field
 * set plus the count of body-derived claimant conflicts the caller should log.
 */
export function buildParserEvaFields(
  parseResult: ParserExtractionEnvelope,
  inbound: InboundEvaEnvelope,
): { parserEvaFields: ParserEvaFields; claimantConflictCount: number } {
  const ex = parseResult.extraction ?? {};
  const exVal = (k: string): string => (ex[k]?.value ?? '').trim();
  // Prefer the provider resolved ACROSS all parsed docs (already filtered to non-empty,
  // non-UNKNOWN, non-engineer-report in parse.ts). On an audit email the chosen envelope is
  // the EVA report whose extraction.work_provider is '' — the real PCH/QDOS instruction lives
  // in another candidate, so falling back to the chosen envelope's value would blank it. For a
  // single-doc email resolvedWorkProvider == the chosen envelope's value, so behaviour is
  // unchanged. Fall back to the chosen envelope's value if resolvedWorkProvider is absent
  // (older parser bundle not yet redeployed).
  const resolvedWorkProvider = (parseResult.resolvedWorkProvider ?? '').trim();
  const exWorkProvider = resolvedWorkProvider || exVal('work_provider');
  const documentClaimantName = exVal('claimant_name');
  const bodyClaimant = supplementClaimantNameFromBody(String(inbound.body ?? ''));
  const claimantInputs = resolveClaimantInputs(documentClaimantName, bodyClaimant);
  const claimantName = claimantInputs.value;
  const parserEvaFields: ParserEvaFields = {
    source_reference:
      String(inbound.internetMessageId ?? '').trim() ||
      String(inbound.messageId ?? '').trim(),
    work_provider: exWorkProvider.toUpperCase() === 'UNKNOWN' ? '' : exWorkProvider,
    vehicle_model: exVal('vehicle_model'),
    claimant_name: claimantName,
    claimant_telephone: exVal('claimant_telephone'),
    claimant_email: exVal('claimant_email'),
    date_of_loss: exVal('date_of_loss'),
    date_of_instruction: exVal('date_of_instruction'),
    accident_circumstances:
      exVal('accident_circumstances') ||
      supplementAccidentCircumstancesFromBody(String(inbound.body ?? '')),
    vat_status: exVal('vat_status'),
    ...(claimantInputs.fromEmailBody
      ? { sources: { claimant_name: 'email_text' as const } }
      : {}),
    ...(claimantInputs.conflicts.length > 0
      ? {
          claimant_conflicts: claimantInputs.conflicts.map((value) => ({
            value,
            source: 'email_text' as const,
            source_reference:
              String(inbound.internetMessageId ?? '').trim() ||
              String(inbound.messageId ?? '').trim(),
          })),
        }
      : {}),
  };
  return { parserEvaFields, claimantConflictCount: claimantInputs.conflicts.length };
}
