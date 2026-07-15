/* ============================================================
   Collision Engineers — SPA DATA SEAM: empty default source.

   The seam's DEFAULT DataAccess, used until `configureDataAccess(restClient)`
   injects the live Data API (REST) source at startup (src/main.tsx). It
   carries NO fabricated case data — the app renders only real API rows.
   Every method resolves to an empty/zero result (or rejects, for writes) so:

     - the offline build + unit tests stay green and network-free (no
       fetch calls here), and
     - if the REST-client injection is ever reverted or races, screens fall
       back to honest EMPTY states (not fabricated claimant data, and not a crash).

   The fabricated rows that used to back this source were removed from the
   shipped app (moved to src/__fixtures__, test-only). createCase rejects with a
   clear "not configured" error so a write attempt before injection is loud
   rather than silently echoing a synthetic id.
   ============================================================ */

import type {
  InboundEmail,
  InboundCategory,
  InboundSubtype,
  InboundCounts,
  InboundFacet,
  TriageState,
  LiveCounts,
  Throughput,
  AgingExceptions,
  PipelineStage,
  PipelineStageKey,
  QueueName,
  ReasonFacet,
  DashboardSummary,
  RemoveCaseInput,
  RemoveCaseResult,
  NextCasePoResult,
  ProviderUpdateInput,
  ReclassifyInboundInput,
  AiSuggestion,
  AiSuggestionReviewInput,
  AiSuggestionReviewResult,
  GenerateAiSuggestionsResult,
} from '@cs/domain';
import {
  BOX_GATES_ALL_FALSE,
  LOCATION_ASSIST_GATE_ALL_OFF,
  AI_ASSIST_GATE_ALL_OFF,
  DELETE_CASE_IMAGE_GATE_ALL_OFF,
} from '@cs/domain';
import type { DataAccessExt, DetachInboundResult, OutlookMoveResult } from './rest-client';
import { EMPTY_SEARCH } from './rest-client';

const NOT_CONFIGURED =
  'Data source not configured — call configureDataAccess(restClient) in main.tsx before writes.';

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

/* ============================================================
   Phase 8 — Inbox / Triage demo seed (cr1bd_inboundemail).

   UNLIKE the Case data above — which is deliberately NOT fabricated in the
   shipped source — the Inbox screen is a NEW, dark-gated surface, and a small
   realistic seed makes the faceted triage queue demonstrable in dev / tests /
   storybook. This is SAFE for the deployed app: main.tsx always injects the
   REST (Data API / Postgres) source, whose `inboundEmails*` methods return
   HONEST-EMPTY if the inbound-email route is ever unwired — so these rows
   surface ONLY when the mock source is active, never in production
   data. Field shapes mirror the camelCase `InboundEmail` domain type 1:1; the
   `category`/`subtype` strings equal the choiceset option names (§2.3). The array
   is mutable so `setTriageState` flips a row in place for the demo.
   ============================================================ */
const inboundRows: InboundEmail[] = [
  {
    id: 'ibe-1001',
    name: 'Instruction — Acuity Law (CCPY26050)',
    sourceMessageId: '<CAH9wd-001@mail.acuity-law.co.uk>',
    subject: 'New instruction for inspection — LR19 KXM',
    fromAddress: 'instructions@acuity-law.co.uk',
    senderDomain: 'acuity-law.co.uk',
    sourceMailbox: 'engineers@collisionengineers.co.uk',
    receivedOn: '2026-06-25T08:14:00Z',
    hasAttachments: true,
    category: 'receiving_work',
    subtype: 'existing_provider_instruction',
    confidence: 0.95,
    classifierMode: 'deterministic',
    // Real vendored-engine token shapes (rules-engine-v2 Phase 0/5 —
    // functions/parser/cedocumentmapper_v2/rules/email_classifier.py), so the
    // "Why this label?" mapping (why-classified.ts) has something real to
    // translate in dev/tests, not the pre-Phase-0 shorthand this seed used to
    // carry.
    signals: [
      'work_keywords:instruction to inspect,new instruction',
      'body_caseref:CCPY26050',
      'body_vrm:LR19KXM',
      'provider_match_state:one',
      'attachment_kinds:instruction',
      'rule:instruction_doc_existing_provider',
    ],
    triageState: 'routed',
    bodyVrm: 'LR19KXM',
    bodyCaseref: 'CCPY26050',
    bodyPreview:
      'Please find attached our instruction to inspect the above vehicle. The insured is available weekdays; images of the damage are attached.',
    caseId: 'case-1001',
    workProviderId: 'wp-acuity',
  },
  {
    id: 'ibe-1002',
    name: 'Audit re-inspection — Pendle Claims (A.PCH261269)',
    sourceMessageId: '<PCH-audit-261269@pendleclaims.com>',
    subject: 'Audit instruction — re-inspect repair, A.PCH261269',
    fromAddress: 'audits@pendleclaims.com',
    senderDomain: 'pendleclaims.com',
    sourceMailbox: 'engineers@collisionengineers.co.uk',
    receivedOn: '2026-06-24T16:02:00Z',
    hasAttachments: true,
    category: 'receiving_work',
    subtype: 'existing_provider_audit',
    confidence: 0.95,
    classifierMode: 'deterministic',
    signals: [
      'work_keywords:please carry out',
      'audit_phrases:audit re-inspection',
      'body_caseref:A.PCH261269',
      'body_vrm:YD68 OZR',
      'provider_match_state:one',
      'attachment_kinds:instruction',
      'rule:instruction_doc_audit',
    ],
    triageState: 'routed',
    bodyVrm: 'YD68 OZR',
    bodyCaseref: 'A.PCH261269',
    bodyPreview:
      'Please carry out an audit re-inspection of the completed repair and confirm whether the work meets the engineer’s original assessment.',
    caseId: 'case-1002',
    workProviderId: 'wp-pendle',
  },
  {
    id: 'ibe-1003',
    name: 'New-client instruction — Marsh & Webb Solicitors',
    sourceMessageId: '<7f21c0@marshwebb-legal.com>',
    subject: 'Instruction to inspect write-off — GK15 TYU',
    fromAddress: 'newinstructions@marshwebb-legal.com',
    senderDomain: 'marshwebb-legal.com',
    sourceMailbox: 'info@collisionengineers.co.uk',
    receivedOn: '2026-06-25T09:41:00Z',
    hasAttachments: true,
    category: 'receiving_work',
    subtype: 'new_client_work',
    confidence: 0.8,
    classifierMode: 'deterministic',
    signals: [
      'work_keywords:instruction to inspect',
      'body_vrm:GK15TYU',
      'provider_match_state:none',
      'attachment_kinds:instruction',
      'rule:instruction_doc_new_client',
    ],
    triageState: 'new',
    bodyVrm: 'GK15TYU',
    bodyCaseref: '',
    bodyPreview:
      'We are a new instructing firm and would like to engage your services to inspect the attached vehicle and provide an engineering report.',
  },
  {
    id: 'ibe-1004',
    name: 'Query — where is the report for AB12 CDE?',
    sourceMessageId: '<query-ab12cde@acuity-law.co.uk>',
    subject: 'Chasing report — AB12 CDE / our ref CCPY26031',
    fromAddress: 'caseworker@acuity-law.co.uk',
    senderDomain: 'acuity-law.co.uk',
    sourceMailbox: 'engineers@collisionengineers.co.uk',
    receivedOn: '2026-06-25T07:55:00Z',
    hasAttachments: false,
    category: 'query',
    subtype: 'query_existing_work',
    confidence: 0.8,
    classifierMode: 'deterministic',
    signals: [
      'query_keywords:any update',
      'body_caseref:CCPY26031',
      'body_vrm:AB12CDE',
      'provider_match_state:one',
      'rule:query_with_reference',
    ],
    triageState: 'routed',
    bodyVrm: 'AB12CDE',
    bodyCaseref: 'CCPY26031',
    bodyPreview:
      'Could you let us know when the engineer’s report for the above will be ready? The hire is ongoing and we’re being chased by the client.',
    caseId: 'case-0931',
    workProviderId: 'wp-acuity',
  },
  {
    id: 'ibe-1005',
    name: 'Cold enquiry — quote to inspect a write-off',
    sourceMessageId: '<hello-9931@gmail.com>',
    subject: 'How much to inspect a category S vehicle?',
    fromAddress: 'j.okafor@gmail.com',
    senderDomain: 'gmail.com',
    sourceMailbox: 'info@collisionengineers.co.uk',
    receivedOn: '2026-06-24T13:20:00Z',
    hasAttachments: false,
    category: 'query',
    subtype: 'query_new_enquiry',
    confidence: 0.6,
    classifierMode: 'deterministic',
    signals: ['query_keywords:for a quote', 'provider_match_state:none', 'rule:query_keyword_only'],
    triageState: 'new',
    bodyVrm: '',
    bodyCaseref: '',
    bodyPreview:
      'Hi, I’ve been told my car is a write-off and I’d like an independent engineer to look at it. Could you give me a quote and let me know how it works?',
  },
  {
    id: 'ibe-1006',
    name: 'Out-of-office auto-reply',
    sourceMessageId: '<ooo-44@pendleclaims.com>',
    subject: 'Automatic reply: New instruction for inspection — LR19 KXM',
    fromAddress: 'l.bryce@pendleclaims.com',
    senderDomain: 'pendleclaims.com',
    sourceMailbox: 'desk@collisionengineers.co.uk',
    receivedOn: '2026-06-25T08:15:00Z',
    hasAttachments: false,
    category: 'other',
    subtype: 'other',
    confidence: 0.3,
    classifierMode: 'deterministic',
    signals: ['auto_reply:automatic reply,i am out of the office', 'rule:auto_reply_marker'],
    triageState: 'new',
    bodyVrm: '',
    bodyCaseref: '',
    bodyPreview:
      'I am currently out of the office with no access to email and will return on Monday. For urgent matters please contact the claims team.',
  },
  {
    id: 'ibe-1007',
    name: 'Newsletter — Motor Claims Weekly',
    sourceMessageId: '<news-2026-26@motorclaimsweekly.news>',
    subject: 'This week in motor claims: salvage values, OEM parts & more',
    fromAddress: 'noreply@motorclaimsweekly.news',
    senderDomain: 'motorclaimsweekly.news',
    sourceMailbox: 'info@collisionengineers.co.uk',
    receivedOn: '2026-06-23T06:00:00Z',
    hasAttachments: false,
    category: 'other',
    subtype: 'other',
    confidence: 0.3,
    classifierMode: 'deterministic',
    signals: ['provider_match_state:none', 'rule:abstain_to_other'],
    triageState: 'dismissed',
    bodyVrm: '',
    bodyCaseref: '',
    bodyPreview:
      'Your weekly round-up of motor-claims news. Unsubscribe at any time using the link at the foot of this email.',
  },
  {
    id: 'ibe-1008',
    name: 'Delivery failure (mailer-daemon)',
    sourceMessageId: '<bounce-7741@mx.outlook.com>',
    subject: 'Undeliverable: Your photos for inspection',
    fromAddress: 'postmaster@mx.outlook.com',
    senderDomain: 'mx.outlook.com',
    sourceMailbox: 'desk@collisionengineers.co.uk',
    receivedOn: '2026-06-24T18:47:00Z',
    hasAttachments: false,
    category: 'other',
    subtype: 'other',
    confidence: 0.3,
    classifierMode: 'deterministic',
    signals: ['auto_reply:undeliverable', 'rule:auto_reply_marker'],
    triageState: 'new',
    bodyVrm: '',
    bodyCaseref: '',
    bodyPreview:
      'Your message couldn’t be delivered to the recipient. The mailbox may be full or the address may not exist.',
  },
];

/** A row is "active" until staff handle it — `actioned` / `dismissed` are handled
 *  (the active-first list scope + counts, work-todo-spike: email-management). */
function isActiveInbound(r: InboundEmail): boolean {
  return r.triageState !== 'actioned' && r.triageState !== 'dismissed';
}

/** Richer-taxonomy `tag` -> (category, subtype) for the reclassify demo write
 *  (the server does this mapping for real; the mock mirrors it). */
const TAG_MAP: Record<
  NonNullable<ReclassifyInboundInput['tag']>,
  { category: InboundCategory; subtype: InboundSubtype }
> = {
  Inspection: { category: 'receiving_work', subtype: 'existing_provider_instruction' },
  'New client work': { category: 'receiving_work', subtype: 'new_client_work' },
  Audit: { category: 'receiving_work', subtype: 'existing_provider_audit' },
  Diminution: { category: 'receiving_work', subtype: 'existing_provider_diminution' },
  Query: { category: 'query', subtype: 'query_existing_work' },
};

/** Filter the seed by the active category-tab facet (+ optional subtype + view).
 *  `view` defaults to 'active' (handled rows hidden), mirroring the server. */
function filterInbound(rows: InboundEmail[], facet?: InboundFacet): InboundEmail[] {
  const view = facet?.view ?? 'active';
  return rows
    .filter((r) => (facet?.category ? r.category === facet.category : true))
    .filter((r) => (facet?.subtype ? r.subtype === facet.subtype : true))
    .filter((r) =>
      view === 'all' ? true : view === 'handled' ? !isActiveInbound(r) : isActiveInbound(r),
    )
    .slice() // copy so callers can sort without mutating the seed
    .sort((a, b) => (a.receivedOn < b.receivedOn ? 1 : -1)); // newest-first
}

/** Per-category ACTIVE-first counts (+ untriaged backlog) over the seed — handled
 *  rows (actioned/dismissed) are excluded, matching the `/api/inbound/counts` contract. */
function countInbound(rows: InboundEmail[]): InboundCounts {
  const active = rows.filter(isActiveInbound);
  return {
    receiving_work: active.filter((r) => r.category === 'receiving_work').length,
    query: active.filter((r) => r.category === 'query').length,
    billing: active.filter((r) => r.category === 'billing').length,
    non_actionable: active.filter((r) => r.category === 'non_actionable').length,
    case_update: active.filter((r) => r.category === 'case_update').length,
    cancellation: active.filter((r) => r.category === 'cancellation').length,
    pre_instruction: active.filter((r) => r.category === 'pre_instruction').length,
    website_enquiry: active.filter((r) => r.category === 'website_enquiry').length,
    other: active.filter((r) => r.category === 'other').length,
    untriaged: active.filter((r) => r.triageState === 'new').length,
  };
}

/**
 * The empty/unconfigured DataAccess. Reads return empty; the only write
 * (createCase) rejects until the live source is injected.
 */
export const mockDataAccess: DataAccessExt = {
  lookupVehicle: (_input) => Promise.reject(new Error(NOT_CONFIGURED)),
  /* ----- Cases ----- */
  caseById: (_id) => Promise.resolve(undefined),
  createCase: (_input) => Promise.reject(new Error(NOT_CONFIGURED)),
  // Write — rejects until the live source is injected (mirrors createCase/setOnHold).
  updateCase: (_id, _patch) => Promise.reject(new Error(NOT_CONFIGURED)),
  saveCaseEdits: (_id, _patch, _version) => Promise.reject(new Error(NOT_CONFIGURED)),
  casesForQueue: (_name, _now) => Promise.resolve([]),
  openVrmTwins: (_vrm, _excludeCaseId) => Promise.resolve([]),
  openCasePoMatches: (_casePo, _excludeCaseId) => Promise.resolve([]),
  setOnHold: (_caseId, _onHold) => Promise.reject(new Error(NOT_CONFIGURED)),
  // Write — rejects until the live source is injected (a faked chaser row would
  // let staff believe a chase was recorded when it wasn't; mirrors setOnHold).
  logChase: (_caseId, _input) => Promise.reject(new Error(NOT_CONFIGURED)),
  // Guided-photo reads stay honestly empty; every link-changing action rejects.
  captureSessions: (_caseId) => Promise.resolve([]),
  createCaptureSession: (_caseId, _input) => Promise.reject(new Error(NOT_CONFIGURED)),
  rotateCaptureSession: (_sessionId) => Promise.reject(new Error(NOT_CONFIGURED)),
  revokeCaptureSession: (_sessionId) => Promise.reject(new Error(NOT_CONFIGURED)),
  // Case done lifecycle (TKT-094/095/096): the two writes reject (a faked status
  // flip must never look recorded); the completed browse reads honest-empty.
  markEvaSubmitted: (_caseId) => Promise.reject(new Error(NOT_CONFIGURED)),
  markCaseDone: (_caseId) => Promise.reject(new Error(NOT_CONFIGURED)),
  retryManualIntakeArchive: (_caseId) => Promise.reject(new Error(NOT_CONFIGURED)),
  completedCases: (_status) => Promise.resolve([]),
  mergeCandidates: (_caseId) => Promise.resolve([]),
  mergeCases: (_sourceCaseId, _targetCaseId) => Promise.reject(new Error(NOT_CONFIGURED)),
  // Durable Superuser write — rejects until the live source is injected (a faked
  // "removed" result would be exactly the synthetic echo this source refuses to give).
  removeCase: (_id, _input: RemoveCaseInput): Promise<RemoveCaseResult> =>
    Promise.reject(new Error(NOT_CONFIGURED)),
  // Honest READ: the case corpus is empty (case_ count 0), so the next sequence for
  // ANY principal is 001 — computed, not fabricated. `source:'db'` (empty DB baseline).
  nextCasePo: (principal, year): Promise<NextCasePoResult> => {
    const p = (principal ?? '').toUpperCase();
    const yy = (year !== undefined && year !== ''
      ? String(year)
      : String(new Date().getFullYear())
    ).slice(-2);
    const seq = '001';
    const id = `${p}${yy}${seq}`;
    return Promise.resolve({
      principal: p,
      yy,
      seq,
      nextSeq: 1,
      evaLower: id.toLowerCase(),
      boxUpper: id.toUpperCase(),
      source: 'db',
    });
  },

  /* ----- Evidence ----- */
  imagesForCase: (_caseId) => Promise.resolve([]),

  /* ----- Providers ----- */
  providers: () => Promise.resolve([]),
  providerByCode: (_code) => Promise.resolve(undefined),
  // Durable corpus write — rejects until the live source is injected (mirrors createCase).
  updateProvider: (_idOrCode, _input: ProviderUpdateInput) =>
    Promise.reject(new Error(NOT_CONFIGURED)),

  /* ----- Inspection-address suggestions (corpus; empty default) ----- */
  inspectionAddressSuggestions: (_caseId, _q) => Promise.resolve([]),
  assistantChat: (_messages) =>
    Promise.resolve({ reply: 'The assistant is not available in this preview.', disabled: true }),
  getAiChatGate: () => Promise.resolve({ enabled: false, writeEnabled: false }),
  globalSearch: (q) => Promise.resolve({ ...EMPTY_SEARCH, query: q }),
  caseWithVersion: (_id) =>
    Promise.resolve({
      state: 'unavailable' as const,
      reason: 'request_failed' as const,
      status: 0,
      error: 'The latest case could not be loaded.',
    }),
  inboundWithVersion: (_id) =>
    Promise.resolve({
      state: 'unavailable' as const,
      reason: 'request_failed' as const,
      status: 0,
      error: 'The latest email could not be loaded.',
    }),
  resolveOutlookMessageLink: (id) => {
    const row = inboundRows.find((item) => item.id === id);
    return Promise.resolve(
      row?.outlookWebLink
        ? { status: 'available' as const, outlookWebLink: row.outlookWebLink }
        : { status: 'missing_identity' as const },
    );
  },
  executeProposal: (_action, _ifMatch) =>
    Promise.resolve({ ok: false, status: 501, error: 'That change is not available.' }),
  uploadEvidence: (_caseId, _files, _options) => Promise.resolve({ added: [], rejected: [], status: 501 }),
  evidenceContentUrl: (_id) => Promise.resolve(undefined),
  evidenceContentBlob: (_id) => Promise.resolve(undefined),
  // Durable write — rejects until the live source is injected (mirrors createCase).
  setReflectionDismissed: (_evidenceId, _dismissed) => Promise.reject(new Error(NOT_CONFIGURED)),
  updateEvidenceReview: (_evidenceId, _input) => Promise.reject(new Error(NOT_CONFIGURED)),
  deleteCaseImage: (_caseId, _evidenceId) => Promise.reject(new Error(NOT_CONFIGURED)),
  inspectionAddressCounts: () => Promise.resolve({ confirmed: 0, suggested: 0 }),
  // Honest no-op: the empty default writes nothing (the live REST source, backed by
  // the Postgres `inspection_address` table, is injected at startup). The CaseDetail
  // confirm still updates the local working copy when this default source is active.
  saveInspectionDecision: (_caseId, _decision) => Promise.resolve({ persisted: false }),

  /* ----- Dashboard / queue aggregates ----- */
  // Amalgamated summary: zero case pipeline (no fabricated cases) + the inbound demo
  // counts (active-first), so the dev cockpit's inbound pill mirrors the Inbox seed.
  dashboardSummary: (): Promise<DashboardSummary> =>
    Promise.resolve({
      liveCounts: ZERO_LIVE,
      throughput: ZERO_THROUGHPUT,
      queueCounts: { ...ZERO_QUEUE_COUNTS },
      pipelineStages: emptyPipelineStages(),
      reasonFacets: [] as ReasonFacet[],
      agingExceptions: ZERO_AGING,
      inbound: countInbound(inboundRows),
    }),
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

  /* ----- Inbox / Triage (Phase 8 demo seed) ----- */
  inboundEmails: (facet) => Promise.resolve(filterInbound(inboundRows, facet)),
  inboundEmailCounts: () => Promise.resolve(countInbound(inboundRows)),
  // Demo write: flip the seed row in place so a refetch reflects the change.
  setTriageState: (id, state: TriageState) => {
    const row = inboundRows.find((r) => r.id === id);
    if (row) row.triageState = state;
    return Promise.resolve();
  },
  // Demo write (mirrors setTriageState): apply the explicit category/subtype OR map the
  // richer-taxonomy `tag`, record the classifier's ORIGINAL suggestion so the
  // chosen-vs-suggested marker shows, mark it human-settled, and return the updated row.
  reclassifyInbound: (id, input: ReclassifyInboundInput): Promise<InboundEmail> => {
    const row = inboundRows.find((r) => r.id === id);
    if (!row) return Promise.reject(new Error(`Inbound email ${id} not found`));
    if (row.suggestedCategory === undefined) row.suggestedCategory = row.category;
    if (row.suggestedSubtype === undefined) row.suggestedSubtype = row.subtype;
    const mapped = input.tag ? TAG_MAP[input.tag] : undefined;
    row.category = input.category ?? mapped?.category ?? row.category;
    row.subtype = input.subtype ?? mapped?.subtype ?? row.subtype;
    row.classifierMode = 'human';
    return Promise.resolve({ ...row });
  },

  /* ----- AI suggestion layer (TKT-015) — honest-empty / honest-off default ----- */
  // No fabricated AI rows: the empty default has no suggestions and the gate is OFF, so
  // the gated panel renders NOTHING. generate is the same honest no-op the live API gives
  // when disabled; the durable review write rejects until the live source is injected.
  aiSuggestions: (_caseId): Promise<AiSuggestion[]> => Promise.resolve([]),
  getAiAssistGate: () => Promise.resolve({ ...AI_ASSIST_GATE_ALL_OFF }),
  generateAiSuggestions: (_caseId): Promise<GenerateAiSuggestionsResult> =>
    Promise.resolve({ generated: 0, reason: 'disabled' }),
  reviewAiSuggestion: (_id, _input: AiSuggestionReviewInput): Promise<AiSuggestionReviewResult> =>
    Promise.reject(new Error(NOT_CONFIGURED)),

  /* ----- Inbound suggestions — ref-gate affordance (rules-engine-v2 Phase 2) -----
     Same honest-empty default as aiSuggestions above: no fabricated rows, so the
     inbox preview panel's suggested-match banner never renders on the mock source. */
  inboundSuggestions: (_id): Promise<AiSuggestion[]> => Promise.resolve([]),
  // Write — rejects until the live source is injected (never a fake unlink).
  detachInbound: (_id): Promise<DetachInboundResult> => Promise.reject(new Error(NOT_CONFIGURED)),

  /* ----- Destructive image deletion (TKT-160) — honest-off on the mock source ----- */
  getDeleteCaseImageGate: () => Promise.resolve({ ...DELETE_CASE_IMAGE_GATE_ALL_OFF }),

  /* ----- Outlook filing (TKT-054 / 020726 E6) — honest-off on the mock source ----- */
  getOutlookMoveGate: () => Promise.resolve({ enabled: false }),
  moveInboundToOutlook: (_id): Promise<OutlookMoveResult> =>
    Promise.reject(new Error(NOT_CONFIGURED)),
};

/** Factory form, for symmetry with `createRestDataAccess`. */
export function createMockDataAccess(): DataAccessExt {
  return mockDataAccess;
}
