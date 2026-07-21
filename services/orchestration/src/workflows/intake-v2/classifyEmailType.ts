/** *
 * Durable activity: Stage 2 of the from-scratch intake engine (`@cs/intake-engine`) —
 * classify an email into `1a_standard | 1b_audit_repairable | 1b_audit_total_loss |
 * 1c_inspection_and_audit | needs_review`, given an ALREADY-RESOLVED principal code
 * (Stage 1's output — see `identifyPrincipal.ts`) and the message's body/document text.
 *
 * `loadRegistry()` + `defaultEntryFor()` resolve the principal's registry entry exactly
 * as `runIntakePipeline` does (services/intake-engine/src/pipeline/pipeline.ts) — a
 * principal with no registry file yet still classifies against the fully-defaulted
 * fallback entry rather than throwing (see that package's registry/defaults.ts).
 * `classifyEmailType` (Stage 2 itself) is pure phrase-matching against the entry's
 * `emailTypeRules` — see that module's own doc comment for the exact decision order
 * (dual-commissioning first, then audit-signal, then verdict, gated by the entry's
 * declared `caseTypeMarkers`).
 *
 * NOT wired into `intakeOrchestrator.ts`'s live intake decision this pass — see
 * `intake-v2/README.md`.
 */

import * as df from 'durable-functions';
import {
  loadRegistry,
  defaultEntryFor,
  classifyEmailType,
  type ClassifyEmailTypeResult,
} from '@cs/intake-engine';

export interface ClassifyEmailTypeV2Input {
  /** Stage 1's resolved principal code (identifyPrincipal.ts's `principalCode`, after
   *  any Stage 1b intermediary disambiguation) — never a raw sender address. */
  principalCode: string;
  /** Combined body/document text — see the pipeline's own doc comment for why this
   *  rebuild does not (yet) separate the two signals. */
  contentText: string;
}

export function classifyEmailTypeV2Core(input: ClassifyEmailTypeV2Input): ClassifyEmailTypeResult {
  const registry = loadRegistry();
  const principalCode = (input.principalCode ?? '').trim();
  const entry = registry.byPrincipalCode.get(principalCode) ?? defaultEntryFor(principalCode);
  return classifyEmailType(entry, input.contentText ?? '');
}

df.app.activity('classifyEmailTypeV2', {
  handler: async (input: ClassifyEmailTypeV2Input, ctx): Promise<ClassifyEmailTypeResult> => {
    const result = classifyEmailTypeV2Core(input);
    ctx.log(
      JSON.stringify({
        evt: 'classifyEmailTypeV2',
        principalCode: input.principalCode,
        emailType: result.emailType,
      }),
    );
    return result;
  },
});
