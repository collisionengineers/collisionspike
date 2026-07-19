/**
 * retro-parse-map.ts (ADR-0022 / TKT-058 / TKT-219).
 *
 * The PURE mapping of a parse envelope onto the retro create payload's parser fields,
 * shared by the reconstruction arms (retro-reconstruct.ts) and the related-correspondence
 * ingest child (retro-related-ingest.ts). Framework-free and replay-safe: pure over
 * checkpointed activity results, unit-tested without the Durable harness.
 */

import type { ParserEvaFields } from '../../adapters/data-api.js';
import {
  resolveClaimantInputs,
  supplementAccidentCircumstancesFromBody,
  supplementClaimantNameFromBody,
} from '../../platform/supplement-parse.js';

/** The parse activity's envelope shape as the retro rungs consume it. */
export interface RetroParseResult {
  vrm?: { value?: string };
  reference?: { value?: string };
  extraction?: Record<string, { value?: string } | undefined>;
  /** TKT-220 (G5) — the instructing provider resolved across ALL parsed docs
   *  (parse.ts resolveWorkProviderAcrossDocs); preferred over the chosen envelope's
   *  extraction exactly as live intake does. */
  resolvedWorkProvider?: string;
  skipped?: boolean;
}

/** Pure mapping of a parse envelope onto the create payload's parser fields —
 *  mirrors intakeOrchestrator's forwarding block exactly (fill-if-empty semantics
 *  live in the API). Replay-safe: pure over checkpointed activity results. */
export function mapRetroParse(
  parseResult: RetroParseResult,
  bodyText: string,
  sourceReference: string,
): {
  parserEva: ParserEvaFields;
  parserVrm: string;
  parserRef: string;
  parserMileage: string;
  parserMileageUnit: string;
} {
  const ex = parseResult.extraction ?? {};
  const exVal = (k: string): string => (ex[k]?.value ?? '').trim();
  // TKT-220 (G5) — mirror intake exactly: prefer the cross-document resolved provider (an
  // audit-shaped reconstruction's chosen envelope may be the EVA report whose own
  // extraction.work_provider is blank); fall back to the chosen envelope's value.
  const exWorkProvider = (parseResult.resolvedWorkProvider ?? '').trim() || exVal('work_provider');
  const claimantInputs = resolveClaimantInputs(
    exVal('claimant_name'),
    supplementClaimantNameFromBody(bodyText),
  );
  const stableSourceReference = sourceReference.trim().slice(0, 400);
  return {
    parserEva: {
      source_reference: stableSourceReference,
      work_provider: exWorkProvider.toUpperCase() === 'UNKNOWN' ? '' : exWorkProvider,
      vehicle_model: exVal('vehicle_model'),
      claimant_name: claimantInputs.value,
      claimant_telephone: exVal('claimant_telephone'),
      claimant_email: exVal('claimant_email'),
      date_of_loss: exVal('date_of_loss'),
      date_of_instruction: exVal('date_of_instruction'),
      accident_circumstances:
        exVal('accident_circumstances') || supplementAccidentCircumstancesFromBody(bodyText),
      vat_status: exVal('vat_status'),
      ...(claimantInputs.fromEmailBody
        ? { sources: { claimant_name: 'email_text' as const } }
        : {}),
      ...(claimantInputs.conflicts.length > 0
        ? {
            claimant_conflicts: claimantInputs.conflicts.map((value) => ({
              value,
              source: 'email_text' as const,
              source_reference: stableSourceReference,
            })),
          }
        : {}),
    },
    parserVrm: (parseResult.vrm?.value ?? '').trim(),
    parserRef: (parseResult.reference?.value ?? '').trim(),
    parserMileage: exVal('mileage'),
    parserMileageUnit: exVal('mileage_unit'),
  };
}
