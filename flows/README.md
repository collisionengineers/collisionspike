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
| `intake.definition.json` | `Flow_Intake_<Mailbox>` | §5.1 | Per-shared-mailbox **V2 trigger** (`OnNewEmailV3SharedMailbox`, concurrency=1, attachments+content, **`fetchOnlyWithAttachment=true`**). FIRST action is the **`MinIntakeDate` guard** (drop email received before the date → Terminate Succeeded), then captures Internet Message-ID, seeds `payloadHash`, runs the **exact-repeat dedup guard** (Message-ID hit → drop, ADR-0010), audits `graph_message_ingested`. Mailbox is a flow **parameter**, never hardcoded. | **[RESERVED-FOR-USER]** |
| `classify-persist.definition.json` | `Flow_Classify_Persist` | §5.2 | Apply-to-each attachment: **deterministic classify** by extension/MIME → `cr1bd_evidencekind` integer (image/instruction/email/other), bytes → **Azure Blob** (never inline), one **Evidence** row per attachment carrying the `storagePath` ref + SHA256, dedup by SHA within the message. Folds sorted hashes into `payloadHash`. | **[RESERVED-FOR-USER]** |
| `case-resolve.definition.json` | `Flow_CaseResolve` | §5.3 | The **ADR-0010 ladder**: drop / attach / new+`duplicate_risk` / propose-attach / create. Open-case lookup is **always provider-scoped** (`_cr1bd_workproviderid_value`) and excludes terminals. Resolution uses a **Filter-array (Query)** action (`item()` in `where`), **not** an arrow-lambda. | **[RESERVED-FOR-USER]** |
| `status-evaluate.definition.json` | `Flow_StatusEvaluate` | §5.4 | **Guard order** mirroring `statusForReviewCase`: terminal → `missing_required_fields` → `missing_images` → `needs_review` → `ready_for_eva`. Calls the shared **ValidateCase** surface so flow + Code App agree. Idempotent (no write when unchanged). | **[RESERVED-FOR-USER]** |
| `parse.definition.json` | `Flow_Parse` | §5.5 | Reads **`PDF_MAPPER_ENABLED`** (value-or-default coalesce), branches: on → call parser connector **`ParseDocument`**, pre-fill the 12 EVA fields for **staff review** (never auto-final); off → audit skip, leave for manual entry. | **[RESERVED-FOR-USER]** |
| `enrich.definition.json` | `Flow_Enrich` | §5.6 | Reads **`ENRICHMENT_ENABLED`**, calls DVSA connector **`EnrichDvsaMot`** by VRM. **`document_has_mileage`** passed so the **mileage estimate fires only when the document has none** (ADR-0006). Writes into **empty** fields only; advisory, never blocks intake. | **[RESERVED-FOR-USER]** |
| `provider-match.definition.json` | `Flow_ProviderMatch` | §5.8 | **Email-domain → WorkProvider** match (no alias matching). Exactly-one → bind + `provider_matched`; ambiguous → **never auto-pick** → `needs_review`; none → proceed, provider `needs_review`. | **[RESERVED-FOR-USER]** |
| `jobsheet-import.definition.json` | `Flow_JobSheetImport` | §5.7 | **Read-only** Excel `List rows present in a table` over the job sheet → **staged draft** WorkProvider rows (`cr1bd_active=false`). Upsert by `principalCode`; **never overwrite an active record** without change-reason. No macros, no write-back. Drive/file ids are **parameters**. | **[RESERVED-FOR-USER]** |
| `finalize-eva-box.definition.json` | `Flow_FinalizeEvaBox` | §5.10 | **EVA + Box in unison** inside one Scope. **UPPERCASE** Box folder / **lowercase** EVA. Photo order = 2 previews then all (Evidence `sequenceIndex` asc). **`EVA_API_ENABLED`** gates the transport (Sentry REST vs drag-drop JSON to Box). Idempotent by `cr1bd_finalizedpayloadhash` (stamped **last**). `BoxArchiveRootId` is a **parameter**. | **[RESERVED-FOR-USER]** |
| `chaser-draft.definition.json` | `Flow_ChaserDraft` | ADR-0003 | **Draft-only**: composes a body, writes a **`drafted`** Chaser row. The boundary is enforced by the **absence** of any send action — the linter greps for send operations and finds zero. | **[RESERVED-FOR-USER]** |

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
  reference to a real connection at activation.
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

## Notes for the activation handoff

- **Reconcile placeholder op names** before deploy: the V2 trigger op (`OnNewEmailV3SharedMailbox`),
  the Blob/Box/Excel operation ids, and the env-var `$expand` navigation property
  (`environmentvariabledefinition_environmentvariablevalue`) are the connector-swagger-dependent
  spots — confirm against the tenant's swagger.
- **SHA256 + payloadHash** are computed in the storage/parser Function (Power Automate has no native
  SHA256), which returns `{ Path, sha256, size }`; the flow only orders and folds them.
- **DLP:** every connector above must sit in the same data group in the target environment, or import
  / run fails. Premium: Dataverse, Azure Blob, Box, the four custom connectors. Standard: Office 365
  Outlook, Excel Online (Business).
