# 10 — Settings migration

Everything Dataverse/Power Platform held as configuration → its Azure home. Source of truth is
`dataverse/environment-variables.json` (28 vars), `dataverse/choicesets/*.json` (17 files → 22 distinct
global choice sets), `dataverse/relationships.json` (15 1:N + 2 N:N), `dataverse/roles/*.json` (2 roles).
**Phase P2.** Everything below is enumerated verbatim from those files — the integer codes, defaults, and
privilege depths are the **parity surface** (R4) and must survive the port byte-for-byte.

The new homes:
- **20 boolean gates + 6 string config vars** → **app-settings** on the two new TypeScript Function Apps
  (Data API + Orchestration), read at startup; one exception (`HOLD_NEW_CASES_BY_DEFAULT`) is DB-backed.
- **2 secret vars** → **Key Vault references** (see [`11`](./11-secrets-and-keyvault.md)).
- **22 choice sets** → Postgres lookup tables keyed by the existing integer (codes preserved).
- **2 security roles** → Entra app roles + Postgres RLS.

---

## 1. The 28 environment variables → Function app-settings

Schema-name prefix `cr1bd_` is dropped for the app-setting key (the runtime reads `process.env.PDF_MAPPER_ENABLED`).
Preserve the **default values** exactly — they are part of the parity check (R4). `Boolean` defaults are the
literal strings `"true"`/`"false"` in Dataverse; as app-settings they stay `"true"`/`"false"` strings and the
TS `gates` module coerces with `=== "true"`.

### 1.1 Full enumeration (all 28, in manifest order)

| # | Schema name (`cr1bd_`) | Type | Default | New home | Consumer in new world |
|---|---|---|---|---|---|
| 1 | `PDF_MAPPER_ENABLED` | Boolean | `true` | app-setting | Orchestration (gate parser-Function call) |
| 2 | `ENRICHMENT_ENABLED` | Boolean | `false` *(Dev currentValue `true` — live)* | app-setting | Orchestration (gate DVSA enrichment call) |
| 3 | `ENRICHMENT_API_BASE` | String | `""` | app-setting | Orchestration → enrichment Function base URL |
| 4 | `EVA_API_ENABLED` | Boolean | `false` | app-setting | Data API / Orchestration (gate Sentry REST) |
| 5 | `EVA_BASE_URL` | String | `""` | app-setting | EVA submit path |
| 6 | `EVA_CLIENT_ID` | **Secret** | KV ref `eva-client-id` | **KV reference** | EVA OAuth — see [`11`](./11-secrets-and-keyvault.md) |
| 7 | `EVA_CLIENT_SECRET` | **Secret** | KV ref `eva-client-secret` | **KV reference** | EVA OAuth — see [`11`](./11-secrets-and-keyvault.md) |
| 8 | `AZURE_MAPS_ENABLED` | Boolean | `false` | app-setting | address normalisation path select (M3) |
| 9 | `VALUATION_ENABLED` | Boolean | `false` | app-setting | valuation enrichment (deferred) |
| 10 | `COPILOT_ENABLED` | Boolean | `false` | app-setting | Copilot (deferred) |
| 11 | `AZURE_VISION_ENABLED` | Boolean | `false` | app-setting | OCR/image-AI gate |
| 12 | `OCR_SCANNED_PDF_ENABLED` | Boolean | `false` | app-setting | Orchestration (parse OCR fallback) |
| 13 | `PLATE_OCR_ENABLED` | Boolean | `false` | app-setting | plate-OCR consumer (no binder yet) |
| 14 | `VALUATION_API_BASE` | String | `""` | app-setting | valuation Function base URL |
| 15 | `AUDIT_CASES_ENABLED` | Boolean | `false` | app-setting | Orchestration (ADR-0014 audit branch) |
| 16 | `HOLD_NEW_CASES_BY_DEFAULT` | Boolean | `false` | **DB row (NOT app-setting)** ⚠️ | Data API read+write (see §1.3) |
| 17 | `LOCATION_ASSIST_ENABLED` | Boolean | `false` | app-setting | Data API (show action) + outer guard |
| 18 | `LOCATION_ASSIST_API_BASE` | String | `""` | app-setting | location-suggest Function base URL |
| 19 | `CHASER_SEND_ENABLED` | Boolean | `false` | app-setting | Orchestration (outbound-send kill switch) |
| 20 | `CASE_DISPOSITION_ENABLED` | Boolean | `false` | app-setting | disposition job (destructive kill switch) |
| 21 | `EMAIL_AI_ENABLED` | Boolean | `false` | app-setting | triage-llm child (ADR-0015) |
| 22 | `BOX_API_ENABLED` | Boolean | `false` | app-setting | every Box path outer guard |
| 23 | `BOX_FOLDER_AT_INTAKE_ENABLED` | Boolean | `false` | app-setting | box-folder-create at parse-confirm |
| 24 | `BOX_FILEREQUEST_ENABLED` | Boolean | `false` | app-setting | File-Request chaser + webhook intake |
| 25 | `BOX_EMBED_ENABLED` | Boolean | `false` *(reserved)* | app-setting | SPA Box embed (stays off) |
| 26 | `BOX_METADATA_ENABLED` | Boolean | `false` *(deferred)* | app-setting | Box Metadata-Query (deferred) |
| 27 | `BOX_FOLDER_ROOT_ID` | String | `""` | app-setting | CreateFolder `parent.id` |
| 28 | `BOX_FILE_REQUEST_TEMPLATE_ID` | String | `""` | app-setting | CopyFileRequest template id |

**Tally:** 20 boolean gates · 6 string config (`ENRICHMENT_API_BASE`, `EVA_BASE_URL`, `VALUATION_API_BASE`,
`LOCATION_ASSIST_API_BASE`, `BOX_FOLDER_ROOT_ID`, `BOX_FILE_REQUEST_TEMPLATE_ID`) · 2 secrets. Of the 20
booleans, **19 are read-only-at-runtime app-settings**; #16 is the one runtime-writable gate (§1.3).

### 1.2 Apply commands (one per app, copy-pasteable)

The Data API and Orchestration apps each read the subset of gates they consume; setting the full list on
both is harmless (an unused setting is inert) and keeps the parity diff trivial. The frozen Dev defaults —
**`PDF_MAPPER_ENABLED=true`, `ENRICHMENT_ENABLED=true` (Dev override is live), everything else `false`/`""`** —
go on at provisioning time. `--settings` takes `KEY=VALUE` pairs; quote the empties so the shell passes the
literal `""`. `HOLD_NEW_CASES_BY_DEFAULT` is **deliberately absent** from this command (it is a DB row, §1.3).

```bash
RG=rg-collisionspike-dev
DATA_API=<data-api-app>          # new Flex Consumption Function App
ORCH=<orchestration-app>         # new Durable/queue Function App

# Boolean gates + string config (NON-secret) — apply to BOTH new apps.
COMMON_SETTINGS=(
  PDF_MAPPER_ENABLED=true
  ENRICHMENT_ENABLED=true              # Dev currentValue; solution default is false
  ENRICHMENT_API_BASE=https://cespkenrich-fn-gi62sd.azurewebsites.net
  EVA_API_ENABLED=false
  EVA_BASE_URL=
  AZURE_MAPS_ENABLED=false
  VALUATION_ENABLED=false
  VALUATION_API_BASE=
  COPILOT_ENABLED=false
  AZURE_VISION_ENABLED=false
  OCR_SCANNED_PDF_ENABLED=false
  PLATE_OCR_ENABLED=false
  AUDIT_CASES_ENABLED=false
  LOCATION_ASSIST_ENABLED=false
  LOCATION_ASSIST_API_BASE=
  CHASER_SEND_ENABLED=false
  CASE_DISPOSITION_ENABLED=false
  EMAIL_AI_ENABLED=false
  BOX_API_ENABLED=false
  BOX_FOLDER_AT_INTAKE_ENABLED=false
  BOX_FILEREQUEST_ENABLED=false
  BOX_EMBED_ENABLED=false
  BOX_METADATA_ENABLED=false
  BOX_FOLDER_ROOT_ID=
  BOX_FILE_REQUEST_TEMPLATE_ID=
)

az functionapp config appsettings set -g "$RG" -n "$DATA_API" --settings "${COMMON_SETTINGS[@]}"
az functionapp config appsettings set -g "$RG" -n "$ORCH"     --settings "${COMMON_SETTINGS[@]}"
```

> `EVA_CLIENT_ID` / `EVA_CLIENT_SECRET` are **NOT** in the block above — they are Key Vault references applied
> separately (and only when the EVA gate flips). See [`11`](./11-secrets-and-keyvault.md) §Reference pattern.

To **flip a gate** later (the activation lever that replaces the Dataverse "set currentValue"):
```bash
az functionapp config appsettings set -g "$RG" -n "$DATA_API" --settings EVA_API_ENABLED=true
# changing an app-setting recycles the app — expected, this is the "restart-to-change" property.
```
To **revert a gate to the solution default** (the analogue of deleting a Dataverse `environmentvariablevalue`),
re-set it to the default value above — there is no per-environment "delete override" concept once it is an
app-setting; the default *is* whatever the provisioning command set.

### 1.3 ⚠️ `HOLD_NEW_CASES_BY_DEFAULT` — the one runtime-writable gate (DB-backed, NOT an app-setting)

`cr1bd_HOLD_NEW_CASES_BY_DEFAULT` is **unique**: it is the only env-var the Code App **reads AND writes** at
runtime (the Admin "hold new cases by default" toggle upserts its `environmentvariablevalue`; the manifest
note calls this out as the explicit exception to "the Code App never writes env-vars"). It is **not a flow
gate** — no orchestration reads it; only the manual New-case path consumes it (when `true`, a manually
created case is parked in the Held queue with `onhold=true`).

App-settings are **restart-to-change and not writable by the running app**, so this gate cannot be an
app-setting. It moves to a **DB-backed settings row**:

```sql
-- a tiny single-row-per-key settings table the Data API can UPDATE at runtime
CREATE TABLE app_setting (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
INSERT INTO app_setting(key, value) VALUES ('hold_new_cases_by_default', 'false');  -- preserve default OFF
```

The Data API exposes a **read+write** endpoint for it (e.g. `GET /settings/hold-new-cases-default`,
`PUT /settings/hold-new-cases-default`), guarded by the `CollisionSpike.Admin` app role (mirroring the
Dataverse "writing needs env-var customization privilege" rule — see §5). Every other gate is read-only at
runtime. The `app_setting` table is the natural home for any **future** runtime-toggleable preference, but
keep it to actual read-write settings — the 19 read-only gates stay app-settings so a future move to App
Configuration (D7) is a one-file change.

### 1.4 Gate-read pattern (centralise the read)

Today flows read gates via the Dataverse environment-variable connector (`environmentvariabledefinition` +
`environmentvariablevalue`, all-false on read failure). In the new world the TypeScript API/orchestration read
through a single tiny `gates` module so the source is swappable:

```ts
// gates.ts — the single read point. process.env for the 19 static gates;
// the DB-backed hold gate is fetched live (cached briefly) because it is runtime-writable.
const bool = (k: string) => process.env[k] === 'true';
export const gates = {
  pdfMapper:        () => bool('PDF_MAPPER_ENABLED'),
  enrichment:       () => bool('ENRICHMENT_ENABLED'),
  evaApi:           () => bool('EVA_API_ENABLED'),
  boxApi:           () => bool('BOX_API_ENABLED'),
  // ...all 19 read-only gates...
  holdNewCasesByDefault: () => readSettingBool('hold_new_cases_by_default'), // DB row, §1.3
};
```
Keep the read centralised so D7 (move to Azure App Configuration) is a one-file change.

---

## 2. Choice sets (17 files → 22 global choice sets) → Postgres lookup tables

Each Dataverse global choice set → a **lookup table** `(code int PRIMARY KEY, name text NOT NULL UNIQUE,
label text NOT NULL)` seeded with the rows below. **Prefer a lookup table over a native `ENUM`** so the
integer code is explicit, queryable, and FK-referenceable — and because **every code MUST be preserved**:
`case-status`, `image-role`, `case-type`, `audit-action`, `inbound-category/subtype` feed EVA exports and the
`contracts/` parity tests. All codes are `100000000`-based and **MUST NOT be renumbered** (the JSON notes say
so explicitly for case-status, audit-action, and the inbound taxonomy). Add new members append-only at the
next free integer.

### 2.1 Full enumeration (every set, every code)

| File | Choice set (`cr1bd_`) | Bound column | Default | Codes (`100000000 +`) → name |
|---|---|---|---|---|
| action-reason | `actionreason` | Case.actionReason | — | 0 missing_images · 1 missing_instructions · 2 duplicate · 3 conflict · 4 needs_review |
| audit-event | `auditaction` | AuditEvent.action | — | 0 graph_message_ingested · 1 graph_message_ingest_failed · 2 attachment_classified · 3 case_created · 4 case_attached · 5 duplicate_dropped · 6 duplicate_flagged · 7 provider_matched · 8 provider_unmatched · 9 parser_called · 10 parser_failed · 11 enrichment_called · 12 enrichment_failed · 13 status_changed · 14 jobsheet_imported · 15 eva_submitted · 16 box_synced · 17 corpus_record_changed · 18 inspection_override · 19 box_folder_created · 20 box_file_request_copied · 21 box_upload_received · 22 location_assist_confirmed · 23 chaser_sent · 24 inbound_classified · 25 inbound_routed · 26 case_disposed |
| audit-event | `auditseverity` | AuditEvent.severity | `info` | 0 info · 1 warning · 2 error |
| case-link-state | `caselinkstate` | Case.caseLinkState | `none` | 0 none · 1 pending · 2 linked |
| case-status | `casestatus` | Case.status | — | 0 new_email · 1 ingested · 2 needs_review · 3 missing_required_fields · 4 missing_images · 5 duplicate_risk · 6 linked_to_instruction · 7 ready_for_eva · 8 eva_submitted · 9 box_synced · 10 error |
| case-type | `casetype` | Case.caseType | standard (0) | 0 standard · 1 audit |
| chaser | `chasertargettype` | Chaser.targetType | — | 0 image_source · 1 repairer · 2 work_provider |
| chaser | `chaserchannel` | Chaser.channel | — | 0 email · 1 whatsapp |
| chaser | `chaserstatus` | Chaser.status | `drafted` | 0 drafted · 1 sent · 2 responded · 3 overdue |
| evidence-kind | `evidencekind` | Evidence.kind | — | 0 image · 1 video · 2 instruction · 3 email · 4 valuation · 5 eva_payload · 6 other · 7 engineer_report |
| field-provenance-source-type | `fieldprovenancesourcetype` | FieldLevelProvenance.sourceType | — | 0 staff · 1 pdf_extraction · 2 email_text · 3 corpus · 4 ai · 5 dvla_dvsa · 6 document_ai · 7 azure_vision · 8 web_lookup · 9 whatsapp · 10 manual_upload |
| image-role | `imagerole` | Evidence.imageRole | `unknown` (3) | 0 overview · 1 damage_closeup · 2 additional · 3 unknown |
| image-source | `imagesourcekind` | ImageSource.kind | — | 0 provider_direct · 1 repairer · 2 intermediary · 3 individual |
| image-source | `imagesourcechannel` | ImageSource.channel | — | 0 email · 1 whatsapp |
| improvement-signal-classification | `improvementsignalclass` | ImprovementSignal.classification | — | 0 parser_rule_candidate · 1 corpus_update_candidate · 2 provider_policy_candidate · 3 enrichment_issue · 4 one_off_case_issue |
| inbound-email-classification | `inboundcategory` | InboundEmail.category | — | 0 receiving_work · 1 query · 2 other |
| inbound-email-classification | `inboundsubtype` | InboundEmail.subtype | — | 0 existing_provider_instruction · 1 existing_provider_audit · 2 new_client_work · 3 query_existing_work · 4 query_new_enquiry · 5 other |
| inspection-decision-mode | `inspectiondecisionmode` | InspectionAddress.decisionMode | `unknown` (3) | 0 confirmed_physical · 1 manual · 2 image_based · 3 unknown |
| inspection-location-policy | `inspectionlocationpolicy` | WorkProvider.inspectionLocationPolicy | `prefer_address` (1) | 0 always_image_based · 1 prefer_address · 2 required_address |
| intake-channel | `intakechannelkind` | Case.intakeChannelKind | — | 0 email · 1 whatsapp |
| provider-automation-mode | `providerautomationmode` | WorkProvider.providerAutomationMode | `review_auto` (1) | 0 manual · 1 review_auto · 2 full_auto |
| review-state | `reviewstate` | FieldLevelProvenance.reviewState | `needs_review` (1) | 0 not_required · 1 needs_review · 2 reviewed · 3 conflict |

**22 sets total** (audit-event, chaser, image-source, and inbound-email-classification are bundle files
holding 2/3/2/2 sets respectively; the other 13 files hold one each → 13 + 2 + 3 + 2 + 2 = 22).

### 2.2 Parity-critical notes carried from the JSON

- **`parityKey`**: `casestatus` asserts on `value` (the integer); `inboundcategory`/`inboundsubtype` assert on
  `name` (their `name` EQUALS a `CATEGORY_*`/`SUBTYPE_*` constant in
  `functions/parser/cedocumentmapper_v2/rules/email_classifier.py` — the Python classifier still returns those
  strings, so the lookup-table `name` column is the join key, not the integer).
- **Defaults** (`default` in the JSON) become the column `DEFAULT` on the bound table — preserve:
  `caselinkstate=none`, `auditseverity=info`, `chaserstatus=drafted`, `imagerole=unknown`,
  `inspectiondecisionmode=unknown`, `inspectionlocationpolicy=prefer_address`,
  `providerautomationmode=review_auto`, `reviewstate=needs_review`, `casetype=standard`.
- **`location_assist_confirmed` (auditaction 100000022)** is RESERVED/forward-declared — keep the code
  even though no emitter exists yet (a future address-confirm path writes it).

Lookup-table DDL + seed lives in [`20`](./20-data-and-schema-migration.md); this section is the authoritative
code list it seeds from.

---

## 3. Relationships (15 1:N + 2 N:N) → FK + cascade

Each Dataverse relationship → a Postgres FK. Where the Dataverse cascade is `Cascade` (case→evidence,
case→chaser, case→note, case→fieldlevelprovenance) use `ON DELETE CASCADE`; where it is `RemoveLink`
(nullable lookups, audit history) use `ON DELETE SET NULL`. The 2 N:N (repairer↔workprovider,
imagesource↔workprovider) become junction tables. Exact FK list + cascade per relationship is in
[`20`](./20-data-and-schema-migration.md) (authored from `dataverse/relationships.json`).

---

## 4. Dedup alternate key → UNIQUE constraint

The inbound-email `sourcemessageid` alternate key → `UNIQUE (sourcemessageid)` on the inbound-email table.
This is also the **R2 backstop** at cutover — if the old flow and new Graph webhook briefly both read the
mailbox, the unique insert fails on the duplicate (idempotent ingest). Preserve it as a hard DB constraint,
not just app logic.

---

## 5. Security roles (2) → Entra app roles + Postgres RLS

`dataverse/roles/admin-role.json` + `user-role.json` define **CollisionSpike User** (least-privilege intake
staff) and **CollisionSpike Admin** (`supersetOf` User + the config/governance surface). Both are
**single-BU / "Organization" depth = all rows** (shared-queue model — no per-owner or BU hierarchy). They map
to **two Entra app roles** (`CollisionSpike.User`, `CollisionSpike.Admin`) checked by the Data API, backed by
**Postgres RLS** so the DB enforces row access even if app code is bypassed. The depth values are all
`Organization` (= unrestricted rows) or `None` (= no privilege), so RLS reduces to **table-level grants +
two append-only/archive invariants**, not row predicates.

### 5.1 Per-table privilege matrix (verbatim from the two role JSONs)

`C`reate/`R`ead/`W`rite/`D`elete at `Organization` depth = ✓; `None` = ✗. (Append/AppendTo are ✓ wherever the
table is reachable and are the relational-link grant — they don't map to a DML privilege in Postgres, so
they're omitted from the RLS translation.)

| Table (`cr1bd_`) | User CRWD | Admin CRWD | Translation / invariant |
|---|---|---|---|
| `case` | C R W ·  | C R W · | **No Delete even for Admin** — disposition runs as the job identity (ADR-0017), not interactive Admin. RLS: GRANT INSERT/SELECT/UPDATE; **no DELETE** to either app role. |
| `evidence` | C R W D | C R W D | Full CRUD both roles (child of Case). |
| `inboundemail` | C R W · | C R W **D** | User no-Delete (dedup anchor); Admin gains Delete (purge mis-triaged/test row). |
| `chaser` | C R W D | C R W D | Full CRUD both roles. |
| `note` | C R W D | C R W D | Full CRUD both roles. |
| `improvementsignal` | C R · · | C R W D | User may only RAISE (Create+Read); Admin triages (Write+Delete). |
| `workprovider` | · R · · | C R W · | **Archive-not-delete** — Admin edits corpus, **never** hard-deletes (referenced providers carry Case/PO history); deactivate via `active=false` (a Write). RLS: **no DELETE** to either role. |
| `repairer` | · R · · | C R W · | Same archive-not-delete corpus rule. |
| `inspectionaddress` | C R W · | C R W · | User CAN Create+Write (the per-case confirmed-decision save path, `saveInspectionDecision`), but **no Delete** for either (archive-not-delete; corpus reseeded offline). |
| `imagesource` | · R · · | C R W · | User read-only; Admin edits; archive-not-delete (no Delete either). |
| `fieldlevelprovenance` | C R W · | C R W · | Full CRUD except **no Delete** (provenance rows are the review audit). |
| `auditevent` | C R · · | C R · **D** | **Append-only** — neither role may **Write** (tamper-evidence). Admin gets **Delete only** (retention/DSAR cascade), never in-place edit. RLS: GRANT INSERT/SELECT both; **no UPDATE ever**; DELETE Admin-only. |

### 5.2 The three carried invariants (must survive the port)

1. **Audit is append-only.** Grant `INSERT, SELECT` on `auditevent` to both roles; **never `UPDATE`** (even
   Admin); `DELETE` only to `CollisionSpike.Admin` (retention cascade). This is the strongest invariant — the
   Postgres role for the app DB user MUST lack `UPDATE` on `auditevent` so a bug cannot rewrite history.
2. **Corpus is archive-not-delete.** `workprovider`, `repairer`, `inspectionaddress`, `imagesource` get
   `active=false` (a Write), never hard `DELETE` — withheld even from Admin. Don't grant `DELETE` on these
   four to either role.
3. **Case delete is governance-only.** Neither app role deletes `case` (or `inboundemail` for User); only the
   disposition job's own DB identity does, gated by `CASE_DISPOSITION_ENABLED` (§1, var #20).

### 5.3 Env-var privileges → §1.3 + Admin app role

The Admin role's `miscPrivileges` (`prv{Create,Read,Write}EnvironmentVariableDefinition`,
`prv{Create,Read,Write,Delete}EnvironmentVariableValue`) governed who could flip Dataverse gates. In the new
world that authority splits:
- **Static gates (19)** are app-settings — flipping one is an **operator** action (`az functionapp config
  appsettings set`), not an in-app role. There is no in-app "set gate value" surface for these.
- **The one runtime-writable gate** (`HOLD_NEW_CASES_BY_DEFAULT`, §1.3) — its read+write endpoint is guarded
  by the `CollisionSpike.Admin` app role, preserving "writing the hold default needs env-var customization
  privilege."

Detail of the Entra app-role manifest + token-claim check is in [`31`](./31-auth-migration.md); this file owns
the privilege→grant mapping.

---

## 6. Platform audit → app-written audit

Dataverse's automatic field-level audit is **not reproduced wholesale**; the app already writes its own domain
audit to `cr1bd_auditevent` (the 27-member `auditaction` vocabulary in §2.1). The Data API writes the
equivalent rows on every state change. If finer who-changed-what is wanted later, add Postgres triggers / a
temporal pattern — but that is **out of migration scope** (don't rebuild a feature we weren't using).

---

## 7. Parity check (the P2 gate)

Port `dataverse/verify-parity.mjs` + `dataverse/case-status.parity.test.ts` to a Postgres check that asserts:
- every choice-set integer code in §2.1 matches the old value (all 22 sets, every member);
- every gate default in §1.1 matches (20 booleans + 6 strings; `HOLD_NEW_CASES_BY_DEFAULT` checked against the
  `app_setting` seed row, not an app-setting);
- the `inboundcategory`/`inboundsubtype` `name` values still equal the `email_classifier.py` constants
  (`parityKey: name`);
- the status-machine transitions match `contracts/case-status`;
- the role matrix in §5.1 matches the two role JSONs (no privilege silently widened — especially no `UPDATE`
  on `auditevent`, no `DELETE` on the four corpus tables).

This check must pass before P3 starts and runs again in P6 ([`99`](./99-verification-and-cutover.md)).
