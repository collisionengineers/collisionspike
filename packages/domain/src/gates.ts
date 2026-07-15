/**
 * @cs/domain/gates — shared gate reader (server-only, process.env).
 *
 * Imported as '@cs/domain/gates' by:
 *   - services/data-api/src/features/settings/gates.ts (re-export)
 *   - orchestration activity files (direct import)
 *
 * Deliberately NOT re-exported from the main barrel (src/index.ts) so that the browser SPA
 * never pulls process.env code. The SPA reads gate values over HTTP via /api/gates/* instead
 * (plan 10 §1.4 / plan 21.2).
 *
 * All accessors default to false / empty on missing env var (gates are default-off).
 *
 * TODO (settings agent): validate against the full gate list in plan 10 §1.2 once all
 * environment variables are finalised.
 */

export const gates = {
  // Core feature gates (plan 10 §1.1, #1–#21 boolean set)
  pdfMapper: (): boolean => process.env.PDF_MAPPER_ENABLED === 'true',         // #1
  enrichment: (): boolean => process.env.ENRICHMENT_ENABLED === 'true',        // #2
  evaApi: (): boolean => process.env.EVA_API_ENABLED === 'true',               // #4
  azureMaps: (): boolean => process.env.AZURE_MAPS_ENABLED === 'true',         // #8
  valuation: (): boolean => process.env.VALUATION_ENABLED === 'true',          // #9
  azureVision: (): boolean => process.env.AZURE_VISION_ENABLED === 'true',     // #11
  ocrScannedPdf: (): boolean => process.env.OCR_SCANNED_PDF_ENABLED === 'true',// #12
  plateOcr: (): boolean => process.env.PLATE_OCR_ENABLED === 'true',           // #13
  auditCases: (): boolean => process.env.AUDIT_CASES_ENABLED === 'true',       // #15
  locationAssist: (): boolean => process.env.LOCATION_ASSIST_ENABLED === 'true',// #17
  // AI vision-reasoning ESCALATION for location assist (TKT-078) — default OFF, ships DARK.
  // A deeper photo-based location suggestion via the keyless AOAI gpt-5 vision model, gated on
  // TOP of locationAssist. Operator-blocked for live flip (production AI sign-off, gated.md E2).
  locationAssistAi: (): boolean => process.env.LOCATION_ASSIST_AI_ENABLED === 'true',
  chaserSend: (): boolean => process.env.CHASER_SEND_ENABLED === 'true',       // #19
  caseDisposition: (): boolean => process.env.CASE_DISPOSITION_ENABLED === 'true',// #20
  emailAi: (): boolean => process.env.EMAIL_AI_ENABLED === 'true',             // #21
  // AI assistant suggestion layer (TKT-015) — default OFF. Gates the embedded AI
  // suggestion surface + the server-side model call path; honest no-op while off
  // OR while no model endpoint/deployment is configured (see aiAssistConfigured).
  aiAssist: (): boolean => process.env.AI_ASSIST_ENABLED === 'true',
  // AI chat helper (TKT-060) — default OFF. Gates the read-only assistant drawer + its
  // POST /api/assistant/chat route. Distinct from aiAssist (the suggestion layer): this is
  // a conversational Q&A surface with READ-ONLY tools only. Needs a model endpoint +
  // deployment (see aiChatConfigured) in addition to this switch.
  aiChat: (): boolean => process.env.AI_CHAT_ENABLED === 'true',
  // Live image role/registration classifier (TKT-064) — default OFF. Gates the gpt-5-vision
  // classify call on the intake image paths (extractImages / classifyPersist). Needs a model
  // endpoint + deployment (see imageRoleClassifyEnabled); off/unconfigured => images persist
  // with role `unknown` exactly as before (the one-shot backfill handled existing evidence).
  imageRoleClassify: (): boolean => process.env.IMAGE_ROLE_CLASSIFY_ENABLED === 'true',
  // Staged image-analysis suggestion producer (TKT-016) — default OFF, ships DARK. Gates the
  // additive, observation-first pipeline (vehicle-present, same-vehicle, registration, background
  // text, location hints, ranked inspection-address suggestion) behind POST /api/cases/{id}/
  // image-analysis/generate. PURELY additive: every output is an ai_suggestion row (never writes
  // evidence.image_role_code/registration_visible/excluded, case_.vrm, or any address column — the
  // live TKT-064 classifier owns those; reconciliation is TKT-088/112). Needs a model endpoint +
  // deployment (see imageAnalysisEnabled). Off/unconfigured => the route is an honest no-op. The
  // scene-understanding stages carry image bytes off-region (GlobalStandard) — the live flip is
  // DPIA-gated; activation is tracked in docs/operations/operator-actions.md.
  imageAnalysis: (): boolean => process.env.IMAGE_ANALYSIS_ENABLED === 'true',

  // ---- PLAN-001 (AI hardening + MCP) gates — ALL default OFF, ship DARK ----
  // TKT-066/069 — the registry-driven read adapter for the assistant. When OFF the assistant
  // uses the original hand-written `execTool` (fast rollback); when ON it derives its tool set
  // from the shared @cs/domain capability registry. Read-only either way (TKT-060 invariant).
  assistantToolsetV2: (): boolean => process.env.ASSISTANT_TOOLSET_V2 === 'true',
  // TKT-072 — global search endpoint GET /api/search. Default OFF for a soak; the SPA search box
  // falls back to its prior behaviour while off, and the route honestly 404-gates.
  globalSearch: (): boolean => process.env.GLOBAL_SEARCH_ENABLED === 'true',
  // TKT-111 — the in-app assistant WRITE tier (propose→confirm→execute). Default OFF; ships DARK.
  // Live flip is operator-blocked (per-gate E2/G5 sign-off + DPIA; see
  // docs/operations/operator-actions.md). The model NEVER
  // issues a write directly — a human confirms a structured diff and the SPA calls an existing route.
  assistantWriteTier: (): boolean => process.env.ASSISTANT_WRITE_TIER_ENABLED === 'true',
  // TKT-110 — the read-only MCP server (Streamable-HTTP) for external agents. Default OFF; ships
  // DARK. Exposes ONLY registry read tools; needs its own Entra app-registration before a live flip
  // (see docs/operations/operator-actions.md). Authorization is still enforced at the Data API,
  // never the MCP layer.
  mcpServer: (): boolean => process.env.MCP_SERVER_ENABLED === 'true',

  // Box gates (Phase 7, ADR-0012) — all default off
  boxApi: (): boolean => process.env.BOX_API_ENABLED === 'true',               // #22
  boxFolderAtIntake: (): boolean => process.env.BOX_FOLDER_AT_INTAKE_ENABLED === 'true',// #23
  boxFileRequest: (): boolean => process.env.BOX_FILEREQUEST_ENABLED === 'true',// #24

  // TKT-095 detector (a) — sent-email-to-provider → case `done` (ADR-0023). Default OFF;
  // ships DARK. Flipping it ON makes the orchestration's subscription maintenance CREATE a
  // Graph `users/{mailbox}/mailFolders('SentItems')/messages` subscription per intake
  // mailbox (notifications route to /api/graph-webhook-sent, NEVER the intake pipeline);
  // flipping it back OFF makes the same maintenance pass PRUNE those SentItems
  // subscriptions — a gate flip fully self-reconciles in both directions. While OFF the
  // sent-items webhook/queue handlers drop everything with a trace, so behaviour is
  // identical to pre-TKT-095. Read by the orchestration app only.
  doneSentEmail: (): boolean => process.env.DONE_SENT_EMAIL_ENABLED === 'true',

  // Outlook filing (TKT-054 / 020726 E6) — default off. Gates the SPA "Suggested action"
  // button, the Data API enqueue route, AND the orchestration mover. Operator-blocked:
  // requires the Mail.ReadWrite Exchange-RBAC re-consent before it may be flipped
  // (see docs/operations/operator-actions.md).
  outlookMove: (): boolean => process.env.OUTLOOK_MOVE_ENABLED === 'true',

  // Retroactive case reconstruction (ADR-0022 / TKT-058) — all default off. retroCase is
  // the master switch (read by the orchestration retro activities AND the Data API's
  // /api/internal/retro/* routes — set it on BOTH apps); retroOutlookSearch is the
  // independent kill switch for the Outlook $search rung (Graph-search behaviour must be
  // revocable without losing the Box rung). retroBoxArchiveRootIds is the comma-separated
  // READ-ONLY Box archive root folder id(s) the reconstruction may search — empty means
  // the Box rung honestly skips (the box-webhook app enforces the same roots via its own
  // BOX_READONLY_ROOT_IDS scope lock).
  retroCase: (): boolean => process.env.RETRO_CASE_ENABLED === 'true',
  retroOutlookSearch: (): boolean => process.env.RETRO_OUTLOOK_SEARCH_ENABLED === 'true',
  retroBoxArchiveRootIds: (): string => process.env.RETRO_BOX_ARCHIVE_ROOT_IDS ?? '',

  // Triage-policy gates (Stage B, rules-engine-v2 Phase 2 / ADR-0019) — all default off.
  // Each gates ONE rung of `decideTriage` (domain/triage-policy.ts); the function itself
  // is pure and never reads process.env — the caller (an orchestration Durable activity)
  // reads these accessors and passes the values in as a plain TriagePolicyGates object.
  // With all four off, decideTriage always falls through to 'proceed_default' (the
  // kill-switch invariant) — gates-off output is indistinguishable from today.
  triageRefGate: (): boolean => process.env.TRIAGE_REF_GATE_ENABLED === 'true',
  triageCancellation: (): boolean => process.env.TRIAGE_CANCELLATION_ENABLED === 'true',
  triageImagesRouting: (): boolean => process.env.TRIAGE_IMAGES_ROUTING_ENABLED === 'true',
  triageCaseUpdate: (): boolean => process.env.TRIAGE_CASE_UPDATE_ENABLED === 'true',
  // TKT-093 — auto-attach promotion (ADR-0019 §4 promotion seam). Default off (ships DARK;
  // live flip is operator-blocked; see docs/operations/operator-actions.md). MODIFIES the
  // ref-gate rung: an EXACT
  // SINGLE open-case match on a strong signal (case_po/job_ref — NEVER vrm-only, per the
  // inviolable VRM rule) is attached automatically instead of merely suggested. With this
  // off, the ref-gate rung is exactly today's suggest_attach.
  triageAutoAttach: (): boolean => process.env.TRIAGE_AUTO_ATTACH_ENABLED === 'true',
  // TKT-084 — the pre-instruction lane (taxonomy v3; operator sign-off recorded
  // 2026-07-09 in the ticket's evidence). Default off in code. While OFF, classifyInbound
  // DEMOTES a classifier 'pre_instruction' verdict to 'other' (today's behaviour — honest
  // kill-switch) and no correlation runs. While ON: the lane is recorded as classified
  // (held on the inbound_email row, no case minted — categoryMintsCase is false for it
  // either way), and a later instruction's case-mint correlates held rows onto the new
  // case, suggest-first (never auto-attach — the correlation key is typically VRM-only).
  triagePreInstruction: (): boolean => process.env.TRIAGE_PRE_INSTRUCTION_ENABLED === 'true',
  // TKT-034 — the reg-keyed Box holding-folder rung for image-bearing emails that match
  // no case (ADR-0015 §5 fallback step 2). Default off (ships DARK — creating non-Case/PO
  // folders under the Box root is a NEW folder-naming semantic the operator must approve;
  // see docs/operations/operator-actions.md). While off, an unmatched images email is only FLAGGED for manual
  // handling (attention_reason 'images_no_match') — fallback step 3 — which needs no gate.
  boxRegFolder: (): boolean => process.env.BOX_REG_FOLDER_ENABLED === 'true',

  // (The replay-backfill gate was REMOVED with its driver — TKT-106. The wipe-and-
  // rebuild path is non-viable: TKT-059's dry-run proved the mailboxes retain only a
  // fraction of the DB's source emails, so the DB is the system of record. Keep the
  // finding — TKT-059 verification — not the dead switch.)

  // String config vars (plan 10 §1.1, #3, #5, #14, #18, #27, #28)
  enrichmentApiBase: (): string => process.env.ENRICHMENT_API_BASE ?? '',      // #3
  evaBaseUrl: (): string => process.env.EVA_BASE_URL ?? '',                    // #5
  valuationApiBase: (): string => process.env.VALUATION_API_BASE ?? '',        // #14
  locationAssistApiBase: (): string => process.env.LOCATION_ASSIST_API_BASE ?? '',// #18
  boxFolderRootId: (): string => process.env.BOX_FOLDER_ROOT_ID ?? '',         // #27
  boxFileRequestTemplateId: (): string => process.env.BOX_FILE_REQUEST_TEMPLATE_ID ?? '',// #28

  // AI model endpoint config (TKT-015). The server-side model call path is built but
  // dormant: these settings are ABSENT in live app-settings, so the generate route stays
  // an honest no-op until the wiring lands (model deployments now exist on the Foundry
  // account — live state in LIVE_FACTS.json `foundry`; rules-engine-v2 Phase 4 wires
  // them). Prefer managed-identity/keyless — no API key gate by design.
  aiModelEndpoint: (): string => process.env.AI_MODEL_ENDPOINT ?? '',
  aiModelDeployment: (): string => process.env.AI_MODEL_DEPLOYMENT ?? '',

  // Outlook-move queue config (TKT-054): the orchestration app's queue-service endpoint,
  // e.g. https://<orch-storage-account>.queue.core.windows.net — the Data API enqueues
  // move jobs there with its managed identity (Storage Queue Data Message Sender).
  outlookMoveQueueServiceUrl: (): string => process.env.OUTLOOK_MOVE_QUEUE_SERVICE_URL ?? '',
  // Evidence-backfill queue config (TKT-145): the `evidence-backfill` queue lives on the
  // SAME orchestration storage account as `outlook-move` (cespkorchstdev01), so it
  // deliberately FALLS BACK to OUTLOOK_MOVE_QUEUE_SERVICE_URL — no new app-setting is
  // required live. The dedicated variable exists only as an escape hatch should the two
  // queues ever need to diverge.
  evidenceBackfillQueueServiceUrl: (): string =>
    process.env.EVIDENCE_BACKFILL_QUEUE_SERVICE_URL || process.env.OUTLOOK_MOVE_QUEUE_SERVICE_URL || '',

  /**
   * Derived: location assist is only enabled when all three conditions are met.
   * Used by GET /api/gates/location-assist (plan 21 §21.2).
   */
  locationAssistEnabled: (): boolean =>
    gates.locationAssist() &&
    gates.azureMaps() &&
    gates.locationAssistApiBase() !== '',

  /**
   * Derived: the AI vision-reasoning escalation is actionable — the base location assist is on,
   * its own gate is on, AND a model endpoint + deployment are configured. Off => the deeper
   * suggestion path is an honest no-op (TKT-078). Ships DARK; operator-gated live flip (gated.md E2).
   */
  locationAssistAiEnabled: (): boolean =>
    gates.locationAssistEnabled() &&
    gates.locationAssistAi() &&
    gates.aiModelEndpoint() !== '' &&
    gates.aiModelDeployment() !== '',

  /**
   * Derived: a model endpoint AND deployment are both configured. The AI generate
   * route requires this in ADDITION to the aiAssist() switch — gate ON but model
   * UNCONFIGURED is still an honest no-op (the live state today). Used by
   * GET /api/gates/ai-assist + the generate route's disabled-reason.
   */
  aiAssistConfigured: (): boolean =>
    gates.aiModelEndpoint() !== '' && gates.aiModelDeployment() !== '',

  /**
   * Derived: the AI chat helper is actionable — the gate is ON and a model endpoint +
   * deployment are configured. Used by GET /api/gates/ai-chat + the chat route's honest
   * refusal (TKT-060).
   */
  aiChatEnabled: (): boolean =>
    gates.aiChat() && gates.aiModelEndpoint() !== '' && gates.aiModelDeployment() !== '',

  /**
   * Derived: the live image classifier is actionable — the gate is ON and a model endpoint +
   * deployment are configured. The intake image paths call classifyImage only when this is
   * true; otherwise they persist role `unknown` (pre-classifier behaviour). (TKT-064.)
   */
  imageRoleClassifyEnabled: (): boolean =>
    gates.imageRoleClassify() && gates.aiModelEndpoint() !== '' && gates.aiModelDeployment() !== '',

  /**
   * Derived: the staged image-analysis producer is actionable — the gate is ON and a model
   * endpoint + deployment are configured. The POST /api/cases/{id}/image-analysis/generate route
   * runs the pipeline only when this is true; otherwise it is an honest no-op (TKT-016). The
   * reg-OCR stage additionally needs the OCR Function (OCR_FN_URL) and the address stage needs
   * locationAssistEnabled — each degrades gracefully on its own when its dependency is absent.
   */
  imageAnalysisEnabled: (): boolean =>
    gates.imageAnalysis() && gates.aiModelEndpoint() !== '' && gates.aiModelDeployment() !== '',

  /**
   * Derived: the Outlook-move path is actionable — the gate is ON and the move queue
   * endpoint is configured. Used by GET /api/gates/outlook-move + the enqueue route's
   * honest refusal (TKT-054 / 020726 E6).
   */
  outlookMoveEnabled: (): boolean =>
    gates.outlookMove() && gates.outlookMoveQueueServiceUrl() !== '',
};
