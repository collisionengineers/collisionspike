/** *
 * `@cs/intake-engine` wired AUTHORITATIVELY into the live intake path.
 *
 * Two decisions move to the engine when `INTAKE_ENGINE_ENABLED` is on:
 *
 *   1. `identifyingSenderFor` — the address provider-matching runs against. A staff
 *      forward's envelope `From` is a Collision Engineers address, which correctly
 *      matches no provider; the originating provider address is inside the quoted
 *      forward header. Recovering it is what lets a forwarded instruction resolve to its
 *      provider at all. This is the alpha's entire mail shape, so without it the engine
 *      (and the live matcher) see `unmatched` on every message.
 *
 *   2. `decideCaseTypeWithIntakeEngine` — the case-type decision, from the engine's
 *      email-type classifier instead of the parser/classifier signals.
 *
 * TAXONOMY MAPPING. The engine's email types map onto the live `CaseWorkType` cleanly,
 * and deliberately stop at the TYPE — the engine's own Case/PO prefix strings ('a.'/'ap.',
 * lower-case by its own design note) are NOT used. `markerForMint` in
 * packages/domain/src/domain/case-type.ts stays the single owner of marker FORMAT, so the
 * canonical upper-case 'A.'/'AP.' is produced exactly as before and the two conventions
 * never have to be reconciled:
 *
 *   1a_standard              -> standard,         dual false
 *   1b_audit_repairable      -> audit,            dual false
 *   1b_audit_total_loss      -> audit_total_loss, dual false
 *   1c_inspection_and_audit  -> audit,            dual TRUE
 *
 * The `1c` -> dual mapping is not a guess: `markerForMint` already returns '' for a dual
 * decision ("a DUAL letter keeps the standard number"), and the engine's own corpus test
 * independently asserts `1c` yields prefix ''. Both sides already agree.
 *
 * FALLS BACK, NEVER GUESSES. Any engine outcome that is not a resolved, non-needs_review
 * classification defers to the existing `decideCaseType(signals)` — so an unknown sender,
 * an ambiguous domain, or an audit whose verdict the engine could not determine behaves
 * exactly as it does today rather than being forced to 'standard'.
 *
 * DIMINUTION. The engine has no diminution concept (accepted for this QDOS experiment).
 * A legacy `diminution` decision is therefore PRESERVED rather than overridden — the
 * engine cannot meaningfully contradict a type it cannot express, and silently
 * downgrading one to 'standard' would mint a wrong Case/PO.
 */

import { decideCaseType, type CaseTypeDecision, type CaseTypeSignals, type CaseWorkType } from '@cs/domain';
import { gates } from '@cs/domain/gates';
import { loadRegistry, resolveIdentifyingSender, runIntakePipeline } from '@cs/intake-engine';

/** The envelope fields this module needs; deliberately structural so callers can pass a
 *  full `InboundEnvelope` or the orchestrator's `unknown`-typed checkpointed value. */
interface EngineInboundLike {
  senderAddress?: unknown;
  body?: unknown;
  receivedAt?: unknown;
}

function readEnvelope(inbound: unknown): { senderAddress: string; body: string; receivedAt: string } {
  const e = (inbound ?? {}) as EngineInboundLike;
  return {
    senderAddress: typeof e.senderAddress === 'string' ? e.senderAddress : '',
    body: typeof e.body === 'string' ? e.body : '',
    receivedAt: typeof e.receivedAt === 'string' ? e.receivedAt : '',
  };
}

const EMAIL_TYPE_TO_CASE_TYPE: Readonly<Record<string, { caseType: CaseWorkType; dual: boolean }>> = {
  '1a_standard': { caseType: 'standard', dual: false },
  '1b_audit_repairable': { caseType: 'audit', dual: false },
  '1b_audit_total_loss': { caseType: 'audit_total_loss', dual: false },
  '1c_inspection_and_audit': { caseType: 'audit', dual: true },
};

/** Two-digit year token for the engine's Case/PO contract, taken from the message's own
 *  `receivedAt` so a Durable replay reproduces it — never the wall clock. */
export function yearTokenFor(receivedAt: string): string {
  const parsed = new Date(receivedAt);
  const year = Number.isNaN(parsed.getTime()) ? new Date(0).getUTCFullYear() : parsed.getUTCFullYear();
  return String(year).slice(-2);
}

/**
 * The address provider-matching should identify against: the originating sender recovered
 * from a forwarded header when there is one, else the envelope sender unchanged. Returns
 * the envelope sender untouched while the gate is off.
 */
export function identifyingSenderFor(
  senderAddress: string,
  body: string,
): { senderAddress: string; source: 'envelope' | 'forwarded_header' } {
  if (!gates.intakeEngine()) return { senderAddress, source: 'envelope' };
  const resolved = resolveIdentifyingSender(senderAddress, body ?? '');
  return { senderAddress: resolved.senderAddress, source: resolved.source };
}

/**
 * The case-type decision. Pure and deterministic over already-checkpointed values, so it
 * remains safe to call from the orchestrator body exactly as `decideCaseType` was.
 */
export function decideCaseTypeWithIntakeEngine(inbound: unknown, signals: CaseTypeSignals): CaseTypeDecision {
  const legacy = decideCaseType(signals);
  if (!gates.intakeEngine()) return legacy;

  // The engine cannot express diminution; never let it downgrade one.
  if (legacy.caseType === 'diminution') return legacy;

  try {
    const { senderAddress, body, receivedAt } = readEnvelope(inbound);
    const identifying = resolveIdentifyingSender(senderAddress, body);
    const result = runIntakePipeline({
      senderAddress: identifying.senderAddress,
      contentText: body,
      registry: loadRegistry(),
      year: yearTokenFor(receivedAt),
    });

    if (result.outcome !== 'resolved' || !result.emailType) return legacy;
    const mapped = EMAIL_TYPE_TO_CASE_TYPE[result.emailType];
    if (!mapped) return legacy;

    return {
      caseType: mapped.caseType,
      dual: mapped.dual,
      signals: [
        `intake-engine:${result.emailType}`,
        `principal:${result.principalCode ?? ''}`,
        `sender:${identifying.source}`,
        ...(result.classify?.matchedDualCommissioningPhrase
          ? [`phrase:${result.classify.matchedDualCommissioningPhrase}`]
          : []),
        ...(result.classify?.matchedAuditSignalPhrase
          ? [`phrase:${result.classify.matchedAuditSignalPhrase}`]
          : []),
        ...(result.classify?.matchedVerdictPhrase ? [`verdict:${result.classify.matchedVerdictPhrase}`] : []),
      ],
    };
  } catch {
    // The engine must never be able to fail intake — fall back to the existing decision.
    return legacy;
  }
}
