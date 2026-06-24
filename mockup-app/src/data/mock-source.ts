/* ============================================================
   Collision Engineers — Code App DATA SEAM: empty default source.

   The seam's DEFAULT DataAccess, used until `configureDataAccess(generated
   Services)` injects the live Dataverse source at startup (src/main.tsx). It
   carries NO fabricated case data — the app renders only real Dataverse rows.
   Every method resolves to an empty/zero result (or rejects, for writes) so:

     - the offline build + unit tests stay green and SDK-free (no
       '@microsoft/power-apps' import here), and
     - if the Dataverse injection is ever reverted or races, screens fall back
       to honest EMPTY states (not fabricated claimant data, and not a crash).

   The fabricated rows that used to back this source were removed from the
   shipped app (moved to src/__fixtures__, test-only). createCase rejects with a
   clear "not configured" error so a write attempt before injection is loud
   rather than silently echoing a synthetic id.
   ============================================================ */

import type { DataAccess } from './types';
import { BOX_GATES_ALL_FALSE, LOCATION_ASSIST_GATE_ALL_OFF } from './types';
import type {
  LiveCounts,
  Throughput,
  AgingExceptions,
  PipelineStage,
  PipelineStageKey,
  QueueName,
  ReasonFacet,
} from '../mock/queues';

const NOT_CONFIGURED =
  'Data source not configured — call configureDataAccess(generatedServices) in main.tsx before writes.';

const ZERO_LIVE: LiveCounts = { notReady: 0, review: 0, held: 0 };
const ZERO_THROUGHPUT: Throughput = { inToday: 0, submittedToday: 0, clearedThisWeek: 0 };
const ZERO_AGING: AgingExceptions = { rows: [], pastDueCount: 0, duplicateCount: 0, conflictCount: 0 };
const ZERO_QUEUE_COUNTS: Record<QueueName, number> = {
  'not-ready': 0,
  review: 0,
  held: 0,
};

/** The empty pipeline strip (all four stages at zero). The dashboard hero
    renders only the three backlog stages; the `submitted` total feeds the
    "Sent to EVA (total)" throughput cell and the CaseDetail spine. */
function emptyPipelineStages(): PipelineStage[] {
  const defs: { key: PipelineStageKey; label: string }[] = [
    { key: 'new', label: 'New' },
    { key: 'not_ready', label: 'Not ready' },
    { key: 'review', label: 'Review' },
    { key: 'submitted', label: 'Submitted' },
  ];
  return defs.map((d) => ({
    key: d.key,
    label: d.label,
    count: 0,
    tone: d.key === 'not_ready' ? 'stuck' : 'normal',
  }));
}

/**
 * The empty/unconfigured DataAccess. Reads return empty; the only write
 * (createCase) rejects until the live source is injected.
 */
export const mockDataAccess: DataAccess = {
  /* ----- Cases ----- */
  caseById: (_id) => Promise.resolve(undefined),
  createCase: (_input) => Promise.reject(new Error(NOT_CONFIGURED)),
  casesForQueue: (_name, _now) => Promise.resolve([]),
  openVrmTwins: (_vrm, _excludeCaseId) => Promise.resolve([]),
  setOnHold: (_caseId, _onHold) => Promise.reject(new Error(NOT_CONFIGURED)),
  mergeCandidates: (_caseId) => Promise.resolve([]),
  mergeCases: (_sourceCaseId, _targetCaseId) => Promise.reject(new Error(NOT_CONFIGURED)),

  /* ----- Evidence ----- */
  imagesForCase: (_caseId) => Promise.resolve([]),

  /* ----- Providers ----- */
  providers: () => Promise.resolve([]),
  providerByCode: (_code) => Promise.resolve(undefined),

  /* ----- Inspection-address suggestions (corpus; empty default) ----- */
  inspectionAddressSuggestions: (_caseId) => Promise.resolve([]),
  inspectionAddressCounts: () => Promise.resolve({ confirmed: 0, suggested: 0 }),
  // Honest no-op: the empty default writes nothing (the live source is injected at
  // startup). The CaseDetail confirm still updates the local working copy; only the
  // durable corpus write is deferred until the Dataverse source + table are wired.
  saveInspectionDecision: (_caseId, _decision) => Promise.resolve({ persisted: false }),

  /* ----- Dashboard / queue aggregates ----- */
  liveCounts: (_now) => Promise.resolve(ZERO_LIVE),
  throughput: (_now) => Promise.resolve(ZERO_THROUGHPUT),
  agingExceptions: (_now) => Promise.resolve(ZERO_AGING),
  queueCounts: (_now) => Promise.resolve({ ...ZERO_QUEUE_COUNTS }),
  reasonCounts: (_now) => Promise.resolve([] as ReasonFacet[]),
  pipelineStages: () => Promise.resolve(emptyPipelineStages()),

  /* ----- Activity feed ----- */
  recentActivity: () => Promise.resolve([]),
  activityForCase: (_caseId) => Promise.resolve([]),

  /* ----- Box feature gates (Box off until the live source is injected) ----- */
  getBoxGates: () => Promise.resolve({ ...BOX_GATES_ALL_FALSE }),

  /* ----- Box File-Request template id (none until the live source is injected) ----- */
  getBoxFileRequestTemplateId: () => Promise.resolve(undefined),

  /* ----- Location-assist gate (off until the live source is injected) ----- */
  getLocationAssistGate: () => Promise.resolve({ ...LOCATION_ASSIST_GATE_ALL_OFF }),

  /* ----- App intake preferences (off / not-configured by default) ----- */
  getHoldNewCasesDefault: () => Promise.resolve(false),
  setHoldNewCasesDefault: (_value) => Promise.reject(new Error(NOT_CONFIGURED)),
};

/** Factory form, for symmetry with `createDataverseDataAccess`. */
export function createMockDataAccess(): DataAccess {
  return mockDataAccess;
}
