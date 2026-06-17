/* ============================================================
   Collision Engineers — Code App DATA SEAM: barrel + selector.

   THE ONE IMPORT POINT for the screens. It re-exports:

     1. The PURE, SYNC helpers + types unchanged from '../mock' (dueInfo,
        reasonVerb, outstandingText, suggestCasePo, statusToQueue, QUEUES,
        REASON_LABELS, EVA_FIELD_ORDER, every domain type, …). These compute over
        a Case/now with no I/O, so they stay synchronous and identical whether
        the data came from the mock or from Dataverse.

     2. The async repository (`DataAccess`) via a SELECTOR: `getDataAccess()`
        returns the mock source by DEFAULT (offline, SDK-free, green) and the
        Dataverse source ONLY when real generated services are injected through
        `configureDataAccess(services)`. Screens never import a pac-generated
        service directly — they go through `data` / the hooks.

     3. The React hooks (../data/hooks) over the async fetchers.

   No '@microsoft/power-apps' import, no 'src/generated/' import — the seam keeps
   the offline build mock-backed so the grep gate passes.
   ============================================================ */

import type { DataAccess, GeneratedServices } from './types';
import { mockDataAccess } from './mock-source';
import { createDataverseDataAccess } from './dataverse-source';

/* ============================================================
   1. PURE SYNC helpers + types — re-exported verbatim from '../mock'.
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
} from '../mock/types';
// EVA field order — the canonical iteration order (pure const).
export { EVA_FIELD_ORDER } from '../mock/types';

// Queue IA + pure helpers/types (statusToQueue/queueByName/QUEUES are pure).
export {
  QUEUES,
  queueByName,
  statusToQueue,
  REASON_LABELS,
  type QueueName,
  type QueueDef,
  type LiveCounts,
  type Throughput,
  type AgingRow,
  type AgingExceptions,
  type PipelineStage,
  type PipelineStageKey,
  type ReasonFacet,
} from '../mock/queues';

// Intake copy + due/aging + Case/PO helpers (all pure over a Case/now).
export {
  reasonVerb,
  outstandingText,
  dueInfo,
  suggestCasePo,
  type DueTone,
  type DueInfo,
  type CasePoSuggestion,
} from '../mock/intake';

// The seam's own interface types (so screens/tests can type a DataAccess).
export type {
  DataAccess,
  GeneratedServices,
  GeneratedTableService,
  OperationResult,
  GetAllOptions,
  CaseRecord,
  EvidenceRecord,
  WorkProviderRecord,
  FieldLevelProvenanceRecord,
  NoteRecord,
  ChaserRecord,
  AuditEventRecord,
} from './types';

/* ============================================================
   2. The DataAccess selector.

   Default = mock. Inject real generated services to switch to Dataverse without
   touching any screen. The selection is a one-time configuration the app shell
   performs at startup (after pac generates the services); screens just read
   `getDataAccess()` / use the hooks.
   ============================================================ */

let active: DataAccess = mockDataAccess;

/**
 * Switch the seam to the Dataverse source by injecting the pac-generated service
 * bundle. Called once at app startup AFTER `pac code add-data-source` has run.
 * Until then (and for the whole offline build) the mock source is used.
 */
export function configureDataAccess(services: GeneratedServices): void {
  active = createDataverseDataAccess(services);
}

/** Reset the seam to the mock source (tests / storybook). */
export function useMockDataAccess(): void {
  active = mockDataAccess;
}

/** The currently-selected DataAccess (mock by default). */
export function getDataAccess(): DataAccess {
  return active;
}

/**
 * Convenience handle the screens/hooks bind to. It always delegates to the
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
export { createDataverseDataAccess } from './dataverse-source';

/* ============================================================
   3. React hooks over the async fetchers.
   ============================================================ */
export {
  useCaseQuery,
  useQueueQuery,
  useDashboard,
  useImages,
  useProviders,
  type QueryState,
} from './hooks';
