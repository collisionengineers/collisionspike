/**
 * orchestration/src/functions/activities/enrich.ts  (activity 6)
 *
 * Durable activity: invoke the enrichment Python Function (DVSA MOT direct + DVLA make
 * fallback via Entra client_credentials + X-API-Key) to suggest vehicle make/model and a
 * mileage estimate, then PERSIST the result onto the case (#1). Gated by ENRICHMENT_ENABLED.
 *
 * Input contract (from intakeOrchestrator, which has the best VRM + the parse result):
 *   { caseId, vrm, documentHasMileage }
 *   - vrm: the case's best VRM (parser PDF VRM preferred over the email sniff). No VRM → skip
 *     (nothing to look up). The enrichment Function REQUIRES { vrm }.
 *   - documentHasMileage: true when the parser already extracted a mileage value → the Function
 *     skips the MOT estimate (the document is authoritative, ADR-0006).
 *
 * The Function route is POST /api/dvsa-mot/enrich and it returns 200 ALWAYS on a real call
 * (advisory; warnings carry soft failures). So non-2xx here is an infra/auth condition:
 *   - 401/403  → auth/config (wrong/missing function key) — SURFACE (ctx.error + audit), don't
 *                silently swallow; do NOT throw (a config fault won't fix on retry, and
 *                enrichment must never block intake).
 *   - 5xx      → transient host fault → throw so the Durable retry policy retries.
 *   - 404/other 4xx → nothing to enrich / not found → skip gracefully.
 *
 * App-settings required: ENRICH_FN_URL, ENRICH_FN_KEY.
 */

import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import type { VehicleDataEnrichmentResponse } from '@cs/domain';
import { isVehicleDataEnrichmentResponse } from '@cs/domain';
import { dataApi } from '../../lib/data-api.js';

interface EnrichInput {
  caseId: string;
  vrm?: string;
  documentHasMileage?: boolean;
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

    const res = await fetch(`${process.env.ENRICH_FN_URL}/api/dvsa-mot/enrich`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-functions-key': process.env.ENRICH_FN_KEY!,
      },
      body: JSON.stringify({ vrm, document_has_mileage: input.documentHasMileage ?? true }),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        // Auth/config — surface, never silently swallow. Not retryable (won't fix on retry),
        // and enrichment is advisory, so don't throw and block the case — record + carry on.
        ctx.error(
          `[enrich] auth/config error ${res.status} calling enrichment for case ${input.caseId} — check ENRICH_FN_KEY`,
        );
        await dataApi.recordAudit({
          action: 'enrichment_failed',
          caseId: input.caseId,
          severity: 'error',
          summary: `enrichment auth/config error ${res.status}`,
        });
        return { enriched: false, error: 'auth', status: res.status };
      }
      if (res.status >= 500) {
        // Transient host fault → throw so the Durable retry policy retries.
        throw new Error(`[enrich] enrichment Function responded ${res.status}`);
      }
      // 404 / other 4xx → nothing to enrich for this case; skip gracefully.
      ctx.log(`[enrich] enrichment returned ${res.status} for case ${input.caseId}; skipping`);
      return { skipped: true, status: res.status };
    }

    const payload: unknown = await res.json();
    if (!isVehicleDataEnrichmentResponse(payload)) {
      ctx.error(
        `[enrich] enrichment returned a non-canonical response for case ${input.caseId}`,
      );
      await dataApi.recordAudit({
        action: 'enrichment_failed',
        caseId: input.caseId,
        severity: 'error',
        summary: 'vehicle lookup returned an invalid response',
      });
      return { enriched: false, error: 'invalid_contract' };
    }
    const result: VehicleDataEnrichmentResponse = payload;

    // Persist the advisory result onto the case (fill-if-empty, server-side). The Data API's
    // internalCasesEnrichment ALREADY writes the single `enrichment_called` audit row, so we do
    // NOT record a second one here — doing so double-counted every enrichment in the activity
    // feed (#94). The data-layer audit is the single source.
    const persisted = await dataApi.persistEnrichment(input.caseId, result);
    ctx.log(JSON.stringify({ evt: 'enrich', caseId: input.caseId, applied: persisted.applied }));
    return { enriched: true, applied: persisted.applied, warnings: result.warnings ?? [] };
  },
});
