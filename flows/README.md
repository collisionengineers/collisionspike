# collisionspike — Power Automate flow definitions (M1 intake pipeline)

Authored **offline** Power Automate / Logic Apps `definition` objects for the M1 vertical slice:
**email in a shared inbox → classify + persist → dedup + case-resolve → status → parse → enrich →
EVA + Box finalize → chase.** Built from the committed `power-automate-flow` skill
(`.claude/skills/power-automate-flow/`) and Phase-1 plan §5.1–5.10, wired with the **real**
`cr1bd_*` Dataverse logical names and the **real** `cr1bd_casestatus` integer option values from
`dataverse/choicesets/case-status.json`.

## Boundary (read this first)

Everything here is **[BUILD]** — authored offline, verified by `node flows/validate-flows.mjs`,
**zero tenant contact**. Every flow ships **`state = off`** (see `flow-state.json`). Activating any
flow, pointing a trigger at a live Collision Engineers mailbox, or running against live
SharePoint / Box / EVA is **[RESERVED-FOR-USER]**.

- `collisioncc` is **reference only** — its `graph-intake` / `case-status` / `case-linking` /
  `image-rules` semantics are **re-implemented (mirrored)** in-flow, never called at runtime.
- **Secrets are Key Vault references only.** No `client_secret` / `x-functions-key` / bearer-token
  literal appears in any definition; token exchange happens inside the custom connectors / Functions.
- **ADR-0010 dedup is inviolable:** never auto-merge on VRM+time, never link across different Work
  Providers. Every ambiguous outcome is a human-confirmable `duplicate_risk`, never a silent merge.
- Flows **READ** Dataverse env-var gates; they never **DEFINE** them.

## The flows

| File (`definitions/`) | Flow | Plan | What it does | Activation |
|---|---|---|---|---|
| `intake.definition.json` | `Flow_Intake_<Mailbox>` | §5.1 | **The ORCHESTRATOR. V3 trigger** (`OnNewEmailV3`, concurrency=1, attachments+content, **`fetchOnlyWithAttachment=true`**) on the connected `digital@` mailbox. `MinIntakeDate` guard → Message-ID exact-repeat dedup (drop) → **anchored EXACT-domain provider match** (`List_active_providers` + `Filter_exact_domain`, the buggy `contains()` substring match is GONE — task #26) → get-or-create the Case (bound to the matched provider, or unassigned) → **drives the downstream chain via Run-a-Child-Flow**: `classify-persist` → `parse` → `status-evaluate`, threading `caseId`, the **email attachments**, and the parser's instruction bytes. V3 has no `mailboxAddress`; the monitored mailbox is the **connection's account**. | **[RESERVED-FOR-USER]** |
| `classify-persist.definition.json` | `Flow_Classify_Persist` | §5.2 | **Child** (Run-a-Child-Flow). Now **receives the attachments array** (+subject/from) from intake — the old `{messageId,caseId}`-only contract made its loop iterate empty. Apply-to-each attachment: **deterministic classify** by extension → `cr1bd_kind` integer (image/instruction/email/other), bytes → **Azure Blob** (never inline), one **Evidence** row per attachment carrying the `storagePath` ref (bound to the Case). **Returns** `{ payloadHash, instructionBytesB64, instructionName, imageCount }` (Response). Per-attachment SHA dedup **dropped** (stock `CreateFile` returns no content hash — §3.2); message-level idempotency = Message-ID + payloadHash. | **[RESERVED-FOR-USER]** |
| `case-resolve.definition.json` | `Flow_CaseResolve` | §5.3 | **Standalone returnable child** (kept for ALM/reuse + the image-first re-dedup pass; **not** on intake's hot path). The **ADR-0010 ladder**: drop / attach / new+`duplicate_risk` / propose-attach / create. Open-case lookup **always provider-scoped** (`_cr1bd_workproviderid_value`), excludes terminals. **Returns** `{ caseId, resolution }` (Response) so a caller can chain. Resolution uses a **Filter-array (Query)** action, **not** an arrow-lambda. | **[RESERVED-FOR-USER]** |
| `status-evaluate.definition.json` | `Flow_StatusEvaluate` | §5.4 | **Child.** **Guard order** mirroring `statusForReviewCase`: terminal → `missing_required_fields` → `missing_images` → `needs_review` → `ready_for_eva`. **Readiness is now computed INLINE** (no `ValidateCase` connector — none was ever deployed): `fieldsValid` = the 7 required EVA fields non-empty; `imagesValid` = the canonical image rule (≥2 accepted images incl ≥1 overview+reg + ≥1 damage_closeup) read straight from Dataverse Evidence. Idempotent (no write when unchanged). | **[RESERVED-FOR-USER]** |
| `parse.definition.json` | `Flow_Parse` | §5.5 | **Child.** Reads **`PDF_MAPPER_ENABLED`** (value-or-default coalesce), branches: on → call parser connector **`ParseDocument`** with the instruction bytes intake threads through from classify-persist, pre-fill the 12 EVA fields for **staff review** (never auto-final); off → audit skip, leave for manual entry. | **[RESERVED-FOR-USER]** |
| `enrich.definition.json` | `Flow_Enrich` | §5.6 | Reads **`ENRICHMENT_ENABLED`**, calls DVSA connector **`EnrichDvsaMot`** by VRM. **`document_has_mileage`** passed so the **mileage estimate fires only when the document has none** (ADR-0006). Writes into **empty** fields only; advisory, never blocks intake. | **[RESERVED-FOR-USER]** |
| `provider-match.definition.json` | `Flow_ProviderMatch` | §5.8 | **Standalone returnable child** (anchored exact-domain match is mirrored **inline in intake**, which is authoritative on the hot path; this flow is kept for ALM/reuse). **Email-domain → WorkProvider** (no alias matching). Now **RETURNS** `{ matchState, workProviderId, principalCode, displayName }` (Response) instead of writing to a Case (the Case may not exist yet — §3.4). Exactly-one → `ONE`; ambiguous → `AMBIGUOUS` (**never auto-pick**); none → `NONE`. | **[RESERVED-FOR-USER]** |
| `jobsheet-import.definition.json` | `Flow_JobSheetImport` | §5.7 | **Read-only** Excel `List rows present in a table` over the job sheet → **staged draft** WorkProvider rows (`cr1bd_active=false`). Upsert by `principalCode`; **never overwrite an active record** without change-reason. No macros, no write-back. Drive/file ids are **parameters**. | **[RESERVED-FOR-USER]** |
| `finalize-eva-box.definition.json` | `Flow_FinalizeEvaBox` | §5.10 | **EVA + Box in unison** inside one Scope. **UPPERCASE** Box folder / **lowercase** EVA. Photo order = 2 previews then all (Evidence `sequenceIndex` asc). **`EVA_API_ENABLED`** gates the transport (Sentry REST vs drag-drop JSON to Box). Idempotent by `cr1bd_finalizedpayloadhash` (stamped **last**). `BoxArchiveRootId` is a **parameter**. | **[RESERVED-FOR-USER]** |
| `chaser-draft.definition.json` | `Flow_ChaserDraft` | ADR-0003 | **Draft-only**: composes a body, writes a **`drafted`** Chaser row. The boundary is enforced by the **absence** of any send action — the linter greps for send operations and finds zero. | **[RESERVED-FOR-USER]** |

Live (2026-06-18): `CS Intake`, `CS Provider Match`, `CS Case Resolve` are ON; the rest OFF. `flow-state.json` keeps `state=off` as the fresh-import default. **The edits in this commit make intake the orchestrator that actually invokes `classify-persist` → `parse` → `status-evaluate` (previously orphaned with manual triggers and nothing calling them).**

## Orchestration (Strategy A — intake calls the chain)

Intake is the single **parent**. After the Message-ID dedup guard and the anchored provider match + get-or-create Case, it calls the children with the **built-in `Run a Child Flow` action** (`"type": "Workflow"`), the Microsoft-blessed, **export-safe** pattern (HTTP-URL chaining breaks across solution import/export — Learn). Each child keeps its **`Manually trigger a flow` (Request)** trigger and returns values via a **`Response`** action:

```
intake (OnNewEmailV3)
  └─ Run_classify_persist  →  classify-persist   (in: messageId, caseId, subject, from, ATTACHMENTS)
  │                                               (out: payloadHash, instructionBytesB64, instructionName, imageCount)
  └─ Run_parse             →  parse              (in: caseId, instructionBytesB64, instructionName, providerHint=principalCode)
  └─ Run_status_evaluate   →  status-evaluate    (in: caseId)  →  advances to ready_for_eva
```

- **The attachment fix is the crux:** `Run_classify_persist.body.attachments = @triggerOutputs()?['body/attachments']` (available because the trigger sets `includeAttachments=true`). Without it the child created **0 Evidence rows**.
- **`host.workflowReferenceName` is a PLACEHOLDER** (`CS_Classify_Persist` / `CS_Parse` / `CS_Status_Evaluate`). After import, the **designer/Flow API rebinds** it to the imported child's GUID — see the redeploy steps below. The placeholder is *not* a live id.
- **`case-resolve` + `provider-match` stay standalone** returnable children (Response-equipped) for ALM/reuse and the image-first VRM-confirm re-dedup pass, but are **not** in intake's hot path: intake owns its own anchored match + single Create (avoids a second domain lookup and a second Case write). The §3.4/§3.5 "provider-match returns the id, case-resolve owns the create" split is the documented alternative wiring.

> ⚠️ **Out-of-scope regression hazard:** `flows/definitions/intake-shared-mailbox.definition.json` (the parameterised multi-inbox variant, `docs/plans/phase-2-live-activation/multi-inbox-access.md` Option A) was **NOT** touched by this change and still carries the **old `SharedMailboxOnNewEmailV2` trigger + the buggy `contains(cr1bd_knownemaildomains,…)` substring match + no orchestration**. Reconcile it to this file's shape before that variant is ever imported/activated, or it regresses both the trigger and the provider match.

## Intake go-live hardening (intake.definition.json)

Two measures harden the intake trigger before go-live:

- **`MinIntakeDate` guard (default `2026-06-17`).** A `String` flow parameter holding the inclusive
  earliest email `receivedDateTime` to ingest; **set per-environment at activation.** The FIRST
  action after the trigger (`Drop_if_before_min_date`) compares the email's `receivedDateTime`
  against `MinIntakeDate` via `@less(ticks(receivedDateTime), ticks(MinIntakeDate))`; if the email is
  **before** the cutoff it audits a `dropped_before_min_date` event (mirrors `Audit_duplicate_dropped`;
  reuses the existing `duplicate_dropped` action value `100000005` — **no Dataverse schema change**)
  then **Terminates with `runStatus = Succeeded`**. The existing dedup/ingest chain runs only when the
  guard's empty `else`-branch is taken (i.e. the email is on/after the cutoff). This stops historical
  backlog mail being ingested when a mailbox is first connected.
- **`fetchOnlyWithAttachment = true` is a TEMPORARY measure.** It suppresses no-attachment noise at the
  trigger source. It is **to be removed when a full email-management / routing system is implemented
  later** (which will handle attachment-less mail explicitly rather than dropping it at the trigger).

## Companion manifests

- **`connection-references.json`** — the closed set of connection **references** the flows bind to
  (`shared_office365`, `shared_commondataserviceforapps`, `shared_azureblob`, `shared_box`,
  `shared_excelonlinebusiness`, custom `shared_ceparser` / `shared_dvsaenrich` /
  `shared_evavalidation` / `shared_evasentry`). No live connection instances. The user binds each
  reference to a real connection at activation. **`shared_evavalidation` is now `usedBy: []`** —
  status-evaluate computes readiness inline, so that connector needs **no** binding for the slice
  (the linter reports it as a declared-but-unused WARN, not a FAIL). Bind only `shared_azureblob`
  (`cr1bd_evidenceblob`) and `shared_ceparser` (`cr1bd_ceparser`) for Phase 1.
- **`flow-state.json`** — declares every flow ships `state = off`, tagged `[BUILD]` authoring vs
  `[RESERVED-FOR-USER]` activation, with the reserved reason per flow.

## Offline lint command

```bash
node flows/validate-flows.mjs
```

Pure static analysis, zero tenant contact. Prints PASS/FAIL per check and exits non-zero on any
fail. It asserts, over `definitions/*.definition.json`:

1. valid JSON with non-empty `triggers` + `actions`;
2. references **only** connection refs declared in `connection-references.json`;
3. **no secret literals** (`client_secret` / `api-key` / `x-functions-key` / bearer tokens);
4. **no hardcoded live mailbox address or Box id** (only parameters / env-vars);
5. every flow is listed in `flow-state.json` as `state = off`;
6. every `cr1bd_cases` `ListRecords` in the dedup flow carries the `_cr1bd_workproviderid_value`
   **cross-provider guard** (other case reads are Message-ID-scoped, a documented exception); and
   the draft-only chaser contains **no send operation**;
7. balanced `@`-expression parentheses.

## Redeploy + bind steps (operator — do in this order)

> The intake trigger is a **connection-webhook** (`OnNewEmailV3`); patching Dataverse `clientdata`
> does **NOT** re-arm it (AGENTS.md rule 2; memory `flow-webhook-trigger-provisioning`). Import the
> edited definitions, then **open each flow in make.powerautomate.com and Save** to (re)provision
> triggers and to **rebind the Run-a-Child-Flow placeholders**.

1. **Bind connections (login/secret — `[RESERVED-FOR-USER]`):**
   - `cr1bd_evidenceblob` (`shared_azureblob`) → an Azure Blob connection on the evidence storage
     account; confirm an **`evidence`** container exists and the identity can `CreateFile`.
   - `cr1bd_ceparser` (runtime connector `shared_new-5fcollision-20engineers-20parser-5ff48c20e0e0674f63`)
     → a connection holding the parser **function key** as `x-functions-key` (host already points at
     `cespike-parser-dev-…`). NB the definitions bind the **portable logical** id `shared_ceparser`
     (matched against `connection-references.json`); ALM rebinds it to this physical runtime id at
     import — do not hardcode the runtime id into the definition JSON.
   - **Do NOT** bind `cr1bd_evavalidation` (status-evaluate is inline now). `cr1bd_dataverse` +
     `cr1bd_sharedmailbox_office365` are already bound.
   - **DLP:** Dataverse + Azure Blob + the parser connector must share one DLP data group.
2. **Env-var gate:** confirm `cr1bd_PDF_MAPPER_ENABLED = true` (Solution → Environment variables →
   Current value). Leave enrich/EVA OFF.
3. **Seed the test sender's domain** (so a positive provider match is possible):
   `pwsh dataverse/.build/15-seed-emaildomains.ps1 -Apply` with a CSV mapping a real provider's
   `principal_code` to the domain you'll send from. (`knownemaildomains` is empty for ~376/392.)
4. **Import + PUBLISH the edited definitions** into `CollisionSpikeFlows`, then in the designer:
   - Open **CS Intake** → on each **Run a Child Flow** card (`Run_classify_persist`, `Run_parse`,
     `Run_status_evaluate`) **re-select the imported child** (this replaces the
     `host.workflowReferenceName` placeholder with the real GUID) → **Save** (re-arms the webhook;
     re-confirm **Concurrency = 1** if prompted).
   - Open **classify-persist**, **parse**, **status-evaluate** → for each, **Run only users → Edit →
     Use this connection** for every non-built-in connector (children require **embedded**
     connections — Learn) → **Save**.
5. **Turn ON in order:** `classify-persist`, then `parse`, then `status-evaluate` (intake,
   provider-match, case-resolve already ON). Leave enrich/finalize/chaser/jobsheet OFF.
6. **Verify** end-to-end per `docs/plans/phase-1-intake-and-case-tracking/phase-1-operational.md` §7 (1 instruction PDF + 2 photos →
   Case + 2 Evidence rows + 12 parsed fields; tag the 2 images `overview`+`registrationVisible` /
   `damage_closeup` → re-invoke status-evaluate → `ready_for_eva`). Trigger health:
   `.../flows/<id>/triggers?api-version=2016-11-01` returns **200**, runs **Succeeded**.

## Notes for the activation handoff

- **Reconcile placeholder op names** before deploy: the V3 trigger op (`OnNewEmailV3`),
  the Blob/Box/Excel operation ids, and the env-var `$expand` navigation property
  (`environmentvariabledefinition_environmentvariablevalue`) are the connector-swagger-dependent
  spots — confirm against the tenant's swagger.
- **payloadHash** is folded in classify-persist from a deterministic **`name|size`** token per
  attachment (sorted, joined) — NOT a content hash. The stock `shared_azureblob` `CreateFile`
  returns blob metadata (**`Path`**) but **no `sha256`/content hash**, and no storage-hash Function
  exists, so **per-attachment SHA dedup is dropped for the slice** (§3.2 / §9 Q2); message-level
  idempotency is the Message-ID probe + payloadHash. `cr1bd_sha256` is left unset until a hashing
  surface is added.
- **status-evaluate readiness is inline**, not a connector. It mirrors
  `mockup-app/src/contracts/image-rules.ts` + `case-status.ts`: `fieldsValid` = the **7 required**
  EVA fields non-empty; `imagesValid` = ≥2 accepted images incl ≥1 overview (registration visible) +
  ≥1 damage_closeup. **Known simplification:** per-field `needs_review`/`conflict` state is
  FieldLevelProvenance (not on the Case row), so the `needs_review` branch is dormant until a
  provenance read is wired — the proper follow-up is the **Path 1** `ValidateCase` Function
  (`functions/evavalidation/`), after which repoint status-evaluate and restore
  `shared_evavalidation` `usedBy`.
- **A clean email parks at `missing_images`, not `ready_for_eva`,** until the 2 images are tagged
  `overview`+`registrationVisible` and `damage_closeup` (manual/OCR until M2) — expected per the data
  model; the §7 test includes the tag step.
- **DLP:** every connector above must sit in the same data group in the target environment, or import
  / run fails. Premium: Dataverse, Azure Blob, the custom connectors. Standard: Office 365
  Outlook, Excel Online (Business).
