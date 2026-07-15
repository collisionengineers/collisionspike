import {
  AI_ASSIST_GATE_ALL_OFF,
  BOX_GATES_ALL_FALSE,
  INBOUND_COUNTS_ZERO,
  LOCATION_ASSIST_GATE_ALL_OFF,
  type DashboardSummary,
  type GenerateAiSuggestionsResult,
  type NextCasePoResult,
  type QueueName,
} from '@cs/domain';
import { EMPTY_SEARCH, type DataAccessExt } from './rest-client';

const NOT_CONFIGURED = 'The live data source is not ready.';

const rejectWrite = <T>(): Promise<T> => Promise.reject(new Error(NOT_CONFIGURED));

const EMPTY_DASHBOARD: DashboardSummary = {
  liveCounts: { notReady: 0, review: 0, held: 0 },
  throughput: { inToday: 0, submittedToday: 0, clearedThisWeek: 0 },
  queueCounts: { 'not-ready': 0, review: 0, held: 0 },
  pipelineStages: [
    { key: 'new', label: 'New', count: 0, tone: 'normal' },
    { key: 'not_ready', label: 'Not ready', count: 0, tone: 'stuck' },
    { key: 'review', label: 'Review', count: 0, tone: 'normal' },
    { key: 'submitted', label: 'Submitted', count: 0, tone: 'normal' },
  ],
  reasonFacets: [],
  agingExceptions: { rows: [], pastDueCount: 0, duplicateCount: 0, conflictCount: 0 },
  inbound: { ...INBOUND_COUNTS_ZERO },
};

function nextCasePo(principal: string, year?: string | number): NextCasePoResult {
  const normalizedPrincipal = (principal ?? '').toUpperCase();
  const normalizedYear = String(year || new Date().getFullYear()).slice(-2);
  const value = `${normalizedPrincipal}${normalizedYear}001`;
  return {
    principal: normalizedPrincipal,
    yy: normalizedYear,
    seq: '001',
    nextSeq: 1,
    evaLower: value.toLowerCase(),
    boxUpper: value,
    source: 'db',
  };
}

/**
 * Safe startup source used only until authentication installs the REST-backed
 * source. It has no fabricated records and rejects every durable write.
 */
export const emptyDataAccess: DataAccessExt = {
  lookupVehicle: () => rejectWrite(),
  caseById: () => Promise.resolve(undefined),
  createCase: () => rejectWrite(),
  updateCase: () => rejectWrite(),
  saveCaseEdits: () => rejectWrite(),
  casesForQueue: () => Promise.resolve([]),
  openVrmTwins: () => Promise.resolve([]),
  openCasePoMatches: () => Promise.resolve([]),
  setOnHold: () => rejectWrite(),
  logChase: () => rejectWrite(),
  captureSessions: () => Promise.resolve([]),
  createCaptureSession: () => rejectWrite(),
  rotateCaptureSession: () => rejectWrite(),
  revokeCaptureSession: () => rejectWrite(),
  markEvaSubmitted: () => rejectWrite(),
  markCaseDone: () => rejectWrite(),
  retryManualIntakeArchive: () => rejectWrite(),
  archiveHoldingResolution: () => Promise.resolve({
    state: 'none',
    holdingIds: [],
    folderIds: [],
    candidateCaseIds: [],
    candidateCases: [],
    sources: [],
    canSelect: false,
  }),
  selectArchiveHolding: () => rejectWrite(),
  completedCases: () => Promise.resolve([]),
  mergeCandidates: () => Promise.resolve([]),
  mergeCases: () => rejectWrite(),
  removeCase: () => rejectWrite(),
  nextCasePo: (principal, year) => Promise.resolve(nextCasePo(principal, year)),
  imagesForCase: () => Promise.resolve([]),
  providers: () => Promise.resolve([]),
  providerByCode: () => Promise.resolve(undefined),
  updateProvider: () => rejectWrite(),
  inspectionAddressSuggestions: () => Promise.resolve([]),
  inspectionAddressCounts: () => Promise.resolve({ confirmed: 0, suggested: 0 }),
  saveInspectionDecision: () => Promise.resolve({ persisted: false }),
  assistantChat: () => Promise.resolve({ reply: 'The assistant is not available.', disabled: true }),
  getAiChatGate: () => Promise.resolve({ enabled: false, writeEnabled: false }),
  globalSearch: (query) => Promise.resolve({ ...EMPTY_SEARCH, query }),
  caseWithVersion: () => Promise.resolve({
    state: 'unavailable',
    reason: 'request_failed',
    status: 0,
    error: 'The latest case could not be loaded.',
  }),
  inboundWithVersion: () => Promise.resolve({
    state: 'unavailable',
    reason: 'request_failed',
    status: 0,
    error: 'The latest email could not be loaded.',
  }),
  resolveOutlookMessageLink: () => Promise.resolve({ status: 'missing_identity' }),
  executeProposal: () => Promise.resolve({ ok: false, status: 501, error: 'That change is not available.' }),
  uploadEvidence: () => Promise.resolve({ added: [], rejected: [], status: 501 }),
  evidenceContentUrl: () => Promise.resolve(undefined),
  evidenceContentBlob: () => Promise.resolve(undefined),
  setReflectionDismissed: () => rejectWrite(),
  updateEvidenceReview: () => rejectWrite(),
  deleteCaseImage: () => rejectWrite(),
  getDeleteCaseImageGate: () => Promise.resolve({ enabled: false }),
  dashboardSummary: () => Promise.resolve({ ...EMPTY_DASHBOARD }),
  liveCounts: () => Promise.resolve({ ...EMPTY_DASHBOARD.liveCounts }),
  throughput: () => Promise.resolve({ ...EMPTY_DASHBOARD.throughput }),
  agingExceptions: () => Promise.resolve({ ...EMPTY_DASHBOARD.agingExceptions }),
  queueCounts: () => Promise.resolve({ ...EMPTY_DASHBOARD.queueCounts } as Record<QueueName, number>),
  reasonCounts: () => Promise.resolve([]),
  pipelineStages: () => Promise.resolve([...EMPTY_DASHBOARD.pipelineStages]),
  recentActivity: () => Promise.resolve([]),
  activityForCase: () => Promise.resolve([]),
  getBoxGates: () => Promise.resolve({ ...BOX_GATES_ALL_FALSE }),
  getBoxFileRequestTemplateId: () => Promise.resolve(undefined),
  getLocationAssistGate: () => Promise.resolve({ ...LOCATION_ASSIST_GATE_ALL_OFF }),
  getHoldNewCasesDefault: () => Promise.resolve(false),
  setHoldNewCasesDefault: () => rejectWrite(),
  inboundEmails: () => Promise.resolve([]),
  inboundEmailCounts: () => Promise.resolve({ ...INBOUND_COUNTS_ZERO }),
  setTriageState: () => rejectWrite(),
  reclassifyInbound: () => rejectWrite(),
  aiSuggestions: () => Promise.resolve([]),
  getAiAssistGate: () => Promise.resolve({ ...AI_ASSIST_GATE_ALL_OFF }),
  generateAiSuggestions: (): Promise<GenerateAiSuggestionsResult> =>
    Promise.resolve({ generated: 0, reason: 'disabled' }),
  reviewAiSuggestion: () => rejectWrite(),
  inboundSuggestions: () => Promise.resolve([]),
  detachInbound: () => rejectWrite(),
  getOutlookMoveGate: () => Promise.resolve({ enabled: false }),
  moveInboundToOutlook: () => rejectWrite(),
};

export function createEmptyDataAccess(): DataAccessExt {
  return { ...emptyDataAccess };
}
