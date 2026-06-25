# Phase 8 — Inbox / Triage Management · gap-closure IMPLEMENTATION PLAN

> **Status: APPROVED for build (offline artifacts only).** Backed by **ADR-0015** (Proposed) and
> [README.md](./README.md). This is the implementer-ready spec: read this file plus the source it
> names — it is self-sufficient. Every change here is **additive and default-OFF**; **no live
> activation** is folded into any implementer slice (all `-Apply` / `pac code` / trigger-flip / gate-flip
> steps are in [§ Operator-gated activation](#operator-gated-activation), and they are the operator's,
> never an implementer's).
>
> **What is already built (commit #24, do NOT rebuild):** the whole of Phase A's offline engine + the
> contracts for B/C. **What this plan closes:** the four wiring gaps that keep Phase A from running —
> (A) the intake restructure, (B-dv) the Phase-C env-var gate + parity lock, (B-app) the Code App
> Inbox/Triage screen, and (A-parser) verification/hardening of the already-built classifier.

---

## 1. As-built summary (verified against the files, 2026-06-25)

**Present and contract-correct (Phase A engine + B/C contracts):**

| Artifact | File | State |
|---|---|---|
| Deterministic classifier (pure fn) | `functions/parser/cedocumentmapper_v2/rules/email_classifier.py` | built; reuses engine.py `VRM_RE` / `detect_audit_signals` / `_match_keywords` / `_WORK_KEYWORDS` / `_QUERY_KEYWORDS`; local `CASEREF_RE` + R0 auto-reply/bounce abstain |
| Engine exports it depends on | `functions/parser/cedocumentmapper_v2/rules/engine.py` | `VRM_RE` (L91), `_AUDIT_PHRASES` (L128), `_WORK_KEYWORDS` (L145), `_QUERY_KEYWORDS` (L175), `_match_keywords` (L204), `detect_audit_signals` (L217) all present |
| `POST /classify-email` route | `functions/parser/function_app.py` L247–341 | FUNCTION auth, reads `"from"`→`from_address`, `_strip_html` server-side, success envelope + safe-`other` error envelope w/ `issues[]`, 500-not-502 guard |
| `ClassifyEmail` connector op | `functions/parser/openapi/parser-connector.json` | op + `ClassifyEmailRequest` / `ClassifyEmailResponse` definitions match the route 1:1; `x-functions-key` security |
| Triage table | `dataverse/schema/inbound-email.json` | `cr1bd_inboundemail`, lifecycle `staged`, `cr1bd_sourcemessageid` alternate key |
| Two choicesets | `dataverse/choicesets/inbound-email-classification.json` | `cr1bd_inboundcategory` + `cr1bd_inboundsubtype`; option `name` == classifier string 1:1 |
| Two RemoveLink relationships | `dataverse/relationships.json` | `cr1bd_case_inboundemail`, `cr1bd_workprovider_inboundemail`, both nullable + `RemoveLink` |
| Two audit actions | `dataverse/choicesets/audit-event.json` | `inbound_classified=100000024`, `inbound_routed=100000025` (`case_disposed=100000026` highest) |
| Gated schema build step | `dataverse/.build/26-inbound-email.ps1` | DRY-RUN default (zero tenant contact without `-Apply`) |
| Parity guard | `dataverse/verify-parity.mjs` | locks taxonomy == classifier `CATEGORY_*`/`SUBTYPE_*` 1:1, table shape, audit ints |
| Triage child flow | `flows/definitions/triage-classify.definition.json` | fully built: classify → upsert-by-Message-ID → open-Case lookup (Case/PO-first, VRM-fallback, never-auto-link-on-ambiguity) → audit → respond; **registered `state:"off"`** in `flows/flow-state.json` |
| Labelled corpus + tests | `test-cases-and-data/triage-corpus/labels.json` (12 Tier-1 + 12 Tier-2), `functions/parser/tests/test_email_classifier.py` | built; covers all six subtypes + the two PR#24 regressions (auto-reply-with-image, instruction-doc-with-do-not-reply-footer) |

**NOT done — the wiring that makes it run (this plan):**

1. **Intake flows untouched** — `intake.definition.json` still `fetchOnlyWithAttachment:true` (L31);
   `intake-shared-mailbox.definition.json` still `hasAttachments:true` (L32). No `Run_triage`, no
   `Switch(category)`, no `cr1bd_inboundemails` dedup probe, Case still created unconditionally. Both
   repo defs also still **trail live** (missing `Run_case_resolve` + `Run_enrich`, flagged in
   `intake.definition.json` L463).
2. **Phase-C env-var missing** — `cr1bd_EMAIL_AI_ENABLED` is in **no** artifact (not
   `environment-variables.json`, not any `.build/*.ps1`, not `verify-parity.mjs`), only in docs.
3. **Phase-B Code App screen does not exist** — no `/inbox` route, no `Inbox.tsx`, no
   `InboundEmailRecord`, no `inboundEmails` service, no data-seam methods.

---

## 2. Pinned contracts (byte-exact — corrected against the real files)

These supersede any approximation in the prose plans. They were re-verified column-by-column,
integer-by-integer against the as-built files above.

### 2.1 Classifier request (POST `/classify-email` + the `ClassifyEmail` connector op)

All fields optional, **snake_case**. `function_app._classify_email` reads them and maps to the pure fn:

```
{ subject:str,
  body:str,                       // HTML or plain — stripped server-side via _strip_html
  from:str,                       // function_app reads "from", maps to the pure fn's from_address
  sender_domain:str,              // lower-cased by the caller
  provider_match_state:'one'|'none'|'ambiguous',
  attachment_kinds:string[],      // e.g. ["instruction","image"]
  has_attachments:bool }
```

### 2.2 Classifier response (200)

```
{ category:'receiving_work'|'query'|'other',
  subtype:'existing_provider_instruction'|'existing_provider_audit'|'new_client_work'
         |'query_existing_work'|'query_new_enquiry'|'other',
  confidence:float,               // banded: 0.95 strong / 0.8 good / 0.6 weak / 0.3 abstain
  signals:string[],               // each rule/phrase that fired; last element is "rule:<id>"
  body_vrm:str,
  body_caseref:str,
  contract_version:"cedocumentmapper_v2.0_email_triage" }
```

On **400/500** the **same shape** is returned with `category=subtype="other"`, `confidence=0.0`,
`signals=["error:<code>"]`, plus `issues:[{field,severity,code,message}]`, same `contract_version`.

### 2.3 Choiceset option string-values + integer IDs (APPEND-ONLY, NEVER renumber; `parityKey=name`)

`cr1bd_inboundcategory`: `receiving_work=100000000`, `query=100000001`, `other=100000002`.

`cr1bd_inboundsubtype`: `existing_provider_instruction=100000000`, `existing_provider_audit=100000001`,
`new_client_work=100000002`, `query_existing_work=100000003`, `query_new_enquiry=100000004`,
`other=100000005`.

The option `name` **equals** the `email_classifier.py` `CATEGORY_*`/`SUBTYPE_*` string value 1:1.
`verify-parity.mjs` §6c asserts this; do not break it.

### 2.4 `cr1bd_inboundemail` column logical names (entity set = `cr1bd_inboundemails`, plural, in flows)

Primary `cr1bd_name` (String200, **required**). Then:

| Logical name | Type | Notes |
|---|---|---|
| `cr1bd_sourcemessageid` | String400 | **ALTERNATE KEY** `cr1bd_inboundemail_sourcemessageid_key` — dedup anchor |
| `cr1bd_subject` | String400 | |
| `cr1bd_fromaddress` | String320 / Email | passed as `from_address` |
| `cr1bd_senderdomain` | String256 | |
| `cr1bd_sourcemailbox` | String256 | |
| `cr1bd_receivedon` | DateTime UserLocal | **`cr1bd_receivedon`** — NOT `cr1bd_receivedat` (README §data-model L97 has a stale `cr1bd_receivedat`; the schema + this contract are authoritative) |
| `cr1bd_hasattachments` | Boolean | |
| `cr1bd_category` | Choice → `cr1bd_inboundcategory` | |
| `cr1bd_subtype` | Choice → `cr1bd_inboundsubtype` | |
| `cr1bd_confidence` | Double precision2 (0–1) | |
| `cr1bd_classifiermode` | String20 | `deterministic`\|`llm`\|`human` |
| `cr1bd_signals` | Memo4000 | |
| `cr1bd_triagestate` | String20 | `new`\|`routed`\|`actioned`\|`dismissed` |
| `cr1bd_bodyvrm` | String16 | |
| `cr1bd_bodycaseref` | String32 | |
| `cr1bd_bodypreview` | Memo4000 | |
| `cr1bd_caseid` | Lookup → `cr1bd_case`, reln `cr1bd_case_inboundemail`, nullable RemoveLink | |
| `cr1bd_workproviderid` | Lookup → `cr1bd_workprovider`, reln `cr1bd_workprovider_inboundemail`, nullable RemoveLink | |

Write nav-prop forms (capitalised, no leading slash, exactly as the triage child uses):
`cr1bd_Caseid@odata.bind = "cr1bd_cases(<guid>)"`,
`cr1bd_Workproviderid@odata.bind = "cr1bd_workproviders(<guid>)"`.
Read lookup forms: `_cr1bd_caseid_value` / `_cr1bd_workproviderid_value`.

### 2.5 Audit actions (`cr1bd_auditaction`, append-only, never renumber)

`inbound_classified=100000024` and `inbound_routed=100000025` **EXIST**. `case_disposed=100000026`
(Phase 9) is the highest; **next free = 100000027**. **LOCKED DECISION (gap-4):** keep ONLY these two —
do **not** add `inbound_query_logged` / `inbound_other`. The as-built triage child already audits
**every** category uniformly (`inbound_classified` after the label settles + `inbound_routed` after the
routing decision), so the README §Flow-change names `inbound_query_logged`/`inbound_other` are
**superseded by the as-built** and are not introduced. Slices A and B both honour this. Audit row
canonical shape: `cr1bd_name`, `cr1bd_action`(int), `cr1bd_actor`, `cr1bd_severity`
(info=100000000 / warning=100000001 / error=100000002), `cr1bd_after`, `cr1bd_occurredat`, optional
`cr1bd_Caseid@odata.bind`.

### 2.6 Decision tree (first match wins — as implemented in `classify_email`)

- **R0** auto-reply/bounce marker present **AND** no instruction doc → `other` (abstain, conf 0.3).
  An attached **instruction doc OVERRIDES** this and falls to R1.
- **R1** instruction-kind attachment → `receiving_work`: `existing_provider_audit` if
  `detect_audit_signals` fires (0.95); else `existing_provider_instruction` if
  `provider_match_state=='one'` (0.95); else `new_client_work` (0.8).
- **R2** image-kind **AND** (`provider=='one'` OR a work keyword) **AND NOT** (query keyword present with
  no work keyword) → `receiving_work` (`existing_provider_instruction` if provider known else
  `new_client_work`; 0.8).
- **R3** no attachments **AND** ≥2 work keywords **AND** (`body_caseref` OR `body_vrm`) →
  `receiving_work` (same subtype rule as R2; 0.6).
- **R4** query keyword **AND** (`body_caseref` OR `body_vrm`) → `query` / `query_existing_work` (0.8).
  The classifier only **proposes**; the FLOW confirms the open-Case link.
- **R5** query keyword only → `query` (`query_existing_work` if `provider=='one'` else
  `query_new_enquiry`; 0.6).
- **R6** else → `other` (abstain, 0.3).

### 2.7 Flow open-Case lookup (lives in `triage-classify`, NOT the classifier)

Case/PO **FIRST** on `cr1bd_casepo`, then **VRM fallback** on `cr1bd_vrm`, both over
`statecode eq 0` **AND** `cr1bd_status` **NOT IN** {`100000006` linked_to_instruction, `100000008`
eva_submitted, `100000009` box_synced, `100000010` error}. Exactly-1 match → link +
`triagestate='routed'` (`routeOutcome='linked_open_case'`); >1 → `routeOutcome='link_ambiguous'`,
leave `cr1bd_caseid` **null** (ADR-0010 never silently merge); 0 → `routeOutcome='queued'`. This is
already implemented in the child; the intake restructure (slice A) does **not** re-implement it.

---

## 3. Corrections folded in vs the proposed gap plan

1. **Env-var home → `26-inbound-email.ps1`, NOT `22-envvars-m2.ps1`.** Precedent: the Phase-9 gate
   `cr1bd_CASE_DISPOSITION_ENABLED` was provisioned in its **own** phase build step
   (`27-retention-schema.ps1` Step 2), not the shared M2 envvars script. The Phase-8 env-var follows the
   same pattern, co-located so one operator `-Apply` of the Phase-8 step provisions the table +
   choicesets + audit actions **and** the dark gate together. (Slice B.)
2. **Lock the gate in `verify-parity.mjs`.** The proposed plan added a manifest note only. The frozen
   `expect{}` map in `verify-parity.mjs` (§6) is where `COPILOT_ENABLED` and `CASE_DISPOSITION_ENABLED`
   are pinned to `"false"`; `cr1bd_EMAIL_AI_ENABLED` must be added there too so the dark default is
   locked by the offline guard. (Slice B.)
3. **Pin `cr1bd_receivedon`.** The pinned contract and the schema use `cr1bd_receivedon`; README
   §data-model L97 says `cr1bd_receivedat` — that is a doc drift, not the truth.
4. **gap-4 resolved → keep the two audit actions** (see §2.5). No per-category audit actions added.
5. **Pre-triage attachment-kinds map aligned to `classify-persist` Compose_kind** (see slice A step 4):
   `.jpg/.jpeg/.png → "image"`, `.pdf/.doc/.docx → "instruction"` (classify-persist's exact extension
   set; `.eml → email`, else `other`). The classifier's `_IMAGE_KINDS`/`_INSTRUCTION_KINDS` accept the
   string tokens `"image"`/`"instruction"`.

---

## 4. Implementer slices

Four slices. Each is offline-only; the `verify` command makes **zero** tenant/live contact.

### Slice A — Flow: intake restructure (triage-first, then route)

- **Owner:** `power-automate-flow-builder`
- **Files:** `flows/definitions/intake.definition.json`;
  `flows/definitions/intake-shared-mailbox.definition.json`.
  (`flows/definitions/triage-classify.definition.json` is the already-built child it invokes;
  `flows/flow-state.json` already registers it `state:"off"` — do not duplicate it.)
- **Exact change:**
  1. **Flip the trigger filter.** `intake.definition.json` `fetchOnlyWithAttachment` true→**false**
     (L31); `intake-shared-mailbox.definition.json` `hasAttachments` true→**false** (L32). Keep
     `concurrency:{runs:1}` and the `MinIntakeDate` / `Drop_if_before_min_date` guard untouched.
  2. **Reconcile UP to live FIRST (prerequisite, see operator note G1).** Both repo defs lack the
     live-only `Run_case_resolve` + `Run_enrich` children that the live CS Intake runs after parse
     (`intake.definition.json` L463 documents this divergence). Add them to the `receiving_work` chain
     **before** any re-import so the restructured intake does not regress live wiring.
  3. **Generalise the Message-ID dedup.** Keep `Find_existing_by_messageId` on `cr1bd_cases` and ADD
     `Find_existing_inbound` (ListRecords `cr1bd_inboundemails`,
     `$filter=cr1bd_sourcemessageid eq '<OData-escaped messageId>'`, `$top:1`; escape by doubling single
     quotes, exactly as the child's `Find_existing_inbound` does). A hit in **either** table → already
     ingested → `Audit_duplicate_dropped`(`100000005`) → Terminate Succeeded.
  4. **Derive `attachmentKinds` BEFORE triage** via a Select/Compose over `body/attachments[*].name`,
     mapping by extension to the classifier's string tokens: `.jpg/.jpeg/.png → "image"`,
     `.pdf/.doc/.docx → "instruction"` (the `classify-persist` Compose_kind extension set; everything
     else contributes nothing). This pre-triage hint is needed because `classify-persist`'s
     per-attachment classification now runs only inside the `receiving_work` branch. It is a coarse
     instruction-vs-image hint; the authoritative per-attachment `cr1bd_kind` is still computed in
     classify-persist for the work path.
  5. **Keep the provider match** (`List_active_providers` + `Filter_exact_domain`, the anchored exact
     domain test) and compute a `providerMatchState` variable: `'one'` when the filtered length==1,
     `'ambiguous'` when >1, else `'none'`; capture `workProviderId` on the single match.
  6. **Insert `Run_triage`** (type `Workflow`, `host.workflowReferenceName` placeholder
     `"CS_TriageClassify"` → `triage-classify.definition.json`; rebound to the imported GUID by the
     operator post-import) passing `{ sourceMessageId, subject, body, from, senderDomain, sourceMailbox,
     receivedOn, providerMatchState, workProviderId, attachmentKinds, hasAttachments }`.
  7. **Switch on `body('Run_triage')?['category']`:**
     - `receiving_work` → the **existing chain** (Create Case bound/unassigned → `Scope_capture_eml` →
       `Run_classify_persist` → `Run_parse` → `Scope_generate_casepo` → `Run_status_evaluate` →
       `Run_case_resolve` → `Run_enrich`), then `UpdateRecord cr1bd_inboundemails` setting
       `cr1bd_Caseid@odata.bind = "cr1bd_cases(<newCaseId>)"` + `cr1bd_triagestate='routed'`, keyed on
       `body('Run_triage')?['inboundEmailId']`.
     - `query` and `other` → **NO Case** (the triage child already linked any open Case and wrote both
       `inbound_classified` + `inbound_routed` audits). Leave the triage row as the child set it.
     - `default` → treat as `other`.
  8. **Move `Create_case` OUT of the unconditional path INTO the `receiving_work` branch only.** Today
     the Case is created before any classification; after this change it is created only when
     `category==receiving_work`.
  9. Do **not** add new audit actions (gap-4 locked: keep `inbound_classified` / `inbound_routed`).
- **Local verify (no live contact):** `node flows/validate-flows.mjs` — confirm both intake defs parse;
  no VRM-scoped-dedup linter violation; `Run_triage` `workflowReferenceName` present; `Switch` has
  `receiving_work`/`query`/`other` branches; `Create_case` lives only under `receiving_work`. Re-import +
  flip-on remain operator-gated (G1, G5, G6).

### Slice B — Dataverse: Phase-C gate + parity lock

- **Owner:** `dataverse-data-architect`
- **Files:** `dataverse/environment-variables.json`; `dataverse/.build/26-inbound-email.ps1`;
  `dataverse/verify-parity.mjs`. **Verify-only (must stay exactly as-is, NO renumber / NO rename):**
  `dataverse/schema/inbound-email.json`, `dataverse/choicesets/inbound-email-classification.json`,
  `dataverse/choicesets/audit-event.json`, `dataverse/relationships.json`,
  `dataverse/.build/optionset-ids.json`.
- **Exact change:**
  1. **Add `cr1bd_EMAIL_AI_ENABLED` to `environment-variables.json`:** `type:"Boolean"`,
     `defaultValue:"false"`, `currentValue:null`,
     `description:"Phase-C (ADR-0015) gate for the deferred triage-llm child — only category=other / low-confidence rows reach it; honours per-provider cr1bd_aiallowed / cr1bd_providerautomationmode; Code App READS only; sibling to COPILOT_ENABLED. Default OFF (ships dark)."`,
     `gates:["Phase-C triage-llm child (ADR-0015)"]`. Add a frozen-default line to the manifest
     `notes[]` mirroring the existing frozen-default notes.
  2. **Provision it in the Phase-8 build step** — append a **Step 6** to `26-inbound-email.ps1` that
     creates the env-var **definition** (Boolean, default `'false'`), dry-run-guarded and idempotent,
     reusing the `environmentvariabledefinitions` POST + `TypeCode`/retry pattern from
     `22-envvars-m2.ps1` / `27-retention-schema.ps1` Step 2. In DRY mode it prints
     `[DRY] WOULD create env var cr1bd_EMAIL_AI_ENABLED (Boolean) default='false'` and makes zero tenant
     contact. (NOT `22-envvars-m2.ps1` — Phase gates live in their phase build step; precedent
     `CASE_DISPOSITION_ENABLED`→`27-retention-schema.ps1`.)
  3. **Lock the dark default in `verify-parity.mjs`:** add `"cr1bd_EMAIL_AI_ENABLED": "false"` to the
     frozen `expect{}` map (§6, alongside `COPILOT_ENABLED` / `CASE_DISPOSITION_ENABLED`).
  4. **Parity-verify (no edits) the rest of the Phase-8 schema** is intact: table, the two choicesets,
     the two relationships, and `inbound_classified=100000024` / `inbound_routed=100000025`. Do not
     touch them.
  5. **Note (operator step, not code):** `.build/optionset-ids.json` gets the two new choiceset GUIDs
     backfilled AFTER the gated `-Apply` (Dataverse assigns the GUIDs only at apply-time).
- **Local verify (no live contact):** `node dataverse/verify-parity.mjs` (taxonomy==classifier 1:1,
  table↔choiceset binding, audit ints, frozen env defaults incl. the new gate);
  `pwsh dataverse/.build/26-inbound-email.ps1` (DRY-RUN default — prints intended actions incl. the new
  Step-6 env-var, zero tenant contact). `-Apply` stays operator-gated (G3).

### Slice B — Code App: Inbox / Triage screen

- **Owner:** `fluent-codeapp-designer`
- **Files:** `mockup-app/src/data/types.ts`; `mockup-app/src/data/mock-source.ts`;
  `mockup-app/src/data/dataverse-source.ts`; `mockup-app/src/data/index.ts`;
  `mockup-app/src/data/hooks.ts`; `mockup-app/src/screens/Inbox.tsx` (new);
  `mockup-app/src/routes.tsx`; `mockup-app/src/components/AppShell.tsx`.
- **Exact change** (mirror the existing `inspectionAddresses` honest-empty optional-service pattern —
  see `GeneratedServices.inspectionAddresses?` in `types.ts` L693):
  1. **`data/types.ts`:** add `InboundEmailRecord` with the `cr1bd_*` logical names **exactly** per §2.4
     (incl. `_cr1bd_caseid_value` / `_cr1bd_workproviderid_value` read forms); add
     `inboundEmails?: GeneratedTableService<InboundEmailRecord>` to `GeneratedServices`
     (**OPTIONAL** — added at deploy via `pac code add-data-source`, honest-empty until wired, exactly
     like `inspectionAddresses` / the env-var tables); add a camelCase domain `InboundEmail` type with
     `InboundCategory` / `InboundSubtype` / `TriageState` string unions; add `DataAccess` members
     `inboundEmails(facet?)` / `inboundEmailCounts()` / `setTriageState(id, state)` (the single write —
     a direct `UpdateRecord` on `cr1bd_triagestate` via the generated service; CSP-safe; honest no-op
     when the service is undefined).
  2. **`data/mock-source.ts`:** return `[]` / zero counts (honest empty), `setTriageState` resolves a
     no-op.
  3. **`data/dataverse-source.ts`:** `inboundEmails.getAll` with `$filter` on `cr1bd_category`,
     `$orderby cr1bd_receivedon desc`, map records → domain `InboundEmail`; same coalesce-on-read-failure
     pattern as `recentActivity` / `casesForQueue`. `setTriageState` → `UpdateRecord`.
  4. **`data/index.ts` + `data/hooks.ts`:** re-export the new types and a `useInbox` hook.
  5. **`screens/Inbox.tsx` (new):** the faceted triage queue in the **current Fluent-v9 idiom** (mirror
     `CaseList` / `Dashboard`: `makeStyles`+tokens, the existing component library — Panel,
     SectionHeading, StatusBadge, VrmPlate, AsyncStates/Skeletons — and a faceted `TabList` for
     **`receiving_work` | `query` | `other`** (the Other tab is mandatory)). Each row: subject, from,
     received, category+subtype `StatusBadge`, confidence, body preview (`cr1bd_bodypreview`),
     `body_vrm` via `VrmPlate`, an **open-in-mailbox** metadata pointer (text of
     `cr1bd_sourcemessageid` + `cr1bd_sourcemailbox` — there is no persisted `.eml` for query/other,
     A7), and **mark-actioned / dismissed** via `setTriageState`. **Convert-to-Case and LLM-reclassify
     are DEFERRED (Phase C)** — do not build them now.
  6. **`routes.tsx`:** wire `/inbox`. **`AppShell.tsx`:** add a nav entry (a 'Triage' section, or under
     Overview) with a count pill from `inboundEmailCounts`.
  - **CSP-safe:** connector ops only — **no raw `fetch`, no iframe**. The seam stays SDK-free (no
    `@microsoft/power-apps` import outside `generated-services.ts` / `main.tsx`).
- **Local verify (no live contact):** `cd mockup-app && npm run build` (tsc + vite green) **and**
  `npm test` (vitest — existing seam tests pass; the new screen renders the mock empty-state); confirm
  the boundary grep in `verify-all.mjs` finds no `@microsoft/power-apps` leak. **No
  `pac code add-data-source` against live** — the screen runs honest-empty until the operator wires the
  service (G4).

### Slice A — Parser: verify + harden (do NOT rebuild)

- **Owner:** `document-parser-engineer`
- **Files:** `functions/parser/tests/test_email_classifier.py`;
  `functions/parser/cedocumentmapper_v2/rules/email_classifier.py`;
  `functions/parser/cedocumentmapper_v2/rules/engine.py`; `functions/parser/function_app.py`;
  `functions/parser/openapi/parser-connector.json`;
  `test-cases-and-data/triage-corpus/labels.json` (+ the `../../cedocumentmapper_v2.0` sibling copies).
- **Exact change:**
  1. **Run the suite** focused on `test_email_classifier.py` (corpus-parametrised + the route-handler
     tests) and confirm green. If anything fails, fix **without** changing the pinned request/response
     field names (§2.1/§2.2) or the `contract_version` string `"cedocumentmapper_v2.0_email_triage"`.
  2. **Confirm vendored↔sibling sync:** `email_classifier.py` plus the engine exports it depends on
     (`VRM_RE`, `detect_audit_signals`, `_match_keywords`, `_WORK_KEYWORDS`, `_QUERY_KEYWORDS`) must
     exist in BOTH the vendored copy (`functions/parser/cedocumentmapper_v2/rules`) and the sibling
     (`../../cedocumentmapper_v2.0/src/cedocumentmapper_v2/rules`). Run
     `test_engine_vendored_in_sync` — it **skips cleanly** when the sibling is absent; if the sibling is
     present it must pass, and if the sibling lacks `email_classifier.py`, re-vendor per `PROVENANCE.md`
     (edit the sibling first, then re-cut).
  3. **Re-confirm the `/classify-email` envelope** matches §2.1/§2.2 + the connector
     `ClassifyEmailRequest`/`ClassifyEmailResponse`: request reads `"from"` (→ `from_address`), body is
     HTML-stripped via `_strip_html`, success returns `{ category, subtype, confidence, signals[],
     body_vrm, body_caseref, contract_version }`, error path returns the safe `other` label + `issues[]`
     using `EMAIL_CONTRACT_VERSION`.
  4. **Re-confirm zero work/query false positives** on the `other` corpus fixtures (incl. the two PR#24
     regressions: out-of-office-with-image → `other`, instruction-doc-with-do-not-reply-footer →
     `receiving_work`).
- **Local verify:** `cd functions/parser && python -m pytest tests/test_email_classifier.py
  tests/test_engine_vendored_in_sync.py -q` (all pass; sibling-sync skips only when the sibling is
  genuinely absent). Optional: `func start` + POST a sample body to `/classify-email` and eyeball the
  envelope.

---

## 5. Coverage vs README §Files-to-modify

| README §Files-to-modify item | Closed by |
|---|---|
| `intake.definition.json` — flip trigger / generalise dedup / triage + Switch / case-id write-back / reconcile live | **Slice A (flow)** |
| `intake-shared-mailbox.definition.json` — same | **Slice A (flow)** |
| `function_app.py` — add `/classify-email` | already built (commit #24); **Slice A (parser)** verifies |
| `engine.py` (+ sibling) — export `VRM_RE` / phrase tuples | already built; **Slice A (parser)** verifies sync |
| `environment-variables.json` — add `cr1bd_EMAIL_AI_ENABLED` | **Slice B (dataverse)** |
| README §Phasing Phase B — Code App Inbox/Triage screen | **Slice B (codeapp)** |

All README §Files-to-modify items and the Phase-B surface are covered.

---

## Operator-gated activation

**None of these are implementer steps.** They cross the live boundary and are the operator's, in order:

- **G1.** **Reconcile the repo intake defs UP to live FIRST** — add the live-only `Run_case_resolve` +
  `Run_enrich` children after parse (done in slice A's offline edit) — and confirm against the live CS
  Intake before any solution re-import, so re-importing the restructured intake does not regress live
  wiring (`intake-repo-trails-live`, `intake.definition.json` L463).
- **G2.** **`grill-with-docs`** the ADR-0015 locked decisions (new-table vs extend-Case; the
  4-quadrant + Other taxonomy) before applying any schema, per the README banner.
- **G3.** Run `dataverse/.build/26-inbound-email.ps1 -Apply` (under `az login` to Dev) to create
  `cr1bd_inboundemail` + the 2 choicesets + the alternate key + `inbound_classified`/`inbound_routed`
  + the new dark `cr1bd_EMAIL_AI_ENABLED` gate (Step 6, default `'false'`). Then backfill
  `.build/optionset-ids.json` with the two new choiceset GUIDs.
- **G4.** `pac code add-data-source` for `cr1bd_inboundemail` so the Code App's `inboundEmails` service
  is generated, then redeploy (`pac code push`). The Inbox screen runs **honest-empty** until this is
  wired.
- **G5.** After import, **rebind** each Run-a-Child-Flow card (including the new `Run_triage` →
  the imported `Flow_TriageClassify` GUID) in the designer; turn `triage-classify` **ON**.
- **G6.** Flip the LIVE CS Intake trigger `fetchOnlyWithAttachment` true→false on **ONE** inbox
  (`digital@`) only; soft-rollout watching Power Automate run volume (headroom under the
  6,000/user/day seeded limit at `concurrency=1`) for a day before enabling the other two inboxes.
- **G7.** **Optional `[RESERVED-FOR-USER]` Tier-3:** drop real PII-scrubbed sample emails into
  `test-cases-and-data/triage-corpus/` (operator AI-test authority G5) and let the suite consume them to
  validate precision on real query/enquiry traffic.

---

*Self-sufficiency note: this file plus the source it names is the complete spec. Pinned contracts in
§2 were re-verified against the as-built files; where the README prose and the as-built code disagree
(the `cr1bd_receivedat`/`cr1bd_receivedon` column name, and the `inbound_query_logged`/`inbound_other`
audit-action names), the as-built code + this file win — reconcile the README to them.*
