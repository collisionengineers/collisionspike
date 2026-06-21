# EVA validation Function — the one shared readiness implementation (M2.B)

> **Milestone: M2** (Phase 3e — EVA readiness gate). Deep dive behind
> [m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md) §6 (M2.B), which is the
> only place this surface was previously documented. Companion to
> [eva-sentry-rest-submission.md](./eva-sentry-rest-submission.md) (3c), the **eva-sentry-api** skill,
> [docs/architecture/eva-field-model.md](../../../docs/architecture/eva-field-model.md), ADR-0005, and
> [AGENTS.md](../../../AGENTS.md). Reconciles to the milestone model
> ([../milestone-model.md](../milestone-model.md)) and the precedence rule in
> [CLAUDE.md](../../../CLAUDE.md): a Phase is the work-breakdown axis, a Milestone is a capability slice
> — 3e (this gate) is **M2**, not M1.
> Author date **2026-06-20**. Read-only research + activation runbook; **no code/flows/Dataverse changed
> by this plan.**

---

## 0. TL;DR decision

**`functions/evavalidation/` is already built offline and pytest-green; what remains is activation,
plus one small flow edit to repoint `status-evaluate` onto it.** This Function is the **ONE shared
implementation** of the EVA readiness contract — `{ fieldsValid, imagesValid, openIssues[] }` — ported
from the canonical TypeScript (`mockup-app/src/contracts/image-rules.ts` +
`mockup-app/src/contracts/case-status.ts`) so the Power Automate status machine and the Code App
`computeReadiness()` agree **byte-for-byte** (Phase-1 §5.4 drift mitigation). The
**`cr1bd_evavalidation`** custom connector (operation **`ValidateCase`**, function-key auth) fronts it.

**Two facts that correct the M2 umbrella and the older source notes** (precedence: reconcile the
older/lower text up to the live state):

1. **The Function is NOT net-new** — `functions/evavalidation/` exists with `validation.py` (the port),
   `function_app.py` (HTTP trigger), `openapi/evavalidation-connector.json`, `infra/main.bicep`, and a
   parity test suite. The umbrella §6 ("net-new Function") predates the build; this doc documents the
   built artifact and its activation, mirroring how [eva-sentry-rest-submission.md](./eva-sentry-rest-submission.md)
   treats `functions/evasentry/`.
2. **`status-evaluate` does NOT currently call `shared_evavalidation`** — it computes readiness
   **INLINE** in flow `@`-expressions (the **Path-2** fix: image-rules + the 7 required EVA fields read
   straight from Dataverse), precisely *because* no backing Function had been deployed when it was wired
   live (H2). The `cr1bd_evavalidation` connection reference is therefore **declared-but-unused** today
   (the flow linter reports WARN, not FAIL — see
   [flows/connection-references.json](../../../flows/connection-references.json)). M2.B is the documented
   **Path-1** target: deploy the Function, repoint `status-evaluate` onto `ValidateCase` (body-in), and
   set `usedBy=[status-evaluate]` so the flow and the Code App share ONE source of truth.

**Why this is on the M2 critical path.** Turning **CS Status Evaluate** *fully* on — i.e. onto the
shared implementation rather than the inline duplicate — needs this connector real. The umbrella's
critical path is `M2.0 → M2.B → M2.C → M2.D`: M2.C (EVA Sentry REST) and the whole EVA submit only fire
on a correct `ready_for_eva`, and that verdict must be the **same** one the Code App shows the reviewer.
Today the inline copy *works* (M1 advanced on it), but it is a **second** implementation that can drift
from the TS contracts; M2.B retires the duplicate.

**No gate, no secrets, no Key Vault.** This is pure domain logic — it mirrors `status-evaluate`'s
"Gating: none". There is nothing to feature-flag and nothing to inject; the only operator step that
crosses the live-services boundary is binding the connection and turning the flow on.

---

## 1. What is already built (verified in-repo, 2026-06-20)

| Asset | State | Notes |
|---|---|---|
| `functions/evavalidation/validation.py` | **Built, pure** | Python port of `image-rules.ts` (`evaluate_image_rules`) + `case-status.ts` (`missing_required_field_keys`, `open_review_issue_keys`). `validate_case(case, evidence) → { fieldsValid, imagesValid, openIssues[] }`. Accepts **both** snake_case contract keys (`work_provider`, `imageRole`, …) **and** raw Dataverse columns (`cr1bd_evaworkprovider`, `cr1bd_imagerole`, …) so the flow can pass rows un-remapped. |
| `functions/evavalidation/function_app.py` | **Built** | Functions Python v2, `@app.route("validate-case", methods=["POST"])`, `http_auth_level=FUNCTION`. Dispatches **body-in** (`{ case, evidence }` → real validation) vs **caseId-only** (compat → a SAFE-NEGATIVE `fieldsValid=false, imagesValid=false` + advisory, so a Case is never marked `ready_for_eva` by a stateless call it can't actually evaluate). Malformed/non-JSON → 400 with the same contract shape. |
| `functions/evavalidation/openapi/evavalidation-connector.json` | **Built** | OpenAPI **2.0**, one operation `ValidateCase` on `POST /validate-case` (`basePath:/api`); `securityDefinitions.apiKeyHeader` = `x-functions-key` in header; `host` still the literal `REPLACE_WITH_FUNCTION_HOSTNAME.azurewebsites.net` placeholder (set at deploy, §4 step 4). `ValidateCaseRequest` allows `caseId` **or** `{ case, evidence }`; `ValidateCaseResponse` = `{ fieldsValid, imagesValid, openIssues[] }`. |
| `functions/evavalidation/infra/main.bicep` | **Built, `az bicep build`-able** | Linux **FC1** (Flex Consumption) Function + Storage (`allowSharedKeyAccess:false`) + workspace-based App Insights + system-assigned MI granted **Storage Blob Data Owner** (FC1 deploy container only). **NO Key Vault** — no secrets. `namePrefix='cespkeval'` → `cespkeval-fn-…`; `instanceMemoryMB:512` (right-sized for trivial JSON checks); `runtime python 3.11`. |
| `functions/evavalidation/tests/test_validation.py` | **Green (offline)** | The **drift gate**: image-rule cases mirror `image-rules.test.ts` exactly (min_count, missing_overview, missing_damage_closeup, excluded-overview, empty-set ordering) over **both** the contract-key and the Dataverse `cr1bd_*` shapes; required-field + open-issue aggregation (port of `case-status.ts`); the `{ fieldsValid, imagesValid, openIssues }` contract; handler dispatch (body-in vs caseId-only safe-negative). No network. |
| `functions/evavalidation/README.md` | **Built** | The Function-local reference; this plan is its phase-level companion. |
| `cr1bd_evavalidation` connection reference | **Unbound / declared-but-unused** | [live-environment.md](../../../docs/architecture/live-environment.md): `shared_evavalidation`, connection `(none)`, "Unbound (gated)". [connection-references.json](../../../flows/connection-references.json) note: NOT used by the Phase-1 slice; kept for this Path-1 design. |
| `status-evaluate.definition.json` | **Imported `state=off`**, computes readiness **INLINE** | `Set_fieldsValid` (7 required EVA fields) + `Filter_*` / `Set_imagesValid` (the image rule) read straight from Dataverse; **no** `OpenApiConnection` to `shared_evavalidation`. M2.B replaces those inline actions with a `ValidateCase` call (§5). |

**Implication:** M2.B is **~90 % activation + one flow edit**, not engineering. The build risk is nil
(pure logic, already parity-tested); the only design decision left is body-in vs caseId-in, and that is
already **resolved in code** as body-in with a caseId-only safe-negative fallback.

---

## 2. Boundary legend (per [AGENTS.md](../../../AGENTS.md) + memory `live-services-boundary`)

| Tag | Meaning | Who |
|---|---|---|
| **[BUILD]** | Authored + verified **offline** (Function code, Bicep, OpenAPI, the cross-impl parity test, `pytest`, `az bicep build`, OpenAPI parse). Zero tenant/Azure/Dataverse contact. **Done for the Function; the small `status-evaluate` edit + a TS↔Function parity harness are the remaining [BUILD] items.** | **Claude** |
| **[DEPLOY-WITH-LOGIN]** | Deploy the Function to `rg-collisionspike-dev`, import the `cr1bd_evavalidation` connector, read-only `az`/`pac`/Dataverse GETs. Touches the tenant; **no** secret values (there are none); **no** prod gate flip; **no** live mailbox/EVA/Box. | Operator (Claude may draft exact commands + run read-only GETs) |
| **[RESERVED-FOR-USER]** | Create the connection on `shared_evavalidation`, **bind `cr1bd_evavalidation`**, and **turn ON `CS Status Evaluate`** on the repointed definition. (No secret/gate — but binding a connection + turning a flow on is across the boundary.) | **Operator only** |

**CSP (AGENTS.md truth #1):** the Code App never calls this Function directly. `status-evaluate` (a
cloud flow, server-side HTTP, CSP-exempt) calls the `cr1bd_evavalidation` connector; the Code App reuses
the **same** logic by importing the TS contracts in-process (no connector call needed from the browser).
**Flow-webhook rule (truth #2):** `status-evaluate` is a `Request`/child-triggered flow (invoked via
Run-a-Child-Flow from intake), **not** a connection-webhook trigger, so turning it on is a state toggle —
**no** designer re-publish dance (memory `flow-webhook-trigger-provisioning`), and the repoint edit does
**not** re-arm any webhook.

---

## 3. The contract and how the two callers consume it

```
                         ┌──────────────────────────────────────────────┐
   Code App              │  ONE readiness contract (the 12-field EVA     │
   computeReadiness()    │  required set + the image rules):             │
   imports the TS  ──────┤    { fieldsValid, imagesValid, openIssues[] } │
   contracts in-proc     │                                              │
                         └──────────────────────────────────────────────┘
                                      ▲                       ▲
        ports byte-for-byte ──────────┘                       └────────── repointed to call (M2.B)
        (validation.py)                                                   shared_evavalidation/ValidateCase
                                      │                                                  │
   mockup-app/src/contracts/image-rules.ts  ── authority ──►  functions/evavalidation/validation.py
   mockup-app/src/contracts/case-status.ts                    (Func_EvaValidation, function-key)
                                      ▲                                                  ▲
                                      └────── tests/test_validation.py mirrors ──────────┘
                                             image-rules.test.ts (the DRIFT GATE)
```

**Verdict mapping** (consumed identically by `status-evaluate`'s guard and the Code App):

| Result | Status the guard lands on |
|---|---|
| `fieldsValid=false` | `missing_required_fields` |
| `imagesValid=false` | `missing_images` |
| `openIssues` non-empty (fields present + images valid, but a field still `needs_review`/`conflict`) | `needs_review` |
| all clear | `ready_for_eva` |

**The required-field set is 7, not 12.** Per `eva-export.ts` `EVA_FIELD_ORDER`, only **work_provider,
vehicle_model, claimant_name, date_of_loss, date_of_instruction, accident_circumstances,
inspection_address** are `required:true`. The other 5 (claimant_telephone, claimant_email, vat_status,
mileage, mileage_unit) are optional and do **not** gate readiness — `validation.py::REQUIRED_FIELD_KEYS`
and the flow's `Set_fieldsValid` both encode exactly this 7-of-12 set, and the parity harness (§6) keeps
them in lock-step.

**The image rule** (`MIN_ACCEPTED_IMAGES=2`): ≥2 accepted Evidence images **AND** ≥1 `overview` with
`registrationVisible=true` (the full reg legible — set by the parser/OCR, ADR-0009, not staff) **AND** ≥1
`damage_closeup`. "Accepted" = `kind=image (100000000) AND acceptedForEva=true AND NOT excluded`
(a person's reflection makes a photo unusable → `excluded`, per the domain rule). Choice values match
[dataverse/choicesets/](../../../dataverse/choicesets/) (image-role overview=100000000,
damage_closeup=100000001; review-state needs_review=100000001, conflict=100000003; evidence-kind
image=100000000).

**`openIssues` is a superset of the inline flow signal.** The Function additionally surfaces per-field
`needs_review`/`conflict` (the `needs_review` branch), which the inline flow currently treats as empty
(per its own comment: per-field review-state is FieldLevelProvenance, not on the Case row). Repointing
onto `ValidateCase` is therefore a **strict improvement** — but **only** once the flow passes the Case +
Evidence body-in (§5); a bare `caseId` yields the safe-negative.

---

## 4. body-in vs caseId-in (RESOLVED: body-in)

The Function accepts two shapes (`function_app.py::handle`):

| Shape | Behaviour | Recommendation |
|---|---|---|
| **(a) body-in** `{ case, evidence }` | The flow passes the Case's 12 EVA fields (or raw `cr1bd_eva*` columns, optionally an embedded `{value,reviewState}` per field, optionally a `reviewStates` map) + the Case's Evidence rows. The Function is **stateless**, does real validation, and **never reads Dataverse**. | **CHOSEN.** Keeps the flow the **single Dataverse caller** (no second Dataverse identity to provision/secure on the Function), keeps the Function pure, and avoids a second Dataverse round-trip. |
| **(b) caseId-in** `{ caseId }` | The Function would read the Case + Evidence itself via a Dataverse managed identity. | **Rejected** for M2.B: it duplicates the Dataverse read the flow already does, needs an MI + Dataverse app-user + table privileges on the Function, and re-introduces an I/O dependency into otherwise-pure logic. (`function_app.py` deliberately has **no Dataverse identity** and returns a safe-negative for this shape so a Case is never wrongly advanced.) |

**Why the safe-negative matters.** The current live `status-evaluate` (the inline Path-2 version) only
ever sends `{ caseId }`-shaped payloads to child flows. If anyone bound `cr1bd_evavalidation` and pointed
the flow at it *without* the body-in edit, every Case would come back `fieldsValid=false,
imagesValid=false` (correctly, because the Function can't see the data) — i.e. nothing would reach
`ready_for_eva`. The safe-negative is a **fail-closed** guard, not a working path; the body-in edit
(§5) is mandatory to actually use the connector.

---

## 5. The `status-evaluate` edit (the one flow change M2.B introduces)

> **[BUILD]** (the edit itself, authored + flow-linted offline) → **[RESERVED-FOR-USER]** (turning the
> repointed flow ON). Owner: **power-automate-flow-builder** (flow) + **eva-sentry-integration**
> (contract). Editing `status-evaluate.definition.json` is the deliberate, narrow change this milestone
> makes; do it as a reviewed commit, not in passing.

The repoint **replaces** the inline readiness computation with a single connector call, keeping the
existing **evidence-aware guard tree** untouched downstream. Concretely:

1. **Keep** `Init_caseId`, `Get_case`, `List_case_evidence`, `List_instruction_evidence` (the flow stays
   the sole Dataverse reader — `Get_case` + the evidence lists supply the body).
2. **Replace** `Filter_accepted_images` / `Filter_overview_with_reg` / `Filter_damage_closeup` /
   `Set_imagesValid` / `Set_fieldsValid` with one **`Validate_readiness`** action:
   `OpenApiConnection` → `connectionName: shared_evavalidation`, `operationId: ValidateCase`,
   `apiId: /providers/Microsoft.PowerApps/apis/shared_evavalidation`, body =
   ```
   { "case": @{outputs('Get_case')?['body']},
     "evidence": @{coalesce(outputs('List_case_evidence')?['body/value'], json('[]'))} }
   ```
   (raw Dataverse rows — `validation.py` accepts `cr1bd_*` columns directly, so no field re-mapping).
3. **Re-source** the two predicates the guard reads:
   `fieldsValid = @body('Validate_readiness')?['fieldsValid']`,
   `imagesValid = @body('Validate_readiness')?['imagesValid']` (set as the two variables the existing
   `Compute_next_status` already consumes), so `Guard_terminal`, `Compute_next_status`,
   `Map_status_choice`, `Patch_status_if_changed`, `Audit_status_changed`, and `Respond_to_parent` are
   **unchanged**.
4. **Optionally** branch the `needs_review` path on `length(body('Validate_readiness')?['openIssues'])`
   once FieldLevelProvenance review-states are wired (the inline version treats `openIssues` as empty;
   the Function fills it — pass a `reviewStates` map in the body when that provenance read lands).
5. **Connection-reference bookkeeping:** flip `cr1bd_evavalidation` from declared-but-unused to
   `usedBy=[status-evaluate]` in [connection-references.json](../../../flows/connection-references.json),
   so `flows/validate-flows.mjs` requires it bound (no longer a WARN) and the linter's closed-set check
   covers it.

**Invariant preserved.** The repoint changes *where* `fieldsValid`/`imagesValid` come from
(Function instead of inline `@`-expressions), never the guard order or the status integers
(`error=100000010`, `missing_required_fields=100000003`, `missing_images=100000004`,
`needs_review=100000002`, `ready_for_eva=100000007`). The cross-impl parity test (§6) proves the Function
verdict equals the old inline verdict for the field/image checks, so the repoint is **content-neutral**.

---

## 6. The parity test — the drift gate (this is the point of M2.B)

The whole reason this Function exists is to delete the **duplicate** readiness logic (one in TS for the
Code App, one inline in the flow). The gate that proves the single Python implementation matches the
canonical TS is a **parity harness over identical fixtures** — author/extend as **[BUILD]**:

- **Already green (Function ↔ TS, structural):** `tests/test_validation.py` mirrors the **exact**
  branches and fixtures of `mockup-app/src/contracts/image-rules.test.ts` (and the case-status
  required-field/open-issue cases), over both the contract-key and the Dataverse `cr1bd_*` shapes. Run
  via the function venv:
  `cd functions/evavalidation && .venv/Scripts/python -m pytest -q`.
- **Cross-implementation parity (the drift gate to add):** a small harness that feeds **N canonical
  Cases** through **both** `mockup-app/src/contracts/case-status.ts`'s `statusForReviewCase` /
  `image-rules.ts` (the Code App's `computeReadiness()` path) **and** `validation.py::validate_case`,
  asserting identical `{ fieldsValid, imagesValid }` (and `openIssues` set, once review-states are in
  scope). This is the analogue of the existing
  [`case-status.parity.test.ts`](../../../mockup-app/src/contracts/case-status.parity.test.ts) (which
  pins the TS union to the Dataverse choice set) — here it pins **TS ⇄ Python** so neither side can drift
  silently. Practically: export a shared JSON fixture set both runners read (a `vitest` case for the TS
  side, a `pytest` case for the Python side), and wire both into the global offline gate
  (`node verify-all.mjs` + the function pytest sweep).

> **Drift gate, restated:** if anyone edits `image-rules.ts` / `case-status.ts` (the authority) without
> updating `validation.py`, the parity test fails. The flow and the Code App can then **never** disagree
> on readiness in production — which is exactly what the second, inline implementation could not
> guarantee.

---

## 7. The connector (`cr1bd_evavalidation`) — function-key, no OAuth, no gate

`openapi/evavalidation-connector.json` is the **[BUILD]** artifact; importing it is **[DEPLOY-WITH-LOGIN]**.

- **OpenAPI 2.0 (Swagger), one operation `ValidateCase`.** Power Platform custom connectors require
  OpenAPI 2.0 and **pick the top security definition**; OpenAPI 3.0 is not supported
  ([Create a custom connector from an OpenAPI definition](https://learn.microsoft.com/connectors/custom-connectors/define-openapi-definition#prerequisites)).
- **Function-key auth, header `x-functions-key`** (`securityDefinitions.apiKeyHeader`, `type:apiKey`).
  This is the supported pattern; custom connectors **do not support OAuth client-credentials**, so a
  keyed connector is correct here (the same constraint that forces EVA's token server-side in 3c — but
  here there is **no** upstream auth at all, the Function calls nothing).
- **The key lives on the connection, not in the spec.** Per memory
  `codeapp-apikey-connector-connection`, an `apiKey` security definition alone can be rejected with
  `ParameterNotDefined: 'api_key'` at connection-create unless the connection parameters declare the key.
  If `pac connector create` from this spec does not surface the key parameter, fall back to the proven
  download→edit `apiProperties`→update→BAP-PUT recipe (the route the **CE Parser** connector used) so the
  connection can carry the function key. (No `apiProperties.json` ships in the folder yet — author it the
  same way as for the parser/evasentry connectors if the import needs it.)
- **No feature gate.** Pure domain logic, always on — there is **no** `*_ENABLED` env-var for validation
  and none should be added (mirrors `status-evaluate` "Gating: none"). Do **not** wrap `ValidateCase` in
  a Dataverse env-var read.
- **DLP:** `shared_evavalidation` must sit in the **same DLP data group** as Dataverse + the other custom
  connectors in the target env, or the flow won't run (the closed-set rule in
  [connection-references.json](../../../flows/connection-references.json)). Verify the env DLP policy
  before activation ([DEPLOY-WITH-LOGIN] read-only).

---

## 8. Activation runbook (dependency-ordered)

> Prerequisite: M2.0 pipeline-on (a Case actually reaches `Get_case` with parsed fields + classified
> Evidence). This runbook makes the **shared** validation real; until step 5 lands, `status-evaluate`
> keeps working on its **inline** copy — so there is no regression risk to M1 from deploying the Function
> early (the connector is simply unbound/unused).

| # | Step | Tag | Command / artifact |
|---|---|---|---|
| 1 | Confirm offline green. | [BUILD] (done) | `cd functions/evavalidation && .venv/Scripts/python -m pytest -q` (no `httpx` needed — pure logic). |
| 2 | Author the **cross-impl parity** harness (TS ⇄ Python over shared fixtures) and wire it into `verify-all.mjs` + the pytest sweep (§6). | [BUILD] | new `vitest` + `pytest` cases reading one fixture set. |
| 3 | `az bicep build functions/evavalidation/infra/main.bicep` → no errors; assert **no Key Vault, no secret literals**. | [BUILD] (done) | offline lint. |
| 4 | **Deploy** the Function (FC1, **remote build** — mandatory on Windows; do **not** `--no-build`). | [DEPLOY-WITH-LOGIN] | `func azure functionapp publish cespkeval-fn-…` (rg `rg-collisionspike-dev`, UK South). Capture the host + a function key (`az functionapp function keys list …`). |
| 5 | Set the connector backend **host**: replace `REPLACE_WITH_FUNCTION_HOSTNAME.azurewebsites.net` in `openapi/evavalidation-connector.json` with `cespkeval-fn-….azurewebsites.net`. | [BUILD] | offline edit before import. |
| 6 | **Author + commit** the `status-evaluate` repoint (§5) and flip `usedBy=[status-evaluate]` in `connection-references.json`; re-run `flows/validate-flows.mjs`. | [BUILD] | flow JSON edit + linter. |
| 7 | **Import the `cr1bd_evavalidation` connector** from the spec. | [DEPLOY-WITH-LOGIN] | `pac connector create …` (fallback: the BAP-PUT recipe, memory `codeapp-apikey-connector-connection`). |
| 8 | **Create the connection** (function-key on the connection) and **bind `cr1bd_evavalidation`**. | [RESERVED-FOR-USER] | `pac connection …` / maker portal. |
| 9 | **Turn ON `CS Status Evaluate`** (the repointed definition). | [RESERVED-FOR-USER] | flow state On (state toggle only — no webhook re-arm). |
| 10 | Live verify (§9). | [RESERVED-FOR-USER] | end-to-end Case transitions. |

---

## 9. Verification

**Offline ([BUILD], Claude):**
- `cd functions/evavalidation && .venv/Scripts/python -m pytest -q` → green (image-rule branches ==
  `image-rules.test.ts`; required-field + open-issue aggregation; the `{ fieldsValid, imagesValid,
  openIssues }` contract; body-in vs caseId-only dispatch).
- The new **cross-impl parity** harness (§6) green: TS `computeReadiness()` and `validate_case` agree on
  every fixture.
- `node -e "require('./functions/evavalidation/openapi/evavalidation-connector.json')"` parses;
  `swagger:2.0`; one path `/validate-case`; security `x-functions-key`, **no** OAuth `securityDefinitions`.
- `az bicep build functions/evavalidation/infra/main.bicep` → no errors; **no Key Vault**, no secret
  literals.
- `flows/validate-flows.mjs` after the §5 edit: `status-evaluate` lists `shared_evavalidation` in its
  closed connection set and is still `state=off`.

**Live (operator; Claude may run read-only GETs):**
- **Auth boundary:** `POST /api/validate-case` **without** a function key → `401`; with key + a non-JSON
  body → `400` (`{ fieldsValid:false, imagesValid:false, openIssues:["request body must be JSON."] }`).
- **body-in happy path:** a Case with all 7 required fields + an overview(reg)+closeup Evidence pair →
  `{ fieldsValid:true, imagesValid:true, openIssues:[] }`; via `CS Status Evaluate` the Case lands
  `ready_for_eva` (100000007).
- **fields-missing:** blank `work_provider` → `fieldsValid:false`, status `missing_required_fields`.
- **images-missing:** required fields present, only one accepted image (or no overview-with-reg) →
  `imagesValid:false`, status `missing_images`; add the closeup/overview → `ready_for_eva`.
- **excluded-overview:** an `overview` with a person's reflection (`excluded=true`) does **not** satisfy
  the overview rule → still `missing_images` (matches `test_excluded_overview_does_not_satisfy_overview_rule`).
- **caseId-only safe-negative (regression guard):** sending only `{ caseId }` returns the safe-negative
  — proving that the §5 body-in edit is required and that an un-edited flow fails **closed**, never
  advancing a Case it can't validate.
- **No secrets anywhere:** App Insights shows no credentials/tokens (there are none); the Function makes
  **zero** upstream calls (no DVSA/EVA/Dataverse egress).

---

## 10. Open questions / decisions

1. **Repoint timing (recommended: do it).** Leaving the inline copy in place is *functional* but keeps a
   **second** readiness implementation alive — the exact drift risk M2.B exists to kill. **Recommend**
   landing the §5 edit so `status-evaluate` and the Code App share `validation.py`'s output; the inline
   actions are deleted once the parity harness is green. (If the operator prefers to defer, the doc state
   is: Function deployed + connector bound but `usedBy` empty, inline copy retained — explicitly a
   *temporary* duplication, tracked here.)
2. **FieldLevelProvenance `openIssues`.** The `needs_review` branch is only reachable when per-field
   review-states are passed in the body (a `reviewStates` map). That provenance read is **not** wired in
   `status-evaluate` today (its own comment notes the simplification). Decide whether M2.B also wires the
   provenance read (richer `needs_review`) or ships with `openIssues` limited to fields+images first.
3. **Connector key plumbing.** Confirm `pac connector create` surfaces the `x-functions-key` connection
   parameter from this spec; if not, author `openapi/apiProperties.json` (declaring the key param as a
   securestring) and use the BAP-PUT recipe (memory `codeapp-apikey-connector-connection`) — the same
   path the parser/evasentry connectors needed.
4. **Cross-link to gated.md.** This surface underpins **H7** (readiness gate to green on a live Case) —
   driving H7 green should use the **shared** Function once §5 lands, so the live verdict the operator
   signs off equals the Code App's. (No new gated row is required; M2.B has no secret/gate.)

---

## 11. Decision summary (one line)

**`functions/evavalidation/` is already built and parity-tested offline (the ONE Python port of the
canonical `image-rules.ts` + `case-status.ts`, returning `{ fieldsValid, imagesValid, openIssues[] }`
behind the function-key `cr1bd_evavalidation` connector, no gate, no secrets, no Key Vault); M2.B is the
activation — deploy the FC1 Function, import + bind the connector, and apply the one narrow
`status-evaluate` edit that swaps its INLINE readiness copy for a body-in `ValidateCase` call — with the
TS⇄Python parity harness as the drift gate that lets the flow and the Code App share ONE readiness
verdict. It is on the M2 critical path because turning CS Status Evaluate *fully* on (onto the shared
implementation) needs it, even though the inline copy already carried M1.**
