# Code App & repo file changes — build plan

> Section 02 of the Box-centric intake pivot. Companion to the architecture in
> [`../04-target-architecture.md`](../04-target-architecture.md) and the risk register in
> [`../07-flaws-risks-and-open-questions.md`](../07-flaws-risks-and-open-questions.md). Settled facts
> (additive hybrid; Dataverse stays system of record; ALL Box automation via a custom CCG/JWT
> connector; File Request is copy-from-template only; Business Plus floor; CSP `connect-src 'none'`;
> Blob transient/Box archival; webhooks best-effort + File-Request firing live-test-only) are taken as
> given here, not re-argued.

## Overview

The Code App (`mockup-app/`, React/Vite, deployed under CSP `connect-src 'none'`) gains Box affordances
**without breaking the data seam**: every new Box call routes through a Power Automate flow invoked via a
generated connector service (the `parser-connector-transport.ts` pattern), never `fetch()`. Five `BOX_*`
feature flags are read **through the Dataverse data source** (Code Apps have no native env-var mechanism —
verified) and exposed as a cached `BoxGates` object the screens gate on. The chaser panel gains a
"Copy image upload link" template that calls a new flow (`POST /2.0/file_requests/{templateId}/copy`) and
puts link+message on the clipboard; the EVA submit dialog stops faking its toast and invokes the existing
`finalize-eva-box` flow; evidence-from-Box is offered as a server-minted **"Open in Box" deep link**
(no CSP change) with an optional **Box Embed iframe** gated behind `BOX_EMBED_ENABLED` (needs an
operator `frame-src` edit). All of it degrades to honest "not available yet" states until the operator
binds the connector and flips the gates.

## Current state (what exists today, with file/resource paths)

**The data seam** (`mockup-app/src/data/`) is the spine every change rides on:
- `types.ts` — the `DataAccess` repository interface (screens depend only on this) + a local
  `GeneratedServices` model of what `pac code add-data-source` emits. No SDK import; pure types.
- `index.ts` — the one import barrel. `getDataAccess()` returns the active source; `configureDataAccess(services)`
  (called once in `main.tsx`) swaps mock→Dataverse. Re-exports pure helpers, the parser/enrichment clients,
  and the React hooks.
- `dataverse-source.ts` — `createDataverseDataAccess(services)` implements `DataAccess` over the injected
  generated services (`services.cases.getAll/get/create/update`, etc.). The place env-var reads will live.
- `generated-services.ts` — the ONLY module importing `src/generated/services/*` (+`@microsoft/power-apps`);
  wraps each pac class as a `GeneratedTableService` via one `as unknown as` cast. New connector services
  get wired in alongside here / in `main.tsx`.
- `parser-connector-transport.ts` — **the canonical CSP-safe transport**: `await CollisionEngineersParserService.ParseDocument(req as unknown as GeneratedRequest)`,
  checks `result.success`, throws honestly, returns `result.data as unknown as ...`. Every new Box transport mirrors this.
- `enrichment-client.ts` — **the canonical gated-transport contract**: an injectable transport type, a
  default `notConnected` transport returning `{ status: 'not_connected', message }`, and a public function
  that calls the transport. The Box link/embed clients copy this shape.
- `hooks.ts` — `useAsync` + `useCaseQuery`/`useDashboard`/`useImages`/… each `{ data, loading, error, refetch }`;
  fetcher read fresh from the live seam (swap-safe). New gate/embed hooks slot in here.

**Screens & components:**
- `mockup-app/src/components/ChaserPanel.tsx` — draft-only composer. `TEMPLATES: ChaserTemplate[]`
  (`image_request`/`instruction_request`/`mileage_chase`), each `{ key, label, channels, body(c) }`.
  Channel radio (email/whatsapp), template dropdown, editable textarea, **Copy to clipboard**
  (`navigator.clipboard.writeText`), **Log as chased** (`onLogChased` → caller adds a Note). Never sends.
- `mockup-app/src/screens/CaseDetail.tsx` — tabbed `[Fields|Evidence|Address|Notes|Chasers]`. Evidence tab
  (~L980–1018): thumb grid of `EvidenceCard`, EVA photo-order guidance, `ImageOrderList`. Chasers tab
  (~L1122–1136) mounts `<ChaserPanel>` and on `onLogChased` pushes a Note to local state. Hosts the
  `EvaSubmitDialog` route overlay at `/case/:id/submit`.
- `mockup-app/src/screens/EvaSubmitDialog.tsx` — Case/PO hero (locked Principal+YY, editable 3-digit seq),
  derives `evaCode` (lowercase) + `boxCode` (UPPERCASE), readiness gate. **`onSubmit` fires a mock toast
  and `close()` — no real call** (the file header says "MOCK ONLY").
- `mockup-app/src/screens/Dashboard.tsx`, `ActionLogs.tsx` — funnel/throughput + activity feed.

**Contracts & mappings (already Box-aware):**
- `mockup-app/src/contracts/case-status.ts` — 11-value `CaseStatus` union **already includes `box_synced`**;
  `TERMINAL_STATUSES = ['eva_submitted','box_synced','error']`. The guard never invents the submit
  terminals (set by finalization upstream).
- `mockup-app/src/mock/queues.ts` — `statusToStage` maps `eva_submitted` **and** `box_synced` → `'submitted'`
  (one funnel bucket). `box_synced` is terminal, owns no live queue.

**Flow (the Box archival that already exists):**
- `flows/definitions/finalize-eva-box.definition.json` (§5.10) — HTTP-triggered (`{caseId, payloadHash, evaPayload12}`),
  reads the case, orders accepted evidence ascending `cr1bd_sequenceindex`, loops `GetFileContentByPath_V2`
  (Azure Blob real bytes, S2 fix) → `Copy_evidence_to_box` (first-party Box `CreateFile`), optionally calls
  EVA Sentry REST when `EVA_API_ENABLED=true` else stages the `.eva.json`, audits, then **stamps
  `cr1bd_status = 100000009` (box_synced) + `cr1bd_submittedat` LAST** as the idempotency latch.
  - **Known gap (per doc 01 §6 / doc 03):** this flow uses the **first-party** Box `CreateFile`
    (interactive-OAuth, no folder-create). The pivot's *new* Box verbs (file-request copy, shared link,
    webhook) need the **custom CCG/JWT connector** built in sections 03/04. This plan does not re-fix the
    archival path; it consumes its existing HTTP trigger from the submit dialog.

**Not present today:** any `BOX_*` env-var read in the UI; any File Request / shared-link / embed UI;
any webhook-intake signal in the UI. The chaser button is draft-only; the submit button is a mock.

## Changes — ordered build steps

Owners: **[Claude-buildable]** = offline TS/flow/docs, lint-verifiable. **[operator-gated]** = needs the Box
Platform app / secret / Admin authorization / interactive sign-in / `frame-src` CSP edit / live confirm
(per `live-services-boundary` + AGENTS.md). Claude never holds a Box credential.

### A. Foundation — the `BoxGates` read (everything else gates on it)

1. **Add the `BoxGates` shape + `getBoxGates()` to the repository interface.**
   In `mockup-app/src/data/types.ts` add `export interface BoxGates { apiEnabled: boolean; folderAtIntakeEnabled: boolean; fileRequestEnabled: boolean; embedEnabled: boolean; metadataEnabled: boolean; fileRequestTemplateConfigured: boolean }`
   and add to `DataAccess`: `getBoxGates(): Promise<BoxGates>`. Re-export `BoxGates` from `index.ts`.
   *Rationale:* the seam is the single dependency surface; screens must read gates the same way they read cases.
   · **[Claude-buildable]** · depends-on: nothing · source: `mockup-app/src/data/types.ts` (existing `DataAccess`); seam doc in `index.ts` header.

2. **Implement `getBoxGates()` in the Dataverse source by reading the env-var *value/definition* rows.**
   Code Apps have **no native environment-variable mechanism** — Microsoft's guidance is explicitly to
   "store values in Dataverse (for example, a settings table)" and read them at runtime. So read the
   platform tables the gates already live in: query `environmentvariabledefinitions` filtered to
   `schemaname eq 'cr1bd_BOX_API_ENABLED'` (and the four siblings), `$expand`
   `environmentvariabledefinition_environmentvariablevalue($select=value)`, and coalesce
   `value ?? defaultvalue ?? 'false'` → boolean (`toLower(...) === 'true'`). This is the **exact pattern the
   `finalize-eva-box` flow uses** for `EVA_API_ENABLED` (`Get_gate_definition`/`Set_gate_*`), so flow and UI
   read identical truth. Add these two tables to `GeneratedServices` (`environmentVariableDefinitions`,
   `environmentVariableValues`, both OPTIONAL like `inspectionAddresses` so the offline build stays green) and
   to `generated-services.ts` once `pac code add-data-source` adds them. `fileRequestTemplateConfigured`
   is `true` when a `cr1bd_BOX_FILEREQUEST_TEMPLATE_ID` env-var value is non-empty (the template id is an
   operator-set value, never hardcoded). Cache the result in a module-level promise (read once at startup;
   expose `refetch` via the hook in step 3). Default every gate **false** on read failure (honest off).
   · **[Claude-buildable]** (the *reads*; the env-var *definitions* are dataverse-data-architect's to create) ·
   depends-on: 1; the five `cr1bd_BOX_*` definitions existing in the solution (cross-section, dataverse agent) ·
   source: env-var-not-supported note + Dataverse-table workaround — https://learn.microsoft.com/power-apps/developer/code-apps/how-to/set-up-azure-app-insights ;
   `EnvironmentVariableValue.Value` is a Memo/Text(2000) column — https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/environmentvariablevalue ;
   the live read recipe — `flows/definitions/finalize-eva-box.definition.json` `Get_gate_definition`/`Set_gate_EVA_API_ENABLED`.

3. **Add a `useBoxGates()` hook.**
   In `mockup-app/src/data/hooks.ts` add `export function useBoxGates(): QueryState<BoxGates>` wrapping
   `getDataAccess().getBoxGates()` (deps `[]`, like `useProviders`). Screens read
   `const { data: gates } = useBoxGates()` and treat `undefined`/loading as "all off". Re-export from `index.ts`.
   · **[Claude-buildable]** · depends-on: 1, 2 · source: `mockup-app/src/data/hooks.ts` (`useProviders` shape);
   getAll/get call shape — https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-dataverse#read-data.

### B. The chaser → File-Request → clipboard path (highest-value UI piece, gates on `BOX_FILEREQUEST_ENABLED`)

4. **Author the flow `chaser-filerequest-copy.definition.json`.**
   New `flows/definitions/chaser-filerequest-copy.definition.json`: HTTP-Request trigger
   (`{ caseId: string }`); a flow parameter `FileRequestTemplateId` (operator-set at activation, never a
   hardcoded live id — mirrors `BoxArchiveRootId` in `finalize-eva-box`); `Get_gate_definition` for
   `cr1bd_BOX_FILEREQUEST_ENABLED` (guard: if false, return 409/"gate off"); `Get_case` (read
   `cr1bd_casepo`); **ensure the Case/PO folder exists** (custom connector `POST /2.0/folders` — its `409`
   "item_name_in_use" carries the existing folder id, so resolve→reuse; doc 01 §1 step 2 requires the folder
   before the copy); then the custom Box REST connector op **`CopyFileRequest`** =
   `POST /2.0/file_requests/{FileRequestTemplateId}/copy` with body
   `{ folder: { id: <caseFolderId>, type: "folder" }, status: "active" }` (+ optional `expires_at`, `title`,
   `description`); **Response** action returning `{ uploadUrl: <body 'url'>, casePo, vrm }`. The copy body
   shape and that the response `url` is the live upload link are **verified**; the form's metadata field set
   (the `vehicle_registration` capture) is **baked into the hand-built template and cannot be set by the copy** —
   so the template is operator one-time work, not a flow input.
   · **[Claude-buildable]** (definition + connector op) · depends-on: the custom Box connector def (cross-section,
   azure agent) + the hand-built template id (operator) · source:
   `POST /2.0/file_requests/{id}/copy` body (`folder.id`+`type`, `status`, `expires_at`) and response `url` —
   https://developer.box.com/reference/post-file-requests-id-copy/ ; "only create is by copying a template",
   four ops, metadata baked in template, one-request-per-folder — `../01-box-capabilities-verified.md` §1 &
   https://developer.box.com/guides/file-requests/ ; `POST /2.0/folders` 409-on-duplicate reuse — doc 01 §6;
   flow-parameter idiom — `flows/definitions/finalize-eva-box.definition.json` (`BoxArchiveRootId`).

5. **Add the transport `chaser-filerequest-transport.ts`.**
   New `mockup-app/src/data/chaser-filerequest-transport.ts`, modelled on `parser-connector-transport.ts`
   *and* the gated `enrichment-client.ts`: define `export interface FileRequestLink { uploadUrl: string; casePo: string; vrm: string }`,
   `export type FileRequestStatus = 'ok' | 'not_connected' | 'error'`,
   `export type CopyFileRequestTransport = (caseId: string) => Promise<{ status: FileRequestStatus; data?: FileRequestLink; message?: string }>`,
   a default `notConnectedFileRequestTransport` returning `not_connected`, and the live
   `connectorCopyFileRequestTransport` = `await CeBoxFlowsService.CopyFileRequest({ caseId } as unknown as GeneratedRequest)`,
   `result.success` check, `result.data as unknown as FileRequestLink`. The "live" service is the generated
   service for whichever connector fronts the flow (custom Box connector op, or a flow-invoke connector —
   decided in section 03). Export the contract from `index.ts`. **No `fetch()`** — CSP forbids it.
   · **[Claude-buildable]** (the live service binds at deploy) · depends-on: 4 + the generated service for the
   flow's connector · source: connector-call pattern `await <Svc>.<Action>(...)` returning `{ success, data }` —
   `mockup-app/src/data/parser-connector-transport.ts` + https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-data#update-the-app-to-call-connections ;
   gated `not_connected` contract — `mockup-app/src/data/enrichment-client.ts` ; CSP `connect-src 'none'` (no fetch) —
   https://learn.microsoft.com/power-apps/developer/code-apps/how-to/content-security-policy.

6. **Extend `ChaserPanel` with the `copy_file_request` template + an injected transport.**
   In `mockup-app/src/components/ChaserPanel.tsx`: add prop
   `onRequestUploadLink?: CopyFileRequestTransport` and `fileRequestEnabled?: boolean`. Add a fourth
   `TEMPLATES` entry `{ key: 'copy_file_request', label: 'Image upload link (Box)', channels: ['email','whatsapp'], body: (c) => <chase copy referencing the link placeholder> }`,
   shown **only when `fileRequestEnabled`** (filter `available` by gate). When that template is active, the
   primary button changes to **"Get upload link & copy"**: it `await onRequestUploadLink(c.id)`; on
   `status==='ok'` it writes `\`${body}\n\nUpload your photos here: ${data.uploadUrl}\`` to the clipboard and
   toasts success (the open-question default: link **and** the brief chase message, with case/VRM context);
   on `not_connected`/`error` it toasts the honest `message` (the enrichment `not_connected` pattern) and does
   not fake a link. Keep the existing copy/log behaviour for the other three templates. The button is the
   chaser's existing pattern (it already never "sends").
   · **[Claude-buildable]** · depends-on: 5 · source: existing `TEMPLATES`/`navigator.clipboard.writeText`/toast —
   `mockup-app/src/components/ChaserPanel.tsx` ; honest-error UX — `mockup-app/src/data/enrichment-client.ts`.

7. **Wire the transport + gate through `CaseDetail`'s Chasers tab.**
   In `mockup-app/src/screens/CaseDetail.tsx` (~L1122) pass
   `fileRequestEnabled={gates?.fileRequestEnabled && gates?.fileRequestTemplateConfigured}` and
   `onRequestUploadLink={connectorCopyFileRequestTransport}` (the live transport; tests/mocks inject a fake)
   into `<ChaserPanel>` (read `gates` from `useBoxGates()`). Optionally drop a Note via the existing
   `onLogChased` path when a link is generated (audit trail: "Image upload link issued"). The button is
   **invisible unless both** the gate is on and a template id is configured (per constraints).
   · **[Claude-buildable]** · depends-on: 3, 6 · source: `mockup-app/src/screens/CaseDetail.tsx` ChaserPanel mount + Note push.

### C. Submit dialog → real `finalize-eva-box` invocation (flow-driven status, gates on `BOX_API_ENABLED`)

8. **Author a submit transport that invokes `finalize-eva-box`.**
   New `mockup-app/src/data/finalize-transport.ts` (gated-transport shape): `FinalizeRequest = { caseId: string; payloadHash: string; evaPayload12: string }`,
   `FinalizeResult = { status: CaseStatus; submittedAt?: string }`, default `notConnected`, and a live
   `connectorFinalizeTransport` = `await <FlowConnector>.FinalizeEvaBox(req as unknown as GeneratedRequest)`
   against the connector fronting the existing `finalize-eva-box` HTTP trigger (its schema already takes
   `{caseId, payloadHash, evaPayload12}` — no flow change needed). Returns the case's new status. **No local
   state write of the status** — per constraints the status transition (`eva_submitted` → `box_synced`) is
   **strictly flow-driven** (the flow stamps `cr1bd_status=100000009` LAST as its latch); the UI awaits the
   flow then re-reads the case.
   · **[Claude-buildable]** (live service binds at deploy) · depends-on: nothing new (trigger exists) ·
   source: `finalize-eva-box` trigger schema `{caseId, payloadHash, evaPayload12}` + box_synced stamp —
   `flows/definitions/finalize-eva-box.definition.json` ; connector-call pattern — `parser-connector-transport.ts`.

9. **Replace the mock `onSubmit` in `EvaSubmitDialog` with the real invocation.**
   In `mockup-app/src/screens/EvaSubmitDialog.tsx`: make `onSubmit` async — set a submitting state
   (disable the button, spinner), build the byte-identical 12-field payload + payloadHash with the **same
   serializer the case detail/flow use** (`contracts/eva-export` / `eva-payload.schema.json`; do NOT
   re-derive), `await connectorFinalizeTransport({ caseId, payloadHash, evaPayload12 })`. On success: toast
   the real outcome, navigate to `/case/:id` (or dashboard) and let `useCaseQuery` re-read the flow-stamped
   `box_synced` status. On failure: honest error toast, button re-enabled, **do not** close. Keep the readiness
   gate. The "Export for EVA" path (drag-drop JSON) stays as the permanent fallback. Gate the *direct* submit
   behind `gates?.apiEnabled` (when off, only the export path is offered — the dialog already disables the
   "Submit directly" radio today).
   · **[Claude-buildable]** · depends-on: 3, 8 · source: existing mock `onSubmit`/derived `evaCode`/`boxCode`/readiness —
   `mockup-app/src/screens/EvaSubmitDialog.tsx` ; flow-driven terminal-status latch — `case-status.ts` `TERMINAL_STATUSES` + `finalize-eva-box` `Stamp_finalized_hash`.

### D. Evidence-from-Box viewing — deep link always, iframe behind `BOX_EMBED_ENABLED`

10. **Add a server-minted "Open in Box" deep link (no CSP change).**
    New op on the custom Box connector `EnsureCaseFolderSharedLink` =
    `PUT /2.0/folders/{id}` with `{ shared_link: { access: "company" } }` (or as policy dictates), read back
    via `GET /2.0/folders/{id}?fields=shared_link`; surface it through a small flow + transport
    `box-link-transport.ts` (gated shape) `getCaseFolderLink(caseId) -> { status, data?: { folderUrl, embedUrl } }`,
    where `folderUrl` = the shared link's `url` and `embedUrl` = the `/embed/s/{token}` form. In
    `CaseDetail` Evidence tab header (~L1004) render an **"Open in Box"** `<a target="_blank">` (an external
    link, not a `fetch`, so CSP `connect-src` is irrelevant) whenever `gates?.apiEnabled`. The link is
    **minted server-side** because the page can't call Box. (Open question: show always when `apiEnabled`,
    or only when embed is off — default: **always available as the alternative**.)
    · **[Claude-buildable]** (connector op + flow + transport; the link is minted by the service) ·
    depends-on: 3 + custom Box connector (azure agent) · source: shared link via `PUT /2.0/folders/{id}` +
    read-back `GET …?fields=shared_link`, `/embed/s/{token}` form — https://developer.box.com/guides/embed/box-embed/
    and `../01-box-capabilities-verified.md` §5; first-party connector cannot mint shared links (needs custom REST) — doc 01 §6.

11. **Add the optional Box Embed iframe (gated `BOX_EMBED_ENABLED`; needs an operator `frame-src` edit).**
    In `CaseDetail` Evidence tab, when `gates?.embedEnabled` **and** an `embedUrl` resolved, render
    `<iframe src={\`${embedUrl}?view=list&sortColumn=date\`} ... />` (preview-only). This is **blocked by the
    default CSP `frame-src 'self'`** until an admin widens `frame-src` to the Box origin — an iframe loads
    Box's *own* page so it is governed by `frame-src`, **not** `connect-src` (so it survives `connect-src 'none'`).
    The UI gates the iframe behind `BOX_EMBED_ENABLED` precisely so it never renders before the operator makes
    the CSP edit. Add a third-party-cookie caveat line + an "Open in Box" fallback button beneath the iframe
    (Box documents the widget is preview-only, mobile-unfriendly, and breaks when 3p cookies are blocked).
    **Box UI Elements are NOT viable** under this CSP (host-page XHR to api.box.com is killed by
    `connect-src 'none'`) — iframe embed is the only path; do not attempt UI Elements.
    · iframe code **[Claude-buildable]**; the **`frame-src` CSP edit is [operator-gated]** (per-environment, via
    PPAC → Privacy + Security → Content security policy → App tab, or the CSP REST API). · depends-on: 3, 10 ·
    source: default CSP `frame-src 'self'` + `connect-src 'none'`, custom values **merge** with defaults, edit
    via PPAC/REST — https://learn.microsoft.com/power-apps/developer/code-apps/how-to/content-security-policy ;
    only `/embed/s/{token}` is framable, shared link required, 3p-cookie/preview-only/mobile caveats —
    https://developer.box.com/guides/embed/box-embed/ , `C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\310-create-a-box-embed-widget.md` , doc 01 §5.

### E. Webhook-driven intake reflected in the UI (gates on `BOX_FILEREQUEST_ENABLED`)

12. **Reflect webhook-driven status advances via existing queries + a manual Refresh (no new push channel).**
    The webhook receiver Function (cross-section, azure agent) writes Evidence + re-runs `CS Status Evaluate`,
    so a File-Request upload moves a case `not_ready → review` **server-side**. The Code App must **not assume
    immediate arrival** (webhooks are best-effort and the File-Request→`FILE.UPLOADED` firing is unproven —
    live-test gate). So: rely on the existing `useDashboard`/`useQueueQuery`/`useCaseQuery` (each exposes
    `refetch`) and add a visible **"Refresh"** affordance on the queue/case views (the dashboard already frames
    an "Updated HH:MM · Refresh" hook in `hooks.ts`). Optionally add an opt-in light poll (e.g. `refetch` every
    N s while a case sits in `not_ready` with `fileRequestEnabled`) — kept as a fallback, not a guarantee.
    No new "upload arrived" socket; the queue simply reflects the flow-advanced status on next read.
    Dedup + HMAC signature verification + the reconciliation sweep are **server-side only** (Function/flow), never UI.
    · **[Claude-buildable]** · depends-on: 3 + the webhook Function (azure agent) · source: webhooks best-effort,
    no SLA, at-least-once, also fire on move, File-Request firing undocumented (live-test) —
    `../01-box-capabilities-verified.md` §2 & `../07-flaws-risks-and-open-questions.md` flaw 5 ;
    existing `refetch` lever — `mockup-app/src/data/hooks.ts`.

### F. Status surfacing — `box_synced` as a distinct terminal

13. **Confirm/extend `box_synced` rendering in ActionLogs, Dashboard, and the case spine.**
    `box_synced` is **already** in the `CaseStatus` union + `TERMINAL_STATUSES`, and `statusToStage` already
    folds it into `'submitted'` — so the funnel/queues need no logic change. The remaining work is **labels**:
    in `mockup-app/src/screens/ActionLogs.tsx` ensure the `box_sync`/`box_synced` audit action renders a
    distinct **"Box synced"/"Archived to Box"** label (the flow already writes `Audit_box_synced` action
    `100000016`), and in `CaseDetail`'s status display + the EVA submit hero show `box_synced` as the
    archive-complete terminal distinct from `eva_submitted` (e.g. a "Archived to Box" badge). Verify
    `Dashboard.tsx` counts `box_synced` toward the `submitted` cell exactly as `eva_submitted` (parity with
    `queues.ts statusToStage`) — it already should; this step is a render/label check, not a remap.
    · **[Claude-buildable]** · depends-on: nothing (status already present) · source: `box_synced` ∈ union/terminals —
    `mockup-app/src/contracts/case-status.ts` ; `statusToStage` `box_synced→submitted` — `mockup-app/src/mock/queues.ts` ;
    audit action `box_synced=100000016` — `flows/definitions/finalize-eva-box.definition.json` `Audit_box_synced`.

### G. ALM wiring of the new connector services (deploy-time)

14. **Add the new connector data source(s) and wire the generated services.**
    Run `pac code add-data-source` for the custom Box connector (and/or the flow-invoke connector fronting the
    new flows) — prefer the **connection-reference** form (`-cr <logicalName> -s <solutionId>`, PAC CLI ≥1.51.1,
    Dec 2025) so the binding is environment-portable across Dev/Test/Prod. Wire the generated `*Service`
    classes into `generated-services.ts` / inject the live transports in `main.tsx` (the same SDK-confinement
    boundary the parser uses). Until bound, the seam's transports return `not_connected` and the offline build
    stays SDK-free (the "no `@microsoft/power-apps` import in src" grep gate keeps passing).
    · connector-data-source add + service wiring **[Claude-buildable]**; **binding the live connection (the Box
    `client_secret` / interactive sign-in) is [operator-gated]**. · depends-on: 4, 5, 8, 10 + the custom Box
    connector definition (azure agent) · source: `pac code add-data-source` (+ `-cr/-s` connection-reference form),
    generated `/generated/services/*`, custom connectors supported (only Excel Online excluded) —
    https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-data ; SDK-confinement boundary —
    `mockup-app/src/data/generated-services.ts` header.

## Cross-section dependencies

**This section needs FROM:**
- **dataverse-data-architect (01-schema-flows? / dataverse section):** the five env-var **definitions**
  `cr1bd_BOX_API_ENABLED`, `cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED`, `cr1bd_BOX_FILEREQUEST_ENABLED`,
  `cr1bd_BOX_EMBED_ENABLED`, `cr1bd_BOX_METADATA_ENABLED` (default `false`) **+** a
  `cr1bd_BOX_FILEREQUEST_TEMPLATE_ID` value, all in the `CollisionSpike` solution; confirmation `box_synced`
  is in the case-status choice set (it already is, value `100000009`). Step 2 reads these.
- **azure-integration-engineer:** the **custom Box REST connector definition** (CCG/JWT service identity)
  exposing `POST /2.0/folders`, `POST /2.0/file_requests/{id}/copy`, `PUT /2.0/folders/{id}` (shared_link),
  `GET /2.0/folders/{id}?fields=shared_link`; and the **webhook-receiver Function** (HMAC verify + 10-min
  replay + Evidence write + status re-evaluate). Steps 4, 10, 12, 14 consume these.
- **power-automate-flow-builder:** review/host `chaser-filerequest-copy.definition.json` (step 4) and the
  shared-link flow (step 10); confirm `finalize-eva-box`'s HTTP trigger is the invocation target for step 8/9
  (and is reachable via the connector the Code App will call).
- **eva-sentry-integration:** confirm the submit-dialog invocation (step 9) does not disturb the EVA path —
  EVA submission and Box archival run in the same `finalize-eva-box` Scope; the two-request photo order
  (2 previews then full set) is unchanged.
- **code-app-architect (reused skill):** confirm Power Apps SDK version supports the connector calls and advise
  the operator on the `frame-src` CSP edit process (step 11) and the connection-reference ALM (step 14).

**This section provides TO:**
- A precise list of the flow **request/response contracts** the flow-builder/azure agents must satisfy:
  `chaser-filerequest-copy` returns `{ uploadUrl, casePo, vrm }`; the shared-link flow returns
  `{ folderUrl, embedUrl }`; `finalize-eva-box` is invoked with `{ caseId, payloadHash, evaPayload12 }` and
  the UI reads back the flow-stamped status.
- The **gate-read contract** (`BoxGates`) that every section's feature flag must map onto, and the rule that
  the UI reads gates from the **same env-var tables** the flows read (one source of truth).
- The constraint that **all status transitions are flow-driven** — no section should expect the Code App to
  write a status and save.

## Risks & open questions

**Risks (UI-relevant slice of doc 07):**
- **Env-vars not native to Code Apps.** The gate read leans on a Dataverse-table query, not a Code App env
  mechanism (verified there is none). Mitigation: read the same `environmentvariabledefinitions`/`…value`
  rows the flows already read; cache + `refetch`. If the operator changes a gate, the app needs a reload/refetch
  (documented in step 2/3).
- **File-Request→`FILE.UPLOADED` firing is unproven** (live-test gate). The UI must not promise instant
  arrival; step 12 deliberately uses refresh/poll, never an "upload arrived" guarantee.
- **Webhook best-effort / fires on move too.** UI shows server-advanced status on next read; dedup + move
  disambiguation are server-side. A missed event cannot strand a case because the reconciliation sweep
  (azure agent) re-evaluates.
- **`frame-src` CSP edit is operator + per-environment.** The iframe is gated so it never renders before the
  edit; the deep link (step 10) is the no-CSP-change alternative that always works.
- **Clipboard UX needs a timely flow.** The file-request copy flow must return within the dialog timeout for
  the clipboard write; on slow/failed flow the UI shows the honest `not_connected`/`error` message (no fake link).
- **Connector secret is operator-only.** Until the Box connection is bound, every Box transport returns
  `not_connected` — the app degrades honestly, never fabricates a link/embed.

**Open questions (carried from the brief; current assumptions baked into the plan):**
- Chaser copy **sync vs background**: assumed **sync** via a short-timeout flow (clipboard within ~5 s).
- Template id **flow parameter vs config table**: assumed **flow parameter** set at activation (+ a
  `cr1bd_BOX_FILEREQUEST_TEMPLATE_ID` value so the UI can gate `fileRequestTemplateConfigured`).
- "Open in Box" deep link **always vs only-when-embed-off**: assumed **always available** when `BOX_API_ENABLED`.
- Copied text content: assumed **link + brief chase message + case/VRM context** (one template body).
- Auto-refresh on webhook advance: assumed **dashboard/queue `useQuery` refetch** (manual + optional light poll),
  no push channel.
- Permanent per-sender drop-box (Phase B3): assumed **out of M1 UI scope** — M1 gates on the B2 per-case template.
- Surface a "Waiting for images via File Request" queue state: assumed **status (`not_ready`/`missing_images`)
  is sufficient**; the chaser link + message is the UX.

## Verification log

**Microsoft Learn (checked via microsoft_docs_search / microsoft_docs_fetch):**
- Code Apps CSP — default directives (`connect-src 'none'`, `frame-src 'self'`, full table), custom values
  **merge** with defaults (replace only when default is `'none'`), edit via PPAC (Privacy + Security →
  Content security policy → App) or the CSP REST API; environment-level —
  https://learn.microsoft.com/power-apps/developer/code-apps/how-to/content-security-policy
- Code Apps connect-to-data — generated `*Service`/`*Model` under `/generated/services/`, call shape
  `await <Svc>.<Action>(args)`, custom connectors supported (only Excel Online excluded), connection-reference
  data sources (PAC ≥1.51.1) — https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-data
- Code Apps connect-to-Dataverse — `getAll(options)`/`get(id)` returning `{ data }`, `IGetAllOptions`
  select/filter — https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-dataverse
- **Code Apps have no native environment variables** — "Environment variables aren't yet supported for code
  apps … store values in Dataverse (for example, a settings table) or use getContext()" —
  https://learn.microsoft.com/power-apps/developer/code-apps/how-to/set-up-azure-app-insights
- EnvironmentVariableValue table — `value` is a Memo/Text column (max 2000); definition/value split —
  https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/environmentvariablevalue
- Code apps architecture — `@microsoft/power-apps` SDK + generated models/services + `power.config.json` —
  https://learn.microsoft.com/power-apps/developer/code-apps/architecture

**Box (checked via WebFetch of developer.box.com + local corpus):**
- File Request copy — `POST /2.0/file_requests/{id}/copy`: required `folder {id,type:"folder"}`; optional
  `title`/`description`/`status`/`expires_at`; response is a FileRequest whose **`url`** is the upload link;
  unspecified fields inherit the template (metadata field set baked in) —
  https://developer.box.com/reference/post-file-requests-id-copy/
- Box Embed — iframe form `https://{domain}.app.box.com/embed/s/{shared_link}?view=…&sortColumn=…`; shared
  link **required**, minted via `PUT /2.0/folders/{id}` (`shared_link`) and read via
  `GET /2.0/folders/{id}?fields=shared_link`; only `/embed/s/` is framable —
  https://developer.box.com/guides/embed/box-embed/
- Box Embed widget — HTML iframe, requires sharing enabled, **third-party-cookie caveat**, preview-only,
  not mobile-optimized — `C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\310-create-a-box-embed-widget.md`
- Box capability base (re-confirmed, not re-litigated): File Request copy-only + four ops + metadata baked +
  one-per-folder; webhooks `FILE.UPLOADED` folder-scoped/best-effort/also-on-move/File-Request-firing-unproven;
  first-party connector file-only (no folder/link/webhook/file-request); CCG/JWT service identity; iframe-only
  embed under the CSP — `../01-box-capabilities-verified.md` §§1,2,5,6,7

**Repo (read for current-state fidelity):**
`mockup-app/src/data/{types,index,dataverse-source,generated-services,parser-connector-transport,parser-client,enrichment-client,hooks}.ts`,
`mockup-app/src/components/ChaserPanel.tsx`,
`mockup-app/src/screens/{CaseDetail,EvaSubmitDialog}.tsx`,
`mockup-app/src/contracts/case-status.ts`, `mockup-app/src/mock/queues.ts`,
`flows/definitions/finalize-eva-box.definition.json`.
