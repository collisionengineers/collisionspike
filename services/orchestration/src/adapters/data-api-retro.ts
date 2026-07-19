/**
 * ADR-0022 retro reconstruction client (extracted from data-api.ts, TKT-210): the
 * any-status existence check + link, the get-or-create persist of a reconstructed case,
 * related-mailbox-email linking, and the fill-gaps parser-field backfill. Behaviour is
 * identical to the original inline methods — the RETRO_CASE_ENABLED gate still lives on
 * the Data API app and every call routes through the shared authenticated `request` core.
 */
import type { ParserEvaFields } from './data-api-contracts.js';
import { request } from './data-api-http.js';

export const retroApi = {
  /**
   * ADR-0022 retro reconstruction — the ANY-STATUS existence check + link (internal route).
   * Unlike linkReply this matches terminal cases too (a billing email about an
   * eva_submitted case must link, not strand); 'gated_off' while RETRO_CASE_ENABLED is
   * not 'true' on the API app (honest refusal — the gate lives on BOTH apps).
   */
  retroResolveExisting(payload: {
    trigger: unknown;
    keys: { casePo?: string; externalRef?: string; vrm?: string; claimant?: string };
    providerId?: string;
    triggerCategory?: string;
  }): Promise<{
    outcome: 'linked' | 'ambiguous' | 'none' | 'gated_off';
    caseId?: string;
    candidateCount: number;
  }> {
    return request('POST', '/api/internal/retro/resolve-existing', payload);
  },

  /**
   * ADR-0022 retro reconstruction — get-or-create persist of a reconstructed case.
   * `casePo` is the DISCOVERED archive folder name (verbatim — the API never mints on
   * this path); concurrent duplicates come back as 'already_exists_linked', never 409/500.
   */
  retroCreate(payload: {
    original: unknown;
    trigger: unknown;
    keys: { casePo?: string; externalRef?: string; vrm?: string; claimant?: string };
    casePo?: string;
    vrm?: string;
    statusName: 'eva_submitted' | 'needs_review';
    onHold: boolean;
    actionReason?: 'needs_review';
    reconstructionSource: 'box_eml' | 'box_doc' | 'outlook' | 'minimal';
    providerId?: string;
    /** TKT-219 — the trigger sender's Image-Source intermediary match (TKT-021). */
    intermediary?: { imageSourceId: string; candidateProviderIds: string[] };
    parserVrm?: string;
    parserRef?: string;
    parserMileage?: string;
    parserMileageUnit?: string;
    parserEva?: ParserEvaFields;
    caseType?: 'standard' | 'audit' | 'audit_total_loss' | 'diminution';
    caseTypeSignals?: string[];
    boxFolder?: { id: string; url?: string };
    triggerCategory?: string;
  }): Promise<{
    outcome: 'created' | 'already_exists_linked' | 'ambiguous' | 'gated_off' | 'refused_category';
    caseId?: string;
    casePo?: string | null;
    newClient?: boolean;
    candidateCount?: number;
    /** TKT-219 — the provider the create actually resolved (PO principal / parser content /
     *  recovery), so the orchestrator's evidence chain can honour the AI opt-out. */
    resolvedProviderId?: string;
    providerRecovery?: 'identity_ready' | 'not_needed' | 'blocked';
  }> {
    return request('POST', '/api/internal/retro/create', payload);
  },

  /**
   * TKT-222 — link related mailbox emails (replies, chasers, our own sent responses) to a
   * reconstructed retro case. Server-side: never re-points a row that already carries a
   * case_id; rows land 'routed' with retro_related_linked provenance. TKT-225: the
   * response additionally identifies WHICH rows linked (`linkedIds`) and which were
   * already linked to THIS case (`alreadyLinkedIds`) — both ingest-eligible; rows linked
   * to a different case are never returned.
   */
  retroLinkRelated(payload: {
    caseId: string;
    rows: unknown[];
  }): Promise<{
    linked: number;
    skipped: number;
    linkedIds?: string[];
    alreadyLinkedIds?: string[];
    /** PR-review fix — the route now applies the 25-new-links per-case cap itself
     *  (already-linked rows don't consume it) and reports how many rows it skipped. */
    skippedByCap?: number;
  }> {
    return request('POST', '/api/internal/retro/link-related', payload);
  },

  /**
   * TKT-225 — fill-gaps parser-field application from a retro-linked RELATED email.
   * Wraps the Data API's applyParserFields engine with NO sender-provider, NO
   * intermediary and NO recoveryContext: strictly fill-if-empty (plus a VRM
   * fill-if-empty with provenance), no Case/PO mint, no provider-recovery completion —
   * a chaser is weaker provenance than an instruction. 'gated_off' while
   * RETRO_CASE_ENABLED is off on the API app.
   */
  retroBackfillFields(payload: {
    caseId: string;
    sourceInternetMessageId: string;
    parserVrm?: string;
    parserRef?: string;
    parserMileage?: string;
    parserMileageUnit?: string;
    parserEva?: ParserEvaFields;
  }): Promise<{ outcome: 'applied' | 'noop' | 'gated_off'; vrmFilled?: boolean }> {
    return request('POST', '/api/internal/retro/backfill-fields', payload);
  },
};
