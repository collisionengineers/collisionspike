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

import type { DataAccess } from '@cs/domain';
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
  type DueTone,
  type DueInfo,
  type CasePoSuggestion,
} from '@cs/domain';

// The seam's own interface types (so screens/tests can type a DataAccess).
export type {
  DataAccess,
  CreateCaseInput,
  CreateCaseResult,
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
  InboundCounts,
} from '@cs/domain';
// The all-false Box-gate baseline + the all-off location-assist baseline (values).
export { BOX_GATES_ALL_FALSE, LOCATION_ASSIST_GATE_ALL_OFF, INBOUND_COUNTS_ZERO } from '@cs/domain';

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

let active: DataAccess = mockDataAccess;

/**
 * Switch the seam to the REST-backed source.  Called once at app startup
 * (src/main.tsx) after MSAL is initialized and the REST client is built.
 * Until then (and in auth-free unit tests) the empty default source is used.
 */
export function configureDataAccess(source: DataAccess): void {
  active = source;
}

/** Reset the seam to the empty default source (tests / storybook). */
export function useMockDataAccess(): void {
  active = mockDataAccess;
}

/** The currently-selected DataAccess (empty default until configured). */
export function getDataAccess(): DataAccess {
  return active;
}

/**
 * Convenience handle the screens/hooks bind to.  It always delegates to the
 * currently-selected source, so swapping via `configureDataAccess` takes effect
 * without re-importing. (A Proxy keeps the reference stable across the swap.)
 */
export const data: DataAccess = new Proxy({} as DataAccess, {
  get(_t, prop: string) {
    // Forward every member call to the live source.
    return (active as unknown as Record<string, unknown>)[prop];
  },
}) as DataAccess;

export { mockDataAccess, createMockDataAccess } from './mock-source';
export { createRestDataAccess } from './rest-client';

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
  type QueryState,
} from './hooks';
