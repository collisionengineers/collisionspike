/* ============================================================
   Collision Engineers — DATA SEAM: barrel + selector (plan 30).

   THE ONE IMPORT POINT for the screens. It re-exports:

     1. The PURE, SYNC helpers + types from '@cs/domain' (dueInfo,
        reasonVerb, outstandingText, suggestCasePo, statusToQueue, QUEUES,
        REASON_LABELS, EVA_FIELD_ORDER, every domain type, …). These
        compute over a Case/now with no I/O, so they stay synchronous and
        identical regardless of source.

     2. The async repository (`DataAccess`) via a SELECTOR: `getDataAccess()`
        returns an EMPTY default source (no fabricated rows) until the REST
        source is injected via `configureDataAccess(source)` at startup
        (src/main.tsx). The app is REST-backed in every real run; the empty
        default exists only so this seam barrel + tests stay auth-free and so
        an injection failure degrades to honest empty states.  Screens never
        import a transport or HTTP client directly.

     3. The React hooks (./hooks) over the async fetchers.

   This barrel imports NO '@azure/msal-*', NO '@microsoft/power-apps', NO
   fetch — those are confined to rest-client.ts (+ main.tsx).
   ============================================================ */

import type { DataAccessExt } from './rest-client';
import { mockDataAccess } from './mock-source';

/* ============================================================
   1. PURE SYNC helpers + types — re-exported from '@cs/domain'.
   The screens keep calling these directly (no Promise, no behaviour change).
   ============================================================ */

// Domain types (Case, Evidence, Provider, EVA field types, status union, …).
export type {
  CaseStatus,
  ProvenanceSourceType,
  ProvenanceMarker,
  FieldProvenance,
  ReviewState,
  EvaField,
  VatStatus,
  MileageUnit,
  EvaFieldKey,
  EvaFieldDescriptor,
  EvaFields,
  EvidenceKind,
  ImageRole,
  Evidence,
  ChaserChannel,
  ChaserStatus,
  ChaserTargetType,
  Chaser,
  Note,
  OverviewFacts,
  IntakeChannelKind,
  IntakeChannelMode,
  IntakeChannel,
  InspectionLocationPolicy,
  ProviderAutomationMode,
  Provider,
  ActivityKind,
  ActivityEvent,
  MissingItemKind,
  MissingItem,
  ActionReason,
  Case,
} from '@cs/domain';
// EVA field order — the canonical iteration order (pure const).
export { EVA_FIELD_ORDER } from '@cs/domain';

// Queue IA + pure helpers/types.
export {
  QUEUES,
  queueByName,
  statusToQueue,
  statusToStage,
  caseTypeOf,
  CASE_TYPE_LABELS,
  REASON_LABELS,
  type QueueName,
  type QueueDef,
  type CaseType,
  type LiveCounts,
  type Throughput,
  type AgingRow,
  type AgingExceptions,
  type PipelineStage,
  type PipelineStageKey,
  type ReasonFacet,
} from '@cs/domain';

// Intake copy + due/aging + Case/PO helpers (all pure over a Case/now).
export {
  reasonVerb,
  outstandingText,
  dueInfo,
  suggestCasePo,
  INTAKE_CHANNEL_LABELS,
  type DueTone,
  type DueInfo,
  type CasePoSuggestion,
} from '@cs/domain';

// The seam's own interface types (so screens/tests can type a DataAccess).
export type {
  DataAccess,
  CreateCaseInput,
  CreateCaseResult,
  CaseUpdateInput,
  InspectionDecisionInput,
  SaveInspectionDecisionResult,
  SuggestedAddress,
  InspectionAddressCounts,
  BoxGates,
  LocationAssistGate,
  // Phase 8 — Inbox / Triage seam types.
  InboundEmail,
  InboundCategory,
  InboundSubtype,
  TriageState,
  ClassifierMode,
  InboundFacet,
  InboundView,
  InboundCounts,
  // work-todo-spike DTOs (amalgamated dashboard, soft-remove, Case/PO preview,
  // provider PATCH, inbound reclassify) — shipped by the BACKEND-API worker.
  DashboardSummary,
  RemoveCaseInput,
  RemoveCaseResult,
  ProviderUpdateInput,
  NextCasePoResult,
  ReclassifyInboundInput,
  // AI suggestion layer (TKT-015) — observation-first, gated.
  AiSuggestion,
  AiSuggestionType,
  AiSuggestionReviewState,
  AiSuggestionReviewDecision,
  AiSuggestionReviewInput,
  AiSuggestionReviewResult,
  GenerateAiSuggestionsResult,
  AiAssistGate,
  AssistantChatTurn,
  AssistantReply,
  ProposedAction,
} from '@cs/domain';
// The seam's EXTENDED DataAccess (frozen @cs/domain DataAccess + the work-todo-spike
// methods). `getDataAccess()` returns this; screens that type-annotate use it.
export type { DataAccessExt, LogChaseInput, DetachInboundResult, OutlookMoveResult } from './rest-client';
// The all-false Box-gate baseline + the all-off location-assist baseline (values).
export {
  BOX_GATES_ALL_FALSE,
  LOCATION_ASSIST_GATE_ALL_OFF,
  INBOUND_COUNTS_ZERO,
  AI_ASSIST_GATE_ALL_OFF,
  OUTLOOK_MOVE_GATE_ALL_OFF,
} from '@cs/domain';

/* ----------  Box affordances: gates + gated transports  ----------
   Gates are read via the REST API (/api/gates/box); the transports
   route copy/shared-link/finalize through fetch calls carrying the
   Bearer token.  The default transports are honest `not_connected`
   until the operator configures them.  Never a raw Box call from
   the SPA — all Box ops go via the BFF. */
export {
  copyFileRequest,
  getSharedLink,
  requestFinalize,
  notConnectedCopyFileRequestTransport,
  notConnectedGetSharedLinkTransport,
  notConnectedRequestFinalizeTransport,
  configureBoxTransports,
  resetBoxTransports,
  activeCopyFileRequestTransport,
  activeGetSharedLinkTransport,
  activeRequestFinalizeTransport,
  type BoxTransportStatus,
  type BoxResult,
  type FileRequestLink,
  type SharedFolderLink,
  type FinalizeRequest,
  type FinalizeAck,
  type CopyFileRequestTransport,
  type GetSharedLinkTransport,
  type RequestFinalizeTransport,
} from './box-transport';

/* ----------  Document-parser response adapter + transport contract (manual intake) ----------
   SDK-free, so it stays inside the offline boundary.  The live REST transport
   (parser-rest-transport.ts) is injected into parseDocument per-call in ManualIntake;
   tests inject a fake. */
export {
  parseDocument,
  adaptParserResponse,
  parserFieldToEvaField,
  parserSourceToType,
  parserErrors,
  fileToBase64,
  type ParserResponse,
  type ParserField,
  type ParserIssue,
  type ParsedIntake,
  type ParseRequest,
  type ParserTransport,
  type ParserExtractionKey,
} from './parser-client';

/* ----------  Location-assist response adapter + transport contract (Phase 4a) ----------
   SDK-free, so it stays inside the offline boundary.  The live REST transport is
   injected at startup (main.tsx); tests inject a fake transport directly into
   `suggestLocations`. Reviewer-invoked candidate suggestions only — NOTHING auto-applies
   (ADR-0013). */
export {
  suggestLocations,
  adaptLocationAssistResponse,
  candidateToSuggestion,
  buildSuggestLocationRequest,
  buildEvidenceNote,
  friendlyEvidenceKind,
  locationAssistErrors,
  LOCATION_ASSIST_CONTRACT_VERSION,
  type SuggestLocationRequest,
  type SuggestLocationResponse,
  type LocationCandidate,
  type LocationEvidenceItem,
  type LocationEvidenceKind,
  type LocationAssistIssue,
  type LocationAssistResult,
  type LocationAssistTransport,
  type LocationAssistInputs,
  type PhotoRef,
  type TextClues,
} from './location-assist-client';
export {
  makeRestLocationAssistTransport,
  configureLocationAssistTransport,
  resetLocationAssistTransport,
  activeLocationAssistTransport,
  notConnectedLocationAssistTransport,
} from './location-assist-rest-transport';

/* ----------  Vehicle enrichment + address normalisation (gated) ---------- */
export {
  enrichVehicle,
  normaliseAddress,
  notConnectedVehicleTransport,
  notConnectedAddressTransport,
  type VehicleEnrichment,
  type NormalisedAddress,
  type EnrichStatus,
  type EnrichResult,
  type VehicleEnrichTransport,
  type AddressNormaliseTransport,
} from './enrichment-client';

/* ============================================================
   2. The DataAccess selector.

   Default = the EMPTY source (no fabricated rows). Call
   `configureDataAccess(source)` to switch to the REST-backed source.
   The selection is a one-time configuration the app shell performs at
   startup; screens just read `getDataAccess()` / use the hooks.
   ============================================================ */

let active: DataAccessExt = mockDataAccess;

/**
 * Switch the seam to the REST-backed source.  Called once at app startup
 * (src/main.tsx) after MSAL is initialized and the REST client is built.
 * Until then (and in auth-free unit tests) the empty default source is used.
 */
export function configureDataAccess(source: DataAccessExt): void {
  active = source;
}

/** Reset the seam to the empty default source (tests / storybook). */
export function useMockDataAccess(): void {
  active = mockDataAccess;
}

/** The currently-selected DataAccess (empty default until configured). */
export function getDataAccess(): DataAccessExt {
  return active;
}

/**
 * Convenience handle the screens/hooks bind to.  It always delegates to the
 * currently-selected source, so swapping via `configureDataAccess` takes effect
 * without re-importing. (A Proxy keeps the reference stable across the swap.)
 */
export const data: DataAccessExt = new Proxy({} as DataAccessExt, {
  get(_t, prop: string) {
    // Forward every member call to the live source.
    return (active as unknown as Record<string, unknown>)[prop];
  },
}) as DataAccessExt;

export { mockDataAccess, createMockDataAccess } from './mock-source';
export { createRestDataAccess, serverMessageOf } from './rest-client';

/* ============================================================
   3. React hooks over the async fetchers.
   ============================================================ */
export {
  useCaseQuery,
  useQueueQuery,
  useDashboard,
  useImages,
  useProviders,
  useInspectionAddressSuggestions,
  useInspectionAddressCounts,
  useBoxGates,
  useLocationAssistGate,
  useHoldNewCasesDefault,
  useActivity,
  useInbox,
  useInboundCounts,
  useNextCasePo,
  useCaseUpdate,
  // work-todo-spike mutation hooks (triage, reclassify, soft-remove, provider PATCH).
  useTriage,
  useReclassifyInbound,
  useLogChase,
  useCaseRemove,
  useProviderUpdate,
  // AI suggestion layer hooks (TKT-015) — gate, list, review, generate.
  useAiAssistGate,
  useAiChatGate,
  useAiSuggestions,
  useReviewAiSuggestion,
  useGenerateAiSuggestions,
  // Inbound suggestion affordance + detach (rules-engine-v2 Phase 2 ref-gate).
  useInboundSuggestions,
  useDetachInbound,
  // Outlook filing (TKT-054 / 020726 E6) — gate + queue-move mutation.
  useOutlookMoveGate,
  useOutlookMove,
  type QueryState,
  type CaseUpdateState,
  type TriageMutationState,
  type ReclassifyInboundState,
  type LogChaseState,
  type CaseRemoveState,
  type ProviderUpdateState,
  type ReviewAiSuggestionState,
  type GenerateAiSuggestionsState,
  type DetachInboundState,
  type OutlookMoveState,
} from './hooks';

/* ============================================================
   4. Client-side input validation (pure; reuses the domain VRM ruleset).
   ============================================================ */
export { checkVrm, normaliseVrm, type VrmCheck } from './vrm-validate';
