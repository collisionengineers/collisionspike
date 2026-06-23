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
  CaseStatus,
  EvaFields,
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
/**
 * Input to `createCase` — the manual-intake write path. Carries the reviewed 12
 * EVA fields, the Case-identity values (vrm / Case-PO), the initial status, and
 * the intake channel marker (always manual here). `writeProvenance` opts into
 * persisting one FieldLevelProvenance row per EVA field (source/confidence).
 */
export interface CreateCaseInput {
  /** The 12 reviewed EVA fields (camelCase keys). */
  evaFields: EvaFields;
  /** VRM (Case identity). */
  vrm: string;
  /** Provider reference / Case-PO (Case identity), if any. */
  casePo?: string;
  /** Provider display name + 4-char principal code, if known. */
  provider?: string;
  providerCode?: string;
  /** Insured / policyholder name (overview fact). */
  insuredName?: string;
  /** Provider's own case / claim number (their reference) — NOT our Case-PO. */
  providerReference?: string;
  /** Initial workflow status (e.g. 'ingested'). */
  status: CaseStatus;
  /** Free-text source mailbox/label for the manual channel. */
  sourceLabel?: string;
  /** Persist a FieldLevelProvenance row per EVA field when true. */
  writeProvenance?: boolean;
  /** Inspection decision to stamp on create (e.g. 'image_based' for an image-only
   *  case); omitted -> the back-fill derives it from the address text. */
  inspectionDecision?: Case['inspectionDecision'];
  /** Reason for an image-based decision — persisted as a case note when present. */
  inspectionDecisionReason?: string;
  /** Park the new case in the Held queue on creation (hold-by-default / per-case). */
  onHold?: boolean;
}

/** The result of a Case write — the new row's id (GUID) the UI navigates to. */
export interface CreateCaseResult {
  /** The created Case's id (cr1bd_caseid GUID), used by `/case/:caseId`. */
  id: string;
}

/* ----------  Inspection-address SUGGESTIONS (always a suggestion)  ----------
   A low-confidence candidate inspection location surfaced from the externally-
   maintained corpus (cr1bd_inspectionaddress rows tagged
   cr1bd_sourcelabel startswith 'suggested', cr1bd_decisionmode = unknown). These
   are NEVER auto-confirmed and NEVER mirrored onto a Case — the reviewer must
   pick one explicitly, which copies it into the manual 6-line draft and sets the
   decision mode to manual (see CaseDetail "Suggested locations"). */
export interface SuggestedAddress {
  /** Catalogue row id (cr1bd_inspectionaddressid GUID). */
  id: string;
  /** The candidate address as up-to-6 lines (already split; blanks trimmed). */
  lines: string[];
  /** Normalised UK postcode, if present. */
  postcode: string;
  /** Provider principal code this candidate is associated with, if known. */
  providerCode?: string;
  /** The location value (loc) the candidate was matched on, if known. */
  locValue?: string;
  /** Free-text evidence/provenance note (source + detail) — shown in a tooltip. */
  evidenceNote?: string;
  /** The confidence band carried in the source label (e.g. 'candidate_multiple_addresses'). */
  confidenceBand?: string;
}

/** Confirmed-vs-suggested split of the inspection-address corpus (Admin count). */
export interface InspectionAddressCounts {
  /** Confirmed reference rows (decisionMode confirmed_physical). */
  confirmed: number;
  /** Low-confidence suggestion rows (sourceLabel startswith 'suggested'). */
  suggested: number;
}

/* ----------  Box feature gates (the BOX_* env-var rows, read at runtime)  ----------
   Code Apps have NO native environment-variable mechanism, so the gates are read
   the SAME way the flows read them — via the Dataverse `environmentvariable*`
   platform tables (see `getBoxGates` in dataverse-source.ts). Every gate defaults
   FALSE; the whole object defaults all-false on a read failure (honest off). The
   names below mirror the `cr1bd_BOX_*` definitions owned by the dataverse section
   (plan 05); the UI only READS them. */
export interface BoxGates {
  /** cr1bd_BOX_API_ENABLED — the master Box switch (shared link, direct submit). */
  apiEnabled: boolean;
  /** cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED — folder minted at parse-confirm. */
  folderAtIntakeEnabled: boolean;
  /** cr1bd_BOX_FILEREQUEST_ENABLED — the per-case image upload-link chaser. */
  fileRequestEnabled: boolean;
  /** cr1bd_BOX_EMBED_ENABLED — the in-app iframe embed (reserved; stays off here). */
  embedEnabled: boolean;
  /** cr1bd_BOX_METADATA_ENABLED — Business-Plus metadata path (Wave-2+, out of scope). */
  metadataEnabled: boolean;
  /**
   * Derived (NOT an env-var Boolean): true when `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID`
   * carries a non-empty value. The chaser upload-link action needs BOTH
   * `fileRequestEnabled` AND a configured template id before it may show.
   */
  fileRequestTemplateConfigured: boolean;
}

/** All-false default — the honest "Box not switched on / unreadable" baseline. */
export const BOX_GATES_ALL_FALSE: BoxGates = {
  apiEnabled: false,
  folderAtIntakeEnabled: false,
  fileRequestEnabled: false,
  embedEnabled: false,
  metadataEnabled: false,
  fileRequestTemplateConfigured: false,
};

/** Result of a manual staff case merge (#4). */
export interface MergeCasesResult {
  /** The surviving (target) case id. */
  targetCaseId: string;
  /** Count of evidence rows reparented from source to target. */
  movedEvidence: number;
}

export interface DataAccess {
  /* ----- Cases ----- */
  /** A single case by id (mock `caseById`). */
  caseById(id: string): Promise<Case | undefined>;
  /** Create a new Case from reviewed manual-intake fields; returns its id. */
  createCase(input: CreateCaseInput): Promise<CreateCaseResult>;
  /** Cases in a queue; `done` is windowed on submittedAt===today (mock `casesForQueue`). */
  casesForQueue(name: QueueName, now?: Date): Promise<Case[]>;
  /** Other OPEN cases sharing a VRM — the duplicate_risk "VRM twins" affordance. */
  openVrmTwins(vrm: string, excludeCaseId?: string): Promise<Case[]>;
  /** Park / un-park a case (staff manual hold). On-hold cases route to the Held queue. */
  setOnHold(caseId: string, onHold: boolean): Promise<void>;
  /** Open, same-provider cases this case could be MERGED into (staff manual merge,
   *  #4): excludes self, terminal, and already-merged (linked_to_instruction). */
  mergeCandidates(caseId: string): Promise<Case[]>;
  /** Manually MERGE a source case into a target (survivor) case: reparent the
   *  source's evidence onto the target, mark the source linked_to_instruction
   *  (caseType 'merged') and record the survivor in cr1bd_duplicatekeys. Same
   *  provider only (asserted). Audit + target readiness recompute are the backend
   *  flow's job. Returns the survivor id + moved-evidence count. */
  mergeCases(sourceCaseId: string, targetCaseId: string): Promise<MergeCasesResult>;

  /* ----- Evidence ----- */
  /** Image-kind, non-excluded evidence for a case (mock `imagesForCase`). */
  imagesForCase(caseId: string): Promise<Evidence[]>;

  /* ----- Providers (corpus) ----- */
  /** The WorkProvider corpus (mock `providers`). */
  providers(): Promise<Provider[]>;
  /** One provider by principalCode (mock `providerByCode`). */
  providerByCode(code: string): Promise<Provider | undefined>;

  /* ----- Inspection-address suggestions (corpus; ALWAYS suggestions) ----- */
  /**
   * Low-confidence candidate inspection locations for a case (corpus rows tagged
   * `cr1bd_sourcelabel` startswith 'suggested'), scoped to the case's provider.
   * NEVER auto-applied — the reviewer picks one explicitly. Empty by default
   * (the corpus table is added at deploy time; the empty source returns []).
   */
  inspectionAddressSuggestions(caseId: string): Promise<SuggestedAddress[]>;
  /** Confirmed-vs-suggested split of the inspection-address corpus (Admin count). */
  inspectionAddressCounts(): Promise<InspectionAddressCounts>;

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

  /* ----- Box feature gates ----- */
  /**
   * The `BOX_*` feature gates, read from the Dataverse env-var tables (Code Apps
   * have no native env-var read). Cached after the first read; resolves to
   * `BOX_GATES_ALL_FALSE` on any failure. The empty/default source returns
   * all-false (Box off until the live source + bound connection exist).
   */
  getBoxGates(): Promise<BoxGates>;

  /* ----- App intake preferences ----- */
  /** Read the 'hold new cases by default' toggle (env-var; false on failure). */
  getHoldNewCasesDefault(): Promise<boolean>;
  /** Write the 'hold new cases by default' toggle (upserts its env-var value). The
   *  ONE Code-App env-var WRITE — needs env-var customization privilege. */
  setHoldNewCasesDefault(value: boolean): Promise<void>;
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
  cr1bd_onhold?: boolean; // staff manual hold -> Held queue
  cr1bd_caselinkstate?: number; // cr1bd_caselinkstate integer (none|pending|linked)
  cr1bd_duplicatekeys?: string; // DEDUP STAGING Memo: JSON of linked/merged case ids

  /* Box one-way mirror (absent until the Case/PO folder is created). */
  cr1bd_boxfolderid?: string;
  cr1bd_boxfolderurl?: string; // folder shared-link ("Open in Box")
  cr1bd_boxsyncedat?: string | null;

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
  _cr1bd_caseid_value?: string; // read form ($filter); writes use the @odata.bind below
  'cr1bd_Caseid@odata.bind'?: string; // write form: '/cr1bd_cases(<guid>)'
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
  /* Box one-way mirror per-file (absent until archived to Box). */
  cr1bd_boxfileid?: string;
  cr1bd_boxfileurl?: string; // per-file shared-link ("open in Box")
}

/** An InspectionAddress catalogue row (cr1bd_inspectionaddress logical names).
    Suggestions are the subset whose cr1bd_sourcelabel starts with 'suggested'. */
export interface InspectionAddressRecord {
  cr1bd_inspectionaddressid?: string;
  cr1bd_name?: string;
  cr1bd_decisionmode?: number; // cr1bd_inspectiondecisionmode integer
  cr1bd_decisionreason?: string;
  /** Origin discriminator: 'suggested[:<status>]' marks a low-confidence row. */
  cr1bd_sourcelabel?: string;
  cr1bd_sourcenote?: string;
  cr1bd_addressline1?: string;
  cr1bd_addressline2?: string;
  cr1bd_addressline3?: string;
  cr1bd_addressline4?: string;
  cr1bd_addressline5?: string;
  cr1bd_addressline6?: string;
  cr1bd_postcode?: string;
  /** Repairer lookup (GUID), when the location IS a known repairer. */
  _cr1bd_repairerid_value?: string;
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
  _cr1bd_caseid_value?: string; // read form ($filter); writes use the @odata.bind below
  'cr1bd_Caseid@odata.bind'?: string; // write form: '/cr1bd_cases(<guid>)'
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
  _cr1bd_caseid_value?: string; // read form ($filter); writes use the @odata.bind below
  'cr1bd_Caseid@odata.bind'?: string; // write form: '/cr1bd_cases(<guid>)'
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

/* ----------  Environment-variable platform tables (the BOX_* gate read)  ----------
   Code Apps cannot read environment variables natively, so the BOX_* gates are
   read from the two SYSTEM tables that back every Power Platform env-var: the
   DEFINITION (schemaname + defaultvalue) and the VALUE (the current override).
   We model only the columns the gate read consumes; the real pac-generated
   services satisfy these structurally. Both are OPTIONAL on GeneratedServices
   (like inspectionAddresses) so the offline build stays green until the operator
   wires them with `pac code add-data-source`. */

/** An environmentvariabledefinition row (the gate's name + baked default). */
export interface EnvironmentVariableDefinitionRecord {
  environmentvariabledefinitionid?: string;
  /** The schema name, e.g. 'cr1bd_BOX_API_ENABLED'. */
  schemaname?: string;
  /** The baked default ('false' / '' for the BOX_* set) used when no value row exists. */
  defaultvalue?: string;
}

/** An environmentvariablevalue row (the current override for a definition). */
export interface EnvironmentVariableValueRecord {
  environmentvariablevalueid?: string;
  /** The override value (Memo/Text up to 2000). Coalesced over the default. */
  value?: string;
  /** Lookup back to the owning definition (GUID), for join-side filtering (read). */
  _environmentvariabledefinitionid_value?: string;
  /** Write form for the definition lookup on create: '/environmentvariabledefinitions(<guid>)'. */
  'EnvironmentVariableDefinitionId@odata.bind'?: string;
}

/** An AuditEvent / activity row (cr1bd_auditevent logical names — see
    dataverse/schema/audit-event.json). The flows write one of these for every
    auto / extraction action; the primary column is `cr1bd_name` (one-line
    summary) and the event time is `cr1bd_occurredat`. There is NO
    cr1bd_timestamp / cr1bd_description / cr1bd_vrm column (those were a
    placeholder shape the activity adapter mis-read). */
export interface AuditEventRecord {
  cr1bd_auditeventid?: string;
  _cr1bd_caseid_value?: string;
  /** Controlled action vocabulary (cr1bd_auditaction integer). */
  cr1bd_action?: number | string;
  cr1bd_actor?: string;
  /** One-line human summary (the primary column). */
  cr1bd_name?: string;
  /** JSON snapshot after the change (Memo) — fallback detail. */
  cr1bd_after?: string;
  cr1bd_before?: string;
  /** Event time (DateTime, UserLocal) — the sort key. */
  cr1bd_occurredat?: string;
  /** info|warning|error (cr1bd_auditseverity integer). */
  cr1bd_severity?: number;
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
  /**
   * The InspectionAddress corpus table. OPTIONAL because it is added at DEPLOY
   * time via `pac code add-data-source` (code-apps-preview:add-dataverse) — it is
   * not yet in `src/generated/services/`. Until the operator wires it, the
   * Dataverse source returns empty suggestions / zero counts (honest empty
   * states), so the offline build stays green without a fabricated service.
   */
  inspectionAddresses?: GeneratedTableService<InspectionAddressRecord>;
  fieldProvenance: GeneratedTableService<FieldLevelProvenanceRecord>;
  notes: GeneratedTableService<NoteRecord>;
  chasers: GeneratedTableService<ChaserRecord>;
  auditEvents: GeneratedTableService<AuditEventRecord>;
  /**
   * The environment-variable DEFINITION table — backs the BOX_* gate read.
   * OPTIONAL because it is added at deploy time via `pac code add-data-source`;
   * until the operator wires it, `getBoxGates()` returns all-false (honest off).
   */
  environmentVariableDefinitions?: GeneratedTableService<EnvironmentVariableDefinitionRecord>;
  /**
   * The environment-variable VALUE table — the current gate overrides, coalesced
   * over each definition's default. OPTIONAL for the same deploy-time reason.
   */
  environmentVariableValues?: GeneratedTableService<EnvironmentVariableValueRecord>;
}
