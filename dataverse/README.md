# CollisionSpike — Dataverse schema-as-code

Authoritative, reviewable **schema spec** for the `CollisionSpike` Dataverse solution. These are
**authoring artifacts**, not a Dataverse import package: the **dataverse-data-architect** translates
them into `EntityMetadata` / `AttributeMetadata` / `OptionSetMetadata` via `pac` + the Web API at
**[DEPLOY-WITH-LOGIN]**. Everything here is **[BUILD]** — authored offline, verified by a local node
check, **zero tenant contact**.

Publisher prefix: **`cr1bd`** (every table, column, choice set, env var, relationship).

## Layout

```
dataverse/
  schema/                       one file per table (11 = 10 business tables + FieldLevelProvenance)
    _table.schema.json          authoring JSON-Schema for a table (local lint only)
    _choiceset.schema.json      authoring JSON-Schema for a choice set (local lint only)
    case.json                   M1-live — the live work item (dedup keys, 12 EVA fields, overview-only)
    evidence.json               M1-live — attachments/artifacts (image-rules)
    work-provider.json          M1-live — provider corpus (email-domain matching)
    audit-event.json            M1-live — append-only audit trail
    repairer.json               staged  — first-class repairer (N:N WorkProvider, ADR-0001)
    inspection-address.json     staged  — per-case location + decision mode
    image-source.json           staged  — supplier role (email/whatsapp)
    field-level-provenance.json staged  — separate provenance rows (Phase-1 §4 decision)
    improvement-signal.json     staged  — staff-correction triage (deferred, no M1 writers)
    chaser.json                 staged  — missing-item chaser (draft-only)
    note.json                   staged  — free-text note
  choicesets/                   global option sets (case-status is the parity keystone)
  environment-variables.json    the M1 feature-gate manifest (+ Key Vault secret references)
  relationships.json            N:N + all 1:N lookups (authoritative cross-table map)
  verify-parity.mjs             offline integrity + parity check (node, no tenant)
  README.md                     this file
```

## M1-live vs staged

Phase 0 deploys **four** tables live and **defines + stages** the other six (plus the provenance table).

| Table | State | Why |
|---|---|---|
| **Case** | **M1-live** | the work item; write-heavy |
| **Evidence** | **M1-live** | attachments + image-rules |
| **WorkProvider** | **M1-live** | email-domain matching |
| **AuditEvent** | **M1-live** | append-only trail |
| Repairer | staged | 1b corpus import; Case/InspectionAddress read |
| InspectionAddress | staged | M1 = policy gate + manual entry |
| ImageSource | staged | 1b import; non-email-domain intake |
| FieldLevelProvenance | staged | written by M1 parser/enrichment/staff, but not one of the M1 *four* |
| ImprovementSignal | staged | modeled, **deferred** (no M1 writers) |
| Chaser | staged | scaffolds; draft-only in M1 |
| Note | staged | always available; minimal in M1 |

`lifecycle.state` in each table file is the machine-readable source of this split (`verify-parity.mjs`
asserts exactly those four are `m1-live`).

## Keystone: the Case Status choice set

`choicesets/case-status.json` holds **exactly the 11** `CaseStatus` values, reconciled **1:1** against
the prototype union (`mockup-app/src/mock/types.ts`) and `data-model.md` §"Case status state machine".
It is kept importable so a **Vitest parity test** can assert its option `name`s/`label`s equal the
contracts' `CaseStatus` union with no extras on either side. `verify-parity.mjs` performs the same
assertion offline today. **Integer `value`s are stable identifiers — never renumber once deployed.**

## The 12-field EVA contract on Case

The Case table carries the settled 12 EVA payload fields as `cr1bd_eva*` columns, each tagged
`evaField: true` + `evaOrder: 1..12` (verifier asserts 12 fields, contiguous order). Engineer
allocation is **NOT an EVA submission field** — it is left blank and assigned inside EVA *after*
submission, so it was removed entirely from the contract (B3 RESOLVED; the `cr1bd_evaengineerallocation`
column was dropped).

> `vrm`, `caseRef`, `casePo` are **Case-identity** columns, **never** part of the 12-field EVA JSON.
> Overview-only `cr1bd_ov*` columns are imported for display and are flagged
> `mustNotDriveWorkflow: true` — they must not drive workflow / readiness / matching.

Per-field **provenance + review state** live in **separate `FieldLevelProvenance` rows** joined to the
Case by `fieldName` (the Phase-1 §4 table-vs-embedded decision), **not** embedded on the Case row. The
Code App's field adapter maps these rows ⇄ the prototype's embedded `EvaField` shape.

## How this maps to a solution import — **[DEPLOY-WITH-LOGIN]**

> All of the following require an interactive login and touch **non-inbox Dataverse only**. They are
> **not** performed in [BUILD]. No flow activation, no live inbox/SharePoint/Box/EVA contact.

1. **Create the publisher + unmanaged solution** (`CollisionSpike`, prefix `cr1bd`) — `pac solution init`
   / `pac solution add-reference`, or author the solution and push via `pac`.
2. **Global choice sets first** — create each `choicesets/*.json` as a global option set (Web API
   `POST /GlobalOptionSetDefinitions`), so table Choice columns can bind to them. `case-status` is
   mandatory for the Case table.
3. **Tables** — for each `schema/*.json`: create the entity (`logicalName`, `displayName`,
   `ownership`, primary column), then add columns. Map authoring `type` → Dataverse attribute type
   (`String`/`Memo`/`Boolean`/`DateTime` w/ `dateTimeBehavior`/`Integer`/`BigInt`/`Decimal` w/
   `precision`/`Money`/`File`/`Lookup`/`Choice`). `required` → `RequiredLevel`
   (`none`→None, `recommended`→Recommended, `required`→ApplicationRequired).
4. **Relationships** — apply `relationships.json`: the two **N:N** (intersect entities
   `cr1bd_repairer_workprovider`, `cr1bd_imagesource_workprovider`) and all **1:N** lookups. The lookup
   column on each child table file and its `relationshipSchemaName` must match the entry here (the
   verifier enforces this). Honor the `cascade` behaviors (owned children Cascade; audit/corpus
   references RemoveLink to preserve history).
5. **Alternate keys** — create the keys declared in the table files (Case `sourceMessageId` idempotency
   guard; WorkProvider `principalCode`; Repairer `name+postcode`) for upsert + dedup.
6. **Environment variables** — create each entry in `environment-variables.json` as a Dataverse env-var
   **definition** with the frozen `defaultValue`. **Secret** variables (`EVA_CLIENT_ID/SECRET`) are
   created as **Key Vault references** — never with a literal value (value injection is
   **[RESERVED-FOR-USER]**).
7. **Generate typed models** — the Code App runs `pac code add-data-source`
   (`code-apps-preview:add-dataverse`) to emit `src/generated/dataverse/*` off the now-deployed schema.
   That is also **[DEPLOY-WITH-LOGIN]** (reads live schema; Dataverse only, never an inbox).

Translation choices (auth type per attribute, precise `MaxLength`, calendar/format) are the
dataverse-data-architect's to finalize; the values here are the agreed authoring intent.

## Boundary

* **[BUILD]** (done here): author + locally verify the schema spec. `node dataverse/verify-parity.mjs`
  is the offline gate (14 checks: status parity, 12-field EVA order, overview-only flags, lookup/reln
  integrity, M1 split, frozen env defaults, secrets-as-references, choiceSet resolution, no print-red).
* **[DEPLOY-WITH-LOGIN]**: import the solution / create tables, choice sets, relationships, env-vars,
  and generate typed models — **non-inbox Dataverse, under the user's login**.
* **[RESERVED-FOR-USER]**: inject secret **values** into Key Vault; activate any flow; all live
  inbox / SharePoint / Box / EVA contact.

## Brand note

Any UI built off this schema uses web red `#db0816` **on screen only** — never the print `#c80a32`
(the verifier greps the spec for the print red and fails on a hit).
