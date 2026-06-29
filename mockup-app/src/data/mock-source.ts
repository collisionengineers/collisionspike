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

import type {
  DataAccess,
  InboundEmail,
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
} from '@cs/domain';
import { BOX_GATES_ALL_FALSE, LOCATION_ASSIST_GATE_ALL_OFF } from '@cs/domain';

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
   Dataverse source, whose `inboundEmails*` methods return HONEST-EMPTY while the
   `cr1bd_inboundemail` table is unwired (services.inboundEmails undefined, G4) —
   so these rows surface ONLY when the mock source is active, never in production
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
    sourceMailbox: 'digital@collisionengineers.co.uk',
    receivedOn: '2026-06-25T08:14:00Z',
    hasAttachments: true,
    category: 'receiving_work',
    subtype: 'existing_provider_instruction',
    confidence: 0.95,
    classifierMode: 'deterministic',
    signals: ['attachment:instruction', 'provider:one', 'rule:R1'],
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
    sourceMailbox: 'digital@collisionengineers.co.uk',
    receivedOn: '2026-06-24T16:02:00Z',
    hasAttachments: true,
    category: 'receiving_work',
    subtype: 'existing_provider_audit',
    confidence: 0.95,
    classifierMode: 'deterministic',
    signals: ['attachment:instruction', 'audit:re-inspection', 'provider:one', 'rule:R1'],
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
    sourceMailbox: 'enquiries@collisionengineers.co.uk',
    receivedOn: '2026-06-25T09:41:00Z',
    hasAttachments: true,
    category: 'receiving_work',
    subtype: 'new_client_work',
    confidence: 0.8,
    classifierMode: 'deterministic',
    signals: ['attachment:instruction', 'provider:none', 'rule:R1'],
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
    sourceMailbox: 'digital@collisionengineers.co.uk',
    receivedOn: '2026-06-25T07:55:00Z',
    hasAttachments: false,
    category: 'query',
    subtype: 'query_existing_work',
    confidence: 0.8,
    classifierMode: 'deterministic',
    signals: ['keyword:query', 'body_caseref', 'open_case:linked', 'rule:R4'],
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
    sourceMailbox: 'enquiries@collisionengineers.co.uk',
    receivedOn: '2026-06-24T13:20:00Z',
    hasAttachments: false,
    category: 'query',
    subtype: 'query_new_enquiry',
    confidence: 0.6,
    classifierMode: 'deterministic',
    signals: ['keyword:query', 'keyword:quote', 'provider:none', 'rule:R5'],
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
    sourceMailbox: 'digital@collisionengineers.co.uk',
    receivedOn: '2026-06-25T08:15:00Z',
    hasAttachments: false,
    category: 'other',
    subtype: 'other',
    confidence: 0.3,
    classifierMode: 'deterministic',
    signals: ['marker:auto-reply', 'abstain', 'rule:R0'],
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
    sourceMailbox: 'enquiries@collisionengineers.co.uk',
    receivedOn: '2026-06-23T06:00:00Z',
    hasAttachments: false,
    category: 'other',
    subtype: 'other',
    confidence: 0.3,
    classifierMode: 'deterministic',
    signals: ['abstain', 'rule:R6'],
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
    sourceMailbox: 'digital@collisionengineers.co.uk',
    receivedOn: '2026-06-24T18:47:00Z',
    hasAttachments: false,
    category: 'other',
    subtype: 'other',
    confidence: 0.3,
    classifierMode: 'deterministic',
    signals: ['marker:bounce', 'abstain', 'rule:R0'],
    triageState: 'new',
    bodyVrm: '',
    bodyCaseref: '',
    bodyPreview:
      'Your message couldn’t be delivered to the recipient. The mailbox may be full or the address may not exist.',
  },
];

/** Filter the seed by the active category-tab facet (+ optional subtype). */
function filterInbound(rows: InboundEmail[], facet?: InboundFacet): InboundEmail[] {
  return rows
    .filter((r) => (facet?.category ? r.category === facet.category : true))
    .filter((r) => (facet?.subtype ? r.subtype === facet.subtype : true))
    .slice() // copy so callers can sort without mutating the seed
    .sort((a, b) => (a.receivedOn < b.receivedOn ? 1 : -1)); // newest-first
}

/** Per-category counts (+ untriaged backlog) over the seed. */
function countInbound(rows: InboundEmail[]): InboundCounts {
  return {
    receiving_work: rows.filter((r) => r.category === 'receiving_work').length,
    query: rows.filter((r) => r.category === 'query').length,
    other: rows.filter((r) => r.category === 'other').length,
    untriaged: rows.filter((r) => r.triageState === 'new').length,
  };
}

/**
 * The empty/unconfigured DataAccess. Reads return empty; the only write
 * (createCase) rejects until the live source is injected.
 */
export const mockDataAccess: DataAccess = {
  /* ----- Cases ----- */
  caseById: (_id) => Promise.resolve(undefined),
  createCase: (_input) => Promise.reject(new Error(NOT_CONFIGURED)),
  // Write — rejects until the live source is injected (mirrors createCase/setOnHold).
  updateCase: (_id, _patch) => Promise.reject(new Error(NOT_CONFIGURED)),
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

  /* ----- Inbox / Triage (Phase 8 demo seed) ----- */
  inboundEmails: (facet) => Promise.resolve(filterInbound(inboundRows, facet)),
  inboundEmailCounts: () => Promise.resolve(countInbound(inboundRows)),
  // Demo write: flip the seed row in place so a refetch reflects the change.
  setTriageState: (id, state: TriageState) => {
    const row = inboundRows.find((r) => r.id === id);
    if (row) row.triageState = state;
    return Promise.resolve();
  },
};

/** Factory form, for symmetry with `createDataverseDataAccess`. */
export function createMockDataAccess(): DataAccess {
  return mockDataAccess;
}
