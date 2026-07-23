/** *
 * Durable activity: wraps `@cs/intake-engine`'s Case/PO number ALLOCATION CONTRACT
 * (`mintCaseNumber`/`formatCaseNumber` — services/intake-engine/src/pipeline/mint-case-number.ts).
 *
 * This activity has NO database access — it produces `{ sequenceScopeKey, prefix }`
 * only, exactly like the pure function it wraps. The actual live sequence allocation
 * (the MAX+1 probe under `pg_advisory_xact_lock`) still belongs to the Data API:
 * `services/data-api/src/features/cases/case-po.ts`'s `mintCasePo`. THAT IS THE SEAM a
 * future PR would need to change to consume this contract — `mintCasePo` would need to
 * take `sequenceScopeKey` (in place of its own `${principal}${yy}` prefix construction)
 * and `prefix` (in place of its own `'' | 'A.' | 'AP.' | 'D.'` marker parameter).
 *
 * That rewiring is explicitly NOT done in this pass, for two confirmed, real reasons
 * (not oversights — see `@cs/intake-engine`'s README §4 and this activity's own tests):
 *   1. CASING — `case-po.ts` mints upper-case `'A.'/'AP.'` markers; this engine's
 *      contract mints lower-case `'a.'/'ap.'` on purpose (a confirmed, deliberate
 *      rebuild decision, not a bug to reconcile away).
 *   2. SCOPING — `case-po.ts` runs an INDEPENDENT sequence per (marker, principal,
 *      year) (ADR-0021/ADR-0022's numbering rules); this engine's contract shares ONE
 *      counter per (principal, year) across every email type — also confirmed,
 *      deliberate, and incompatible with `case-po.ts`'s current SQL without a real
 *      schema/behaviour change there (`services/data-api` is out of scope for this
 *      pass).
 *
 * NOT wired into `intakeOrchestrator.ts`'s live intake decision this pass — see
 * `intake-v2/README.md`.
 */

import * as df from 'durable-functions';
import {
  mintCaseNumber,
  formatCaseNumber,
  type EmailTypeForCaseNumber,
  type MintCaseNumberResult,
} from '@cs/intake-engine';

export interface MintCaseNumberV2Input {
  principalCode: string;
  year: string;
  emailType: EmailTypeForCaseNumber;
}

export function mintCaseNumberV2Core(input: MintCaseNumberV2Input): MintCaseNumberResult {
  return mintCaseNumber({
    principalCode: input.principalCode,
    year: input.year,
    emailType: input.emailType,
  });
}

df.app.activity('mintCaseNumberV2', {
  handler: async (input: MintCaseNumberV2Input, ctx): Promise<MintCaseNumberResult> => {
    const result = mintCaseNumberV2Core(input);
    ctx.log(
      JSON.stringify({
        evt: 'mintCaseNumberV2',
        principalCode: input.principalCode,
        sequenceScopeKey: result.sequenceScopeKey,
        prefix: result.prefix,
      }),
    );
    return result;
  },
});

// Re-exported so a caller that already has an allocated sequence number (from the
// Data API's own — separately scoped, see doc above — counter) can still reuse this
// engine's pure formatter without importing `@cs/intake-engine` directly.
export { formatCaseNumber };
