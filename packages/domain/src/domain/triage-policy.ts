/* ============================================================
   Collision Engineers — Triage policy (Stage B), ADR-0019 / rules-engine-v2 Phase 2.

   `decideTriage` is the deterministic routing brain that sits between Stage A (the
   vendored text classifier, `email_classifier.py` — signals/category/subtype from email
   TEXT ALONE) and the orchestrator's Durable activities. It joins `resolveCase`
   (dedup.ts, ADR-0010) and `matchProviderByDomain` (provider-match.ts) as an
   INVIOLABLE-RULES peer: pure, injected-context, no I/O, no env reads, no live calls.
   The orchestrator calls it from a Durable ACTIVITY (never inline in the orchestrator
   function itself) so every decision is checkpointed, replay-safe, and carries a
   persisted `decisionInputs` snapshot for the App Insights customEvents telemetry
   (ADR-0019 §"decision telemetry").

   WHY A SEPARATE STAGE: Stage A sees only email text — it cannot know whether a
   Case/PO / job ref / VRM matches an OPEN case, whether this exact message already
   arrived on another subscribed mailbox, or what a conversation's other messages turned
   into. Stage B is handed that live context ALREADY RESOLVED by the caller (the Postgres
   reads happen in the calling activity, never here) and turns
   (classification x context) into ONE action.

   THE RUNGS (evaluated top-down inside `decideTriage`; first match wins — mirrors the
   dedup.ts ladder style):
     1. Pre-mint duplicate delivery          -> drop_duplicate        (gates.refGate)
     2. Cancellation precedence               -> propose_cancellation  (gates.cancellation)
     3. Ref-gate (+ case_update refinement)   -> suggest_attach        (gates.refGate [+ gates.caseUpdate])
     4. Unmatched images + a registration     -> route_images_unmatched(gates.imagesRouting)
     5. Default                               -> proceed_default       (today's plain pass-through)

   KILL-SWITCH INVARIANT: with all four TriagePolicyGates false, NONE of rungs 1-4 can
   fire — every one of their conditions requires its own gate. So `decideTriage` ALWAYS
   falls through to rung 5, returning Stage A's own category/subtype unchanged. Gates-off
   output is therefore indistinguishable from today's plain pass-through BY CONSTRUCTION,
   not by a special-cased "are all gates off" check (see the kill-switch tests).

   THE INVIOLABLE RULES this module encodes (do not relax without a corpus + a review):
     - NEVER auto-attach, NEVER auto-cancel. Every action here is a SUGGESTION a human
       confirms (the `ai_suggestion` accept/reject lifecycle) — 'suggest_attach' and
       'propose_cancellation' are proposals, not mutations. Mirrors ADR-0010's
       no-silent-merge discipline and ADR-0015's abstain-to-other bias.
     - VRM-ONLY MATCHES NEVER PROMOTE PAST SUGGESTION. This is the SAME rule as
       ADR-0010's rung 4 (`propose_attach`, never `attach`, on a bare VRM) applied here: a
       vrm-only ref-gate match is exactly as suggestion-only as a case_po/job_ref match
       (matchedOn only decides whether a SINGLE match narrows to a `targetCaseId` at all —
       see the promotion seam below), and a cancellation proposal NEVER trusts a vrm-only
       match for its target at all (see `cancellationEligibleMatches`). PERMANENT, not a
       release-1 caveat.
     - `conversationSiblingCaseIds` is SECONDARY ONLY. It is carried into
       `decisionInputs` for richer telemetry but is NEVER read by any branch CONDITION —
       a thread of emails about the same case never creates a match by itself.

   DOCUMENTED PROMOTION SEAM (ADR-0019 §4): a future release MAY promote an EXACT SINGLE
   open-case_po match to auto-attach once corpus results + live staff confirmations
   justify it. That promotion belongs in a NEW action (e.g. 'attach_case') this function
   does not emit yet — `suggest_attach` is deliberately the ONLY case-linking action this
   release, so the seam is "add a rung above this one", not "loosen this one".

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No I/O, no env reads, no live calls. Same
   inputs -> same output.
   ============================================================ */

/**
 * Stage-A's classification handed to the policy, plus the reference/reply signals the
 * engine already extracts from text (job-ref pass-through: rules-engine-v2 Phase 0).
 *
 * `category`/`subtype` are deliberately loose NAMES — not the closed InboundCategory /
 * InboundSubtype unions (dto/index.ts). Stage A's taxonomy version can be ahead of or
 * behind the DTO's at any moment (`taxonomyVersion` records which — Phase 2's stated
 * deploy order lands the DDL/choicesets before the engine tag that emits v2 names), and
 * this module must not force a compile-time coupling between the two. Codes are minted
 * from these NAMES at the persistence layer via the codecs (`@cs/domain/codecs`), never
 * here.
 */
export interface TriagePolicyClassification {
  /** e.g. 'receiving_work' | 'query' | 'cancellation' | 'case_update' | … (taxonomy v2). */
  category: string;
  subtype: string;
  /** Stage-A's 0..1 confidence. Carried through for telemetry; Stage B does not branch
   *  on it — confidence-band routing to the gated LLM pass is Stage C's job (ADR-0019 §3). */
  confidence?: number;
  /** Stage-A's rule-id/signal-flag list (e.g. 'uncorroborated_instruction_doc'). Carried
   *  through to `decisionInputs` for telemetry only — never branched on here. */
  signals?: readonly string[];
  bodyVrm?: string;
  bodyCaseref?: string;
  /** Provider job/claim reference (Phase-0 pass-through; the ref-gate below is the FIRST
   *  consumer that actually routes on it — the TKT-023 fix). */
  bodyJobref?: string;
  isReply?: boolean;
  /** Which taxonomy vintage produced this classification (v1 today; v2 once the engine
   *  tag + choicesets ship). Absent = v1. Carried through for telemetry only. */
  taxonomyVersion?: number;
}

/** One open case a reference/registration signal matched, as ALREADY RESOLVED by the
 *  calling activity (a Postgres read) — `decideTriage` never looks anything up itself. */
export interface OpenCaseRefMatch {
  caseId: string;
  casePo: string;
  /** Which signal produced this match. case_po beats job_ref beats vrm (§ ref-gate). */
  matchedOn: 'case_po' | 'job_ref' | 'vrm';
  /** The open case's current status (e.g. 'needs_review') — carried for telemetry. */
  status: string;
}

/**
 * Live context the caller (a Durable activity) resolves BEFORE calling `decideTriage` —
 * every field here is the RESULT of a Postgres/Graph read the caller already performed;
 * this module performs no lookups of its own.
 */
export interface TriagePolicyContext {
  /** Open cases matched by this arrival's Case/PO, job ref, or VRM. */
  openCaseMatches: readonly OpenCaseRefMatch[];
  /** True when this exact Internet-Message-Id was already ingested — the cross-mailbox
   *  duplicate-delivery rung the ref-gate widens (ADR-0019 §"mint race"). */
  duplicateInternetMessageId: boolean;
  /** Case ids of OTHER messages in the same email conversation (local Postgres
   *  correlation on `conversation_id`, Phase 2). SECONDARY SIGNAL ONLY — see the module
   *  doc's inviolable rules. */
  conversationSiblingCaseIds: readonly string[];
  providerMatchState: 'matched' | 'unmatched' | 'ambiguous' | 'none';
  hasAttachments: boolean;
  attachmentKinds: readonly string[];
  /** True when every attachment is image-class (extension/MIME — see classification.ts).
   *  Drives the images_received subtype and the unmatched-images routing rung. */
  imagesOnly: boolean;
}

/** Default-off feature gates, read from `@cs/domain/gates` by the CALLER and passed in
 *  here as plain values — `decideTriage` itself never reads `process.env` (pure). */
export interface TriagePolicyGates {
  refGate: boolean;
  cancellation: boolean;
  imagesRouting: boolean;
  caseUpdate: boolean;
}

/** The five actions `decideTriage` can return. All but `proceed_default` /
 *  `drop_duplicate` are SUGGESTIONS — a human confirms via the `ai_suggestion`
 *  lifecycle; none of these mutate a case. */
export type TriagePolicyAction =
  | 'proceed_default'
  | 'drop_duplicate'
  | 'suggest_attach'
  | 'propose_cancellation'
  | 'route_images_unmatched';

export interface TriagePolicyDecision {
  action: TriagePolicyAction;
  /** The category/subtype NAMES to persist — either Stage A's own (pass-through) or
   *  this policy's override (case_update / cancellation refinements). Codes are minted
   *  from these at the persistence layer via the codecs; this module never touches an
   *  integer. */
  finalCategory: string;
  finalSubtype: string;
  /** Set only when EXACTLY ONE open case is the unambiguous target (ref-gate /
   *  case_update / cancellation). Multiple or zero matches leave this undefined — a
   *  human picks. */
  targetCaseId?: string;
  /** Which `ai_suggestion.suggestion_type` this decision writes, when it writes one. */
  suggestionType?: 'case_link' | 'cancellation';
  /**
   * Plain-English, HANDLER-LANGUAGE "why" (AGENTS.md hard rule — no engineering/cloud/
   * process/meta jargon: never "gated"/"signals"/"classifier"/"rule-id"/JSON/ADR/webhook/
   * etc.). This is shown close to verbatim in the SPA's "Why this label?" affordance
   * (rules-engine-v2 Phase 5), so treat it as RENDERED text, not a log line.
   */
  rationale: string;
  /**
   * Compact JSON-able snapshot of every input that drove this branch — the App Insights
   * customEvents telemetry payload + the Durable checkpoint record. Free to use
   * engineering-precise keys/values (this is NOT rendered to staff — only `rationale` is).
   */
  decisionInputs: Record<string, unknown>;
  /** This module's version token, stamped on every decision so a ruleset change is
   *  diffable per version (ADR-0019 §"decision telemetry"). */
  policyVersion: string;
}

const POLICY_VERSION = 'triage-policy-v1';

/* ----------  Match-ranking helpers  ---------- */

const REF_MATCH_PRIORITY: Record<OpenCaseRefMatch['matchedOn'], number> = {
  case_po: 0,
  job_ref: 1,
  vrm: 2,
};

/** Human label for a match signal — used ONLY in `rationale` text (handler-language;
 *  "Case/PO" / "job reference" / "registration" are all real domain words handlers use,
 *  per CONTEXT.md — never the internal `matchedOn` token itself). */
function matchLabel(matchedOn: OpenCaseRefMatch['matchedOn']): string {
  switch (matchedOn) {
    case 'case_po':
      return 'Case/PO';
    case 'job_ref':
      return 'job reference';
    case 'vrm':
      return 'registration';
  }
}

/** Collapse matches that name the SAME case (e.g. matched by both its Case/PO and its
 *  registration) to one entry, so the exactly-one-match cardinality checks below are
 *  never fooled by an upstream signal producing two rows for the one case. */
function distinctByCaseId(matches: readonly OpenCaseRefMatch[]): OpenCaseRefMatch[] {
  const seen = new Map<string, OpenCaseRefMatch>();
  for (const m of matches) {
    if (!seen.has(m.caseId)) seen.set(m.caseId, m);
  }
  return [...seen.values()];
}

/** The highest-priority signal tier present (case_po > job_ref > vrm), deduplicated by
 *  case. Empty input -> empty output. */
function bestMatchTier(matches: readonly OpenCaseRefMatch[]): OpenCaseRefMatch[] {
  if (matches.length === 0) return [];
  const bestPriority = Math.min(...matches.map((m) => REF_MATCH_PRIORITY[m.matchedOn]));
  const tier = matches.filter((m) => REF_MATCH_PRIORITY[m.matchedOn] === bestPriority);
  return distinctByCaseId(tier);
}

/** Matches eligible to be a CANCELLATION target — case_po/job_ref only. A cancellation
 *  proposal never targets a case found by VRM ALONE: with two open claims on the same
 *  registration, guessing which one to propose closing from the registration alone would
 *  be unsafe (ADR-0010's no-ref rung applies here just as much as it does to dedup). */
function cancellationEligibleMatches(matches: readonly OpenCaseRefMatch[]): OpenCaseRefMatch[] {
  return distinctByCaseId(matches.filter((m) => m.matchedOn !== 'vrm'));
}

/**
 * True when at least one of the classification's own reference fields is populated — the
 * DEFENSIVE re-assertion behind the ref-gate rung. Mirrors dedup.ts's `eligibleCases`
 * discipline ("the function never trusts the caller alone"): a non-empty
 * `context.openCaseMatches` is SUPPOSED to mean the caller matched one of these exact
 * fields, but this module re-checks it rather than trusting that invariant blindly.
 */
function hasRefSignal(c: TriagePolicyClassification): boolean {
  return Boolean(
    (c.bodyCaseref && c.bodyCaseref.trim()) ||
      (c.bodyJobref && c.bodyJobref.trim()) ||
      (c.bodyVrm && c.bodyVrm.trim()),
  );
}

/* ----------  The policy  ---------- */

/**
 * Turn (classification x live context) into ONE triage action, per the rungs in the
 * module doc above. Pure: same inputs -> same output. See the module doc for the
 * kill-switch invariant, the inviolable rules, and the documented promotion seam.
 */
export function decideTriage(
  classification: TriagePolicyClassification,
  context: TriagePolicyContext,
  gates: TriagePolicyGates,
): TriagePolicyDecision {
  /* Rung 1 — pre-mint duplicate delivery. Wins over every other rung (mirrors ADR-0010
     rung 1: an exact repeat drops even when a reference would otherwise attach). Gated
     behind refGate because the ref-gate is what WIDENS this race window in the first
     place (ADR-0019 §"mint race") — with refGate off, resolveCase's own rung 1
     (Message-Id/payload-hash) remains the only duplicate guard, exactly as today. */
  if (context.duplicateInternetMessageId && gates.refGate) {
    return {
      action: 'drop_duplicate',
      finalCategory: classification.category,
      finalSubtype: classification.subtype,
      rationale:
        'This message has already been received and processed once — the repeat copy is not actioned again.',
      decisionInputs: {
        rung: 'duplicate_internet_message_id',
        duplicateInternetMessageId: context.duplicateInternetMessageId,
      },
      policyVersion: POLICY_VERSION,
    };
  }

  /* Rung 2 — cancellation precedence. Trumps BOTH the ref-gate suggestion (rung 3) and
     the case_update/query split inside it — checked first among the "real" rungs. NEVER
     auto-closes: always a staff-confirmed proposal (choice_case_status keeps a terminal
     'removed' state a person chooses to use). Only case_po/job_ref matches are trusted
     for a target — never vrm-only (see cancellationEligibleMatches). */
  if (gates.cancellation && classification.category === 'cancellation') {
    const eligible = cancellationEligibleMatches(context.openCaseMatches);
    const target = eligible.length === 1 ? eligible[0] : undefined;
    return {
      action: 'propose_cancellation',
      finalCategory: classification.category,
      finalSubtype: classification.subtype,
      ...(target ? { targetCaseId: target.caseId } : {}),
      suggestionType: 'cancellation',
      rationale: target
        ? `This message reports case ${target.casePo} as cancelled or closed — flagged for a person to confirm before it is closed or put on hold.`
        : 'This message reports a case cancelled or closed, but no single open case could be matched to it — flagged for a person to find the right one.',
      decisionInputs: {
        rung: 'cancellation',
        engineCategory: classification.category,
        eligibleMatchCount: eligible.length,
        openCaseMatches: context.openCaseMatches,
      },
      policyVersion: POLICY_VERSION,
    };
  }

  /* Rung 3 — ref-gate: any reference/registration signal matching an OPEN case is a
     SUGGESTION to attach, never an auto-attach (ADR-0010's no-silent-merge discipline;
     VRM-only NEVER promotes past suggestion — a permanent invariant). Runs on EVERY
     classification, including receiving_work, so a follow-up doesn't leak into a fresh
     mint — closes the TKT-023 leak (it also runs pre-mint on receiving_work, the leak's
     exact shape). */
  if (gates.refGate && hasRefSignal(classification) && context.openCaseMatches.length > 0) {
    const tier = bestMatchTier(context.openCaseMatches);
    const target = tier.length === 1 ? tier[0] : undefined;

    /* case_update refinement — its OWN gate, applied only once ref-gate has already
       found a match to attach to. caseUpdate has NO independent trigger path by design:
       it RELABELS a suggest_attach that refGate already produced, it never creates one
       on its own (see the design note in the final report to the orchestration wave). */
    let finalCategory = classification.category;
    let finalSubtype = classification.subtype;
    let caseUpdateApplied = false;
    if (gates.caseUpdate && context.hasAttachments) {
      finalCategory = 'case_update';
      finalSubtype = context.imagesOnly ? 'images_received' : 'update_general';
      caseUpdateApplied = true;
    }
    // else (no attachments — a question-only reply): finalCategory/subtype stay exactly
    // as Stage A proposed (typically query/query_existing_work) — case_update never
    // claims a bare question ("ref-match + question-only … stays [the] query lane").

    return {
      action: 'suggest_attach',
      finalCategory,
      finalSubtype,
      ...(target ? { targetCaseId: target.caseId } : {}),
      suggestionType: 'case_link',
      rationale: target
        ? `Matches open case ${target.casePo} by its ${matchLabel(target.matchedOn)} — suggested attaching this email to it.`
        : `Matches ${tier.length} open cases by ${matchLabel(tier[0].matchedOn)} — needs a person to pick the right one.`,
      decisionInputs: {
        rung: 'ref_gate',
        matchTier: tier[0]?.matchedOn,
        matchCount: tier.length,
        openCaseMatches: context.openCaseMatches,
        conversationSiblingCaseIds: context.conversationSiblingCaseIds,
        caseUpdateApplied,
        hasAttachments: context.hasAttachments,
        imagesOnly: context.imagesOnly,
      },
      policyVersion: POLICY_VERSION,
    };
  }

  /* Rung 4 — unmatched images carrying a registration: route to the reg-keyed
     dumping-folder lane rather than guess a case or leave it unrouted (ADR-0015 §5).
     openCaseMatches is re-checked explicitly here (not just inferred from "rung 3 didn't
     fire") so this rung stands on its own, matching dedup.ts's re-assertion style. */
  if (
    gates.imagesRouting &&
    context.imagesOnly &&
    context.openCaseMatches.length === 0 &&
    classification.bodyVrm &&
    classification.bodyVrm.trim()
  ) {
    return {
      action: 'route_images_unmatched',
      finalCategory: classification.category,
      finalSubtype: 'images_received',
      rationale: `These photos show a registration (${classification.bodyVrm.trim()}) but do not yet match an open case — routed to the unmatched-photos folder for a person to place.`,
      decisionInputs: {
        rung: 'images_routing',
        bodyVrm: classification.bodyVrm,
        openCaseMatchCount: context.openCaseMatches.length,
      },
      policyVersion: POLICY_VERSION,
    };
  }

  /* Rung 5 — default. Either every gate is off (the kill-switch invariant — this is then
     the ONLY reachable rung, so gates-off output is a plain pass-through by construction)
     or the gates are on but nothing here matched a rung's condition. Stage A's own
     category/subtype pass through unchanged. */
  return {
    action: 'proceed_default',
    finalCategory: classification.category,
    finalSubtype: classification.subtype,
    rationale:
      'No case-matching or cancellation action applies here — this message proceeds through the ordinary intake process unchanged.',
    decisionInputs: {
      rung: 'default',
      gates,
      openCaseMatchCount: context.openCaseMatches.length,
      duplicateInternetMessageId: context.duplicateInternetMessageId,
    },
    policyVersion: POLICY_VERSION,
  };
}
