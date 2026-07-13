/**
 * orchestration/src/functions/activities/enrich.ts  (activity 6)
 *
 * Durable activity: ask the Data API's single vehicle-lookup route to look up,
 * validate, and persist vehicle details. Gated by ENRICHMENT_ENABLED.
 *
 * Input contract (from intakeOrchestrator, which has the best VRM + the parse result):
 *   { caseId, vrm, documentHasMileage }
 *   - vrm: the case's best VRM (parser PDF VRM preferred over the email sniff). No VRM → skip
 *     (nothing to look up). The enrichment Function REQUIRES { vrm }.
 *   - documentHasMileage: true when the parser already extracted a mileage value → the Function
 *     skips the MOT estimate (the document is authoritative, ADR-0006).
 *
 * The Data API route is POST /api/vehicle-data/lookup and successful provider-level
 * misses remain 200 advisory envelopes (warnings carry soft failures). A non-2xx is an
 * API/auth/request condition:
 *   - 401/403  → auth/config — SURFACE (ctx.error + audit), don't
 *                silently swallow; do NOT throw (a config fault won't fix on retry, and
 *                enrichment must never block intake).
 *   - 5xx      → transient host fault → throw so the Durable retry policy retries.
 *   - 404/other 4xx → nothing to enrich / not found → skip gracefully.
 *
 * Provider credentials live behind the enrichment Function; orchestration needs only
 * its normal Data API managed-identity audience and no direct provider configuration.
 */

import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { dataApi } from '../../lib/data-api.js';
import { isRetryableVehicleLookupFailure } from '../../lib/vehicle-data-intake.js';

interface EnrichInput {
  caseId: string;
  vrm?: string;
  documentHasMileage?: boolean;
  idempotencyKey?: string;
}

df.app.activity('enrich', {
  handler: async (input: EnrichInput, ctx): Promise<unknown> => {
    if (!gates.enrichment()) {
      ctx.log('[enrich] skipped — ENRICHMENT_ENABLED=false');
      return { skipped: true, reason: 'gate_off' };
    }

    const vrm = (input.vrm ?? '').trim();
    if (!vrm) {
      ctx.log(`[enrich] no VRM resolved for case ${input.caseId}; nothing to enrich — skipping`);
      return { skipped: true, reason: 'no_vrm' };
    }

    // The route still re-reads saved case state for mileage precedence. The activity's
    // resolved VRM is supplied as a fallback for the narrow window before that value is
    // visible on the case; a conflicting saved VRM fails closed at the API boundary.
    let result;
    try {
      result = await dataApi.lookupVehicle(input.caseId, vrm, input.idempotencyKey);
    } catch (error) {
      if (isRetryableVehicleLookupFailure(error)) throw error;
      ctx.error(`[enrich] advisory vehicle lookup rejected for case ${input.caseId}: ${String(error)}`);
      return { enriched: false, skipped: true, reason: 'advisory_lookup_rejected' };
    }
    ctx.log(JSON.stringify({ evt: 'enrich', caseId: input.caseId, applied: result.persisted.applied }));
    return {
      enriched: result.lookup.status === 'found',
      applied: result.persisted.applied,
      warnings: result.mileage.warnings.map((warning) => warning.message),
    };
  },
});
