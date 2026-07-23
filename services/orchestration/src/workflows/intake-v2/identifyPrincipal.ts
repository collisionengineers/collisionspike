/** *
 * Durable activity: Stage 1 of the from-scratch intake engine (`@cs/intake-engine`) —
 * resolve the sender's identity (a direct provider, an intermediary needing Stage 1b
 * disambiguation, or neither) from the pure, zero-I/O provider registry.
 *
 * `loadRegistry()` is the intake-engine's own registry loader (reads
 * `services/intake-engine/src/registry/providers/*.json` — a read-only, local-repo
 * read, never a live API call); `identifyPrincipal` is Stage 1 of the pipeline
 * (`services/intake-engine/src/pipeline/identify-principal.ts`). This activity does
 * nothing but call those two functions and log the outcome — see that module's own doc
 * comment for the full matching-rule contract (domain-vs-address precedence, ambiguity,
 * intermediary candidate counts).
 *
 * NOT wired into `intakeOrchestrator.ts`'s live intake decision this pass — see
 * `intake-v2/README.md`. This activity exists, is registered, and is unit-tested so a
 * follow-up iteration can call it directly.
 */

import * as df from 'durable-functions';
import { loadRegistry, identifyPrincipal, type IdentifyPrincipalResult } from '@cs/intake-engine';

export interface IdentifyPrincipalV2Input {
  senderAddress: string;
}

/** Callable in-process (no Durable round-trip) — also what the registered activity
 *  below delegates to. */
export function identifyPrincipalV2Core(input: IdentifyPrincipalV2Input): IdentifyPrincipalResult {
  const registry = loadRegistry();
  return identifyPrincipal(input.senderAddress ?? '', registry.all);
}

df.app.activity('identifyPrincipalV2', {
  handler: async (input: IdentifyPrincipalV2Input, ctx): Promise<IdentifyPrincipalResult> => {
    const result = identifyPrincipalV2Core(input);
    ctx.log(
      JSON.stringify({
        evt: 'identifyPrincipalV2',
        outcome: result.outcome,
        domain: result.matchedDomain,
        principalCode: result.principalCode,
      }),
    );
    return result;
  },
});
