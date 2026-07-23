/* ============================================================
   intake-engine — the composed pipeline.

   Sequences Stage 1 (identify-principal) -> optional Stage 1b
   (resolve-intermediary-principal) -> Stage 2 (classify-email-type) -> Stage 3
   (mint-case-number), with an EXPLICIT needs_review/ambiguous exit at every point
   where an earlier stage could not safely resolve. Never falls through to a guess
   anywhere — every early-return below corresponds to a documented guard in the stage
   it reads from.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No I/O of its own — `registry` is supplied by
   the caller (via registry/loader.ts's `loadRegistry()`), this module never reads a
   provider file itself.
   ============================================================ */

import { defaultEntryFor } from '../registry/defaults.js';
import type { ProviderRegistry } from '../registry/loader.js';
import { identifyPrincipal, type IdentifyPrincipalResult } from './identify-principal.js';
import { resolveIntermediaryPrincipal, type ResolveIntermediaryResult } from './resolve-intermediary-principal.js';
import { classifyEmailType, type ClassifyEmailTypeResult, type EmailType } from './classify-email-type.js';
import { mintCaseNumber, type MintCaseNumberResult } from './mint-case-number.js';

export interface RunIntakePipelineInput {
  senderAddress: string;
  /** Combined body/document text, used both for Stage 1b intermediary resolution and
   * Stage 2 email-type classification — this rebuild does not (yet) need to
   * distinguish "body text" from "attached document text" as separate signals. */
  contentText: string;
  registry: ProviderRegistry;
  /** Passed straight through to mint-case-number.ts — see that module's doc comment
   * for why this package does no calendar logic of its own. */
  year: string;
}

export type PipelineOutcome = 'resolved' | 'needs_review' | 'ambiguous' | 'unmatched';

export interface PipelineResult {
  outcome: PipelineOutcome;
  /** Set only on 'resolved'. */
  principalCode?: string;
  emailType?: EmailType;
  caseNumberContract?: MintCaseNumberResult;
  /** Diagnostics from every stage that actually ran — always populated where
   * relevant; never load-bearing for correctness beyond what already produced
   * `outcome`. */
  identify: IdentifyPrincipalResult;
  intermediaryResolution?: ResolveIntermediaryResult;
  classify?: ClassifyEmailTypeResult;
}

export function runIntakePipeline(input: RunIntakePipelineInput): PipelineResult {
  const identify = identifyPrincipal(input.senderAddress, input.registry.all);

  if (identify.outcome === 'unmatched') {
    return { outcome: 'unmatched', identify };
  }
  if (identify.outcome === 'ambiguous') {
    return { outcome: 'ambiguous', identify };
  }
  if (identify.outcome === 'needs_review') {
    // Stage 1's own needs_review (e.g. a misconfigured intermediary with 0 candidates).
    return { outcome: 'needs_review', identify };
  }

  let principalCode: string;
  let intermediaryResolution: ResolveIntermediaryResult | undefined;

  if (identify.outcome === 'intermediary') {
    // identify-principal.ts only returns 'intermediary' for an entry it just read out
    // of this same registry, so this lookup cannot miss in practice — the guard below
    // is defensive, not expected to trigger.
    const intermediaryEntry = input.registry.byPrincipalCode.get(identify.intermediaryCode as string);
    if (!intermediaryEntry) {
      return { outcome: 'needs_review', identify };
    }

    intermediaryResolution = resolveIntermediaryPrincipal(intermediaryEntry.candidatePrincipals, input.contentText);
    if (intermediaryResolution.outcome === 'needs_review') {
      return { outcome: 'needs_review', identify, intermediaryResolution };
    }
    principalCode = intermediaryResolution.principalCode as string;
  } else {
    principalCode = identify.principalCode as string;
  }

  // The resolved principal may not have its own registry file yet (e.g. an
  // intermediary's candidate that hasn't been independently onboarded) — fall back to
  // the fully-defaulted entry rather than throwing or guessing; see registry/defaults.ts.
  const principalEntry = input.registry.byPrincipalCode.get(principalCode) ?? defaultEntryFor(principalCode);

  const classify = classifyEmailType(principalEntry, input.contentText);
  if (classify.emailType === 'needs_review') {
    return { outcome: 'needs_review', identify, intermediaryResolution, classify };
  }

  const caseNumberContract = mintCaseNumber({ principalCode, year: input.year, emailType: classify.emailType });

  return {
    outcome: 'resolved',
    principalCode,
    emailType: classify.emailType,
    caseNumberContract,
    identify,
    intermediaryResolution,
    classify,
  };
}
