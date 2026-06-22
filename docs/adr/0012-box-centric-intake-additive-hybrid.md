# Box is an additive, one-way archival + intake mirror; Dataverse stays the system of record

The intake pipeline needs a durable, human-navigable case archive and an account-free way to collect
images from senders who never see Power Platform. **Box** is the natural home for both: a per-Case/PO
folder of record from first contact, and File Requests that let a garage or intermediary drag photos
into the right case without a login. The mature reference build (`collisioncc`) already files to Box at
EVA-submit time, and the spike's `finalize-eva-box` flow does a first-party byte copy. The pivot makes
Box **earlier** (a folder at parse-confirm, not only at submit) and **deeper** (File-Request chasers +
webhook-driven intake), but it does **not** move the source of truth. Box Metadata has **no joins**, so
dedup (ADR-0010), the status machine, and Case/PO sequencing can never run off Box. We adopt Box as an
**additive, env-var-gated** layer that mirrors Dataverse **one-way** (Dataverse → Box); the webhook
Function may *write* Evidence rows from an upload, but case **logic** is never queried off Box. This is
not a cheaper architecture than Dataverse-authoritative — it is an additive content/intake/archival
enhancement, accepted on those terms.

The pivot rests on a set of **verified** platform constraints (Microsoft Learn + developer.box.com +
the local Box mirror, re-confirmed 2026-06-21). They are recorded here as the binding pillars every
section reconciles to, because two of them invert the convenient reading of the dossier's own diagrams:

- **A custom Power Platform connector is mandatory.** The first-party Box connector is file-only
  (no folder-create, no shared-links, no webhooks, no File Requests, no metadata) and OAuth-only — it
  cannot perform the pivot's verbs. All Box automation runs through a **custom connector over Box REST**
  with a service identity.
- **The CCG service token is minted inside the Azure Function, never the connector.** Power Platform
  custom connectors **cannot** run the OAuth2 client-credentials grant (Learn, verbatim:
  *"Currently, client credentials grant type is not supported by custom connectors"*; *"APIHub only
  supports the authorization code method of OAuth 2.0 configuration"*). So the connector authenticates by
  **API-key (an Azure Function host key) on the connection**, and the Box **CCG** token
  (`POST /oauth2/token`, `grant_type=client_credentials`, `box_subject_type=enterprise`, App Access Only,
  scopes `root_readwrite` + `manage_webhook`) is exchanged **inside the Function** from a Key Vault
  secret. This is the proven EVA-Sentry / parser facade pattern. The dossier's ASCII label
  "custom Box REST connector (CCG/JWT)" is a simplification — the token lives Function-side.
- **File Request is copy-from-template only.** Box exposes no create-from-scratch File-Request API
  (*"the API only allows the creation of new file requests by copying an existing file request associated
  to another folder"*). The team hand-builds **one** template File Request once; each case is a
  `POST /file_requests/{templateId}/copy`. Any capture-form field (including a reg field, if used) is
  **baked into the template** and cannot be varied by the copy call.
- **Webhooks are best-effort.** No SLA, at-least-once, droppable, and `FILE.UPLOADED` **also fires on
  moves**. Signatures are `BOX-SIGNATURE-PRIMARY`/`SECONDARY` = HMAC-SHA256 over body ++
  `BOX-DELIVERY-TIMESTAMP`, with a **10-minute replay** window, **dual-key** rotation, and retries on
  delivery failure. The receiver must verify, dedup, disambiguate upload-vs-move, **process the
  Dataverse fan-out on the request path, and return 200 only once the work is settled** — or a non-2xx
  (503) on a *transient* failure so **Box retries** (Box does **not** retry after a 2xx). A timed
  `ListFolder`/Metadata-Query reconciliation sweep is **documented but not yet built** — a deferred
  secondary backstop; Box's own retry on the non-2xx is the primary recovery, not the sweep.
- **The Code App calls Box only via the connector/flows.** Code Apps enforce `connect-src 'none'`, so
  the UI never `fetch()`es Box. Evidence is surfaced as a **server-minted "Open in Box" deep link**
  (the operator decision is **link, not embed**); no iframe is built and no CSP edit is made.

Decisions:

- **Additive hybrid; Dataverse is the system of record.** Box is a content + intake + archival mirror,
  written **one-way** (Dataverse → Box). No dedup / status / Case-PO sequencing ever runs off Box
  Metadata (it has no joins). Dual-store drift is mitigated primarily by one-way authority plus Box's own
  webhook retry (the receiver returns a non-2xx on a transient failure); a reconciliation sweep is a
  deferred, not-yet-built secondary backstop.

- **All Box automation runs through a custom Box REST connector with a service identity; the CCG token
  is minted inside the Azure Function, not the connector.** The connector carries an **API-key (Function
  host key) on the connection** (declared as `connectionParameters.api_key` in `apiProperties.json` — an
  `apiKey` securityDefinition alone does not create the param, proven for `cr1bd_ceparser`); the Box
  `client_secret` is a **Function-side Key Vault reference, never on the connection**. Claude never holds
  a Box credential.

- **File Requests are copy-from-template only.** Hand-build **one** template File Request; per case
  `POST /file_requests/{templateId}/copy` onto the Case/PO folder. The connection-reference identity is
  **pinned** (build-plan reconciliation table, reflected in `flows/connection-references.json`): a
  **parallel `cr1bd_box_rest`** custom connector carries folder-create + File-Request copy + shared-link +
  webhook lifecycle, while first-party **`cr1bd_box` (`shared_box`) is RETAINED** for `finalize-eva-box`'s
  byte path (`CreateFile`) — **not** an in-place repoint of `cr1bd_box`. Two Box connections coexist by
  design; the operator binds **both** at activation. For the **chaser path the Code App calls the Box REST
  connector op directly** (`CopyFileRequest` / `GetFolderSharedLink`) — **no flow in the path**, because
  under `connect-src 'none'` the app cannot POST to a flow Request URL (the pinned 2026-06-21 build-plan
  decision). `box-file-request-copy.definition.json` is an authored **standby** child flow for future
  operator activation, **not** currently invoked by the Code App; at activation the direct transport must
  also persist `cr1bd_boxfilerequestid`/`url` on the case.

- **The plan floor is base Box Business.** Base Business covers per-Case/PO folders, File Requests, and
  webhooks (Waves 0/1/2) — the whole live intake path runs on it. **Metadata (the Business-Plus tier)
  is OUT OF SCOPE now** and is a **later, optional Wave-2 reliability upgrade** for the orphaned
  image-only path only: it would buy a `vehicle_registration` capture **field** on the File-Request form,
  not new behaviour for case-bound uploads (those carry the case's parsed VRM already). Treat
  "Business Plus" as the **metadata-field** gate, distinct from the higher Enterprise+ tiers that gate
  Box Automate metadata events/actions and Box AI Units — do not conflate them. (This supersedes the
  earlier "plan floor = Business Plus" reading.) A 2026-06-21 verification proved the File-Request
  free-text **description is not API/webhook-readable at any tier**, so the orphaned-path reg capture, if
  ever needed, comes from filename-VRM / an emailed reg / human triage — never the description; metadata
  would be the only way to get a structured field, and that is what Business Plus buys.

- **The webhook intake path is best-effort and gated on a live test.** The receiver verifies the HMAC
  dual-key signature, rejects stale timestamps (10-minute window), distinguishes `FILE.UPLOADED` from
  `FILE.MOVED`, writes Evidence (the byte store stays Blob), and re-invokes the idempotent
  `CS Status Evaluate`. **It processes this Dataverse fan-out on the request path and returns 200 only
  when the work is settled; a *transient* failure returns a non-2xx (503) so Box retries** (Box does
  **not** retry after a 2xx) — it is **not** "respond 2xx promptly then a background fan-out." **Durable
  dedup is the Evidence-existence check on the `box:file:<id>` tag in `cr1bd_sourcemessageid`** (the
  `BOX-DELIVERY-ID` guard is only an in-process replay drop); the webhook also writes `cr1bd_boxfileid`
  (a correlation/UI mirror, **never** the dedup key) and `cr1bd_acceptedforeva = true`, with audit rows
  in the canonical `cr1bd_name`/`cr1bd_occurredat`/`cr1bd_action`/`cr1bd_after` shape. The
  **File-Request → `FILE.UPLOADED`** firing is **undocumented** and is the single biggest empirical
  unknown: it is a **live-test gate** (BLOCKING for the File-Request wave); Box's retry on the non-2xx is
  the primary recovery, and the timed `ListFolder`/Metadata-Query reconciliation sweep is a **deferred,
  not-yet-built** secondary fallback. We confirm the exact response-time limit against Box's webhook docs
  at build time.

- **Evidence is linked, not embedded.** The Code App surfaces a **server-minted "Open in Box" deep link**
  via the shared-link op (no CSP change, available whenever the connection is bound). The in-app
  **Box Embed iframe is not built**: it would require an operator `frame-src` edit (`https://*.app.box.com`
  via PPAC → Privacy + Security → App tab; this is `frame-src`, who *this app* may embed — **not**
  `frame-ancestors`). `BOX_EMBED_ENABLED` stays **reserved/off**; the iframe remains a future option only.

- **Env-var gated, sequenced, default-off.** `BOX_API_ENABLED` is the unlock; then
  `BOX_FOLDER_AT_INTAKE_ENABLED` → `BOX_FILEREQUEST_ENABLED`; `BOX_EMBED_ENABLED` stays reserved.
  `BOX_METADATA_ENABLED` and `BOX_AI_ENABLED` are deferred (Phase-C placeholders). Gate **schema names +
  defaults are owned by the Dataverse schema work**; every other section reads them. Gate-publish latency
  is ~1 hour — a flip is not an instant cutover.

- **Data residency is recorded as satisfied (no hard requirement).** The operator decision (2026-06-21)
  is that claimant PII may live in Box; UK-residency Box Zones (Enterprise + seats + consulting) is
  **not** mandated. This is revisited only if a client or insurer later mandates UK residency, at which
  point the tier changes. Box Governance retention/legal hold and Box AI (metered AI Units; Business and
  Business Plus include **zero**) are deferred, independently gated Phase-C decisions, each potentially
  tier-changing.

- **Box Relay / Box Automate are assessed and not required.** The valuable capabilities (custom HTTPS
  step, AI agents, Box Extract, metadata-triggered routing) are Enterprise / Enterprise-Advanced-gated
  and **duplicate** the authoritative parser/enrichment/Dataverse logic. Two caveats are carried as a
  watch item: Box Automate is **on-by-default at GA (28 Apr 2026)** — disable it if unused; and it is
  **not interoperable with Box Governance/Shield/Zones**.

- **This ADR outranks the older Box docs.** Where `box-archival-pipeline.md` (built against the
  first-party connector) disagrees, it is reconciled **down** to a finalization detail; ADR-0012 wins.

Trade-off: a custom connector + a token-minting/webhook Azure Function + a hand-built template + a
public webhook endpoint + a service-identity Platform app, instead of the first-party file-copy alone —
plus a permanently two-store world (Dataverse authoritative, Box one-way) whose drift must be actively
managed. Accepted because the first-party connector simply cannot create folders, copy File Requests,
mint shared links, or subscribe webhooks, and because account-free image collection that auto-advances a
case is the highest-value piece of the intake workflow and has no Dataverse-only equivalent. The
residual empirical risk — does a File-Request upload actually fire `FILE.UPLOADED`? — is isolated behind
a live-test gate, with Box's own webhook retry (a non-2xx on a transient failure) as the primary recovery
and a reconciliation sweep as a deferred, not-yet-built backstop, so the worst case is a delayed (not
stranded) case.
Builds on ADR-0010 (dedup ladder — reg-merge routes drop-box uploads) and ADR-0008 (the tool boundary
ends at EVA handoff — Box archival sits inside that boundary, not beyond it). **Status: Accepted
2026-06-21.**
