/* ============================================================
   Collision Engineers — Code App DATA SEAM: types.

   Two interfaces, no implementation, no SDK import:

   (a) DataAccess — the REPOSITORY the screens depend on. Its function NAMES are
       the same ones the mock barrel ('../mock') exports today; the DATA-FETCHING
       members return Promise<...> (so the screens can move to async hooks),
       while the windowing/aging shapes are unchanged. This is the single seam:
       screens import everything through '../data', never from '../mock' or from
       a pac-generated service.

   (b) GeneratedServices — a LOCAL TypeScript model of the services
       `pac code add-data-source` (code-apps-preview:add-dataverse) emits under
       `src/generated/services/*`. We code the Dataverse-backed DataAccess against
       THIS interface (injected at runtime), NOT against '@microsoft/power-apps'
       or `src/generated/` — so the offline build stays SDK-free and mock-backed,
       and the 'no @microsoft/power-apps import in src' grep gate keeps passing.
       When pac generates the real services they satisfy this shape structurally.

   PURE TYPES ONLY. No values, no React, no I/O.
   ============================================================ */

import type {
  ActionReason,
  Case,
  Evidence,
  Provider,
  ActivityEvent,
} from '../mock/types';
import type {
  QueueName,
  LiveCounts,
  Throughput,
  AgingExceptions,
  PipelineStage,
  ReasonFacet,
} from '../mock/queues';

/* ============================================================
   (a) DataAccess — the repository the screens use.
   ============================================================ */

/**
 * The repository the four screens (Dashboard, CaseList, CaseDetail,
 * EvaSubmitDialog) bind to. Method NAMES match the mock barrel's data-fetching
 * exports 1:1; the only change is that data-fetching members return Promises so
 * the same surface works over async Dataverse calls. The mock implementation
 * resolves these synchronously (Promise.resolve), so behaviour is identical to
 * today; the Dataverse implementation awaits the generated services.
 *
 * PURE HELPERS that take a Case/now and compute synchronously (dueInfo,
 * suggestCasePo, reasonVerb, outstandingText, statusToQueue, …) are NOT on this
 * interface — they stay SYNC and are re-exported unchanged from '../data'
 * (see index.ts). Only the members that fetch/aggregate rows live here.
 */
export interface DataAccess {
  /* ----- Cases ----- */
  /** A single case by id (mock `caseById`). */
  caseById(id: string): Promise<Case | undefined>;
  /** Cases in a queue; `done` is windowed on submittedAt===today (mock `casesForQueue`). */
  casesForQueue(name: QueueName, now?: Date): Promise<Case[]>;
  /** Other OPEN cases sharing a VRM — the duplicate_risk "VRM twins" affordance. */
  openVrmTwins(vrm: string, excludeCaseId?: string): Promise<Case[]>;

  /* ----- Evidence ----- */
  /** Image-kind, non-excluded evidence for a case (mock `imagesForCase`). */
  imagesForCase(caseId: string): Promise<Evidence[]>;

  /* ----- Providers (corpus) ----- */
  /** The WorkProvider corpus (mock `providers`). */
  providers(): Promise<Provider[]>;
  /** One provider by principalCode (mock `providerByCode`). */
  providerByCode(code: string): Promise<Provider | undefined>;

  /* ----- Dashboard / queue aggregates ----- */
  /** Live-depth backlogs: needsAction / inProgress / ready (mock `liveCounts`). */
  liveCounts(now?: Date): Promise<LiveCounts>;
  /** Windowed throughput: inToday / submittedToday / clearedThisWeek (mock `throughput`). */
  throughput(now?: Date): Promise<Throughput>;
  /** Oldest-due-first needs-action rows + exception tallies (mock `agingExceptions`). */
  agingExceptions(now?: Date): Promise<AgingExceptions>;
  /** Per-queue counts for the rail badges (mock `queueCounts`). */
  queueCounts(now?: Date): Promise<Record<QueueName, number>>;
  /** Needs-action reason facet chips, zero-count dropped (mock `reasonCounts`). */
  reasonCounts(now?: Date): Promise<ReasonFacet[]>;
  /** Per-stage counts for the pipeline strip (mock `pipelineStages`). */
  pipelineStages(): Promise<PipelineStage[]>;

  /* ----- Activity feed ----- */
  /** Recent pipeline activity, newest first (mock `activity`). */
  recentActivity(): Promise<ActivityEvent[]>;
  /** Activity for a single case, newest first (mock `activityForCase`). */
  activityForCase(caseId: string): Promise<ActivityEvent[]>;
}

/** A needs-action reason re-exported for callers shaping aging tallies. */
export type { ActionReason };

/* ============================================================
   (b) GeneratedServices — LOCAL model of pac `add-data-source` output.

   Per the Microsoft Learn "Connect your code app to Dataverse" docs, each table
   added with `pac code add-data-source` produces:
     - src/generated/models/<Entity>Model.ts   — a flat record type (logical names)
     - src/generated/services/<Entity>Service.ts — a class with static methods:
         getAll(options?) -> Promise<IOperationResult<T[]>>
         get(id)          -> Promise<IOperationResult<T>>
         create(record)   -> Promise<IOperationResult<T>>
         update(id, chg)  -> Promise<IOperationResult<void | T>>
         delete(id)       -> Promise<IOperationResult<void>>
   We model the SHAPE we actually consume (getAll + get for read-only M1 binding;
   create/update declared for the deploy-time write paths) so the real generated
   classes satisfy this structurally at injection time. We deliberately DO NOT
   import the real `@microsoft/power-apps` IOperationResult / IGetAllOptions —
   we restate the minimal structural shapes here to keep the offline build
   SDK-free.
   ============================================================ */

/** Minimal structural mirror of the SDK's `IOperationResult<T>` ({ data?: T }). */
export interface OperationResult<T> {
  data?: T;
}

/** Minimal structural mirror of the SDK's `IGetAllOptions` (select/filter/sort/top). */
export interface GetAllOptions {
  select?: string[];
  filter?: string;
  orderBy?: string[];
  top?: number;
}

/**
 * The generated service surface for one Dataverse table. `TRecord` is the flat
 * logical-name record (cr1bd_* keys + the system id column). Matches the static
 * methods pac emits on `<Entity>Service`.
 */
export interface GeneratedTableService<TRecord> {
  getAll(options?: GetAllOptions): Promise<OperationResult<TRecord[]>>;
  get(id: string): Promise<OperationResult<TRecord>>;
  create(record: Partial<TRecord>): Promise<OperationResult<TRecord>>;
  update(id: string, changes: Partial<TRecord>): Promise<OperationResult<void | TRecord>>;
  delete?(id: string): Promise<OperationResult<void>>;
}

/* ----------  Flat Dataverse record shapes (cr1bd_* logical names)  ----------
   These mirror the dataverse/schema/*.json logical columns the M1 binding reads.
   Choice columns surface as the integer `value` (e.g. statuscode integers from
   dataverse/choicesets/*.json); the adapter maps them to the camelCase enums.
   Kept partial-friendly (optional) because OData $select trims columns. */

/** A Case row as the generated CasesService returns it (cr1bd_case logical names). */
export interface CaseRecord {
  cr1bd_caseid?: string;
  cr1bd_name?: string;
  cr1bd_vrm?: string;
  cr1bd_caseref?: string;
  cr1bd_casepo?: string;

  cr1bd_status?: number; // cr1bd_casestatus integer (statuscode)
  cr1bd_intakechannelkind?: number; // cr1bd_intakechannelkind integer
  cr1bd_intakechannelmanual?: boolean;
  cr1bd_sourcemailbox?: string;
  cr1bd_actionreason?: number | null; // cr1bd_actionreason integer
  cr1bd_inspectiondecision?: number; // cr1bd_inspectiondecisionmode integer

  cr1bd_datedue?: string | null; // ISO/Dataverse DateOnly
  cr1bd_inspectiondate?: string | null;
  cr1bd_submittedat?: string | null;
  /** createdon is the Dataverse system audit column (intake/aging windowing). */
  createdon?: string;

  /** WorkProvider lookup (GUID) + the expanded display/code, when $expanded. */
  _cr1bd_workproviderid_value?: string;
  cr1bd_provider_display?: string;
  cr1bd_provider_code?: string;

  /* The 12 EVA payload columns (strings; '' allowed). */
  cr1bd_evaworkprovider?: string;
  cr1bd_evavehiclemodel?: string;
  cr1bd_evaclaimantname?: string;
  cr1bd_evaclaimanttelephone?: string;
  cr1bd_evaclaimantemail?: string;
  cr1bd_evadateofloss?: string;
  cr1bd_evadateofinstruction?: string;
  cr1bd_evaaccidentcircumstances?: string;
  cr1bd_evainspectionaddress?: string;
  cr1bd_evavatstatus?: string;
  cr1bd_evamileage?: string;
  cr1bd_evamileageunit?: string;

  /* Overview-only (must not drive workflow). */
  cr1bd_ovinsuredname?: string;
  cr1bd_ovclaimantname?: string;
  cr1bd_ovthirdpartyname?: string;
  cr1bd_ovclaimnumber?: string;
  cr1bd_ovpolicyreference?: string;
  cr1bd_ovincidentdate?: string;
  cr1bd_ovclaimtype?: string;
  cr1bd_ovinsurername?: string;
  cr1bd_ovrepairername?: string;
}

/** An Evidence row (cr1bd_evidence logical names). */
export interface EvidenceRecord {
  cr1bd_evidenceid?: string;
  cr1bd_filename?: string;
  _cr1bd_caseid_value?: string;
  cr1bd_kind?: number; // cr1bd_evidencekind integer
  cr1bd_imagerole?: number; // cr1bd_imagerole integer
  cr1bd_registrationvisible?: boolean;
  cr1bd_acceptedforeva?: boolean;
  cr1bd_excluded?: boolean;
  cr1bd_exclusionreason?: string;
  cr1bd_sequenceindex?: number;
  cr1bd_sha256?: string;
  cr1bd_contenttype?: string;
  cr1bd_storagepath?: string;
  cr1bd_sourcemessageid?: string;
  cr1bd_sourcelabel?: string;
}

/** A WorkProvider row (cr1bd_workprovider logical names). */
export interface WorkProviderRecord {
  cr1bd_workproviderid?: string;
  cr1bd_displayname?: string;
  cr1bd_principalcode?: string;
  cr1bd_defaultmailbox?: string;
  cr1bd_knownemaildomains?: string; // newline/JSON list (Memo)
  cr1bd_inspectionlocationpolicy?: number; // cr1bd_inspectionlocationpolicy integer
  cr1bd_providerautomationmode?: number; // cr1bd_providerautomationmode integer
  cr1bd_active?: boolean;
}

/** A FieldLevelProvenance row (cr1bd_fieldlevelprovenance logical names). */
export interface FieldLevelProvenanceRecord {
  cr1bd_fieldlevelprovenanceid?: string;
  _cr1bd_caseid_value?: string;
  cr1bd_fieldname?: string; // EVA_FIELD_ORDER camelCase key
  cr1bd_value?: string;
  cr1bd_sourcetype?: number; // cr1bd_fieldprovenancesourcetype integer
  cr1bd_sourcelabel?: string;
  cr1bd_sourcereference?: string;
  cr1bd_confidence?: number | null;
  cr1bd_reviewstate?: number; // cr1bd_reviewstate integer
  cr1bd_reviewedby?: string;
  cr1bd_reviewedat?: string;
  cr1bd_notes?: string;
}

/** A Note row (cr1bd_note logical names). */
export interface NoteRecord {
  cr1bd_noteid?: string;
  _cr1bd_caseid_value?: string;
  cr1bd_author?: string;
  cr1bd_timestamp?: string;
  cr1bd_text?: string;
}

/** A Chaser row (cr1bd_chaser logical names). */
export interface ChaserRecord {
  cr1bd_chaserid?: string;
  _cr1bd_caseid_value?: string;
  cr1bd_targettype?: number;
  cr1bd_targetname?: string;
  cr1bd_channel?: number;
  cr1bd_templateused?: string;
  cr1bd_status?: number;
  cr1bd_summary?: string;
  cr1bd_createdat?: string;
  cr1bd_sentby?: string;
  cr1bd_sentat?: string;
}

/** An AuditEvent / activity row (cr1bd_auditevent logical names). */
export interface AuditEventRecord {
  cr1bd_auditeventid?: string;
  _cr1bd_caseid_value?: string;
  cr1bd_vrm?: string;
  cr1bd_action?: number | string;
  cr1bd_actor?: string;
  cr1bd_timestamp?: string;
  cr1bd_description?: string;
}

/**
 * The bundle of generated services the Dataverse-backed DataAccess is injected
 * with. After `pac code add-data-source` runs for each table, the caller wires
 * the real `CasesService`/`EvidenceService`/… (which satisfy these structurally)
 * into this object and hands it to `createDataverseDataAccess`. Nothing here is
 * imported by the default (mock) build.
 */
export interface GeneratedServices {
  cases: GeneratedTableService<CaseRecord>;
  evidence: GeneratedTableService<EvidenceRecord>;
  workProviders: GeneratedTableService<WorkProviderRecord>;
  fieldProvenance: GeneratedTableService<FieldLevelProvenanceRecord>;
  notes: GeneratedTableService<NoteRecord>;
  chasers: GeneratedTableService<ChaserRecord>;
  auditEvents: GeneratedTableService<AuditEventRecord>;
}
