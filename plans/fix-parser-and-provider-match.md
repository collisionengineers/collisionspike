# Fix plan — manual-intake PARSER (Code App) + intake provider-match

> Status: **planning only** (no code/flow/build/deploy done by this document). Authored 2026-06-18 against
> live state verified the same day. Two independent fixes, deployable separately:
>
> 1. **PARSER** — route the Code App manual-intake parse through the existing **CE Parser** custom connector
>    instead of a raw `fetch()` (which the deployed player blocks via CSP `connect-src 'none'`).
> 2. **PROVIDER-MATCH** — replace the unanchored `contains(...)` substring filter in the live **CS Intake**
>    flow with an anchored, exact, per-domain membership test.
>
> Pairs with: `docs/architecture/live-environment.md`, `AGENTS.md`, tasks **#26 / #27 / #28**.

---

## 0. Ground truth this plan is built on (verified live 2026-06-18)

| Fact | Value | How verified |
|---|---|---|
| Env | `Collision Engineers - Dev` (Sandbox) `b3090c42-51fb-ee24-9868-474da322a3ad`, org `https://collisionengineers-dev.crm11.dynamics.com` | `pac auth list` (active profile [2]) |
| `pac` version | **2.8.1** (≥ 1.51.1 → connection-reference `-cr`/`-s` flags available) | `pac --version` |
| CE Parser connector apiId | **`/providers/Microsoft.PowerApps/apis/new_collision-20engineers-20parser`** (publisher prefix `new_`, NOT `shared_`) | Dataverse `connectionreferences` GET |
| Connection ref `cr1bd_ceparser` | connector = parser; **connectionid = None (UNBOUND)** | Dataverse GET + `pac connection list` (only `shared_office365` + `shared_commondataserviceforapps` connections exist) |
| Parser Function | `cespike-parser-dev-x7xt3d5ovhi7y.azurewebsites.net`, `POST /api/parse`, `auth_level=FUNCTION`, body `{document(base64), filename, provider_hint?}`, response envelope `{extraction, vrm, reference, issues, contract_version}` | `functions/parser/function_app.py`, `functions/parser/openapi/parser-connector.json` |
| Connector operation | `operationId = ParseDocument`, path `/parse`, security `apiKeyHeader` = header **`x-functions-key`** | `functions/parser/openapi/parser-connector.json` |
| Dev function key (today) | embedded in `mockup-app/src/data/parser-config.ts` (owner-declared non-sensitive dev key) | file read |
| Code App | id `da7ba7af-9ffc-4c70-8f75-1f053ca354da`, source `mockup-app/`, deploy = `npm run build` → `pac code push` | `mockup-app/power.config.json` |
| Live **CS Intake** flow | workflowid `92131f3d-9cd5-4e88-aa9e-a5705a5850a0`, **statecode = 1 (ON)**, trigger **`OnNewEmailV3`** | Dataverse `workflows` clientdata GET |
| Live `Resolve_provider` filter (THE BUG) | `cr1bd_active eq true and contains(cr1bd_knownemaildomains, '@{variables('senderDomain')}')` at action path `If_already_ingested/else/Resolve_provider` | parsed from live `clientdata` |
| `cr1bd_knownemaildomains` storage format | **newline-separated** (`-join "\n"`), lowercased, de-duped, one domain per line | `dataverse/.build/15-seed-emaildomains.ps1` (`$joined = ($desired -join "\`n")`) |
| OData over a Memo | only `contains`/`startswith`/`endswith` supported; **no anchored "is one of these lines" operator** | Microsoft Learn "Filter rows by using OData" |

### Two important drifts/gotchas this plan must handle (do not skip)

- **DRIFT A — live flow ≠ repo file.** The repo `flows/definitions/intake.definition.json` shows trigger
  `SharedMailboxOnNewEmailV2`; the **live** flow uses `OnNewEmailV3`. The live flow was rebuilt in the
  designer. **The fix must be made against the live flow (designer/Flow API), and the repo file updated to
  match** — editing only the repo file and pushing clientdata would NOT change live behaviour and could
  even regress the trigger. (Memory: `flow-webhook-trigger-provisioning`.)

- **DRIFT B — connector apiId is `new_…`, not `shared_…`.** The connection-references manifest
  (`flows/connection-references.json`) and the `parse.definition.json` call the parser connector
  `shared_ceparser`. The **real** connector (hand-created in the portal) is
  `new_collision-20engineers-20parser`. All `pac code add-data-source` / `pac connection` commands MUST use
  the `new_…` apiId. (The flows manifest is a separate, pre-existing reconciliation debt — note it, do not
  let it mislead the Code App wiring.)

- **GOTCHA C — SDK boundary.** `mockup-app/src/data/parser-client.ts` is deliberately **SDK-free** (imports no
  `@microsoft/power-apps`) so the offline build/tests stay green (there is an explicit grep gate). The
  pac-generated connector service **does** import `@microsoft/power-apps`. Therefore the generated service must
  be wired in through the existing SDK-confinement seam (`mockup-app/src/data/generated-services.ts` +
  `main.tsx`), the **same way** the Dataverse services are confined — NOT imported directly into
  `parser-client.ts`. See §1.4 for the exact injection design.

---

# PART 1 — PARSER: route manual intake through the CE Parser connector

**Problem.** `fetchParserTransport` in `mockup-app/src/data/parser-client.ts` does
`fetch(parserUrl(), { headers: { 'x-functions-key': … } })` to the Azure Function host. On the deployed
Code App player the CSP is `connect-src 'none'`, so the browser blocks the request (works only on
`localhost`/offline tests). **Fix:** call the parser through the CE Parser custom connector via the
`@microsoft/power-apps` SDK (same-origin Power Platform connector proxy), with the function key stored on
the connection — never in the bundle.

## 1.1 Pre-req (OPERATOR, [RESERVED-FOR-USER] — login/secret) — create the connection

`cr1bd_ceparser` is unbound and **no** parser connection exists. The connector uses API-key auth, which
does NOT support the CLI `create-connection` (that is SSO-only), so create it in the maker portal:

1. https://make.powerapps.com → correct env (`Collision Engineers - Dev`) → **Connections** → **+ New connection**.
2. Pick the custom connector **"CollisionSpike CE Parser"** (`new_collision-20engineers-20parser`).
3. **API Key** = the parser function key (currently the value in `mockup-app/src/data/parser-config.ts`,
   `functionKey`). This is sent as `x-functions-key`. (Optionally mint a fresh function key in Azure and use
   that instead — see §1.6.)
4. Create. Then **bind it to the connection reference** so the binding is ALM-portable:
   - Solutions → **CollisionSpike** (or the solution that owns `cr1bd_ceparser`) → **Connection References** →
     `CollisionSpike CE Parser` → set the connection to the one just created → Save.
5. Capture the **connection id** (the GUID): `pac connection list` (look for apiId
   `…/new_collision-20engineers-20parser`).

> Verify: `pac connection list` now shows a row with API Id `…/new_collision-20engineers-20parser`, Status
> **Connected**; and Dataverse `connectionreferences` shows `cr1bd_ceparser` with a non-null `connectionid`.

## 1.2 Generate the typed connector service — `pac code add-data-source`

Run from `mockup-app/`. **Two valid forms; prefer the connection-reference form (B) for ALM**, fall back to
the raw connection-id form (A) if the reference isn't bound yet.

**Form A — by connection id (simplest; binds app directly to the connection):**
```powershell
# from mockup-app/
pac code add-data-source -a "new_collision-20engineers-20parser" -c "<parserConnectionId>"
```

**Form B — by connection reference (ALM-portable; needs the ref bound, pac ≥ 1.51.1 — we have 2.8.1):**
```powershell
# from mockup-app/   — get the solution id first:
pac solution list   # CollisionSpike → copy its Id (Unique Name CollisionSpike)
pac code add-data-source -a "new_collision-20engineers-20parser" -cr "cr1bd_ceparser" -s "<CollisionSpikeSolutionId>"
```

A custom connector is a **nontabular** data source → do **not** pass `-t/-d` (those are for SQL/SharePoint).

This command will:
- update `mockup-app/power.config.json` → add the connector under `connectionReferences` (today `{}`), and
- generate `mockup-app/src/generated/services/<ServiceName>.ts` + `mockup-app/src/generated/models/<ModelName>.ts`,
  and register the data source in `mockup-app/.power/schemas/appschemas/dataSourcesInfo.ts`.

**Verify generated names before coding (do not assume):**
```powershell
# what files were generated + the method/operation name
Get-ChildItem mockup-app/src/generated/services
Get-ChildItem mockup-app/src/generated/models
Select-String -Path mockup-app/src/generated/services/*.ts -Pattern "ParseDocument|class .*Service|static async"
```
Expected shape (mirrors the Office 365 Users example in Learn — service class named after the connector,
method named after the operationId `ParseDocument`):
```ts
// e.g. CollisionEngineersParserService.ts  (exact name TBD — read it)
await <ParserService>.ParseDocument({ document, filename /*, provider_hint */ });
// returns { data: ParseResponse-shaped, ... }  (an IOperationResult-style envelope)
```
> UNCERTAINTY P1: the exact generated **class name** and the **return wrapper** (`.data` vs direct) are
> connector-derived. Resolve by reading the generated file (commands above) before editing
> `parser-client.ts`. Do not hard-code a guessed name.

## 1.3 power.config.json — expected delta (illustrative, machine-written)

`pac code add-data-source` rewrites it; expected addition under the (currently empty) `connectionReferences`:
```jsonc
"connectionReferences": {
  "new_collision-20engineers-20parser": {
    "apiId": "/providers/Microsoft.PowerApps/apis/new_collision-20engineers-20parser",
    "connectionId": "<parserConnectionId>",            // Form A
    // or, Form B: "connectionReferenceLogicalName": "cr1bd_ceparser"
    "dataSourceName": "<ParserDataSourceName>"
  }
}
```
Do not hand-edit this; let the CLI own it. Commit it after generation.

## 1.4 Wire the generated service through the SDK seam (respect the offline boundary)

`parser-client.ts` must stay SDK-free. Inject the connector transport the same way Dataverse services are
injected. Concretely:

**(a) New thin adapter module** `mockup-app/src/data/parser-transport.connector.ts` (this file is ALLOWED to
import `@microsoft/power-apps` / the generated service — it is a sibling of `generated-services.ts`, which is
already the SDK-confinement boundary). It implements the existing `ParserTransport` type:
```ts
import { <ParserService> } from '../generated/services/<ParserService>';
import type { ParserTransport, ParseRequest, ParserResponse } from './parser-client';

export const connectorParserTransport: ParserTransport = async (req: ParseRequest): Promise<ParserResponse> => {
  const body = { document: req.document, filename: req.filename,
                 ...(req.provider_hint ? { provider_hint: req.provider_hint } : {}) };
  const result = await <ParserService>.ParseDocument(body);   // adjust call/return per §1.2 verify
  return (result?.data ?? result) as ParserResponse;          // unwrap per the generated envelope
};
```
The **request contract `{document, filename, provider_hint?}` and the `ParserResponse` shape are preserved
verbatim** — `adaptParserResponse()` and the whole `ManualIntake.tsx` review UI keep working unchanged.

**(b) Inject at startup** in `mockup-app/src/main.tsx` (where `configureDataAccess(generatedServices)` is
already called after the SDK is live). Add a parser-transport setter so the seam swaps the default fetch
transport for the connector transport — for example a new
`configureParserTransport(connectorParserTransport)` exported from `parser-client.ts`/`index.ts`, or have
`parseDocument` read a module-level `activeTransport` (default `fetchParserTransport`, replaced at startup).
Keep the DEFAULT as `fetchParserTransport` so the offline build + `localhost` keep working and the unit test
(`parser-client.test.ts`, which injects its own transport) stays green.

> This mirrors the existing seam doctrine in `mockup-app/src/data/index.ts` and `generated-services.ts`:
> SDK/generated imports confined to `generated-services.ts`, `parser-transport.connector.ts`, and `main.tsx`;
> everything else (`parser-client.ts`, screens, tests) stays SDK-free so the offline grep gate passes.

**Minimal change to `parser-client.ts`:** add the transport-swap hook (a setter or a module-level
`activeTransport` that `parseDocument` uses when no explicit `transport` arg is passed). Do **not** import the
connector or the SDK here. `fetchParserTransport` may be kept (localhost/dev) or marked deprecated; leave it
exported for tests.

## 1.5 Remove the embedded key from `parser-config.ts`

Once the connector transport is the production path, the function key must not ship in the bundle:
- Delete the literal `functionKey` from `DEFAULT_PARSER_CONFIG` in `mockup-app/src/data/parser-config.ts`
  (set to `''` and update the `ParserConfig` doc-comment, or drop the field). The key now lives ONLY on the
  Power Platform connection (§1.1).
- `baseUrl`/`path` may remain for the localhost/dev `fetchParserTransport` fallback, but they are no longer
  load-bearing for the deployed app (the connector owns host + auth). Update the file header comment that
  currently says "APPROACH = DIRECT FETCH" to "APPROACH = CE Parser connector (production); direct fetch is
  localhost-only fallback".
- Grep to confirm no other references break:
  ```powershell
  Select-String -Path mockup-app/src -Pattern "functionKey|getParserConfig|parserUrl" -SimpleMatch
  ```
  (`fetchParserTransport` is the only consumer of `functionKey`; `ManualIntake.tsx` does not touch it.)

## 1.6 (Optional, recommended) rotate the function key

Since the dev key is in git history: in Azure, mint a new **function** key for the `parse` function (or a new
host key), put the new value on the connection (§1.1 step 3), and leave the old key out of the new bundle.
Read-only check of current keys requires a privileged GET; treat the actual rotation as operator action.
Owner has stated the dev key is non-sensitive, so this is optional, not blocking.

## 1.7 Build, push, deploy

```powershell
# from mockup-app/
npm run test          # offline unit tests incl. parser-client.test.ts must stay green
npm run build         # tsc -b && vite build  → dist/
pac code push         # publishes app da7ba7af-… ; hard-refresh the player afterwards (it caches)
```
> If `tsc` fails on the generated service import (name mismatch), fix the import in
> `parser-transport.connector.ts` to the actual generated class/return shape from §1.2 — do not weaken types.

---

# PART 2 — PROVIDER-MATCH: anchored exact domain membership in CS Intake

**Problem (confirmed live).** `Resolve_provider` filters with
`contains(cr1bd_knownemaildomains, '<senderDomain>')` — an **unanchored substring** test over the
newline-separated multi-domain Memo. Sender `co.uk` matches a provider whose list contains
`carcompany.co.uk`; sender `acme.co` matches `acme.com`; etc. A false single-match mints an **unsafe
Case/PO** (wrong principalCode). The canonical TS (`mockup-app/src/domain/provider-match.ts`,
`matchProviderByDomain`) and the sibling `flows/definitions/provider-match.definition.json` already do this
**correctly** with an anchored, split-and-membership test. Bring CS Intake in line.

**Why not a one-line OData fix.** Dataverse `$filter` over a Memo supports only `contains`/`startswith`/
`endswith` (Learn). There is no "value is one of the newline-delimited lines" operator. Delimiter-wrapped
tricks (`contains(field, '\n acme.co.uk \n')`) are brittle: they depend on exact CRLF/space normalization in
storage and on embedding `%0A` reliably inside the Power Automate `$filter` literal — not robust. The correct,
already-proven approach is: **broaden the OData filter to active-only (server side), then anchor in-flow with
a Query (Filter array) action** over the split list. This mirrors `provider-match.definition.json` exactly.

## 2.1 The exact flow change (intake — `If_already_ingested/else` branch)

Replace the single `Resolve_provider` (OData `contains`) action with **two** actions, and repoint
`If_one_provider` at the filtered result. `Init_senderDomain` already exists upstream in the live flow
(lowercased domain after `@`, `none.invalid` sentinel) — reuse it.

**BEFORE (live, buggy):**
```json
"Resolve_provider": {
  "type": "OpenApiConnection",
  "inputs": {
    "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords",
      "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
    "parameters": {
      "entityName": "cr1bd_workproviders",
      "$filter": "cr1bd_active eq true and contains(cr1bd_knownemaildomains, '@{variables('senderDomain')}')",
      "$select": "cr1bd_workproviderid,cr1bd_principalcode",
      "$top": 2
    }
  },
  "runAfter": { "Audit_message_ingested": [ "Succeeded" ] }
}
```

**AFTER — action 1: list active providers (anchor moves in-flow). Drop the `$top:2`; the Query does the
narrowing.** Add `cr1bd_knownemaildomains` to `$select` so it is available to the Query:
```json
"List_active_providers": {
  "type": "OpenApiConnection",
  "inputs": {
    "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords",
      "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
    "parameters": {
      "entityName": "cr1bd_workproviders",
      "$filter": "cr1bd_active eq true and cr1bd_knownemaildomains ne null",
      "$select": "cr1bd_workproviderid,cr1bd_principalcode,cr1bd_knownemaildomains"
    }
  },
  "comment": "ALL active providers that have any domains. EXACT membership applied in-flow next (OData contains() over a Memo is an UNANCHORED substring test and would false-match -> unsafe Case/PO). Mirrors provider-match.definition.json + matchProviderByDomain.",
  "runAfter": { "Audit_message_ingested": [ "Succeeded" ] }
}
```

**AFTER — action 2: anchored membership (Query / Filter array).** This is the load-bearing expression,
copied from `provider-match.definition.json` `Filter_exact_domain`: split the newline-separated Memo (strip
CR `%0D` and spaces, lowercase), test EXACT array membership of `senderDomain`:
```json
"Filter_exact_domain": {
  "type": "Query",
  "inputs": {
    "from": "@coalesce(outputs('List_active_providers')?['body/value'], json('[]'))",
    "where": "@contains(split(replace(replace(toLower(coalesce(item()?['cr1bd_knownemaildomains'], '')), decodeUriComponent('%0D'), ''), ' ', ''), decodeUriComponent('%0A')), variables('senderDomain'))"
  },
  "comment": "Anchored exact membership: split knownemaildomains (CRLF + spaces stripped, lowercased) into individual domains and test EXACT membership of senderDomain. 'co.uk' is a DISTINCT array element from 'carcompany.co.uk'. No substring/alias matching.",
  "runAfter": { "List_active_providers": [ "Succeeded" ] }
}
```
> Expression detail: `decodeUriComponent('%0A')` = newline (split delimiter), `decodeUriComponent('%0D')` =
> CR (stripped first). `senderDomain` is already lowercased upstream. This exactly matches the canonical
> seed format (`-join "\n"`, lowercased) from `15-seed-emaildomains.ps1` and the
> `provider-match.definition.json` precedent — so the two flows agree.

**AFTER — repoint the existing gate.** `If_one_provider` and the `Create_case_matched` bind currently read
`outputs('Resolve_provider')?['body/value']` and `first(outputs('Resolve_provider')?['body/value'])`. Change
both to the filtered array:
- `If_one_provider` expression:
  `@equals(length(body('Filter_exact_domain')), 1)`  *(was `length(coalesce(outputs('Resolve_provider')?['body/value'], json('[]')))`)*
- `Create_case_matched` bind:
  `@concat('/cr1bd_workproviders(', first(body('Filter_exact_domain'))?['cr1bd_workproviderid'], ')')`
- `If_one_provider.runAfter`: `{ "Filter_exact_domain": [ "Succeeded", "Failed" ] }` (keep the graceful
  gate — 0 / ambiguous / unavailable all fall to `Create_case_unassigned`, never sinking the Case create).

**Net semantics:** exactly-one anchored match → bind provider; 0 or >1 (ambiguous) or any failure →
`Create_case_unassigned` (unassigned, `new_email`, staff assigns). This is the ADR-0011 "never auto-pick an
ambiguous domain → needs_review" rule, identical to `provider-match.definition.json`.

> NOTE: a `Query` action whose `where` references a missing/empty field can error; the `coalesce(..., '')`
> inside the expression and the `cr1bd_knownemaildomains ne null` server filter both guard this, and the
> `If_one_provider` runAfter includes `Failed`, so a Query quirk still creates the Case unassigned.

## 2.2 Keep the repo in sync (resolve DRIFT A)

Update `flows/definitions/intake.definition.json` to the SAME two-action shape (and reconcile its trigger
block to `OnNewEmailV3` to match live, if that reconciliation is in scope for this change). Then re-lint:
```bash
node flows/validate-flows.mjs    # must PASS (balanced @-parens, declared connection refs only, no secrets)
```

## 2.3 Redeploy path (designer/Flow API — NOT clientdata-only)

CS Intake's trigger is `OnNewEmailV3`, a **connection-webhook** trigger. Per the live-environment gotcha and
memory `flow-webhook-trigger-provisioning`, patching only the Dataverse `clientdata` does **not** re-arm the
webhook subscription. Use one of:

- **Designer (simplest, recommended):** open **CS Intake** in make.powerapps.com → edit the
  `Resolve_provider` step into `List_active_providers` + `Filter_exact_domain` + repoint `If_one_provider`
  (as §2.1) → **Save** (Save re-registers the webhook). The actions edited are pure Dataverse `ListRecords` +
  a Query, so no new connection/permission is needed.
- **Flow Management API (scriptable):** PUT the updated definition via
  `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/<envId>/flows/<workflowid>?api-version=2016-11-01`
  then confirm the trigger provisioned (GET `.../triggers?api-version=2016-11-01` → 200, not 500). If using
  the Dataverse `clientdata` PATCH route at all, you MUST follow with a designer Save or an explicit
  trigger re-provision; clientdata alone is insufficient for webhook triggers.

No env-var gate applies to provider-match (it is core intake, always on). The flow is already ON
(statecode=1); do not toggle state.

---

## 3. VERIFICATION

### 3.1 Parser (Code App)
1. **Pre-flight:** `pac connection list` shows the parser connection **Connected**; `cr1bd_ceparser` has a
   non-null connectionid; `mockup-app/power.config.json` contains the `new_collision-20engineers-20parser`
   data source; `mockup-app/src/generated/services/<ParserService>.ts` exists with a `ParseDocument` method.
2. **Build/test:** `npm run test` green (offline), `npm run build` succeeds, `pac code push` completes.
3. **Live (Chrome DevTools on the play URL
   `https://apps.powerapps.com/play/e/b3090c42-.../app/da7ba7af-...`):**
   - Hard-refresh. Open **Manual intake**, choose a known instruction PDF, click **Parse document**.
   - **Network tab:** the parse request goes to a Power Platform connector-proxy host (e.g.
     `*.powerplatform.com` / the connector gateway), **NOT** to
     `cespike-parser-dev-x7xt3d5ovhi7y.azurewebsites.net`. Status **200**.
   - **Console tab:** **no** CSP violation (`Refused to connect … connect-src`). Previously this fired on the
     direct fetch; it must be absent now.
   - **UI:** the 12 EVA fields populate with ProvenanceBadges; VRM/reference fill; warnings (if any) show;
     **Create case** works → navigates to the new case.
   - **Negative:** upload a `.txt` (unsupported) → the parser's 400 issue surfaces as a parse error in the
     MessageBar (round-trips through the connector, not a CSP/network error).
   - Confirm **no `x-functions-key`** is visible in the request from the browser (auth is injected by the
     connector server-side).

### 3.2 Provider-match (intake flow)
1. **Seed at least one domain** if not already present (so a positive match is possible):
   `pwsh dataverse/.build/15-seed-emaildomains.ps1 -Apply` with a CSV mapping a real provider to the domain
   you'll send from. Confirm via GET:
   `cr1bd_workproviders?$filter=cr1bd_knownemaildomains ne null&$select=cr1bd_principalcode,cr1bd_knownemaildomains`.
2. **Positive:** send an email from an address whose domain **exactly equals** a seeded provider domain to
   `digital@collisionengineers.co.uk`. Expected: a Case is created **bound to that provider**
   (`_cr1bd_workproviderid_value` set), and an audit row `provider_matched` (or the intake's
   `graph_message_ingested` + a bound case). Check the latest case:
   `cr1bd_cases?$select=cr1bd_name,_cr1bd_workproviderid_value,createdon&$orderby=createdon desc&$top=3`.
3. **Anti-false-positive (the whole point):** send from a domain that is a **substring** of a seeded domain
   but not an exact line (e.g. seeded `carcompany.co.uk`, send from `co.uk`-only or `company.co.uk`).
   Expected: **NOT** bound (Case created **unassigned**) — the old `contains` would have mis-bound it.
4. **Ambiguous (if a domain maps to >1 active provider):** expect **unassigned** (never auto-pick).
5. **Flow run history:** Flow Management API
   `.../flows/92131f3d-9cd5-4e88-aa9e-a5705a5850a0/runs?api-version=2016-11-01` shows the run succeeded with
   the `Filter_exact_domain` step producing the expected count.
6. **Trigger health:** `.../triggers?api-version=2016-11-01` returns **200** (webhook still armed after the
   designer Save).

### 3.3 Regression guard
- `npm run test` (Code App) green; `node flows/validate-flows.mjs` PASS.
- No secret literal reintroduced: `Select-String -Path mockup-app/src -Pattern "A31IJ9|x-functions-key"`
  returns nothing in shipped source after §1.5 (the test fixture strings are fine).

---

## 4. Risks & open questions (flag + how to verify live)

| # | Risk / open question | Mitigation / live check |
|---|---|---|
| **Q1 (biggest)** | Exact **generated service class name + return-envelope** for the parser connector (`.data` vs direct; method really `ParseDocument`). Whole Part-1 wiring (§1.4) depends on it. | After `pac code add-data-source`, READ `mockup-app/src/generated/services/*.ts` (commands in §1.2). Do not guess. Adjust `parser-transport.connector.ts` to the real name/return. |
| Q2 | Does `pac code add-data-source` accept a **custom** (`new_…`) connector cleanly as nontabular, and is the connector definition complete enough (operationId/body) for codegen? | Run §1.2 and inspect output; if codegen omits `ParseDocument`, re-import/refresh the connector from `functions/parser/openapi/parser-connector.json` (set `host` to the real Function host) and retry. Use the `code-apps-preview:add-connector` skill if generation misbehaves. |
| Q3 | **Form B (`-cr/-s`)** requires the connection reference bound and a solution that actually owns `cr1bd_ceparser`. | `pac solution list`; confirm which solution holds the ref via `pac code list-connection-references -s <id>`. If unbound/edge-cased, use **Form A** (`-c <connectionId>`). |
| Q4 | DRIFT A — editing the wrong surface. | Make the §2.1 change in the **designer on the live flow** (or Flow API), then mirror into the repo file; never clientdata-only for the `OnNewEmailV3` webhook. |
| Q5 | Memo `cr1bd_knownemaildomains` not actually newline-separated for some legacy rows (e.g. comma/CRLF-only). | The Query strips `%0D` + spaces and splits on `%0A`; the seed script writes `\n`. Spot-check a few live rows (GET in §3.2.1). If any use commas, extend the split set the same way `15-seed-emaildomains.ps1` `Split-Domains` does (`[\r\n,;]+`) — i.e. nest replaces of `,`/`;`→`%0A` before the split. |
| Q6 | Function key in git history (P1 §1.6). | Optional rotation; owner says dev key non-sensitive. If rotating, update the connection's API key, not the bundle. |
| Q7 | DLP — premium custom connector + Dataverse must share a data group, or the connector call fails at runtime. | If the live parse 200 check (§3.1) fails with a DLP error, confirm `new_collision-20engineers-20parser` and Dataverse are in the same DLP data group for the env. |
| Q8 | Player caching. | Always hard-refresh after `pac code push` before verifying. |

---

## 5. File / command change-list (quick index)

**Parser (Code App), under `mockup-app/`:**
- `pac code add-data-source -a "new_collision-20engineers-20parser" -c <connId>` (or `-cr cr1bd_ceparser -s <solutionId>`)
  → generates `src/generated/services/<ParserService>.ts`, `src/generated/models/<…>.ts`; edits
  `power.config.json`, `.power/schemas/appschemas/dataSourcesInfo.ts`.
- NEW `src/data/parser-transport.connector.ts` — SDK-side `ParserTransport` over `<ParserService>.ParseDocument`.
- EDIT `src/data/parser-client.ts` — add transport-swap hook (setter / module `activeTransport`); keep SDK-free.
- EDIT `src/main.tsx` — inject `connectorParserTransport` at startup (next to `configureDataAccess`).
- EDIT `src/data/parser-config.ts` — remove embedded `functionKey`; update header comment.
- (maybe) EDIT `src/data/index.ts` — export the new transport-config setter.
- `npm run test` → `npm run build` → `pac code push`.

**Provider-match (intake flow):**
- EDIT the **live** CS Intake flow (designer/Flow API): replace `Resolve_provider` with
  `List_active_providers` + `Filter_exact_domain`; repoint `If_one_provider` + `Create_case_matched`.
- EDIT `flows/definitions/intake.definition.json` to match (reconcile trigger to `OnNewEmailV3`).
- `node flows/validate-flows.mjs`.
- (pre-req for a positive test) `dataverse/.build/15-seed-emaildomains.ps1 -Apply` with a real domain CSV.
