# Phase 1 Implementation Plan — Email Intake + Case Tracking (collisionspike, M1 vertical slice)

> Status: planning only. This document authors and sequences work; it does **not** deploy, activate, or
> live-test anything. `collisioncc` is reference-only — its contracts (`case-status`, `image-rules`,
> `graph-intake`, EVA payload) are **re-implemented**, never called at runtime. PyMuPDF is licensed and
> approved — no AGPL remediation anywhere in this plan.
>
> **STATUS UPDATE 2026-06-18 — Email intake activated and verified.** `CS Intake` (rebuilt
> `OnNewEmailV3` trigger), Provider Match, and Case Resolve are ON on the `digital@` mailbox; a test
> email created a real `cr1bd_cases` row. This plan now specifies the **remaining Phase-1 work**:
> downstream-flow activation (Classify+Persist ON; Parse, Status Evaluate, Enrich pending the parser
> CSP/connector fix), corpus incorporation, address-matching, and EVA/Box finalisation.

---

## 1. Overview

Phase 1 is the **M1 vertical slice**: a real email arriving in a Collision Engineers shared inbox becomes a
tracked `Case` in Dataverse, gets parsed + enriched into the 12 EVA fields with field-level provenance,
passes a human readiness review in the Code App, and is exported to EVA as drag-drop JSON (with the
Box folder minted at parse-confirm per Phase 7/ADR-0012 and **augmented** at finalisation, not first
created at submit). It does this by re-implementing the `collisioncc` `graph-intake` → `case-status` →
`image-rules` → `eva-export` pipeline on the Microsoft stack (Power Automate + Dataverse + Azure Functions
+ a React/Vite Code App). Phase 1b (provider corpus + inspection-address) rides alongside as the seed data
and policy gate that make provider-domain matching and address decisions meaningful. **Everything in Phase 1
is buildable and provable offline; every step that touches a live inbox, the live SharePoint job sheet, or
live Box/EVA is reserved for the user.**

Phase 1 consumes Phase 0 outputs **as-is** and adds no new prerequisite — it completes the orchestration
(flows + Functions + Code App data binding) on top of the Phase 0 foundation.

### Phase 0 prerequisites checklist (consumed as-is; not re-planned here)

- [ ] **Code App scaffold** — React/Vite tree, `PowerProvider`, `power.config.json.template`,
      `src/generated/dataverse/*` typed model stubs. *(code-app-architect)*
- [ ] **`CollisionSpike` Dataverse solution** — the M1-four tables deployed (**Case, Evidence, WorkProvider,
      AuditEvent**) and the other six **defined and staged** (Repairer, InspectionAddress, ImageSource,
      ImprovementSignal, Chaser, Note). *(dataverse-data-architect)*
- [ ] **Case-status choice set** frozen and reconciled 1:1 against `src/contracts/case-status.ts`.
- [ ] **Env-var manifest** — names + M1 defaults frozen: `PDF_MAPPER_ENABLED=true`,
      `ENRICHMENT_ENABLED=true`, `ENRICHMENT_API_BASE`, `EVA_API_ENABLED=false`, `EVA_BASE_URL`,
      `EVA_CLIENT_ID/SECRET` (Key Vault refs), `AZURE_MAPS_ENABLED=false`, `VALUATION_ENABLED=false`,
      `COPILOT_ENABLED=false` (+ an OCR gate `AZURE_VISION_ENABLED=false` if Read OCR is wrapped).
- [ ] **Ported contracts** — `src/contracts/{eva-export,image-rules,case-status}.ts` +
      `contracts/eva-payload.schema.json` (the keystone), validated vs `Final Format Example 02.json`.
- [ ] **Parser HTTP entry point** in `cedocumentmapper_v2.0` + contract-lock test; **Azure Function +
      Key Vault Bicep** authored (parser Fn, DVSA enrichment Fn). *(document-parser-engineer,
      azure-integration-engineer)*
- [x] **Flow definitions authored and deployed** (intake / classify / finalization / chaser). *(2026-06-18 update: `CS Intake`, Provider Match, and Case Resolve are **deployed and ON** — email intake is live. Classify+Persist is deployed but currently **OFF**. Parse, Status Evaluate, Enrich, Finalize, Chaser, Job Sheet are deployed but **OFF** pending downstream activation.)*

---

## 2. The Build / Deploy / Reserved boundary

**Hard rule (non-negotiable):** Claude MUST NEVER deploy, activate, or run anything that touches the **live
Collision Engineers Outlook shared inboxes, the live SharePoint job sheet, or live Box** — including any flow
that categorizes/ingests/processes real email. Those activations and **all** live tests against them are
**reserved for the user**, performed after an app is assembled. Claude MAY: **(a)** BUILD code, flows, schema,
and Azure Functions fully offline; **(b)** DEPLOY-WITH-LOGIN — deploy only **non-inbox** resources, and only
under the user's interactive login. Every workstream below is tagged exactly one of **[BUILD]** /
**[DEPLOY-WITH-LOGIN]** / **[RESERVED-FOR-USER]**.

| Workstream | Tag |
|---|---|
| Author per-mailbox intake flow definitions (5.1) | **[BUILD]** — complete |
| Point/activate intake flows on **live** shared mailboxes + live-inbox tests | **[RESERVED-FOR-USER]** — ✅ DONE 2026-06-18: `CS Intake` / Provider Match / Case Resolve ON on `digital@`; test email created real `cr1bd_cases` row |
| Attachment classification + `.eml`/blob persistence logic (5.2) | **[BUILD]** |
| Case create/append + VRM correlation + dedup logic (5.3) | **[BUILD]** |
| Status state machine — TS contract + flow guard mirror (5.4) | **[BUILD]** |
| Parser Azure Function code + Bicep + connector OpenAPI (5.5) | **[BUILD]** |
| Deploy parser Function + import parser connector (non-inbox) | **[DEPLOY-WITH-LOGIN]** |
| DVSA enrichment Function code + Bicep + Key Vault refs + OpenAPI (5.6) | **[BUILD]** |
| Deploy DVSA Function + Key Vault + import connector (non-inbox) | **[DEPLOY-WITH-LOGIN]** |
| Inject gateway/EVA secret **values** into Key Vault | **[RESERVED-FOR-USER]** |
| SharePoint job-sheet import + staging logic against **fixture** spreadsheet (5.7) | **[BUILD]** |
| Run job-sheet import against the **live SharePoint job sheet** | **[RESERVED-FOR-USER]** |
| Provider corpus + email-domain matching logic (5.8) | **[BUILD]** |
| Inspection-address policy gate + manual-entry wiring (5.9) | **[BUILD]** |
| Code App: scaffold, port prototype `src/`, build/lint (5.10) | **[BUILD]** |
| Generate Dataverse models/services (`pac code add-data-source`) | **[DEPLOY-WITH-LOGIN]** |
| Deploy/push Code App (`pac code push`, non-inbox) | **[DEPLOY-WITH-LOGIN]** |
| Import `CollisionSpike` solution + create env-vars (non-inbox Dataverse) | **[DEPLOY-WITH-LOGIN]** |
| Activate corpus draft records (Dataverse writes, non-inbox) | **[DEPLOY-WITH-LOGIN]** |
| Activate EVA-submit + Box-sync finalization flow; EVA prod cutover | **[RESERVED-FOR-USER]** |
| All live validation (real inboxes / SharePoint / Box / EVA) | **[RESERVED-FOR-USER]** |

Net consequence: Phase 1 builds offline inside the workflow; guided deploy of **non-inbox** resources is a
separate post-workflow sequence run after the user logs in; everything inbox/SharePoint/Box/EVA-live is a
handoff checklist the user executes.

---

## 3. Services used

| Service | Purpose in Phase 1 | Config | Gating env var | Owning agent | Boundary |
|---|---|---|---|---|---|
| **Office 365 Outlook connector** | Trigger "When a new email arrives in a shared mailbox (V2)" (Include Attachments=Yes, Include Attachment Content=Yes); later draft chaser replies | One connection per shared mailbox (3); connection ref packaged in solution | — (trigger) | power-automate-flow-builder (flow), code-app-architect (connector selection) | **[BUILD]** flow; **[RESERVED-FOR-USER]** activate on live mailbox |
| **Power Automate** | Hosts all cloud flows: intake, classify+persist, case-resolve/dedup, status, parser call, enrichment call, finalization (EVA+Box), chasers | Flows in `CollisionSpike` solution; Dataverse + HTTP + Outlook + Box + SharePoint connectors | per-flow gate reads | power-automate-flow-builder | **[BUILD]** defns; **[RESERVED-FOR-USER]** activate inbox/SharePoint/Box flows |
| **Dataverse** | Working store (Case, Evidence, WorkProvider, AuditEvent + staged tables); env-var store; status choice set | Solution-packaged; file column / Azure Blob for `.eml` + attachment bytes | — | dataverse-data-architect | **[DEPLOY-WITH-LOGIN]** import solution + env-vars |
| **SharePoint / Excel Online (Business) connector** | Read-only import of job sheet (Principals/Garages/Jobs) → staged Dataverse drafts; no macros | "List rows present in a table" (Excel) or "Get items" (SharePoint) | — | power-automate-flow-builder | **[BUILD]** logic; **[RESERVED-FOR-USER]** run vs live job sheet |
| **Azure Functions — parser host** | Wrap `cedocumentmapper_v2.0` HTTP entry: instruction bytes → 12 EVA fields w/ confidence+source | Linux container (PyMuPDF wheels + Tesseract); route `POST /parse` | `PDF_MAPPER_ENABLED` | azure-integration-engineer (host), document-parser-engineer (code) | **[BUILD]** code+Bicep; **[DEPLOY-WITH-LOGIN]** deploy |
| **Azure Functions — DVSA enrichment wrapper** | REST over `collisionplugin` `dvsa-mot` behind `ce-mcp-gateway`; `get_vehicle_summary` + `current_mileage_estimate` | Service identity → gateway OAuth2; route `POST /dvsa-mot/enrich`; secret from Key Vault | `ENRICHMENT_ENABLED` + `ENRICHMENT_API_BASE` | azure-integration-engineer | **[BUILD]** code+Bicep; **[DEPLOY-WITH-LOGIN]** deploy |
| **Azure Key Vault** | Secrets: gateway `CLIENT_ID/SECRET`, EVA `CLIENT_ID/SECRET`; never echoed | Dataverse secret env-vars hold **Key Vault references** only; Infisical is source-of-record | — | azure-integration-engineer | **[DEPLOY-WITH-LOGIN]** create vault; **[RESERVED-FOR-USER]** inject secret values |
| **Entra app registration** | Service identity for the two Functions + (later) EVA connector OAuth | App-reg spec authored offline; consent interactive | — | azure-integration-engineer | **[BUILD]** spec; **[RESERVED-FOR-USER]** consent/register |
| **Custom Power Platform connectors** | Surface `/parse` and `/dvsa-mot/enrich` as connectors for flows/Code App | OpenAPI 2.0 specs authored offline; gated at flow branch | `PDF_MAPPER_ENABLED`, `ENRICHMENT_ENABLED` | azure-integration-engineer (OpenAPI), power-automate-flow-builder (consume) | **[BUILD]** OpenAPI; **[DEPLOY-WITH-LOGIN]** import |
| **postcode.io** | UK postcode validation/normalisation for manual inspection-address entry | Free, UK-only, no auth; HTTP action or Code App | `AZURE_MAPS_ENABLED=false` selects postcode.io | power-automate-flow-builder / code-app-architect | **[BUILD]** + **[DEPLOY-WITH-LOGIN]** (public endpoint) |
| **Box connector** (folder at parse-confirm + finalize augment — Phase 7/ADR-0012) | UPPERCASE Case/PO folder minted at parse-confirm (`box-folder-create`); `finalize-eva-box` **augments** it, uploading photos in EVA order — not first created at EVA submit | eva-sentry-integration lane; consumes Case data this slice writes | — | eva-sentry-integration / power-automate-flow-builder | **[BUILD]** flow; **[RESERVED-FOR-USER]** activate |
| **EVA Sentry REST (gated)** | Sentry v1.2 path built against EVA **test** env; inert in M1 (drag-drop JSON is the M1 path + permanent fallback) | `EVA_BASE_URL` same for test/prod; creds route env (Key Vault) | `EVA_API_ENABLED` (false in M1) | eva-sentry-integration | **[BUILD]** vs test; **[RESERVED-FOR-USER]** enable/cutover |

---

## 4. Data model deltas for Phase 1 / 1b

Phase 0 defines the schema; Phase 1 **writes through** it. No new tables beyond the staged 10. Deltas =
columns/relationships actively read/written in this slice.

**Case** *(M1 live, write-heavy)*
- Identity/workflow R/W: `vrm`, `caseRef` (source/claim reference — the dedup tiebreaker, ADR-0010),
  `casePo` (generated at parse-confirm by the `intake` flow's `Scope_generate_casepo`, not at EVA
  submit — so the Box folder can be minted then per Phase 7/ADR-0012), `status`, `intakeChannel`,
  `sourceMailbox`, `workProviderId`
  (→ WorkProvider), `imageSourceId?`, `inspectionAddressId?`, `dateDue`, `inspectionDate`.
- **New dedup keys written at intake:** `sourceMessageId` (Graph/Internet Message-ID), `payloadHash`
  (SHA256 over normalized subject + from + sorted attachment SHA256s).
- **Dedup staging:** `duplicateKeys` / `caseLinkState` (`none|pending|linked`) to drive `duplicate_risk`
  and attach-vs-new review.
- **12 EVA fields** populated by parser/enrichment/staff (pre-fill, staff-reviewed — never auto-final).
- **Overview-only columns** imported but MUST NOT drive workflow/readiness/matching: insuredName,
  claimantName, thirdPartyName, claimNumber, policyReference, incidentDate, claimType, insurerName,
  repairerName.

**Evidence** *(M1 live)*
- Per attachment: `kind` (image|instruction|email|valuation|eva_payload|other), `filename`, `contentType`,
  `sha256`, `storagePath` (blob/file-column ref), `sourceMessageId`, `sequenceIndex` (photo order).
- `imageRole` (overview|damage_closeup|additional|unknown) — default **unknown**, manual in M1.
- `registrationVisible` — **OCR-assisted from M1** (does image OCR text contain the case VRM?).
- `acceptedForEva` (default true) + `excluded` + `exclusionReason` — staff can exclude (e.g. reflection;
  auto-detection is M2).

**WorkProvider** *(M1 live for matching; seeded in 1b)*
- Read for matching: `knownEmailDomains[]`, `principalCode` (one code: lowercase=EVA, UPPERCASE=Box/Case-PO),
  `defaultMailbox`, `inspectionLocationPolicy`, `providerAutomationMode` (only `Review auto` honored in M1),
  `active`.
- 1b import writes: `displayName`, `instructionNotes`, `imagesSourceNotes`, `dragInToEva`, policy seed.
- Per-provider toggles (aiAllowed, evaSubmitAllowed, enrichmentAllowed, outboundAllowed) — **modeled,
  deferred** (M1 uses global env-var kill switches only).

**FieldLevelProvenance** *(write-through on every EVA-relevant Case field)*
> **M1 modeling decision (must settle in Phase 0 schema):** the prototype **embeds** provenance per field
> (`FieldProvenance` inside each `EvaField`, no separate rows). This plan assumes a **separate
> `FieldLevelProvenance` table** with rows joined to the Case (named so in data-model.md; §5.10 step 5 and
> the parser/enrichment writers below assume joinable rows). Confirm with dataverse-data-architect:
> **separate table** (chosen here — supports per-source history, conflict rows, and audit) vs the
> prototype's embedded shape. The field adapter (§5.10 step 5) maps embedded prototype provenance ⇄ the
> joined rows either way; this is a real table-vs-embedded choice, not just naming.
- `fieldName`, `value`, `sourceType` ∈ {staff, pdf_extraction, email_text, corpus, ai, dvla_dvsa,
  document_ai, cloud_vision→azure_vision, web_lookup, whatsapp, manual_upload}, `sourceLabel`,
  `sourceReference`, `confidence?`, `reviewState` ∈ {not_required, needs_review, reviewed, conflict},
  `reviewedBy?`, `reviewedAt?`.
- Phase 1 writers: parser → `pdf_extraction`; email-body extraction → `email_text`; DVSA → `dvla_dvsa`;
  corpus/domain match → `corpus`; staff edit → `staff`. **Conflict rule:** when an enrichment value differs
  from an existing non-empty value, set `reviewState=conflict` and never overwrite silently (mileage:
  document authoritative).

**AuditEvent** *(M1 live, append-only)*
- `actor` (flow name or staff), `action` (`graph_message_ingested`, `attachment_classified`,
  `case_created`, `case_attached`, `duplicate_dropped`, `duplicate_flagged`, `provider_matched`,
  `provider_unmatched`, `parser_called`, `parser_failed`, `enrichment_called`, `enrichment_failed`,
  `status_changed`, `jobsheet_imported`, `graph_message_ingest_failed`), `severity`, `before`/`after`
  (JSON), `timestamp`.

**Repairer / InspectionAddress / ImageSource** *(staged; 1b import writes; Case reads)* — many-to-many
Repairer↔WorkProvider (ADR-0001) backs the inspection-address policy gate (manual entry in M1).
InspectionAddress carries `repairerId?` OR ad-hoc 6-line + postcode, `sourceLabel`, `decisionMode`
∈ {confirmed_physical, manual, image_based, unknown}.

**Chaser / Note** *(staged; minimal in M1)* — Notes always available; Chaser scaffolds authored, structured
chaser automation deferred. WhatsApp chasers are **draft-only** (ADR-0003).

**ImprovementSignal** — modeled, **deferred** (no writers in M1).

---

## 5. Implementation workstreams

Each subsection: trigger | inputs | outputs | Dataverse effects | gating | idempotency/errors | owning agent |
skills | boundary | offline build-verification.

### 5.1 Email intake flows — `Flow_Intake_<Mailbox>`

- **Trigger:** Office 365 Outlook **"When a new email arrives in a shared mailbox (V2)"**, Include
  Attachments=Yes, Include Attachment Content=Yes. One flow instance per shared inbox (3). Mirrors
  `graph-intake.ts` `ingestGraphMessage`.
- **Inputs:** message metadata (Internet Message-ID, subject, from, receivedDateTime, bodyPreview,
  categories), attachments array (name, contentType, contentBytes, isInline).
- **Outputs:** a persisted `SourceMessage` context (mailbox, messageId, payloadHash) handed to 5.2/5.3;
  AuditEvent.
- **Dataverse effects:** W AuditEvent (`graph_message_ingested`); raw `.eml` reference (5.2 persists bytes).
  No Case yet (5.3 decides create vs attach). Establishes the candidate at `new_email`.
- **Gating:** none (intake is the entry point); downstream branches read gates.
- **Idempotency/errors:** compute `payloadHash` + capture Message-ID; if any Case/SourceMessage already has
  this exact Message-ID OR payloadHash → **drop** (ADR-0010 true duplicate), audit `duplicate_dropped`. On
  `@removed`/fetch failure → audit `graph_message_ingest_failed` (ERROR), set `error` if a Case exists.
  Trigger **concurrency control = 1** + a Dataverse "get-or-create by Message-ID" guard prevents
  double-create on retries.
- **Owning agent:** power-automate-flow-builder (defers connector OpenAPI → azure; write contract → dataverse).
- **Skills:** *(to create)* `power-automate-flow` (shared-mailbox trigger + attachment-loop patterns);
  `code-apps-preview:add-office365` (connector selection); `microsoft-docs:microsoft-docs` (trigger limits).
- **Boundary:** **[BUILD]** authoring; **[RESERVED-FOR-USER]** pointing at / activating on a live mailbox +
  all live-inbox tests.
- **Offline build-verification:** validate exported `flows/intake.definition.json` is well-formed and
  references only declared connection refs + the Dataverse interface contract; lint trigger/action schema
  against the connector swagger; assert dedup-key expressions (Message-ID, payloadHash) compile (no
  unresolved dynamic-content tokens). No tenant call.

### 5.2 Attachment classification & persistence — `Flow_Intake` (Apply-to-each branch)

- **Trigger:** inline in 5.1 (Apply to each attachment).
- **Inputs:** attachment name, contentType, contentBytes; full message MIME (`.eml`).
- **Classification (deterministic, mirrors graph-intake):** `.jpg/.jpeg/.png` → `kind=image`;
  `.pdf/.docx/.doc` → `kind=instruction`; the message itself (`.eml`) → `kind=email`; else `kind=other`.
  Each gets SHA256 + size.
- **Outputs / Dataverse effects:** W one Evidence row per attachment (`kind`, `filename`, `contentType`,
  `sha256`, `storagePath`, `sourceMessageId`; image defaults `imageRole=unknown`,
  `registrationVisible=false`, `acceptedForEva=true`); W the `.eml` as Evidence `kind=email`. **Bytes go to a
  file column / Azure Blob, never inline in Dataverse rows** (graph-intake invariant: "all file data uploaded
  to storage immediately"). No status change yet (5.3 sets `ingested`).
- **Gating:** none.
- **Idempotency/errors:** dedup Evidence by `sha256` within the message (no duplicate IDs). On a single
  attachment failure, continue others, audit per-attachment, do not fail the whole message.
- **Owning agent:** power-automate-flow-builder; storage column shape → dataverse-data-architect.
- **Skills:** `power-automate-flow` (attachment-loop + blob-write idiom); `microsoft-docs:microsoft-docs`
  (file-column vs Blob limits).
- **Boundary:** **[BUILD]**; **[RESERVED-FOR-USER]** only when run against live mail.
- **Offline build-verification:** unit-test the classification mapping as a pure expression table
  (extension/MIME → kind) in a fixture harness; assert every branch produces a valid Evidence payload against
  the Dataverse interface contract; confirm no inline-bytes write path exists (storage-ref only).

### 5.3 Case create/append + VRM correlation + dedup — `Flow_CaseResolve`

- **Trigger:** called by 5.1 after classification, before parser.
- **M1 default ordering (decided):** run a **lightweight pre-parse VRM/reference sniff** over subject + body
  + attachment filenames (regex for UK VRM + the provider reference pattern) so case-resolve/dedup runs
  **before** the parser (matching §9's 5.3-before-5.5 sequence). If the sniff yields no VRM/reference (e.g.
  instruction-first, image-less arrivals), resolve provisionally and **re-run dedup once after the parser
  returns** `vrm`/`reference` (5.5), upgrading `duplicate_risk`/attach decisions then. This keeps the build
  order fixed and avoids blocking intake on the parser. (See Risk #2 / Risk #5.)
- **Inputs:** candidate VRM (pre-parse subject/filename/body sniff; parser-confirmed VRM on the post-parse
  re-run), `caseRef`/claim reference (sniffed from subject/body, parser-confirmed on re-run), Message-ID,
  payloadHash, sender domain.
- **Outputs:** resolved `caseId` + `resolution` ∈ {created, attached, new_due_to_reference, proposed_attach,
  duplicate_dropped}.
- **Dedup logic (ADR-0010, exact):**
  1. Exact Message-ID/payloadHash repeat → **drop** (handled in 5.1).
  2. Arrival's reference matches an **open** Case reference (same provider) → **attach**.
  3. Reference **differs** from open Case(s) for that VRM → **new Case**, set `duplicate_risk` to flag the VRM
     collision for staff awareness.
  4. **No reference** + VRM matches an open Case → **propose attach, staff confirm** → `duplicate_risk` +
     `caseLinkState=pending`.
  5. No match → **create** new Case.
  - **Never** auto-merge on VRM+time; **never** across different Work Providers.
- **Dataverse effects:** R open Cases by VRM (status not terminal) + their `caseRef` + `workProviderId`;
  W new/updated Case; W Evidence reassignment to resolved case; W AuditEvent (`case_created` |
  `case_attached` | `duplicate_flagged` | `duplicate_dropped`). Status: create → `new_email`→`ingested`;
  attach → keep target status (may re-evaluate to `needs_review`); collision/ambiguous → `duplicate_risk`.
- **Gating:** none.
- **Idempotency/errors:** the get-or-create guard from 5.1 makes this idempotent on Message-ID. Multiple open
  Cases share VRM with no disambiguating reference → never guess; emit `duplicate_risk` + pending review
  (human-confirmed, reversible).
- **Owning agent:** power-automate-flow-builder; correlation/match contract → dataverse-data-architect.
- **Skills:** `power-automate-flow` (dedup branch shape); `microsoft-docs:microsoft-docs` (Dataverse query/OData).
- **Boundary:** **[BUILD]**.
- **Offline build-verification:** decision-table fixture (inputs {has-ref, ref-matches-open, vrm-matches-open,
  same-provider} → expected resolution); assert all five ADR-0010 branches are covered and that "VRM+time" and
  "cross-provider merge" are never reachable; well-formedness lint.

### 5.4 Status state machine — `Flow_StatusEvaluate` + `src/contracts/case-status.ts`

- **Trigger:** invoked after any mutation (intake, parser return, enrichment return, staff edit, image
  tagging, finalization).
- **Inputs:** full Case + Evidence set + readiness signals.
- **Authoritative transitions (re-implemented from `case-status.ts`, never called from collisioncc):**
  `new_email → ingested → needs_review → ready_for_eva → eva_submitted → box_synced`, with branches
  `missing_required_fields`, `missing_images`, `duplicate_risk`, `linked_to_instruction`; terminals
  `eva_submitted`, `box_synced`, `error`. **Guard order (mirrors `statusForReviewCase`):** terminal? return
  it. Else EVA-payload validation fails → `missing_required_fields`. Else image-rules fail (≥2 accepted, ≥1
  overview w/ registrationVisible, ≥1 damage_closeup) → `missing_images`. Else open review issues →
  `needs_review`. Else → `ready_for_eva`.
- **Dataverse effects:** R Case + Evidence; W Case.status; W AuditEvent (`status_changed`, before/after).
- **Gating:** none (pure domain logic).
- **Idempotency/errors:** deterministic + idempotent — recomputing on the same inputs yields the same status;
  never transitions out of a terminal.
- **Owning agent:** eva-sentry-integration owns the TS `case-status.ts` + readiness; power-automate-flow-builder
  mirrors the guard order in-flow. **Drift mitigation (preferred):** expose readiness/status as a validation
  endpoint on the parser Function (or a small validation Function) so flow + Code App consume **one**
  implementation (the shared validation surface — §9 step 3). The Code App reuses the prototype's pure
  `mockup-app/src/components/readiness.ts` `computeReadiness()` verbatim.
- **Skills:** `eva-sentry-api` (image-rules/readiness semantics); `power-automate-flow` (guard-order branch).
- **Boundary:** **[BUILD]**.
- **Offline build-verification:** Vitest over `case-status.ts` covering every transition + terminal-lock +
  the `missing_*` branches against fixtures; **assert the Dataverse status choice set matches all 11 values
  1:1 against the two named authorities — the prototype `mockup-app/src/mock/types.ts` `CaseStatus` union
  (`new_email, ingested, needs_review, missing_required_fields, missing_images, duplicate_risk,
  linked_to_instruction, ready_for_eva, eva_submitted, box_synced, error`) and data-model.md §"Case status
  state machine"** (the new `box_synced` / `linked_to_instruction` transitions reconcile here); flow
  guard-order expressions lint clean.

### 5.5 Parser Azure Function integration — `Func_Parse` + `Flow_Parse`

- **Trigger:** flow step after 5.3 (instruction Evidence exists), OR Code App on-demand re-parse.
- **Inputs:** `POST /parse` `{ document: base64, filename, provider_hint? }`.
- **Outputs — the binding 12-field EVA set in contract order** (per the `eva-sentry-api` skill +
  prototype `mockup-app/src/mock/types.ts` `EvaFields`/`EVA_FIELD_ORDER`, both agree):
  `{ extraction: {work_provider, vehicle_model, claimant_name, claimant_telephone, claimant_email,
  date_of_loss, date_of_instruction, accident_circumstances, inspection_address, vat_status, mileage,
  mileage_unit}, vrm?, reference?, issues[],
  contract_version: "cedocumentparser_v2.0_eva_json" }`; each EVA field
  `{ value, confidence, source, sourceText?, warnings? }`. **`vrm` and `reference` are Case-identity
  fields the parser may also surface (for 5.3 correlation/dedup), NOT EVA payload fields** — they live
  on the Case row, never in the 12-field EVA JSON. **Engineer allocation is NOT an EVA submission field**
  — it is left blank and assigned inside EVA *after* submission, so it was removed entirely from the
  contract (B3 RESOLVED; the field dropped from the schema, the TS contract, the Dataverse Case table,
  the parser adapter, the connector, and the parse flow).
- **Dataverse effects:** W the 12 EVA fields onto Case as **pre-fill for staff review** (never auto-final);
  W FieldLevelProvenance per field (`sourceType=pdf_extraction`, confidence carried,
  `reviewState=needs_review`); W AuditEvent (`parser_called`). **The Function is the single parser surface
  (ADR-0004)** — do not re-derive parsing anywhere else. Triggers 5.4 → typically
  `ingested`→`needs_review`/`missing_required_fields`.
- **Gating:** `PDF_MAPPER_ENABLED` — flow branch checks the env var; off → skip parser, leave fields for
  manual entry.
- **Idempotency/errors:** idempotent on (caseId, instruction sha256) — re-parsing overwrites only
  `pdf_extraction`-sourced fields still in `needs_review`, never `staff`/`reviewed` fields. On Function
  5xx/timeout → audit `parser_failed`, set `needs_review`, surface the issue; retry = exponential, capped.
- **Owning agent:** document-parser-engineer (Function code + contract-lock), azure-integration-engineer
  (host/Bicep/connector OpenAPI), power-automate-flow-builder (flow branch).
- **Skills:** `azure:azure-prepare` / `azure:azure-deploy` / `azure:functions`; `code-apps-preview:add-connector`;
  `microsoft-docs:microsoft-code-reference` (Functions Python SDK).
- **Boundary:** **[BUILD]** code + Bicep + OpenAPI; **[DEPLOY-WITH-LOGIN]** deploy Function + import connector.
- **Offline build-verification:** `pytest` incl. the **http-entry contract test** (response validates against
  `contracts/eva-payload.schema.json`); reconcile parser JSON ↔ TS `eva-export.ts` against the **one schema**;
  `az bicep build`/lint the parser infra; OpenAPI 2.0 lint of the connector; run `/parse` over fixture PDFs
  locally in the container (no tenant). PyMuPDF is approved — verify wheels + Tesseract resolve in the Linux
  image; no AGPL discussion.

### 5.6 DVSA enrichment wrapper — `Func_DvsaEnrich` + `Flow_Enrich`

- **Trigger:** flow step after parser, when Case has a VRM; the mileage path fires **only when the document
  lacks mileage** (document authoritative, ADR-0006).
- **Inputs:** `POST /dvsa-mot/enrich` `{ vrm, reference?, extraction_source? }`.
- **Wrapper behavior:** Function authenticates to `ce-mcp-gateway` (OAuth2, **bearer/secret from Key Vault**),
  calls `dvsa-mot` MCP tools `get_vehicle_summary` + (conditionally) `current_mileage_estimate`, returns
  cleaned `{ vehicle_model?, make?, current_mileage?, mileage_unit?, mileage_confidence?, warnings? }`.
- **Dataverse effects:** W vehicle make/model onto Case **only into empty fields** (else `reviewState=conflict`);
  W mileage **only if document mileage empty**; W FieldLevelProvenance (`sourceType=dvla_dvsa`, confidence,
  `reviewState=needs_review`); W AuditEvent (`enrichment_called`). Suggestions are **staff-reviewed** before
  EVA. Re-runs 5.4 (may clear `missing_required_fields` if model/mileage were the gap).
- **Gating:** `ENRICHMENT_ENABLED` + `ENRICHMENT_API_BASE` — flow checks both; off → skip enrichment.
- **Idempotency/errors:** idempotent per (vrm); gateway token TTL ~3599s cached server-side in the Function;
  on gateway 401 → refresh once then audit `enrichment_failed` and continue (enrichment is advisory, never
  blocks intake). Respect ~500k/day quota; never echo the secret.
- **Owning agent:** azure-integration-engineer (Function + Bicep + Key Vault + OpenAPI);
  power-automate-flow-builder (branch).
- **Skills:** `azure:azure-prepare`/`azure:azure-deploy`; `azure:keyvault`; `azure:entra-app-registration`;
  `azure:azure-rbac`; `code-apps-preview:add-connector`.
- **Boundary:** **[BUILD]** code + Bicep + OpenAPI; **[DEPLOY-WITH-LOGIN]** deploy Function + Key Vault +
  import connector; **[RESERVED-FOR-USER]** inject the gateway secret value into Key Vault.
- **Offline build-verification:** unit-test the wrapper mapping (MCP JSON → cleaned REST shape) against
  recorded fixtures (no live gateway); assert the **mileage-only-when-document-empty** guard with a fixture
  matrix; `az bicep build`/lint the Function + Key Vault (secret **references** only); OpenAPI 2.0 lint;
  confirm no secret literal in any artifact.

### 5.7 SharePoint job-sheet mirror — `Flow_JobSheetImport`

- **Trigger:** manual / scheduled recurrence; **no macros**; preserve human review.
- **Inputs:** Excel Online (Business) "List rows present in a table" over Principals (58), Garages (38), Jobs
  — read-only.
- **Outputs:** **draft** WorkProvider/Repairer/Case-mirror records staged for Management review/approve/correct
  **before activation** (collapse duplicates, lift embedded storage addresses) — activation is human.
- **Dataverse effects:** W staged WorkProvider/Repairer rows (status `draft`/`inactive`); W AuditEvent
  (`jobsheet_imported`). Jobs rows mirror to Case **as reference/overview only** — overview columns MUST NOT
  drive workflow/readiness/matching. No status change on live Cases (corpus seeding, not intake).
- **Gating:** none (writes go to staged/inactive until approved).
- **Idempotency/errors:** upsert by natural key (principalCode / repairer name+postcode); re-import updates
  drafts, never overwrites an **approved/active** corpus record without a change-reason + audit. SharePoint
  read failure → audit + abort, no partial activation.
- **Owning agent:** power-automate-flow-builder (import flow); dataverse-data-architect (staging schema +
  merge rules); corpus-review **UX is the Code App admin screen** (5.10 / §2-derived).
- **Skills:** `code-apps-preview:add-sharepoint` / `code-apps-preview:add-excel`; `power-automate-flow`
  (read-only import idiom).
- **Boundary:** **[BUILD]** import + staging logic against a **synthetic/redacted fixture spreadsheet**;
  **[RESERVED-FOR-USER]** running it against the live SharePoint job sheet + any live test. **PII hygiene:**
  the real seed extract lives in `raw/…` (gitignored, PII per data-model.md) and is **never** used for
  offline build — the `[BUILD]` fixture is a synthetic/redacted copy mirroring the column shape only,
  checked into test fixtures.
- **Offline build-verification:** validate the flow definition + column mapping (job-sheet column → Dataverse
  field, per data-model.md) against the **synthetic/redacted fixture spreadsheet** checked into test fixtures
  (never the `raw/…` PII extract); assert upsert keys + the "never overwrite active without change-reason"
  guard; confirm read-only (no write-back to SharePoint) and no macro invocation in the action list.

### 5.8 Provider corpus + email-domain matching — `Flow_ProviderMatch`

- **Trigger:** inside 5.3, before/at Case create.
- **Inputs:** sender address; derive domain after `@`.
- **Matching rule:** domain → `WorkProvider.knownEmailDomains[]`. **No alias matching.** Unique-domain
  discipline keeps Case/PO generation safe. Honor `providerAutomationMode = Review auto` only (others inert in
  M1).
- **Outputs / Dataverse effects:** R active WorkProvider by domain; W Case.workProviderId + principalCode;
  W FieldLevelProvenance for provider-derived fields (`sourceType=corpus`, `sourceLabel=domain-match`,
  `reviewState` per confidence); W AuditEvent (`provider_matched` | `provider_unmatched`). No domain match →
  Case proceeds, provider field `needs_review` (staff assigns), never blocks intake.
- **Gating:** none.
- **Idempotency/errors:** deterministic on domain; ambiguous (domain → >1 active provider) → flag
  `needs_review`, never auto-pick (unsafe Case/PO).
- **Owning agent:** power-automate-flow-builder; corpus contract → dataverse-data-architect. Code App **displays**
  the match + lets staff **correct** it (writes `staff` provenance).
- **Skills:** `power-automate-flow` (lookup + branch); `microsoft-docs:microsoft-docs` (Dataverse lookup).
- **Boundary:** **[BUILD]**.
- **Offline build-verification:** decision-table fixture (domain → expected provider | unmatched | ambiguous)
  over the seeded provider list; assert no-alias + ambiguity-blocks-auto behavior; provenance write payload
  validates against the FieldLevelProvenance contract.

### 5.9 Inspection-address assistant (M1 = policy gate + manual entry)

- **Scope (M1):** policy gate + **manual** 6-line address entry only. **Ranked address candidates from
  deterministic signals are M2 (deferred); EXIF/GPS + Azure Maps are M3 (deferred).** Do not build candidate
  ranking now.
- **Policy gate (`WorkProvider.inspectionLocationPolicy`):**
  - `always_image_based` → resolves to "Image Based Assessment" for that provider.
  - `prefer_address` (**default for unknown providers**) → attempt physical address; fall back to image-based
    **only with an explicit reviewer decision + reason**.
  - `required_address` → image-based **only by Management override**, audited.
  - **No silent "Image Based Assessment"** anywhere — every image-based outcome carries an explicit reviewer
    decision recorded with a reason (`decisionMode` on InspectionAddress).
- **Wiring:** Code App Address tab provides the 6-line manual entry + decision badge + override-with-reason
  textarea (already prototyped). postcode.io normalises the postcode (M1; `AZURE_MAPS_ENABLED=false`). The
  InspectionAddress record (repairerId? OR ad-hoc 6-line) backs the Case `inspectionAddressId`.
- **Dataverse effects:** W InspectionAddress (`decisionMode`, `sourceLabel`, address/postcode);
  W Case.inspectionAddressId; W AuditEvent on Management override.
- **Gating:** `AZURE_MAPS_ENABLED=false` selects postcode.io.
- **Idempotency/errors:** deterministic; override always requires a non-empty reason (validated client + flow
  side).
- **Owning agent:** code-app-architect (UI), dataverse-data-architect (table), power-automate-flow-builder
  (policy read if done in-flow), eva-sentry-integration (the 6-line EVA address serialization).
- **Skills:** `eva-sentry-api` (6-line address format, pad-to-6 rule); `collision-engineers-design` (form
  styling).
- **Boundary:** **[BUILD]**; corpus-record activation is **[DEPLOY-WITH-LOGIN]**.
- **Offline build-verification:** unit-test the policy → decision mapping; assert **no path yields "Image
  Based Assessment" without a reason**; assert the serialized address is always exactly 6 lines (pad rule)
  and schema-valid.

### 5.10 Code App UI: intake queue / case detail / chasing

**Foundational move — the mock→generated-Dataverse swap (preserves theme, components, routes,
`computeReadiness` unchanged; only the data layer changes):**
1. Scaffold the real Code App (`pac code init`); port the prototype `mockup-app/src/` tree verbatim. **[BUILD]**
2. Generate Dataverse services (`pac code add-data-source` via `code-apps-preview:add-dataverse`) →
   `src/generated/`. **[DEPLOY-WITH-LOGIN]** (reads live schema; Dataverse only, never an inbox).
3. **Introduce a `src/data/` repository seam** exposing the **same function names the mock barrel exports
   today** (`caseById`, `casesForQueue`, `liveCounts`, `throughput`, `agingExceptions`, `reasonCounts`,
   `imagesForCase`, `suggestCasePo`, `dueInfo`, `providers`, `providerByCode`). Today → `mock/*`; after swap →
   async calls over `src/generated/`. **Screens keep importing from one barrel — `pac`-generated service calls
   must never leak into screens.** **[BUILD]**
4. **Async conversion** via `useCaseQuery`/`useQueueQuery` hooks (loading/empty/error). The mock stays
   synchronous behind the hook as a permanent offline harness. **[BUILD]**
5. **Field-name adapter** mapping Dataverse logical names (`cr123_vrm`, `statuscode`) → camelCase domain
   types; the 12 EVA fields join the Case row with its FieldLevelProvenance rows; `EVA_FIELD_ORDER` stays the
   canonical iteration order. **[BUILD]**

**Surface A — Intake queue (`Dashboard.tsx` + `CaseList.tsx`):**
- Swap `casesForQueue(name)` → OData `$filter` by `statuscode` ∈ the queue's status set (port `queues.ts`
  `QUEUES` map verbatim as the filter builder); `done` queue windowed on `submittedAt===today`.
- `liveCounts()`/`throughput()`/`agingExceptions()` → server-side `$count` + small `$top` aggregates; windowing
  math ports verbatim. `reasonCounts()` → group needs-action rows by `actionReason` (**recommend storing
  `actionReason`** — see Risk).
- **New:** loading/empty/error states; manual "Updated HH:MM" refresh (polling, not push); server pagination/
  virtualization; a `duplicate_risk` "VRM twins" row affordance (data from `openVrmTwins()`).

**Surface B — Case detail (`CaseDetail.tsx` + `EvaSubmitDialog.tsx`) — essentially complete in prototype:**
- Swap `caseById(id)` → Dataverse retrieve of Case + expanded children (Evidence, Note, Chaser,
  FieldLevelProvenance, overview facts) assembled into the prototype `Case` shape.
- Field edits → `PATCH` the Case field **and** upsert FieldLevelProvenance (`sourceType=staff`,
  `reviewState=reviewed`, reviewedBy/reviewedAt). Image edits → `PATCH` Evidence (`imageRole`,
  `acceptedForEva`, `excluded`, `exclusionReason`); `ImageOrderList` order → persist Evidence `sequenceIndex`
  (EVA 2-previews-then-all order). Notes → create Note rows. Chasers → write `drafted` Chaser rows (WhatsApp
  **draft-only**, ADR-0003); the Code App **only drafts** — sending is a flow/user action.
- **EVA submit (M1 primary path = JSON drag-drop export):** build the 12-field payload via the shared
  `src/contracts/eva-export.ts` / `eva-payload.schema.json` so app and flow emit **byte-identical** payloads;
  serialize; offer download. The Sentry-API radio stays disabled until `EVA_API_ENABLED`. The actual EVA POST
  + Box sync are a **flow** (gated; activation/live test **[RESERVED-FOR-USER]**); the Code App may write a
  "submit requested" signal row the flow consumes — it never calls EVA/Box directly.
- **New:** save/optimistic-update + conflict handling (two staff on one case); the **dedup attach-vs-new
  decision UI** (ADR-0010) listing candidate open cases with Accept-link / Treat-as-new actions, flipping to
  `linked_to_instruction` or keeping separate; provenance write-back on every edit; OCR `registrationVisible`
  becomes read-only-from-data (set by parser/OCR Function).

**Surface C — Missing-info chasing (`CaseList` "Needs action" queue + `ChaserPanel` + readiness sidebar):**
- Chaser lifecycle from `Chaser` rows; `dueInfo()`/`reasonVerb()`/`outstandingText()` (in `intake.ts`) port
  verbatim. Two user-facing queues per the binding design: "Not ready / chasing" (`missing_*` + needs_review
  with active chaser) and "Ready, not yet in EVA" (`ready_for_eva`).
- **New:** chaser drafting → outbound handoff (drafting **[BUILD]**; **send [RESERVED-FOR-USER]/flow-owned**);
  chaser templates per target-type/channel; an explicit partial-case "held, awaiting X" affordance.

**Admin / corpus surface (no prototype analog) — Phase 1b:**
- View/edit WorkProvider, Repairer, ImageSource, InspectionAddress; the **assisted import tool** (parse
  Principals/Garages → draft records → Management preview-diff → approve). Parsing is **[BUILD]**; activating
  corpus records is **[DEPLOY-WITH-LOGIN]** (Dataverse writes, non-inbox). The seed extract is PII/gitignored.
- **Update one stale prototype type before build** (not a reconciliation): the prototype `Provider`
  `inspectionLocationPolicy` (`'physical'|'image_based'|'mixed'`) is behind the binding enum
  `always_image_based|prefer_address|required_address` (fixed in `inspection-address.md` +
  `provider-corpus.md`, `prefer_address` = unknown-provider default) — adopt the binding enum and extend
  `Provider` with `providerAutomationMode`. One-sided edit; gates only the address gate's own code.

**Gating (Code App reads, never writes env vars):** disable the Sentry-API radio when `EVA_API_ENABLED=false`;
hide enrichment-suggestion UI when `ENRICHMENT_ENABLED=false`; M1 = global kill switches only (per-provider
toggles deferred). **Brand:** `--ce-red` (#db0816) is the only red on screen; `--ce-red-dark` is the
past-due/danger tone — **never the print #c80a32**.

- **Owning agent:** code-apps-preview:code-app-architect (shell + data binding), deferring EVA serialization +
  readiness parity → eva-sentry-integration, row-mutation semantics → dataverse-data-architect.
- **Skills:** `code-apps-preview:create-code-app`, `:add-dataverse`, `:deploy`, `:list-connections`;
  `collision-engineers-design`; `eva-sentry-api`.
- **Boundary:** **[BUILD]** authoring; **[DEPLOY-WITH-LOGIN]** generate models + `pac code push` (non-inbox).
- **Offline build-verification:** `tsc -b && vite build` green; `eslint .` clean; Vitest on `computeReadiness`,
  `EVA_FIELD_ORDER`, queue mapping, `suggestCasePo` (EVA-lowercase/Box-UPPERCASE), `dueInfo`; grep the Code App
  for live EVA/Box/Graph/SharePoint calls → **zero hits**; grep for `#c80a32` → **zero hits**.

---

## 6. Agent assignment matrix

| Workstream | Owning domain agent | Defers (what → to whom) |
|---|---|---|
| Code App shell (`pac code init`, React/Vite tree, routes, theme port, build/lint, `pac code push`) | **code-apps-preview:code-app-architect** | contracts→eva-sentry-integration; schema/generated models→dataverse-data-architect; Function URLs→azure-integration-engineer; flow triggers→power-automate-flow-builder |
| Wire 4 screens to data seam; loading/empty/error; pagination; provenance write-back; dedup decision UI; admin/corpus screens; chaser drafting UI (5.10, 5.9) | **code-app-architect** | EVA payload serialization + readiness parity→eva-sentry-integration; row-mutation semantics→dataverse-data-architect |
| 10 Dataverse tables, choice sets, relationships (Repairer↔WorkProvider N:N), provenance table, env-var manifest, ALM | **dataverse-data-architect** | how tables are queried→code-app-architect; what gates govern→azure; record mutations by flows→power-automate-flow-builder; field set→eva-sentry-integration |
| Intake/classify/dedup/status/finalization/chaser flows; provider-domain matching; EVA+Box atomic submit (5.1–5.4, 5.7, 5.8) | **power-automate-flow-builder** | Function calls→azure; payload→eva-sentry-integration; schema→dataverse; UI→code-app-architect. **Activation [RESERVED-FOR-USER]** |
| `eva-payload.schema.json`; `src/contracts/{eva-export,image-rules,case-status}.ts`; Vitest parity; photo-order/image-rules; JSON export + Sentry path; 6-line address serialization (5.4 contract, 5.9 address) | **eva-sentry-integration** | flow invocation→power-automate; Key Vault secrets→azure; parser output→document-parser-engineer |
| Azure Functions (parser wrapper + DVSA enrichment wrapper); Key Vault; Entra app reg; custom connectors (OpenAPI); Document Intelligence Read; Bicep (5.5, 5.6) | **azure-integration-engineer** | shell/deploy→code-app-architect; payload→eva-sentry-integration; schema→dataverse; consumes gates, doesn't define them |
| Complete `cedocumentmapper_v2.0`; HTTP entry point; contract-lock test; CI (5.5 code) | **document-parser-engineer** | Function hosting/deploy→azure. Stays in sibling repo; PyMuPDF approved (no AGPL work) |

### New-agent advisory — verdict: **NO new domain agent is warranted for M1.**

The existing five domain agents + `code-apps-preview:code-app-architect` cover every workstream; no vertical
slice is orphaned. The two cross-cutting seams have clear primary owners:
- **Code App data-binding / mock→Dataverse seam** — squarely code-app-architect's lane ("Dataverse typed
  stubs→real models"). No new agent.
- **Dedup (case-linking)** — split across three agents but each piece has a clear owner: *detection + status
  flag* → power-automate-flow-builder (ADR-0010); *decision UI* → code-app-architect; *contract* →
  eva-sentry-integration (`case-status`). Coordinate, don't create.
- **SharePoint job-sheet import** — M1 needs only the **one-time assisted import** (not continuous mirroring;
  provider-corpus.md confirms a "one-time import tool"). **Primary owner: power-automate-flow-builder** (the
  read-only import flow + the parse of Principals/Garages/Jobs rows), with **dataverse-data-architect** owning
  the staging schema + merge/upsert rules and the Code App admin preview-diff UX on code-app-architect — same
  split as §5.7. No dedicated SharePoint agent justified. **Revisit only if continuous SharePoint mirroring
  becomes M2 scope** — that would be the strongest future candidate for a `sharepoint-integration` agent,
  since none of the five currently owns SharePoint as a vertical.

---

## 7. Skills needed

| Task | Existing coverage | Gap? |
|---|---|---|
| Scaffold Code App (React/Vite) | `code-apps-preview:create-code-app` | No |
| Generate Dataverse models/services; create tables | `code-apps-preview:add-dataverse` | No |
| Outlook connector (read shared inbox — flow side) | `code-apps-preview:add-office365` | No (activation reserved) |
| SharePoint / Excel connector (job-sheet import) | `code-apps-preview:add-sharepoint` / `:add-excel` | No |
| Custom connector import (parser/DVSA/EVA) | `code-apps-preview:add-connector` | No |
| Find connection IDs before adding | `code-apps-preview:list-connections` | No |
| Deploy/push Code App (non-inbox) | `code-apps-preview:deploy` | No |
| Azure Functions (parser + enrichment wrappers) | `azure:azure-prepare` / `:azure-deploy` / `azure:functions` | No |
| Key Vault secret refs / RBAC | `azure:keyvault` / `azure:azure-rbac` | No |
| Entra app registration | `azure:entra-app-registration` | No |
| Document Intelligence (Read OCR) | `azure:azure-ai` | No |
| Bicep IaC authoring | `azure:bicepschema` + `microsoft-docs:*` | No |
| EVA Sentry contract / 12-field order / photo rules | `eva-sentry-api` | **Partial** — field-level enum semantics (Damage Type enums, multi-postcode) may need transcription from the Sentry PDF. **Enhance, don't create.** |
| CE brand tokens / theme / red #db0816 | `collision-engineers-design` | No (theme already ported) |
| Dataverse/Power Platform/Azure docs lookups | `microsoft-docs:microsoft-docs` / `:microsoft-code-reference` | No |
| **Power Automate cloud-flow authoring** | — | **YES — no covering skill.** |
| Dataverse schema-as-code authoring (table/column/relationship XML, env-var defs, ALM) | `add-dataverse` (UI helper) + `microsoft-docs` | Minor — low priority; `microsoft-docs` covers it. Optional `dataverse-schema` skill. |

### Skill to create now — `power-automate-flow`

The single real skills gap; it underpins power-automate-flow-builder (every flow in §5.1–5.8). Spec — the
skill should contain, with copy-pasteable flow-JSON fragments:
- Shared-mailbox trigger pattern ("When a new email arrives in a shared mailbox (V2)", Include Attachments +
  Content), trigger concurrency control.
- Attachment-handling Apply-to-each loop with SHA256 + Blob/file-column write idiom.
- The status-machine guard-order branch template (terminal → `missing_*` → `needs_review` → `ready_for_eva`).
- The gated-feature idiom: read Dataverse environment variable value → Condition → branch (never define gates).
- The ADR-0010 dedup branch shape (Message-ID/payloadHash drop; reference-match attach; reference-differ new;
  no-reference propose-attach; never VRM+time, never cross-provider).
- The EVA+Box atomic-submit pattern and the chaser-drafting pattern (WhatsApp draft-only).
- DLP gotchas and solution-packaging of flows + connection references.

---

## 8. Testing, verification & validation

### 8.1 Offline build verification (Claude) — [BUILD]

| Check | Command / method | Pass criterion |
|---|---|---|
| Code App type+build | `tsc -b && vite build` | Green, zero TS errors, dist emitted |
| Lint | `eslint .` | Clean |
| Readiness/contract unit tests | Vitest: `computeReadiness`, `EVA_FIELD_ORDER`, queue mapping, `suggestCasePo` (EVA-lowercase/Box-UPPERCASE), `dueInfo`; **status choice set == prototype `CaseStatus` union (`mock/types.ts`) and data-model.md state machine, 1:1** | All pass |
| EVA payload schema-validate | ajv vs `contracts/eva-payload.schema.json` | exactly 12 fields, contract order; VRM + Work Provider non-empty; dates `^\d{2}/\d{2}/\d{4}$\|^$`; address 6 lines or "Image Based Assessment"; VAT/Mileage-unit enums |
| Parser | `pytest` + contract-lock (Python output ⇄ TS schema parity) | All pass |
| Function unit tests | Parser- + DVSA-wrapper with mocked inputs/HTTP | All pass, no network |
| Flow static check | Power Platform solution/flow checker on exported definitions (static, no run) | No errors |
| IaC | `az bicep build`; OpenAPI lint; solution XML well-formedness | All valid |
| No-live-call grep | Grep Code App + Function + flow source for EVA base URL, Box, Graph/Outlook send, SharePoint write, hardcoded secrets | **Zero** direct EVA/Box/Graph calls in Code App; Function calls mockable + gated |

### 8.2 Mocked integration verification — no live services [BUILD]

- **Sample `.eml` fixtures** (instruction-only, images-only, partial, duplicate-by-reference,
  VRM-twin-no-reference, person-reflection image) through flow logic with **mocked connector responses** —
  assert produced Case status + actionReason match the status-machine transition (re-implementing
  `graph-intake` semantics).
- **Mocked dvsa-mot / mcp-gateway:** stub `get_vehicle_summary` + `current_mileage_estimate`; assert
  enrichment fills mileage **only when the document lacks it** and writes `dvla_dvsa` provenance.
- **Mock EVA endpoint** for the gated `EVA_API_ENABLED=true` path: local stub asserts the POST body equals the
  JSON-export body **byte-for-byte** (one serializer, two transports). Default M1 run keeps the gate false.
- **Dedup harness:** the ADR-0010 matrix (exact repeat → drop; matching reference → attach; differing
  reference → new + VRM-collision flag; no reference + VRM match → propose-attach-staff-confirm; never
  cross-provider).
- **Code App against mock seam:** the screens boot fully on `mock/*` with zero tenant contact — kept as a
  permanent offline harness.

### 8.3 User-run live-validation checklist — [RESERVED-FOR-USER]

Performed by the user **after** handoff, in order, against live inboxes/SharePoint/Box/EVA. Claude never runs
these.
1. User completes interactive logins (`pac auth`, `az login`, connector OAuth) and **activates the intake flow
   on ONE shared inbox first** (not all three).
2. Send a **test email** (own address → that mailbox) with one instruction PDF + 2 images (one overview with a
   legible plate, one damage closeup).
3. Confirm in the Code App: a **Case appears** within the expected interval; status `new_email → ingested`;
   provider matched by sender domain; 12 fields pre-filled with provenance badges.
4. Confirm **Outlook categories** applied (provider + ingestion-success).
5. Open the Case: confirm **image roles / registration-visible**; drive the **readiness checklist** to green;
   confirm the **Address** decision gate (override-with-reason if image-based).
6. Confirm **dedup**: re-send the same email (exact repeat → dropped); same VRM **different reference** → new
   case + collision flag; same VRM **no reference** → propose-attach for staff confirm.
7. Confirm **SharePoint mirror/dashboard** reflects the case (if the mirror is activated).
8. **EVA**: with `EVA_API_ENABLED=false`, **export the 12-field JSON** and drag-drop into EVA **test** env;
   confirm acceptance. (Sentry API path only if/when the user enables the gate with test creds.)
9. Confirm the **Box** folder with the **UPPERCASE** Case/PO — minted at **parse-confirm**
   (`box-folder-create`, Phase 7/ADR-0012) and **augmented** by `finalize-eva-box`, not first created
   at EVA submit; confirm photo order (2 previews first, then all including those two).
10. Confirm **AuditEvent** rows for ingest/review/submit; confirm a **chaser drafts** correctly for a
    deliberately-partial case.
11. Only after single-mailbox success: user activates the remaining two shared inboxes.

### 8.4 Acceptance criteria per workstream (objective, checkable)

- **Code App UI:** `tsc -b && vite build` green; all 4 screens render against the data seam; every ✗ readiness
  item deep-links to its field; EVA-submit disabled unless `computeReadiness().ready && seq.length===3`; only
  #db0816 red on screen (grep: no #c80a32).
- **Corpus/inspection-address:** WorkProvider matchable by domain; provider policy drives the address gate;
  **no path yields "Image Based Assessment" without an explicit reason** (asserted in tests); 58 Principals +
  38 Garages importable as **drafts** behind a preview-diff (none auto-activated; odd codes flagged).
- **EVA contract:** exported JSON schema-valid, 12 fields in order, Vitest parity vs `Final Format Example
  02.json`; JSON-export body == API body.
- **Flows (definition-only):** solution checker clean; status machine matches the authoritative diagram for
  all fixtures; dedup matches ADR-0010; **zero activation by Claude**.
- **Functions:** parser wrapper returns the contract shape; DVSA wrapper fills mileage only when the doc lacks
  it; secrets only via Key Vault refs (grep: no inline secrets).
- **Gates:** every non-trivial integration reads its Dataverse env var; M1 defaults `EVA_API_ENABLED=false`,
  `PDF_MAPPER_ENABLED=true`, `ENRICHMENT_ENABLED=true`, `AZURE_MAPS_ENABLED=false`, `COPILOT_ENABLED=false`,
  `VALUATION_ENABLED=false`.

### 8.5 Boundary-compliance gate (pre-handoff, all mechanical)

1. **Static grep gate (8.1):** zero live EVA/Box/Graph-send/SharePoint-write calls in the Code App; all such
   calls live in flow definitions that are authored but not activated.
2. **Flow-state assertion:** every intake/categorize/SharePoint/Box/EVA-submit flow is exported as a definition
   in the solution with state = off/not-activated; produce a checklist of flow names + their off state.
3. **No-credentials assertion:** no EVA/OAuth-gateway/Box secret **values** in the repo or any committed config
   — only Key Vault **references** and Dataverse env-var **names**. Grep for the known secret-var names returns
   only references.
4. **Connection inventory:** `code-apps-preview:list-connections` reviewed — no connection bound to a live
   shared mailbox by Claude; Outlook/SharePoint/Box connections are created **by the user** at activation.
5. **Deploy log:** every `[DEPLOY-WITH-LOGIN]` action enumerated (Code App push, Dataverse tables/env-vars,
   Functions, Key Vault, Entra, connectors) with confirmation each is **non-inbox**; every
   `[RESERVED-FOR-USER]` action (flow activation, live tests, EVA prod cutover) explicitly **not performed**.
6. **Audit trail:** the transcript shows offline build/verify only inside the workflow; live validation (8.3)
   appears solely as a handoff checklist for the user, never executed.

---

## 9. Sequencing & dependencies

Dependency-ordered execution plan (what blocks what), suitable to drive an orchestrated build later.

1. **Dataverse interface contract finalized** — Case dedup columns (`sourceMessageId`, `payloadHash`,
   `caseRef`, `caseLinkState`), Evidence storage column + `sequenceIndex`, FieldLevelProvenance, AuditEvent
   action vocabulary. *Everything writes through this.* *(dataverse-data-architect)*
2. **Freeze the keystone EVA schema** — author the single canonical `eva-payload.schema.json` from the
   **already-agreed binding 12-field set** (Work Provider, Vehicle Model, Claimant Name, Claimant Telephone,
   Claimant Email, Date of Loss, Date of Instruction, Accident Circumstances, Inspection Address, VAT Status,
   Mileage, Mileage Unit). The `eva-sentry-api` skill, `eva-sentry-api.md`,
   `integrations.md`, `data-model.md`, and the prototype `mock/types.ts` all already concur — there is **no
   contract to reconcile** (engineer allocation is NOT an EVA submission field — assigned inside EVA *after*
   submission; removed from the contract, B3 RESOLVED). Land the schema + the Dataverse choice
   set off this one source. **This is the sync point parser, Code App field binding, and EVA export bind to.**
   *(eva-sentry-integration + dataverse)*
3. **`case-status.ts` + readiness contract** wired as the shared validation surface (consumed by both Code App
   and the status sub-flow to prevent drift; ideally exposed as a validation endpoint). [5.4]
   *(eva-sentry-integration)*
4. **Parser Function + connector OpenAPI** (`/parse`) — needed before the parse flow branch. [5.5]
   *(document-parser-engineer + azure-integration-engineer)*
5. **DVSA enrichment Function + connector OpenAPI** (`/dvsa-mot/enrich`) + Key Vault references. [5.6]
   *(azure-integration-engineer)*
6. **Provider-match sub-flow (5.8)** and **case-resolve/dedup sub-flow (5.3)** — both feed intake; build
   before the trigger flow.
7. **Intake flow per mailbox (5.1)** + **classification/persistence branch (5.2)** — composes
   5.8 → 5.3 → 5.5 → 5.6 → 5.4. *(power-automate-flow-builder)*
8. **Job-sheet import + staging (5.7)** — independent of intake; can build in parallel after step 1; required
   before live provider matching is meaningful (1b seeding).
9. **Inspection-address policy gate + manual entry (5.9)** — depends on WorkProvider policy seed (step 8) +
   the 6-line EVA address serialization (step 2). **One-line prerequisite task (not a reconciliation):** the
   binding `inspectionLocationPolicy` enum (`always_image_based | prefer_address | required_address`) is
   already fixed by `inspection-address.md` + `provider-corpus.md`; the prototype `Provider` type
   (`mock/types.ts` line 199, `'physical'|'image_based'|'mixed'`) is simply stale — update it to the binding
   enum and add `providerAutomationMode`. This gates only the address gate's own code, nothing else.
10. **Code App data-seam swap + screens (5.10)** — depends on steps 1–3 (schema + contracts) for the field
    adapter; the mock harness lets UI work proceed in parallel from the start, converging when the seam lands.
11. **Env-var gate wiring (cross-cutting)** — applied across 5.5/5.6 and the finalization branch as each is
    authored; assert gate names match the frozen manifest.
12. **Phase-C offline verification gate (8.1/8.2/8.5)** — run all per-item verifications + the cross-language
    parser↔TS reconciliation against the single schema; assemble the go-live runbook.
13. **[DEPLOY-WITH-LOGIN]** deploy Functions + Key Vault + connectors + solution/env-vars + Code App
    (non-inbox). **[RESERVED-FOR-USER]** point intake flows at live mailboxes, run job-sheet import against
    live SharePoint, activate EVA/Box finalization, all live tests (8.3).

---

## 10. Risks & open questions

1. **The EVA field set (RESOLVED).** The binding 12-field set is **settled and
   consistent** across every authoritative source — the `eva-sentry-api` skill (self-declared source of
   truth), `eva-sentry-api.md`, `integrations.md`, `data-model.md`, and the prototype
   `mockup-app/src/mock/types.ts` (`EvaFields` + `EVA_FIELD_ORDER`) all list the **same** order: Work
   Provider, Vehicle Model, Claimant Name, Claimant Telephone, Claimant Email, Date of Loss, Date of
   Instruction, Accident Circumstances, Inspection Address, VAT Status, Mileage, Mileage Unit. Engineer
   allocation is **NOT an EVA submission field** — it is left blank and assigned inside EVA *after*
   submission, so it was removed entirely from the contract (B3 RESOLVED). (`vrm` and `reference` are
   Case-identity columns, **not** EVA payload fields.) `eva-payload.schema.json` is frozen off this single
   set; the TS contract, the parser output, and the prototype move in lockstep. Owner: eva-sentry-integration.
2. **VRM availability at dedup time (5.3) — resolved for M1.** Decision: the **lightweight pre-parse
   VRM/reference sniff** is the M1 default (subject + body + filenames), so case-resolve runs before the
   parser per §9. For arrivals where the sniff finds nothing (instruction-first / image-less), 5.3 resolves
   provisionally and **re-runs dedup once after the parser returns** `vrm`/`reference`. This fixes the build
   order (no ambiguity vs §9 steps 6–7) at the cost of one post-parse re-evaluation. Residual: tune the sniff
   regexes against fixture corpora.
3. **MCP gateway token refresh mid-use.** Connector docs don't specify the refresh cycle if a token expires
   mid-call (TTL ~3599s). Mitigation: Function caches + refreshes on 401; confirm gateway refresh semantics
   before relying on long-lived caching. [RESERVED-FOR-USER to confirm gateway behavior.]
4. **Dataverse blob/file-column limits for `.eml` + image bytes.** graph-intake's invariant is "store bytes
   externally." Confirm M1 uses Dataverse file columns vs an Azure Blob container fronted by the Function;
   large attachment sets may exceed file-column comfort.
5. **`caseRef`/claim-reference extraction reliability.** ADR-0010 hinges on reference as the dedup
   tiebreaker, but the reference may appear only inside the parsed instruction, not the email envelope. **M1
   handling (per Risk #2 decision):** the pre-parse sniff gets the reference from the envelope when present;
   when it is only in the instruction body, dedup **provisionally** resolves at intake and **finalizes on the
   post-parse re-run** (5.3 re-runs once after 5.5). This keeps 5.3-before-5.5 build order while still letting
   reference-based attach/collision decisions settle once the parser confirms the reference. Residual: a
   reference present only in a scanned-image instruction depends on parser OCR quality.
6. **Stale prototype `inspectionLocationPolicy` type (one-line edit, not a mismatch).** The binding enum
   `always_image_based | prefer_address | required_address` is **already fixed** by `inspection-address.md`
   + `provider-corpus.md` (`prefer_address` = unknown-provider default); the prototype type
   (`mock/types.ts` line 199, `'physical'|'image_based'|'mixed'`) is simply behind the binding doc. One-sided
   update, not a two-way reconciliation — affects only the address gate's own code (5.9), gates nothing else.
7. **EVA test vs prod creds.** Same URL, creds select env; confirm test creds available (Infisical) before the
   gated API path can even be mock-validated against the real schema. [RESERVED-FOR-USER to supply.]
8. **Box folder-name case-sensitivity.** UPPERCASE Case/PO (Box) vs lowercase (EVA). Confirm Box sync is
   case-insensitive or honors UPPERCASE before finalization wiring. [RESERVED-FOR-USER to verify with Box.]
9. **`actionReason` stored vs derived.** Drives facet chips + aging tallies; **recommend storing it** (cheap;
   confirm with dataverse-data-architect).
10. **Concurrency.** Two staff editing one case — the prototype is fire-and-forget local state; needs an
    optimistic-update + last-writer/merge decision in the data seam.
11. **Provider-domain ambiguity / shared domains.** If two providers share a domain, 5.8 correctly blocks
    auto-match but raises manual review load; corpus uniqueness must be enforced at 1b import (5.7).
12. **Code App GA/licensing.** `pac` still marks `code` as "(Preview)"; confirm Code Apps GA + Premium
    licensing in the target environment before any `[DEPLOY-WITH-LOGIN]` push.
13. **No Power Automate authoring skill.** The one real skills gap — recommend creating `power-automate-flow`
    (spec in §7) to de-risk power-automate-flow-builder's entire workstream.
