/* ============================================================
   Collision Engineers — ADR-0010 dedup ladder, REFERENCE CONTRACT (domain, M1).

   `resolveCase` encodes the ADR-0010 five-rung dedup ladder as a pure function.
   It is a REFERENCE / SPEC CONTRACT for the ladder semantics, and it is
   TEST-ONLY: consumed exclusively by `dedup.test.ts` to pin the ladder decision
   table; NO screen and NO flow imports it, and it sits on NO live hot path. It
   re-implements the dedup semantics of collisioncc `src/lib/case-linking.ts`
   (registration/reference correlation, review-required ambiguity) WITHOUT
   importing or calling it.

   NOT 1:1 with the live resolver. The orchestration case resolver was
   rewritten to MERGE-BY-REGISTRATION: it auto-merges a complementary
   instructions/images pair that share a non-empty VRM (survivor = the Case/PO
   holder) and returns the outcomes `noop | merged | held_multiple |
   skipped_guard` off a ONE/MANY/ZERO match-count Switch — NOT this ladder's
   `drop | attach | new_due_to_reference | propose_attach | create` tokens. The
   ONLY rule the two share is rungs 3/4's ">1 candidate for that VRM -> Held /
   duplicate_risk for staff", which survives as the live flow's `held_multiple`
   (MANY) branch; the old ladder's attach/create rungs were never on intake's
   hot path (intake owns its own Create). So treat this function as the ADR-0010
   ladder SPEC, not a mirror of the live Switch. (The per-token `Flow_CaseResolve`
   Switch-case annotations on the `DedupResolution` type below describe that
   SUPERSEDED ladder flow and are retained only as historical reference.)

   THE TWO INVIOLABLE RULES (ADR-0010):
     1. NEVER auto-merge on VRM + time. A bare VRM match (no disambiguating
        reference) is only ever a *proposal* for a human to confirm
        (`propose_attach` + duplicate_risk + caseLinkState=pending).
     2. NEVER link across different Work Providers. `openProviderCases` is
        ASSERTED provider-scoped: any case carrying a different workProviderId is
        ignored (filtered out before any rung runs) — a cross-provider candidate
        can never match.
   Every ambiguous outcome is a human-confirmable `duplicate_risk`, never a
   silent merge.

   The ladder (evaluate top-down, first match wins):
     1. Exact Message-ID OR payloadHash already seen      -> drop
     2. Reference matches an OPEN same-provider case ref   -> attach
     3. Reference DIFFERS from open case(s) for that VRM   -> new_due_to_reference + duplicate_risk
     4. No reference + VRM matches an open case            -> propose_attach + duplicate_risk + pending
     5. No match                                           -> create

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No React, no I/O, no live calls.
   ============================================================ */

import {
  isTerminalStatus,
  type CaseStatus,
} from '../contracts/case-status';

/* ----------  Inputs  ---------- */

/** A candidate open case to resolve against. MUST be provider-scoped by the caller;
 *  this function additionally asserts/ignores any with a mismatched workProviderId. */
export interface OpenProviderCase {
  caseId: string;
  /** Source/claim reference — the ADR-0010 dedup tiebreaker. May be '' / undefined. */
  caseRef?: string;
  /** Current status; terminal cases are not eligible to attach to. */
  status: CaseStatus;
  /** Owning Work Provider. If present and != input.workProviderId, the case is ignored. */
  workProviderId?: string;
}

export interface ResolveCaseInput {
  /** Graph/Internet Message-ID of the arrival. */
  messageId: string;
  /** SHA256 over normalised subject + from + sorted attachment hashes. */
  payloadHash: string;
  /** Sniffed/parser-confirmed UK VRM, or '' when none found yet. */
  candidateVrm: string;
  /** Sniffed/parser-confirmed provider reference, or '' when none found yet. */
  candidateRef: string;
  /** Resolved Work Provider for this arrival (from provider-match, §5.8). */
  workProviderId: string;
  /** Open cases for THIS provider+VRM (caller-scoped; re-asserted here). */
  openProviderCases: readonly OpenProviderCase[];
  /** Message-IDs already ingested (rung 1 exact-repeat guard). */
  seenMessageIds: readonly string[];
  /** Payload hashes already ingested (rung 1 exact-repeat guard). */
  seenPayloadHashes: readonly string[];
}

/* ----------  Output  ---------- */

/** The five terminal resolutions of the ADR-0010 ladder. These tokens are the
 *  shared vocabulary with the `Flow_CaseResolve` Switch:
 *    drop                -> rung 1 (Pattern 1 drops; audited duplicate_dropped)
 *    attach              -> rung 2 (Switch -> default/ATTACH; reference matched)
 *    new_due_to_reference-> rung 3 (Switch case REF_DIFFERS)
 *    propose_attach      -> rung 4 (Switch case VRM_NO_REF)
 *    create              -> rung 5 (Switch case CREATE) */
export type DedupResolution =
  | 'drop'
  | 'attach'
  | 'new_due_to_reference'
  | 'propose_attach'
  | 'create';

/** The AuditEvent action vocabulary this resolver emits (Phase-1 plan §4). */
export type DedupAuditAction =
  | 'duplicate_dropped'
  | 'case_attached'
  | 'case_created'
  | 'duplicate_flagged';

export interface ResolveCaseOutput {
  /** Which rung fired. */
  resolution: DedupResolution;
  /** The open case to attach to / propose attaching to. Set for attach + propose_attach. */
  targetCaseId?: string;
  /** Flag the VRM collision / bare-VRM ambiguity for staff (rungs 3 + 4). */
  setDuplicateRisk: boolean;
  /** Case-link staging: 'pending' when a human must confirm an attach (rung 4). */
  caseLinkState?: 'none' | 'pending';
  /** The CaseStatus the resolver intends downstream (the status sub-flow §5.4 may
   *  recompute review status; for attach it KEEPS the target's status). */
  statusEffect: CaseStatus | 'keep_target';
  /** AuditEvent action to write for this outcome. */
  auditAction: DedupAuditAction;
}

/* ----------  Helpers  ---------- */

/** A reference is "present" only when it is a non-empty trimmed string. */
function hasRef(ref: string | undefined): ref is string {
  return typeof ref === 'string' && ref.trim().length > 0;
}

/** Case-insensitive, whitespace-insensitive reference equality. */
function refEquals(a: string | undefined, b: string | undefined): boolean {
  if (!hasRef(a) || !hasRef(b)) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Provider + eligibility scoping — the cross-provider guard.
 * Drops any candidate whose workProviderId differs from the arrival's (ADR-0010
 * rule 2: cross-provider can NEVER match) and any terminal case (you cannot
 * attach to an eva_submitted / box_synced / error case). This mirrors the
 * `Flow_CaseResolve` ListRecords `$filter` (provider clause + terminal
 * exclusions); the function never trusts the caller alone.
 */
function eligibleCases(input: ResolveCaseInput): OpenProviderCase[] {
  return input.openProviderCases.filter((c) => {
    if (c.workProviderId !== undefined && c.workProviderId !== input.workProviderId) {
      return false; // cross-provider — never matchable
    }
    if (isTerminalStatus(c.status)) return false; // not open
    return true;
  });
}

/* ----------  The ladder  ---------- */

/**
 * Resolve an arrival against open same-provider cases per the EXACT ADR-0010
 * ladder. Pure: same inputs -> same output. Never auto-merges on VRM+time;
 * never matches across providers.
 */
export function resolveCase(input: ResolveCaseInput): ResolveCaseOutput {
  /* Rung 1 — exact Message-ID or payloadHash already seen -> DROP. */
  if (
    input.seenMessageIds.includes(input.messageId) ||
    input.seenPayloadHashes.includes(input.payloadHash)
  ) {
    return {
      resolution: 'drop',
      setDuplicateRisk: false,
      statusEffect: 'keep_target',
      auditAction: 'duplicate_dropped',
    };
  }

  const candidates = eligibleCases(input);

  /* Rung 2 — arrival reference matches an OPEN same-provider case ref -> ATTACH. */
  if (hasRef(input.candidateRef)) {
    const matched = candidates.find((c) => refEquals(c.caseRef, input.candidateRef));
    if (matched) {
      return {
        resolution: 'attach',
        targetCaseId: matched.caseId,
        setDuplicateRisk: false,
        caseLinkState: 'none',
        statusEffect: 'keep_target',
        auditAction: 'case_attached',
      };
    }

    /* Rung 3 — reference present but DIFFERS from open case(s) for that VRM
       -> NEW case, flag the VRM collision (duplicate_risk). Never merge. */
    if (candidates.length > 0) {
      return {
        resolution: 'new_due_to_reference',
        setDuplicateRisk: true,
        caseLinkState: 'none',
        statusEffect: 'new_email',
        auditAction: 'duplicate_flagged',
      };
    }
  }

  /* Rung 4 — NO reference + VRM matches an open case -> PROPOSE attach (staff
     confirm). This is the ONLY VRM-driven path and it is NEVER an auto-merge:
     duplicate_risk + caseLinkState=pending hand it to a human. */
  if (!hasRef(input.candidateRef) && candidates.length > 0) {
    return {
      resolution: 'propose_attach',
      targetCaseId: candidates[0].caseId,
      setDuplicateRisk: true,
      caseLinkState: 'pending',
      statusEffect: 'duplicate_risk',
      auditAction: 'duplicate_flagged',
    };
  }

  /* Rung 5 — no match -> CREATE a clean new case. */
  return {
    resolution: 'create',
    setDuplicateRisk: false,
    caseLinkState: 'none',
    statusEffect: 'new_email',
    auditAction: 'case_created',
  };
}

/* ----------  Merge provider preference (TKT-052)  ---------- */

export interface MergeProviderDecision {
  /** The work-provider id the SURVIVOR (target) must end the merge with, or null when
   *  neither side knows one. */
  providerId: string | null;
  /** 'source' when the survivor inherits the retired side's provider (the fix);
   *  'target' when it already had one; null when neither side knows. */
  filledFrom: 'source' | 'target' | null;
  /** ADR-0010 inviolable rule 2 re-asserted: both sides carry a provider and they
   *  DIFFER — the merge must be refused, never resolved by preference. */
  crossProvider: boolean;
}

/**
 * TKT-052 — merging an image-only case (no provider) into/with an instructions case
 * must never LOSE the provider one side knew: the merged survivor ends with whichever
 * side carries a resolved provider. Pure decision — the caller (mergeCases,
 * services/data-api/src/features/cases/merge-routes.ts, and the audited data-fix deltas) applies it.
 *   - both known + equal   -> keep (target)
 *   - both known + differ  -> crossProvider: REFUSE (ADR-0010 rule 2 — never merge across providers)
 *   - target only          -> keep (target)
 *   - source only          -> FILL the survivor from the source (the bug this fixes)
 *   - neither              -> null (nothing to prefer)
 */
export function decideMergeProvider(
  sourceProviderId: string | null | undefined,
  targetProviderId: string | null | undefined,
): MergeProviderDecision {
  const src = (sourceProviderId ?? '').trim() || null;
  const tgt = (targetProviderId ?? '').trim() || null;
  if (src && tgt && src !== tgt) return { providerId: tgt, filledFrom: null, crossProvider: true };
  if (tgt) return { providerId: tgt, filledFrom: 'target', crossProvider: false };
  if (src) return { providerId: src, filledFrom: 'source', crossProvider: false };
  return { providerId: null, filledFrom: null, crossProvider: false };
}
