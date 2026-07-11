# CURRENT_STATUS — collisionspike

_Single source of truth for "where are we now." Last updated **2026-07-04**._
_Companion docs: [README.md](./README.md) · [ROADMAP.md](./ROADMAP.md) (forward worklist) · **[docs/tickets/BOARD.md](./docs/tickets/BOARD.md)** (granular ticket delivery) · [docs/gated.md](./docs/gated.md) · live registry [docs/architecture/live-environment.md](./docs/architecture/live-environment.md) · _(historical)_ [PLAN.md](./docs/HISTORICAL/PLAN.md) · [DEPLOY-RUNBOOK.md](./docs/HISTORICAL/DEPLOY-RUNBOOK.md)._

> **Role split.** This **CURRENT_STATUS** is the snapshot of what is live *now*.
> [ROADMAP.md](./ROADMAP.md) is the forward phased checklist; [docs/gated.md](./docs/gated.md) is
> everything that needs the operator; plans live under [docs/plans/](./docs/plans/).

> **⚠️ Platform pivot (2026-06-26).** The **live system is now the Azure PaaS stack** (Static Web App +
> Function Apps + Postgres). The original **Power Platform** implementation (Power Apps Code App,
> Dataverse, ~16 Power Automate flows, custom connectors) has been **migrated off to Azure** — it is
> **prior-era / historical** and is **no longer the system of record**; its Power Platform footprint was
> **deprovisioned 2026-06-27** (the Dev sandbox, Code App, both solutions, custom connectors and the
> remaining `case-resolve` flow were deleted via `pac admin delete`; `CollisionSpike.zip` cold-exported off-repo).
> The **domain + workflow are unchanged** (intake → parse → review → enrich → EVA + Box; the EVA 12-field
> contract; image rules; the provider corpus; the `Principal+YY+seq` Case/PO format) — only the **platform
> mechanism** changed. The dated **🔔 Update —** build log is preserved verbatim under
> [Historical — Power Platform era (prior build)](#historical--power-platform-era-prior-build) below.

This is the M1 case-intake spike. The live deployment serves **read + manual case-create**, and
**automated email intake is LIVE** — `cespk-orch-dev` runs Microsoft Graph **PUSH** change-notification
subscriptions over the **production mailbox set info@ + engineers@ + desk@** (mailbox cutover finished
2026-06-29; the test/dev mailbox `digital@` was removed), kept alive by the durable renewer. Manual
case-create remains available alongside. Subscription/mailbox state: the registry
[docs/architecture/live-environment.md](./docs/architecture/live-environment.md). **Principle: no
mock/seed case data in the app — it shows real rows only.**

> **🔔 2026-07-04 — Audit case-type ACTIVATED LIVE: D9/D10 applied, all four surfaces redeployed at
> `aafeba1`, `AUDIT_CASES_ENABLED=true` on both apps (TKT-056 / ADR-0021).**
> User-instructed full go-live ("flip things to true now" — the shadow-review window was explicitly
> waived). Live counts/gate values stay in the registry
> [docs/architecture/live-environment.md](./docs/architecture/live-environment.md) — not repeated here.
> - **The "EVA (Engineers)" provider leak is dead in production**: parser **engine-v2.6** suppresses the
>   engineer-report layout-name fallback, the Data API denylists those names, and the **D9** delta apply
>   proved the live corpus **never held an EVA `work_provider` row** (a verified no-op — the mislabel
>   was code-only, not data). [docs/gated.md](./docs/gated.md) D9.
> - **D10 applied**: `choice_case_type` now carries all 4 rows (`standard`/`audit`/`audit_total_loss`/
>   `diminution`); `choice_evidence_kind` `engineer_report` confirmed. Applied **before** the flip, per
>   the delta's deploy-order warning. [docs/gated.md](./docs/gated.md) D10.
> - **Deployed at `aafeba1`**: parser (engine-v2.6 + the `case_type` envelope + `AP.`/`D.` marker refs),
>   api (marker-aware per-marker Case/PO mints, `case_type_code` writes, staff `PATCH caseType`), orch
>   (`MAX_PARSE_DOCS=3` multi-doc parse with extraction-first instruction selection, `engineer_report`
>   evidence typing), and the SPA (also carries the `16e152c` dashboard cockpit fix; CSP re-verified).
> - **Acting behaviour now**: PCH/QDOS standalone audit instructions mint from the marker's own
>   sequence (`A.PCH26xxx`…); QDOS dual "report + audit report" letters keep the standard number with
>   case-type `audit` (A./AP. ID derived at review); the attached EVA/CNX report persists as
>   `engineer_report` evidence, never as the instruction.
> - **Remaining**: the TKT-056 step-6 **live probe** on the next real audit email; TKT-057 still wants a
>   real inbound **diminution instruction email** (+ a standalone a.qdos email if one exists) from the
>   user — `D.` detection stays review-first until grounded.

> **🔔 2026-07-03 (second wave) — Rules-engine-v2 fully ACTING: D7/D8 DDL applied, parser redeployed on
> taxonomy-v2, all four `TRIAGE_*` gates live.**
> User-instructed ("switch on anything not on yet"). Live counts/gate values stay in the registry
> [docs/architecture/live-environment.md](./docs/architecture/live-environment.md) — not repeated here.
> - **D7 (taxonomy DDL) + D8 (identification seed) + the Phase-4 `ai_suggestion.embedding` delta — all
>   APPLIED LIVE.** Verified: the new choice codes, the two `inbound_email` columns, the Connexus
>   intermediary row + its PCH/SBL links, and PCH's `pch-ltd.com` domain. See
>   [docs/gated.md](./docs/gated.md) D7 / D8.
> - **Parser REDEPLOYED** (3 functions re-verified) — now runs the **taxonomy-v2 engine** plus the
>   2026-07-03 email-classifier hardening (chase-phrase narrowing, `Re:`-reference false-reply guard,
>   ref-extraction fixes, an `images_received`-before-reply-query rung).
> - **All four `TRIAGE_*` gates flipped `true`** on `cespk-orch-dev`
>   (`TRIAGE_REF_GATE_ENABLED`/`TRIAGE_CANCELLATION_ENABLED`/`TRIAGE_IMAGES_ROUTING_ENABLED`/`TRIAGE_CASE_UPDATE_ENABLED`)
>   — the triage policy is now **ACTING**, not shadow-only. Tickets TKT-023/041/043/046 move from
>   "built, gated off" to **active** (TKT-041's hold-language edge case still needs an operator taxonomy
>   decision — [docs/tickets/BOARD.md](./docs/tickets/BOARD.md)).
> - **Provider-domain corrections** — seed `916_provider_domain_corrections.sql` Section A applied
>   (FW/TEN/AX/BC/DFD/BLACK `known_email_domains` corrected; PHA/Parkhouse insert stays operator-confirm
>   — [docs/gated.md](./docs/gated.md) D3).
> - **Exchange `Mail.ReadWrite` grant IN PROGRESS** (device-code sign-in with the operator under way) —
>   the operator's live Outlook-move test is next once it lands ([docs/gated.md](./docs/gated.md) B4).

> **🔔 2026-07-03 — Nine-task activation: provider API intake channel shipped; Outlook-move,
> plate/scanned-PDF OCR, and email-AI gates flipped live; Azure Maps / location-assist live.**
> All user-instructed. Live counts/gate values stay in the registry
> [docs/architecture/live-environment.md](./docs/architecture/live-environment.md) — not repeated here.
> - **Provider API intake channel (TKT-055, ADR-0020)** — api + SPA deployed: a Superuser mints
>   per-provider keys in Admin's Provider settings; providers `POST` cases + Base64
>   instructions/images to a new `X-Api-Key`-authed route. The DDL delta is applied (new
>   `provider_api_key` table, RLS + policies); the no-key/bad-key **401** fail-closed smoke passed.
>   Still pending: the first key mint + an end-to-end submit. Spec:
>   [docs/reference/provider-api-intake-spec.md](./docs/reference/provider-api-intake-spec.md).
> - **`OUTLOOK_MOVE_ENABLED` flipped `true`** on both apps — the SPA's "File to …" buttons are now
>   live, but a click will **403** until the operator adds the Exchange-RBAC `Mail.ReadWrite` grant
>   (the gate flip is step 3 of 4; steps 1–2 + the operator's own live test remain —
>   [docs/gated.md B4](./docs/gated.md)).
> - **Plate OCR + scanned-PDF OCR flipped live** on orchestration (`PLATE_OCR_ENABLED`,
>   `OCR_SCANNED_PDF_ENABLED` — a new parse-activity fallback: PDF instruction + empty extraction →
>   OCR → coalesce).
> - **`EMAIL_AI_ENABLED` flipped live** on orchestration (Phase 4 of rules-engine-v2, this session's
>   instruction serving as the G5/E2 production sign-off) — the known spec gap (honouring
>   `work_provider.ai_allowed`) was closed and deployed **first**: an explicit `false` now skips the
>   model call with reason `provider_ai_opt_out`. Keyless via the orch managed identity.
> - **Azure Maps / location-assist is live** — new Maps + Vision + a location-suggest Function App
>   resource set; a live smoke returned ranked candidates from text clues. Photo-based candidates
>   still use a stub (the Box byte-fetch wiring is unbuilt cross-app work).
> - `BOX_EMBED_ENABLED` / `BOX_METADATA_ENABLED` / `COPILOT_ENABLED` retired from code (scrapped
>   ideas — were never live-set).

> **🔔 2026-07-02 — Rules Engine v2 build complete (all six phases); api/orch/SPA deployed live;
> deploy + data + gate flips are the remaining operator activation path.**
> Full build checklist: [rules-engine-v2-build.md](./docs/plans/phase-8-inbox-management/rules-engine-v2-build.md);
> plan: [rules_engine_v2_plan_9ba034c4.plan.md](./docs/plans/rules_engine_v2_plan_9ba034c4.plan.md);
> per-ticket disposition: **[docs/tickets/BOARD.md](./docs/tickets/BOARD.md)**. Live counts/gate values
> stay in the registry [docs/architecture/live-environment.md](./docs/architecture/live-environment.md)
> — not repeated here.
>
> **LIVE now (acting, not just deployed):**
> - The `/classify-email` **contract pass-through** (`attachment_filenames`, `body_jobref`,
>   `conversationId`) — deployed and live-probed.
> - The Stage-B triage-policy's **shadow-decision telemetry** — every arrival logs a `triage_decision`
>   App Insights `customEvent` (would-be action with all gates forced on) regardless of gate state; the
>   **acting** path stays `proceed_default` (today's routing, byte-for-byte) because all four
>   `TRIAGE_*` gates are absent.
> - The **suggestion + detach surfaces**: `ai_suggestion`'s `case_link`/`cancellation` lifecycle,
>   `POST /api/inbound/{id}/detach`, and the SPA accept/reject + unlink affordances — live, but a
>   suggestion can only ever be *created* once a `TRIAGE_*` gate is on, so this surface is currently
>   honest-empty in production.
> - The non-inline **signature-image raster floor** (TKT-047) — live on `cespk-orch-dev`.
> - **Identification mapping** — the parser's content-detected provider string now maps to a real
>   `work_provider_id` at `caseResolve` (TKT-051's headline example fixed); the Connexus→PCH/SBL
>   intermediary *data* still needs an operator seed apply (see BUILT-GATED).
> - SPA **"why this label?"** handler-language reasons + the **source-mailbox chip filter** (TKT-025).
>
> **Superseded 2026-07-03 (second wave) — every item in this "BUILT — GATED OFF" list below is now
> applied/deployed and ACTING live** (see the newer banner above); kept verbatim as the build-vs-activate
> historical record.
>
> **BUILT — GATED OFF (code/data authored and, where noted, deployed, but not yet acting live) — as of 2026-07-02:**
> - **Taxonomy v2** (`case_update` + `cancellation` categories, `images_received` subtype,
>   `body_jobref`/`conversation_id` columns) — DDL delta authored, not applied.
> - The **taxonomy-v2 parser engine** (cancellation/case_update rules, content-based attachment
>   typing, the externalised `triage-rules.json`) — built and vendored, not yet deployed to the live
>   parser Function (blocked on the DDL above, by design — see the build checklist's Deploy order).
> - The **ref-gate / cancellation-action / images-routing** behaviours inside the Stage-B triage
>   policy — code deployed, but each waits on its own default-off `TRIAGE_*` app-setting.
> - The **Stage-C AOAI triage assist** (a real, keyless Azure OpenAI structured-output call replacing
>   the dormant stub) — deployed gated off; `EMAIL_AI_ENABLED` is unset.
>
> **Activation order** (see [docs/gated.md](./docs/gated.md) for the full detail behind each step):
> the DDL delta apply → the taxonomy-v2 parser deploy → the identification seed-data apply → the
> per-behaviour `TRIAGE_*` gate flips → the `EMAIL_AI_ENABLED` production flip (needs the AI
> per-gate sign-off). **✅ This entire sequence completed 2026-07-03** — see the second-wave banner above.

> **🔔 2026-07-01 — work-todo-spike delivery wave + Box archive re-verified.**
> Granular ticket state (Done / Now / Backlog): **[docs/tickets/BOARD.md](./docs/tickets/BOARD.md)** — do not
> duplicate here. Highlights this pass:
> - **Box evidence archive** — **VERIFIED-LIVE** ([TKT-003](./docs/tickets/done/TKT-003-box-sync/TKT-003-box-sync.md)):
>   intake copies `.eml`, instructions, and images into the case Box folder via `boxArchiveEvidence`
>   (post-2026-07-01 regression fix).
> - **Provider automation modes** enforced in orchestration ([TKT-013](./docs/tickets/done/TKT-013-automation-mode/TKT-013-automation-mode.md)).
> - **SPA** — amalgamated dashboard, calendar date fields, acme placeholder removed
>   ([TKT-007](./docs/tickets/done/TKT-007-amalgamated-dashboard/TKT-007-amalgamated-dashboard.md) /
>   [TKT-008](./docs/tickets/done/TKT-008-calendar-date-fields/TKT-008-calendar-date-fields.md) /
>   [TKT-014](./docs/tickets/done/TKT-014-acme-placeholder/TKT-014-acme-placeholder.md)) — offline-tested;
>   live SPA click-through still open where noted on the board.
> - **Ticket system** live ([TKT-019](./docs/tickets/done/TKT-019-ticket-system/TKT-019-ticket-system.md)).

> **🔔 2026-06-28 — Box is now LIVE (JWT Server Auth); auth + gates reconciled.**
> The single forward worklist is **[ROADMAP.md § Now / Next / Later](./ROADMAP.md)** (start there). This session:
> - **Box** is **JWT Server Auth** (not CCG) and is **LIVE**: the `941197_re7d6t50_config.json` `Config.JSON`
>   is now stored as the Key Vault secret **`box-config-json`** in `cespkboxkvv76a47`, wired into the
>   **`BOX_CONFIG_JSON`** app-setting on `cespkbox-fn-v76a47` as a `@Microsoft.KeyVault(...)` reference.
>   The live smoke-test **`GET /api/box/folders/392761581105/items` → HTTP 200** (lists folder
>   `CCPY26050`). **Root cause of the earlier 502 was a STALE DEPLOYMENT**, not just missing creds: the
>   active box-fn deploy (2026-06-27 01:00) predated the JWT/`BOX_CONFIG_JSON` code (commit `5eac80e`,
>   2026-06-28 17:55), so it minted via the old CCG path and Box rejected it — fixed by **redeploying
>   box-fn** from the repo. `BOX_*` gates are now set on **`cespk-api-dev` + `cespk-orch-dev`**
>   (`BOX_API_ENABLED`/`BOX_FOLDER_AT_INTAKE_ENABLED`/`BOX_FILEREQUEST_ENABLED`/`BOX_FOLDER_ROOT_ID`;
>   `EMBED`/`METADATA` left off). The old "vault empty, no Box creds yet" lines below are **superseded** —
>   the vault now holds `box-config-json` (load-bearing) plus the pre-existing webhook keys. See
>   **[docs/azure/box-activation.md](./docs/azure/box-activation.md)** and
>   **[docs/handoff/02-box-activation.md](./docs/handoff/02-box-activation.md)**.
> - **Email pipeline** — triage-first classify + body-only instructions are wired; the parser
>   **`/classify-email`** route is redeployed (live alongside `/parse`). Go-live still needs the
>   Exchange-RBAC `Mail.Read` grant on the intake mailboxes (prod = **info@ + engineers@ + desk@**).
> - **Blocker:** the Azure CLI session token expired — `az` + the MCP credential chain both 401; an
>   interactive **`! az login`** is required before any further live Azure change.

---

## Snapshot — Azure PaaS stack (live state)

> **Live numbers** (function counts, table/corpus counts, mailbox set, subscription/subscription-state) are
> **NOT duplicated here**. Single source: [LIVE_FACTS.json](./LIVE_FACTS.json), mirrored in the canonical
> registry [docs/architecture/live-environment.md](./docs/architecture/live-environment.md).

The live deployment runs in Azure resource group **`rg-collisionspike-dev`** (region **uksouth**) under an
**Azure Free Trial** subscription. The frontend — Static Web App **`cespk-spa-dev`** (React/Vite from
`mockup-app/`, **MSAL / Entra workforce sign-in**, staff-only) — talks to the Data API (Function App
**`cespk-api-dev`**, Node/TypeScript Functions v4) over **REST** (`mockup-app/src/data/rest-client.ts`):
there is **no Power SDK and no Dataverse** on the live path — **Postgres** (**`cespk-pg-dev`**, v16) is the
system of record. The **orchestration** Function App (**`cespk-orch-dev`**) has **email intake LIVE** —
Graph **PUSH** change-notification subscriptions over the **production mailbox set info@ + engineers@ +
desk@** (all Exchange-RBAC-scoped; mailbox cutover finished 2026-06-29, test mailbox digital@ removed),
kept alive by the durable renewer (`subscriptionMonitorOrchestrator`); manual case-create remains
alongside. The **retained Python Functions** (parser
**`cespike-parser-dev`**, enrichment, evasentry, evavalidation, ocr, box-webhook), the **Key Vaults**,
evidence Blob **`cespkevidstdev01`**, and App Insights / Log Analytics are unchanged from the prior era.
**Box is LIVE** (JWT Server Auth) as of 2026-06-28.

Per-component status + live IDs/counts (SPA, Data API, orchestration, Postgres, retained Functions) — function counts, corpus counts, mailbox set, Graph subscription/RBAC state, feature-gate values: see the live registry [docs/architecture/live-environment.md](./docs/architecture/live-environment.md) (single source: [LIVE_FACTS.json](./LIVE_FACTS.json)).

> **⚠️ This subscription is an Azure _Free Trial_** (quotaId `FreeTrial_2014-09-01`). **The whole stack
> will be disabled at the ~30-day mark** unless it is upgraded to **Pay-As-You-Go**. (The 12-month free
> Postgres Flexible Server allowance survives the upgrade.) This is a hard deadline, not a soft gate.

**Auth / identity.** Entra **workforce** sign-in via MSAL. The two enforced app roles (**`CollisionSpike.User`
/ `CollisionSpike.Superuser`**) map the **two** former Dataverse security roles — **`CollisionSpike.Superuser`**
is the full-privilege (settings / feature-gates / audit / corpus-write) role, **renamed from
`CollisionSpike.Admin`** (same app-role id, so the existing assignment carried over; the legacy name is still
accepted for back-compat). A third role **`CollisionSpike.Engineer`** is **defined but NOT yet enforced** (a
placeholder for future assessment/engineer functionality). **Interim staff set assigned 2026-07-10
(operator-directed):** digital@ (Superuser) plus **desk@ / info@ / engineers@** (`CollisionSpike.User`) —
4 assignments total; accounts must sign out/in for tokens to carry the role. Any other staff member still
receives **403** until an admin assigns them a role (state: registry + gated.md C1).

**Intake auth model — Exchange RBAC for Applications + Graph PUSH subscriptions (NOT Global-Admin consent,
NOT delta-poll).** The intake path uses **Exchange RBAC for Applications**: an **Exchange Administrator**
grants the intake app **resource-scoped** Graph mailbox roles (`New-ServicePrincipal` / `New-ManagementScope`
/ `New-ManagementRoleAssignment`) — **no Global-Admin tenant consent** — and intake reads mail via **Graph
change-notification (PUSH) subscriptions** (one per Inbox, pushing to `…/api/graph-webhook`). _(This
supersedes any earlier note that Graph `Mail.Read` needs Global-Admin consent **and** any earlier
"delta-poll, no push subscription" wording — the live transport is PUSH.)_ Live subscription/RBAC state +
mailbox set: the registry [docs/architecture/live-environment.md](./docs/architecture/live-environment.md).

### ⚠️ Honest known gaps (live state — stated, not papered over)

1. **Email intake is LIVE on the production mailbox set.** `cespk-orch-dev` runs Graph **PUSH**
   subscriptions over **info@ + engineers@ + desk@** (all Exchange-RBAC-scoped; the 2026-06-29 mailbox
   cutover added info@ + desk@ and removed the test/dev mailbox digital@; subscription state in the registry
   [docs/architecture/live-environment.md](./docs/architecture/live-environment.md)).
   ✅ **Graph renewal RESOLVED (2026-06-29):** subscriptions are kept alive by a Durable eternal orchestration
   (`subscriptionMonitorOrchestrator` — a durable timer wakes the scale-to-zero FC1 app, which a plain
   NCRONTAB timer can't); the `graph-renew` timer is retained as a backstop. **Operator watch:** confirm an
   unattended renew at the next ~6h durable-timer wake (a `graph-renewal-success` trace with no manual
   trigger; see [docs/gated.md](./docs/gated.md)). Remaining for hardening: set `EVIDENCE_BLOB_CONNECTION`
   (prefer MI), assign the orch MI an app-role on the Data API, wire the Azure Monitor heartbeat alerts, and
   add a subscription-**prune** step (`runSubscriptionMaintenance` creates+renews but doesn't yet delete a
   subscription for a mailbox removed from `GRAPH_INTAKE_MAILBOXES` — why digital@ had to be deleted by hand).
   Some residual `graph-webhook` `499`/cold-start aborts remain (Graph retries absorb the misses).
2. **DB admin creds + RLS bypass — RESOLVED (2026-06-26).** The Data API now connects to Postgres as the
   **non-owner login `cespk_app`** (`rolsuper=false`, `rolbypassrls=false`), with its password held as a
   **Key Vault reference** (no cleartext), so the authored **Row-Level Security is now enforced** (the prior
   server-admin `csadmin` connection, as table owner, bypassed it). The DB app-role is set per connection via
   `-c app.role=staff` (the `PGAPPROLE` app-setting); grants are least-privilege — no DELETE on any table, and
   `audit_event` is INSERT/SELECT only (append-only). **Secret-exposure sweep — RESOLVED (2026-06-27):** the
   remaining plaintext exposures were also remediated — `GRAPH_CLIENT_SECRET` rotated into Key Vault
   (`cespk-pg-kv-dev/graph-client-secret`, orch managed identity granted **Key Vault Secrets User**); both
   Function Apps' storage moved to **identity-based** (`AzureWebJobsStorage__accountName` + system-assigned MI,
   `allowSharedKeyAccess=false`, MIs granted Storage Blob Data Owner — orch also Queue/Table Data Contributor
   for Durable); `DOCINTEL_KEY` neutralized (Document Intelligence local-auth disabled, ocr MI on the keyless
   **Cognitive Services User** path); and the retained parser/enrich/box function keys moved to Key Vault
   references. Only `APPLICATIONINSIGHTS_CONNECTION_STRING` (not a secret) and the platform-managed
   `WEBSITE_AUTH_ENCRYPTION_KEY` remain as plaintext config — acceptable, no action.
3. **Free-Trial → PAYG deadline.** The whole stack disables at the ~30-day Free-Trial mark unless
   upgraded to Pay-As-You-Go (see the banner above).
4. **Staff app-role assignment incomplete.** Only one principal is assigned; all other staff **403**
   until assigned a `CollisionSpike.User` / `CollisionSpike.Superuser` role.
5. **Auth hardening in progress.** Durable auth error-handling and `aud` (audience-form) hardening are
   still being finalised.

---

## Historical — Power Platform era (prior build)

> **Everything below this line describes the PRIOR Power Platform implementation** (Power Apps Code App
> + Dataverse + Power Automate + custom connectors), which has since been **migrated to the Azure PaaS
> stack above** (the Power Platform footprint was **deprovisioned 2026-06-27** — the Dev sandbox deleted via
> `pac admin delete`). It is preserved **verbatim, as a dated build log** — valuable for
> provenance and for the domain / EVA / provider / workflow detail it captures — but it **no longer
> describes the live system**. Treat every "live / deployed / applied live / activated" statement in
> this band as **true of the Power Platform era only**. The **domain rules** it records (the EVA 12-field
> contract, image rules, the provider corpus, the Case/PO format, the dedup / status machine) **remain
> authoritative**; the **platform mechanism** it records (Dataverse tables, `cr1bd_*` columns, Power
> Automate flows, the `BOX_*` / `cr1bd_*` env-var gates, `pac code push`, the `Collision Engineers - Dev`
> Sandbox) is **historical**.

---

## 🔔 Update — 2026-06-26: Phase 8 (Inbox / Triage Management) COMPLETED OFFLINE on a branch (gated-OFF / activation-pending — NOT live)

Phase 8 (ADR-0015 — email triage / **full-inbox** management) is now **built + verified offline** on branch
`feat/phase-8-inbox-management` (PR pending). Phase A was already minted in the 2026-06-24 SDLC sweep; this
work **closed the wiring gaps** and added the **Phase-B Code App screen**:

- **Intake restructure (offline)** — `intake.definition.json` + `intake-shared-mailbox.definition.json`
  flipped to **triage-first**: the trigger now fetches **all** mail (`fetchOnlyWithAttachment` /
  `hasAttachments` → `false`), Message-ID dedup also probes **`cr1bd_inboundemail`**, a **`Run_triage`**
  child + a **`Switch(category)`** route work to the unchanged Case chain (`Create_case` moved under
  `receiving_work`) with case-id write-back; **reconcile-up-to-live** (`Run_case_resolve` / `Run_enrich`)
  folded in + documented in `intake-restructure-notes.md`.
- **Dataverse** — added the **`cr1bd_EMAIL_AI_ENABLED`** dark gate (default-OFF, Phase-C LLM) via
  `26-inbound-email.ps1` Step 6, locked in `verify-parity.mjs`; the `cr1bd_inboundemail` table + 2
  choicesets + audit actions (`inbound_classified` 100000024 / `inbound_routed` 100000025) confirmed complete.
- **Code App** — new faceted **`/inbox`** Inbox/Triage screen (receiving_work | query | other + an Other tab),
  body preview + open-in-mailbox pointer + reclassify, over a new InboundEmail **data seam** that stays
  **honest-empty** under the live Dataverse source until the table is wired (the "no mock/seed case data on
  the live path" principle holds).
- **Parser** — `/classify-email` + the deterministic classifier verified green; vendored↔sibling in sync.

**Verified offline:** pytest **126** · vitest **383** · `npm run build` green · validate-flows **181/181** ·
verify-parity **all passed**. Live activation (trigger flip, schema `-Apply`, `pac code add-data-source`,
child-flow rebind, single-inbox soft-rollout) is **operator-gated** — full G1–G7 list in
[docs/plans/phase-8-inbox-management/IMPLEMENTATION-PLAN.md](./docs/plans/phase-8-inbox-management/IMPLEMENTATION-PLAN.md)
§gated-activation and [docs/gated.md](./docs/gated.md).

---

## 🔔 Update — 2026-06-24: SDLC sweep — Phase-4a/8/9 subsystems + EVA/OCR/parser hardening BUILT OFFLINE (gated-OFF, deploy-pending — NOT live)

This entry records what the **SDLC sweep** added. **Everything here is built offline, gated-OFF, and the
operator activates** — none of it is live/active in any environment. (Per-item operator steps are in
[docs/gated.md](./docs/gated.md); the forward worklist is now [ROADMAP.md](./ROADMAP.md) — the old `OPEN_ITEMS.md` was merged in.)

**Earlier merges recorded here for the live-state docs (were absent):**
- **Phase-4a location-suggest subsystem (PR #23) — offline-built / deploy-pending.** The `functions/location-suggest`
  Function + the `cr1bd_inspectionaddress` save-path seam (`saveInspectionDecision`, honest no-op until the
  table is wired) + the `location_assist_confirmed=100000022` **reserved/forward-declared** audit action
  (no emitter yet). **ADR-0013 preserved** — no runtime address matcher; staff still pick per case.
- **ADR-0016 offline inspection-address corpus build (Proposed) — offline build only.** The vetted 2-year EVA
  full-address export (`fullevaexportinspectionaddresses.xlsx`) drives a **full-REPLACE** corpus build; all
  helper methods are **offline corpus-build only**, never a per-Case runtime resolver. Operator runs the
  destructive `16-seed -ReplaceSuggestions -Apply` (backup-first); ADR-0016 stays Proposed.

**This sweep's additions (all offline / gated-OFF / deploy-pending):**
- **Phase 1a — parser engine re-vendored.** The 8 drifted engine-core modules were re-cut byte-identical from
  sibling `af98383`; the vendored-engine **drift guard `test_engine_vendored_in_sync.py` is now GREEN**; parser
  pytest passing. Sibling untouched. (The committed parser function-key literal in the activation doc was also
  **scrubbed** to `<set at activation>`; the live key still needs **rotation** — gated.md §7.)
- **Phase 3 — `status-evaluate` repointed onto `shared_evavalidation/ValidateCase`** (flow `state=off`): the 5
  inline readiness actions were replaced by the `Validate_readiness` connection call. **`finalize-eva-box`
  EVA-REST branch now streams photos** (PhotoEntry per photo, reusing the loop's bytes). Plus the **EVA drift
  gates** — a TS-side readiness parity vitest and the cross-transport drag-drop↔REST 12-field byte-identity test.
  EVA still gated **OFF**; the EVA-validation custom connector import + `cr1bd_evavalidation` bind remain operator.
- **Phase 5 — gated OCR fallback wired into `parse.definition.json`** (when extraction is ~empty AND
  `cr1bd_OCR_SCANNED_PDF_ENABLED`, call OcrPdf and re-prefill via `coalesce(OCR, parser)`; off-path unchanged) +
  the `cr1bd_OCR_SCANNED_PDF_ENABLED`/`cr1bd_PLATE_OCR_ENABLED` (default false) + `cr1bd_VALUATION_API_BASE`
  env-var promotions, parity-locked. Operator imports/binds the OCR connector + flips the gate.
- **Phase 8 — inbound-email classifier + triage subsystem (ADR-0015 Proposed).** A deterministic
  `email_classifier.py` (authored in the sibling + re-vendored byte-identical; drift guard GREEN) + the
  `POST /classify-email` route; the `cr1bd_inboundemail` table + 2 choicesets + `inbound_classified=100000024` /
  `inbound_routed=100000025` audit actions + `26-inbound-email.ps1` + verify-parity; the `triage-classify` flow
  (`state=off`) + `ClassifyEmail` op (never auto-links on ambiguity); a labelled triage corpus. **The live
  intake restructure is operator** (gated.md).
- **Phase 9 — data-governance subsystem (ADR-0017 Proposed).** The retention-clock schema +
  `cr1bd_CASE_DISPOSITION_ENABLED` gate + `27-retention-schema.ps1`; the scheduled `case-disposition` flow
  (`state=off`, far-future startTime, anonymise-by-NULL, **zero Box ops / zero DeleteRecord**) +
  `case_disposed=100000026`; the 3-role least-privilege security model as schema-as-code (`dataverse/roles/` +
  `28-roles.ps1`, create-not-assign); **bicep store-hardening** (KV purge-protection on 4 vaults + Blob
  soft-delete/versioning on all 6 Function-host templates) — IaC half only, **the live evidence-bytes store
  `cespkevidstdev01` is NOT in the IaC and is an operator apply**; governance docs (`data-protection.md` +
  the DSAR/erasure cross-store runbook). ADR-0017 stays Proposed; the policy/legal inputs are operator/legal.
- **Phase 6 — `verify-all.mjs` widened + boundary gate.** The pytest loop now covers **every** built Function
  suite (location-suggest/box-webhook/ocr SKIP locally without a `.venv`), and a new **static boundary grep-gate**
  forbids raw `fetch`/XHR/external-service-host literals in `mockup-app/src` outside the connector seam.
  `verify-all` no longer reports a fixed "7/7" — use **"all gates green"**.

---

## 🔔 Update — 2026-06-23: observability consolidated · enrichment secrets → Key Vault · mileage provenance marker (S1) live

Three live hygiene/correctness changes, all verified live:

- **Observability consolidated (S4).** Previously each Azure Function carried its **own** App Insights + Log
  Analytics workspace (7 AI + 7 LAW, including an orphaned managed enrich workspace). Now the **4 FC1 Function
  Apps** — enrichment (`cespkenrich-fn-gi62sd`), eva-sentry
  (`cespkeva-fn-ufa3ci`), evavalidation (`cespkeval-fn-6c6fxd`), box-webhook (`cespkbox-fn-v76a47`) — send
  telemetry to the **shared** parser App Insights `cespike-parser-ai-dev` + workspace `cespike-parser-law-dev`
  (their `APPLICATIONINSIGHTS_CONNECTION_STRING` repointed). **Deleted:** the 4 per-app App Insights
  (`cespkenrich/eva/eval/box-ai-*`), 3 per-app LAW (`cespkeva/eval/box-law-*`, soft-deleted/14-day
  recovery), and the orphaned managed enrich workspace `managed-cespkenrich-ai-gi62sd-ws` + its hidden RG.
  **Remaining App Insights/LAW in `rg-collisionspike-dev`:** only the shared pair (`cespike-parser-ai-dev` +
  `cespike-parser-law-dev`) and the **OCR pair** (`cespkocr-ai-dev` + `cespkocr-law-dev`). **OCR is NOT
  consolidated** — it is a scale-to-zero Functions-on-ACA host where a surgical repoint is unsupported; the
  bicep change for it is **staged on main for OCR's next deploy**. Net: 7+7 → a shared pair + the OCR pair.
- **Enrichment secrets → Key Vault (S3).** The enrichment Function's `DVSA_CLIENT_ID`/`DVSA_CLIENT_SECRET`/
  `DVSA_API_KEY`/`DVLA_API_KEY` are now `@Microsoft.KeyVault` references (status=Resolved) resolving from
  **`cespkenrichkvgi62sd`** (now populated; functionally verified — a live enrichment test returned **200**).
  Previously they were **plain-text app settings** while the vault was empty — closing both the cleartext
  hygiene deviation and the empty-vault redeploy timebomb. The EVA vault `cespkevakvufa3ci` + Box vault
  `cespkboxkvv76a47` remain **empty** (gated off, no creds yet). _(OCR's `DOCINTEL_KEY` stays a plain-text but
  **dormant/unused** app setting — `OCR_PROVIDER=tesseract`/`PLATE_PROVIDER=fast_alpr` run in-container, so
  Document Intelligence is not called; ACR image pull is managed-identity based, no registry creds.)_
- **Mileage provenance marker live (S1).** The live **CS Parse** and **CS Enrich** flows now write
  `cr1bd_fieldlevelprovenance` mileage rows: parse stamps `sourceType=pdf_extraction` / "From instructions";
  enrich stamps `sourceType=dvla_dvsa` / "Estimated mileage (DVSA MOT history)" **only when the document had
  no mileage** (document-first source priority).

---

## 🔔 Update — 2026-06-22: Phase 7 (Box-centric intake pivot) — schema + env-vars APPLIED LIVE (gates OFF) · box-webhook Function DEPLOYED gated-off (secret-free) · connector/flows authored offline · NOT activated

The **Box-centric intake pivot** (ADR-0012, additive hybrid) is **built in the working tree and
offline-verified**, and its **Dataverse schema + env-vars are now applied live in Dev** (verified via `az`
on 2026-06-22) — `cr1bd_case` carries the `cr1bd_box*` columns + `cr1bd_sourcemailbox`, `cr1bd_evidence`
carries `cr1bd_boxfileid`/`cr1bd_boxfileurl`, and every `cr1bd_BOX_*` env-var exists live with **every
`BOX_*` gate OFF** (default *and* current `false`). The **`box-webhook` Azure Function IS deployed** (gated off,
secret-free, Gate-C-verified — `cespkbox-fn-v76a47`). What is **NOT** done: the `cr1bd_box_rest` custom connector
and the Box cloud-flows are **authored offline (`state=off`), not imported/bound live**; no `BOX_*` gate is
flipped; no Box connection is bound; no Box secrets are in Key Vault; the `FILE.UPLOADED` webhook is not subscribed. Branch
`feat/phase-7-box-integration`. Binding decision:
[docs/adr/0012-box-centric-intake-additive-hybrid.md](./docs/adr/0012-box-centric-intake-additive-hybrid.md);
ordered build + reconciliations: [docs/HISTORICAL/box-integration-pivot/plans/00-BUILD-PLAN.md](./docs/HISTORICAL/box-integration-pivot/plans/00-BUILD-PLAN.md);
phase docs: [docs/plans/phase-7-box-integration/](./docs/plans/phase-7-box-integration/).

**What the pivot is.** Bring Box **earlier** (a per-Case/PO folder at **parse-confirm**, not only at
EVA-submit) and **deeper** (File-Request image chasers + a webhook that advances the case on upload),
**without moving the source of truth**. **Dataverse stays authoritative; Box is a one-way mirror**
(Dataverse → Box). Box Metadata has no joins, so dedup / status / Case-PO sequencing **never** run off
Box. The floor is **base Box Business** (folders, File Requests, webhooks, CCG); the **Business Plus**
metadata tier is **out of scope** now (a later, optional reliability upgrade for the orphaned image-only
path only). EVA stays gated **OFF** throughout; Box never gates EVA and EVA never gates Box. Evidence is **linked, not embedded** — a server-minted "Open in Box"
deep link; **no iframe, no `frame-src` edit** (`BOX_EMBED_ENABLED` stays reserved/off).

**Applied live + authored offline (the split):**
- **ADR-0012 + the docs spine** — ADR-0012 (Accepted 2026-06-21), the phase-7 plan folder
  (`README.md` + `box-custom-connector-and-webhook.md` + `box-integration-activation.md`), and the
  architecture §Box updates.
- **Dataverse schema + env-vars — APPLIED LIVE in Dev (all `BOX_*` gates OFF)** — **5 `BOX_*` Boolean gates**
  (`BOX_API_ENABLED`, `…_FOLDER_AT_INTAKE_ENABLED`, `…_FILEREQUEST_ENABLED`, `…_EMBED_ENABLED`,
  `…_METADATA_ENABLED`, all default *and* current `false`) + **2 String config vars** (`BOX_FOLDER_ROOT_ID`,
  `BOX_FILE_REQUEST_TEMPLATE_ID`, default `""`); **9 case columns** on `cr1bd_case`
  (`cr1bd_boxfolderid`/`boxfolderurl`/`boxsyncedat`/`boxfilerequestid`/`boxfilerequesturl`/`sourcemailbox`
  + the finalize submit-signal columns) and **`cr1bd_boxfileid`/`cr1bd_boxfileurl`** on `cr1bd_evidence`;
  **3 audit-action options** (`box_folder_created=100000019`, `box_file_request_copied=100000020`,
  `box_upload_received=100000021`). `verify-parity.mjs` locks the new defaults; `dataverse/.build/25-box-schema.ps1`
  (adds the 9 case columns) is the apply script. **Verified live via `az` on 2026-06-22.**
- **Azure `box-webhook` Function (DEPLOYED gated-off, secret-free — `cespkbox-fn-v76a47`)** — `functions/box-webhook/` (the CCG
  token-mint inside the Function; the HMAC dual-key + 10-min-replay + `BOX-DELIVERY-ID`-dedup webhook
  receiver, which **processes the Dataverse fan-out on the request path and returns 200 when settled, or a
  non-2xx (503) on a transient failure so Box retries** — Box does not retry after a 2xx; the
  custom-connector OpenAPI under `openapi/`; the FC1 bicep under `infra/`). Durable dedup is the
  Evidence-existence check on the `box:file:<id>` tag in `cr1bd_sourcemessageid` (NOT `cr1bd_boxfileid`,
  which the webhook writes as a correlation/UI mirror only); the receiver also stamps `cr1bd_boxfileid` +
  `cr1bd_acceptedforeva=true` and audits with the canonical `cr1bd_name`/`cr1bd_occurredat`/`cr1bd_action`/`cr1bd_after`
  shape. **pytest 79 passed** (incl. the `test_scope_lock.py` BOX_ALLOWED_ROOT_ID assertions added this session). Secrets are Key Vault references only — created under the **hyphenated** names
  `box-client-secret`/`box-webhook-primary-key`/`box-webhook-secondary-key` (resolving into the
  `BOX_CLIENT_SECRET`/`BOX_WEBHOOK_PRIMARY_KEY`/`BOX_WEBHOOK_SECONDARY_KEY` app settings). The deployed Function carries these KV references, but vault `cespkboxkvv76a47` is currently **empty** — the secrets are injected post-deploy once CCG auth is authorized (REMAINING-STEPS.md).
- **Power Automate flows (authored `state=off`)** — new `box-folder-create`, `box-file-request-copy`
  (an authored **standby** child flow for FUTURE operator activation — **not** currently invoked by the
  Code App; the chaser path calls the connector op directly, see below), `box-blob-purge`; `finalize-eva-box`
  rewritten (folder pre-exists → **augments**, reads `cr1bd_BOX_FOLDER_ROOT_ID`, keeps the S2 byte path,
  becomes a Dataverse submit-signal-triggered flow, and now stamps `cr1bd_boxsyncedat` at `box_synced`);
  `box-blob-purge` only purges archived (accepted, non-excluded) **image** evidence (non-image transient
  bytes are retained — a deferred follow-up); `case-resolve` ensures the survivor's folder idempotently.
  `flow-state.json` + `validate-flows.mjs` extended; **flow linter 154/154**.
- **Connection-ref decision PINNED** — a **parallel `cr1bd_box_rest`** custom connector (CCG via the
  Function) carries folder-create + File-Request copy + shared-link + webhook lifecycle; first-party
  `cr1bd_box` (`shared_box`) is **RETAINED** for `finalize-eva-box`'s byte path (`CreateFile`). This is a
  **parallel ref, not an in-place repoint**; two Box connections coexist and the operator binds both. (The
  build plan's "one unpinned decision" is now closed.)
- **Code App (authored, SDK-free; pushed nowhere new for Box)** — `getBoxGates()` reads the same
  `environmentvariabledefinitions`/value rows the flows read (default all-false on failure); the submit
  dialog drives real `finalize-eva-box` via the Dataverse submit-signal; the chaser gains a
  `copy_file_request` action that calls the Box REST connector op **directly** (`CopyFileRequest` /
  `GetFolderSharedLink`, no flow in the path — the Code App runs under CSP `connect-src 'none'` and cannot
  POST to a flow Request URL, the pinned 2026-06-21 build-plan decision); Evidence gains a server-minted
  "Open in Box" deep link. **vitest 256 passed, `tsc -b` clean.**

**Free-account REST live-test (the only live touch — a throwaway Box account, OUT-OF-REPO creds).**
To de-risk the raw REST mechanics, a one-off test ran against a **free** Box account's dev token
(≈60-min lifetime) on a **throwaway folder**, which was created, exercised, and recursively deleted
(confirmed gone). **8/9 ops verified live:** `users/me` (200), `CreateFolder` (201; body
`{name, parent:{id}}`), `ListFolder` (200), `GetSharedLink` for **both** file and folder
(`PUT …?fields=shared_link` → `access=open` + url — both server-mintable under `connect-src 'none'`),
multipart Upload on `upload.box.com` (201), `GetFile` with `sha1` (200), recursive delete (204). The lone
failure is **expected and bounds testing, not the build**: `CreateWebhook` → **403 `insufficient_scope`**
(a free plan lacks `manage_webhook`; the request *shape* was accepted). **No secret was printed or
committed.** Not attempted on the free account (all need Business or higher): the **CCG `client_credentials`**
grant (known `unauthorized_client` on free), **File Requests**, **metadata** (the metadata field itself is
the Business Plus tier).

**What IS live vs what is NOT (the honest state):**
- ✅ The Phase-7 Box **Dataverse schema + env-vars ARE applied live** in Dev (the `cr1bd_box*`/`sourcemailbox`
  case columns, the `cr1bd_boxfileid`/`boxfileurl` evidence columns, the audit-action options, and all
  `cr1bd_BOX_*` env-vars) — **with every `BOX_*` gate OFF** (default and current `false`); `cr1bd_ENRICHMENT_ENABLED`
  is default `false` but current `true` (enrichment is live in Dev via the current value).
- ✅ The `box-webhook` Azure Function IS deployed (gated off, secret-free, Gate-C-verified — `cespkbox-fn-v76a47`); ❌ but its KV secrets are not provisioned, the `FILE.UPLOADED` webhook is not subscribed, and CCG auth is not authorized. ❌ The `cr1bd_box_rest` connector and the Box flows are authored
  offline (`state=off`), **not** imported/bound live; ❌ no live flow edit (incl. the intake `box-folder-create`
  invocation — that is an operator/business-phase live edit); ❌ no `BOX_*` gate flipped; ❌ no Box
  connection bound; ❌ EVA still gated OFF.
- ✅ A free-account demo (case **SBL26001**) proved the folder + upload + shared-link pattern **manually**
  (the always-on Box-account integration — CCG token mint, `FILE.UPLOADED` webhook, template File Request —
  is deferred to a future **Business-account** phase; the free test account cannot sustain CCG/webhooks/File-Requests).
- ⚠️ **REPO-TRAILS-LIVE (reconcile repo UP to live):** the `Run_enrich` and `Run_case_resolve` action cards
  **ARE deployed and running LIVE** but are **missing from** `flows/definitions/intake.definition.json` (and so
  is the `box-folder-create` invocation). The **live** intake is authoritative — a naive solution re-import
  **from** the stale repo def would **regress live**. The fix is to **reconcile the repo def UP to live** (needs
  a live flow export — operator-assisted) **before any import**; this is **NOT** "stuff isn't deployed". The
  Box-folder-create invocation from intake remains an operator/business-phase live edit, not yet applied to the repo def.

**The long pole is the BUSINESS-account second test phase (operator).** The free account cannot exercise
the service-identity path, so the **BLOCKING** verifications wait on a live Business tenant: the CCG token
mint + Admin-authorized Platform app, the hand-built template **File Request**, and — the single biggest
empirical unknown — the **File-Request → `FILE.UPLOADED`** webhook live-test. Primary recovery on a
transient failure is **Box's own retry** on the receiver's non-2xx (Box does not retry after a 2xx); a
timed `ListFolder` reconciliation sweep is **documented but not yet built** — a deferred secondary backstop.
Operator-gated items are in
[docs/gated.md](./docs/gated.md) item 5; the runbook is
[docs/plans/phase-7-box-integration/box-integration-activation.md](./docs/plans/phase-7-box-integration/box-integration-activation.md).

---

## 🔔 Update — 2026-06-21: enrichment gate ON · parser image-based fix (deployed) · job-sheet provider rules applied

- **DVLA/DVSA enrichment turned ON.** The sole cause of "enrichment didn't populate vehicle/mileage" was the Dataverse gate `cr1bd_ENRICHMENT_ENABLED=false`; the whole chain (CS Enrich ON, connector `cr1bd_dvsaenrich` Connected, function `cespkenrich-fn-gi62sd` Running with creds) was already built. Flipped the gate → live-verified the function returns vehicle data (`BC23JZE`→REXTON/SsangYong, `L333FGN`→BMW 220i). Mileage is an MOT-odometer estimate, so near-new vehicles legitimately return none. One-value revert. Memory: enrichment-activated.
- **Parser image-based inspection fix — DEPLOYED + live-verified.** The parser detected "Image-based/Desktop Assessment" wording but BLANKED it; CS Parse only re-defaulted for AX. Fixed in `cedocumentmapper_v2.0` engine: image-based/desktop statements now emit canonical "Image Based Assessment" (6-line EVA form; real addresses still win; junk still blanked) for ALL providers. pytest 54 passed. Redeployed `cespike-parser-dev-x7xt3d5ovhi7y`; `/api/parse` returns `inspection_address.value="Image Based Assessment"`. ⚠️ The parser lib is **vendored** in `functions/parser/` and had **diverged** from the sibling repo (vendored=B2 contact extraction, sibling=image-based fix) — 4 hunks ported; copies still need reconciling. Memory: parser-vendored-divergence.
- **CE job-sheet provider rules applied to the corpus.** Examined `raw/Backup of CE Job Sheet 260429.xlsm` (Principals, 58 rows). Mapped to `cr1bd_workproviders` and applied **write-into-empty** across 46 live rows: added `cr1bd_instructionnotes` + `cr1bd_reportreturnnotes` (~44 providers) + 2 missing mailboxes; existing `inspectionlocationpolicy`/`imagessourcenotes`/`defaultmailbox`/`dragintoeva` curation **preserved**. Multi-channel providers merged. Artifacts: `raw/principalandrepairersheets/outputs/jobsheet_rules/`.
- **Contradictions vs last-12-months EVA — none genuine (after the 2026-06-21 operator correction).** Multi-agent adversarial pass over 33 candidates → **33 REFUTE, 0 CONFIRM**. Key: EVA "Desktop Inspection" is a constant report-TYPE label (≈all CE work), NOT a modality signal — the real discriminator is **loc-rate** — so most "address vs desktop" conflicts are false positives. **Operator correction 2026-06-21:** that lone CONFIRM is **overturned** — RJS is **address-based, not image-based** ("Desktop inspection always goes on"; a high desktop-% is the constant report-TYPE, never a modality signal — whether the *location* is image-based is a separate axis). The job-sheet address note stands, so there are now **0 genuine contradictions**; the live RJS row was already `PreferAddress` (the intended `AlwaysImageBased` override never landed). Also to resolve: ZEN↔ZENITH, R1AM/MOTORX split, 4 no-live-row providers. Memory: jobsheet-provider-rules; detail in `contradictions.md`.
- **Housekeeping:** `docs/architecture/live-environment.md` refreshed (CS Classify/Parse/Status/Enrich OFF→ON, enrich connector Bound, gate true, InspectionAddress 871, cases cleared).

---

## 🔔 Update — 2026-06-20 (evening): intake bug-fix + 3-queue restructure + Case/PO + auto-merge + Hold
Operator-reported faults on a live **AX** instructions email (case `test6` → `AX26001`) → fixed and **verified live** (Code App via `pac code push`; live flows via the byte-identical-trigger technique). Branch `fix/parser-base64-tolerant-decode` (`71a9690`,`f6314a8`,`dcbabec`,`86629a1`).

- **Queues restructured 4→3: Not Ready / Review / Held** (`mock/queues.ts` + all consumers). Not Ready = arrived-but-incomplete (`needs_review`, `missing_*`, new/ingested, linked); Review = `ready_for_eva` only (human-in-the-loop); Held = `error` + `duplicate_risk` + a new **staff Hold** flag. Fixes "everything stuck in review". Verified (test6 in Not Ready).
- **Newest-first ordering** — `allCases` → `orderBy createdon desc`. Verified.
- **Provider-scoped address suggestions** — suggester + `providerCode` read `cr1bd_evaworkprovider` (the phantom `cr1bd_provider_code` never existed → had shown every provider). Verified (test6 Address tab = AX rows only).
- **Inspection address** — AX stays hardwired "Image Based Assessment" (correct) but was saving **blank** → blocked. `CS Parse` now defaults AX inspection_address to "Image Based Assessment" when the parser returns empty (live + repo); test6 backfilled. Non-AX stay blank → Not Ready.
- **`.eml` capture** — live `CS Intake` now saves the source email as `source.eml` evidence (`Init_attachmentsForChild`→`Scope_capture_eml`(`ExportEmail_V2`, raw bytes→`@base64`)→augmented attachments→classify). Trigger byte-identical. _Operator confirms: test email to digital@ → `source.eml` row._
- **Case/PO at intake** — instructions cases get `Principal+YY+seq` (e.g. `AX26001`) after parse (`Scope_generate_casepo`, parallel to enrich, failure-isolated); provider ref kept in `cr1bd_caseref`. test6 = `AX26001`.
- **Auto-merge by registration (ADR-0010 reactivated)** — `CS Case Resolve` repurposed: a single complementary instructions↔images same-VRM pair → survivor (Case/PO holder) absorbs the image evidence → re-evaluate → Review; >1 candidate → Held (`duplicate_risk`). Wired into intake after parse (non-blocking, trigger byte-identical). Provenance via `cr1bd_caselinkstate=Linked` + `cr1bd_duplicatekeys` memo (no case→case lookup exists). _Operator tests with a paired instructions+photos email for one reg._
- **Staff Hold** — new `cr1bd_onhold` boolean (CollisionSpike solution) + a Hold/Release button + "On hold" chip; on-hold cases route to Held (and out of the funnel). Verified live (park → Held 4/Not Ready 3 → released).

⚠️ Repo `intake.definition.json` still trails live on action wiring: the `Run_enrich` + `Run_case_resolve` cards **are deployed and running live but are missing from the repo def** — so a naive re-import **from** the repo would **regress live**. **Live is authoritative; reconcile the repo def UP to live** (live flow export, operator-assisted) **before any import**. Rollback backups for every live flow edit saved under `%TEMP%` (PATCH the saved `clientdata`).

---

## 🔔 Update — 2026-06-20 (later): Claude self-wired activation pass (operator lifted the boundary)
The operator authorised Claude to perform the gated activations directly ("wire up the activations
yourself"). EVA credentials stayed excluded by instruction; no test emails to non-digital inboxes.
Done + verified live by Claude (full table in [docs/gated.md](./docs/gated.md)):

- **Document Intelligence ONLINE (H14)** — OCR host wired (`DOCINTEL_ENDPOINT/KEY/API_VERSION`); DI Read proven (analyze 202 → poll → **succeeded**). tesseract/fast_alpr stay primary, DI = fallback.
- **InspectionAddress in the Code App (S13)** — hand-authored the per-table service (pac 2.8.1's connector-style output is incompatible with the seam), build green (217 tests), **`pac code push` succeeded** → Suggested-locations panel + Admin counts populate from 871 rows.
- **3 "images only" cases cleared (H13)** — re-evaluated on the **real FIX-3 tree**: `test`→**error** (unidentifiable, instruction-only), `test1`/`test3`→**needs_review**. Audit rows written. **Queue now empty.** (The note's blanket "→needs_review" was wrong for `test`; live data corrected it.)
- **Anchored provider match LIVE (H3)** — spliced `List_active_providers`+`Filter_exact_domain` into live `CS Intake`, removed the unanchored `contains()`; **trigger byte-identical** (webhook preserved), still activated. `.eml` Scope (H12) excluded. _Operator: a test email to digital@ confirms the webhook still fires._
- **Enrichment WIRED into the pipeline (H4)** — creds + DVSA Entra consent were already injected; a live `BC23JZE` lookup returned **SSANGYONG REXTON**. Then **fully wired live**: imported the `shared_dvsaenrich` connector, created + bound a function-key connection, reconciled CS Enrich (real connector + reads vrm/ref from the case + added the `Respond_to_flow` it needed to be a child flow), and **inserted `Run_enrich` into CS Intake** (chain is now classify→parse→**enrich**→status-evaluate, non-blocking, trigger byte-identical). `CS Enrich` is **ON**. ⚠️ _Repo flow defs (`intake`, `enrich`) now trail live — reconcile them so a solution re-import can't regress the wiring._
- **EVA-validation Function PROVEN (S12)** — `validate-case` returns correct `{fieldsValid,imagesValid,openIssues}` on real data. Flow cutover deferred (operator chose safe-only for the critical path).
- **CS Case Resolve OFF (S3)** _(superseded later the same day — the "evening" entry above repurposed it to merge-by-registration, turned it ON, and wired it into intake; auto-merge wiring verified live 2026-06-21)_, **suggested-address corpus refreshed (S14, 697 upserts)**, **architecture verified** (5 functions Running + OCR-on-ACA; EVA gated-off with KV-refs to missing secrets).

---

## 🔔 Update — 2026-06-20: M2 mega-build — milestone model, code hardening, Azure deploys, suggested-address corpus (branch `fix/parser-base64-tolerant-decode`)
A large plan-first, ms-docs-verified multi-agent pass, committed in slices. **All gates green: `node verify-all.mjs`** _(counts as-of 2026-06-20: Code App build + **vitest 217**, schema parity, **flow linter 116/116**, pytest parser **53** + enrichment **29** + ocr **36** + evavalidation **51**, + the no-`uploadFileToRecord` gate)_. **The gate set has since widened** — `verify-all` no longer reports a fixed "7/7": it now runs the Code App tsc+vite+vitest, Dataverse parity, the flow linter (currently **154/154**), a pytest loop over **every** built Function suite (parser/enrichment/evasentry/evavalidation + location-suggest/box-webhook/ocr — the last three SKIP locally without a `.venv`), and **two static gates** (the `uploadFileToRecord` regen guard + the **new boundary grep-gate**). Use **"all gates green"**, not a pinned number; live per-suite counts live in the registry [docs/architecture/live-environment.md](./docs/architecture/live-environment.md).

**Milestone clarity + plans** (`38e9c75`, `c20f41e`) — new **[docs/plans/milestone-model.md](./docs/plans/milestone-model.md)** is the authoritative two-axis Phase×Milestone map: the *"M2 = Phases 3–5"* shorthand that caused the M1/M2 overlap is **retired**; M0/M1/M2/M3 are capability slices that cut across phases (3b drag-drop EVA = M1, 3c REST = M2). **Valuation locked to M3** (ADR-0006). CLAUDE.md / ROADMAP / plans-README / phase-READMEs / m2-umbrella reconciled to it. Authored the 3 missing **M2 plans** (EVA-validation Function, enrichment-activation, Box-archival-pipeline) + Copilot Studio, WhatsApp coexistence, multi-inbox feasibility, image-storage-backends, and a dated architecture audit.

**Code** (7 slices `acf484c`…`adb3470`)
- **Dashboard "Submitted" overlap fixed** — funnel re-cut to live backlog depths; the lifetime total moved to the throughput strip as **"Sent to EVA (total)"** beside "Submitted today". + a11y (real funnel buttons, Fluent `Field required`), de-jargon, makeStyles, honest Admin counts.
- **`case-status.ts` mirrors the live FIX-3 evidence-aware tree** — kills the app↔flow drift (a re-save can no longer re-stamp "Images only").
- **Suggested-locations** — a new always-suggestions panel (rows tagged `cr1bd_sourcelabel='suggested:<status>'`, decisionMode=unknown, `[Use this address]`→manual; never auto-confirmed).
- **reg-OCR** connector hardened (strip `format:byte` + apiProperties + tolerant decode) + **S4** parser/OCR EVA-map equality. **Flows** — anchored provider match into `intake-shared-mailbox` + **S8** linter; `finalize-eva-box` **S2** content-bind + the **fictional Box `CreateFolder` removed** (real `CreateFile`+`folderPath`); `cr1bd_box` Premium→Standard. **Enrichment** verified vs real DVSA MOT + DVLA VES (+429 handling, no-secrets dry-run). **evavalidation** hardened (casing-tolerant + a fields-wrapped-Case bug fix) + TS↔Python parity gate. Hardening: parser-storage `allowSharedKeyAccess:false` (**S7**) + the `uploadFileToRecord` regen gate (**S5**).

**Live deploys** ([DEPLOY-WITH-LOGIN], dev sandbox `rg-collisionspike-dev` — all **gated-OFF, no credentials**)
- **Document Intelligence ONLINE** — `cespkdocintel-dev` (F0, `https://cespkdocintel-dev.cognitiveservices.azure.com/`), the OCR host's managed scanned-PDF fallback. Keyless until the operator injects KV `docintel-read-key` + flips `OCR_PROVIDER/PLATE_PROVIDER=docintel`.
- **EVA fully set up (no creds)** — **`cespkeva-fn-ufa3ci`** (evasentry, Sentry REST) deployed + **Running**, `EVA_API_ENABLED=false`; KV `cespkevakvufa3ci` holds **reference-only** secrets. Operator injects EVA **test** creds later (B5).
- **S7 runtime hardening applied** — parser (`cespikestx7xt3d`) + enrichment (`cespkenrichstgi62sd`) storage now `allowSharedKeyAccess=false`; both functions re-verified **Running** (MI-confirmed).
- **EVA-validation Function (M2.B) DEPLOYED + Running** — `cespkeval-fn-6c6fxd` (`/api/validate-case`). The initial FC1 plan-create was **rate-throttled** (a per-region ARM *write* limit re-tripped by the back-to-back deploys — NOT the 250-core memory quota, which excludes idle scale-to-zero apps); it cleared after a **20-min cooldown** → one clean deploy + publish. Remaining: only the `status-evaluate` connector repoint (designer, the M2.B activation).
- **Suggested-address corpus LOADED** — **697** InspectionAddress suggestion rows from the codexwork sheet (decisionMode=Unknown, never confirmed); 17-verify **ALL PASSED** (0 auto-confirm leaks, 0 confirmed-row downgrades). _(Dated 2026-06-20 snapshot — this 871-row interim total was later superseded; current counts in the registry [docs/architecture/live-environment.md](./docs/architecture/live-environment.md).)_ Re-run `16-seed -Apply` on a cadence as the sheet changes.

**Operator handoffs** (full detail in [docs/gated.md](./docs/gated.md))
- **3 "images only" cases** (`test`/`test1`/`test3`) are **stale pre-FIX-3 rows** (zero evidence) — **not** a provider-match bug. Re-run **CS Status Evaluate** with `{ "caseId": "<guid>" }` once each (safe manual-trigger child flow, idempotent, no webhook) → they move to **needs_review** and the "Images only" queue empties. GUIDs in gated.md (H13).
- **H3** anchored provider match still undeployed live — deploy the anchored block in the designer (keep the trigger byte-identical); for an H3-only deploy, strip FIX-4's `.eml` Scope (**H12**).
- **Document Intelligence key**, **EVA test creds**, the **InspectionAddress table-add** to the Code App (`pac code add-data-source`, so suggestions render), and the **continuous corpus re-run** are tracked in gated.md.
- Dashboard re-cut **visual** verification needs the authenticated Power Apps player (operator) — the re-cut is otherwise verified by the green build + 217 vitest; local chrome-devtools confirmed the shell/IA/console are clean.

---

## 🔔 Update — 2026-06-19 (later): pipeline fixes — parser path, categorization, audit, `.eml` (branch `fix/parser-base64-tolerant-decode`)
Four issues fixed via Explore→Plan with **Microsoft Learn** verification of every contract. Repo
committed in slices; the safe flow edits are **PATCHed live + verified** (CS Parse & CS Status Evaluate
are **manual-trigger** flows — `statecode` stayed 1, **no email webhook touched**):
- **FIX 1 — CS Parse drift + a reverted misstep.** Reconciled `cr1bd_vrm`/`cr1bd_caseref` (already
  live) into the repo. ⚠️ I also switched `body/document` to `@base64ToBinary(...)` per the
  then-current memory rule 2 — **that REGRESSED live intake**: `test34` got HTTP **400** (the gateway
  rejects binary in a plain-string param) → Exceptions. **Reverted** live + repo to the RAW base64
  string `@triggerBody()?['instructionBytesB64']` — the config `test1`/`test3` parsed on, and
  `test34`'s exact blob (`%PDF-1.7`) posts **200** straight to `/api/parse`. Memory + AGENTS.md +
  connector spec + tests flipped to **raw string, NEVER base64ToBinary**; the tolerant parser is the
  load-bearing safeguard.
- **FIX 2 — accurate failure audit.** `Audit_parser_failed.cr1bd_after` now reports the **real**
  `statusCode` + parser message (was hardcoded "parser 5xx/timeout"). Live **PATCH 204, verified.**
- **FIX 3 — categorization (the "Images only" mislabel).** `CS Status Evaluate` was **evidence-blind**
  (fields-first → any empty-field case became `missing_required_fields` → "Images only"). Rewrote it
  to be **evidence-aware** (`List_instruction_evidence` + `instructionCount` + `hasIdentity`):
  instructions-only → **awaiting images**; `missing_required_fields` ("Images only") now **requires real
  image evidence**; genuinely-empty/unidentifiable → **error → Exceptions** (premature-error-safe for
  new cases). Existing status values only — no schema change. Live **PATCH 204, verified.**
- **FIX 4 — save the source `.eml` + original attachment.** Built in `intake.definition.json`
  (`Init_attachmentsForChild` + a failure-isolated `Scope_capture_eml` using `ExportEmail_V2` +
  Append-to-array). **Live GATED — see [docs/gated.md](./docs/gated.md) H12** (operator must confirm
  the real `ExportEmail_V2` output shape, then designer-apply to the webhook-sensitive live intake).
  The original *attachments* already persist under the live chain; the `.eml` is additive.
- **Test done (`test34`, 2026-06-19 23:17):** validated FIX 3 — a parse-failed case correctly routed to
  **Exceptions** (not mislabelled), and it CAUGHT the base64ToBinary regression (reverted above). Owed
  now: one more test email on the reverted (raw-string) path to confirm a populated case + an
  instructions-only case reading **awaiting images**. Repo↔live intake drift tracked as **S11**.

---

## 🔔 Update — 2026-06-19 (late): M1 flow chain WIRED LIVE via CLI (branch `fix/flow-chain-live-reconcile`)
The **M1 flow chain is now wired LIVE** end-to-end via the Dataverse API (CLI), and the repo is
**reconciled to the live flows** so a future solution re-import can't regress them:
- **Orchestrator cards added to `CS Intake`.** The live intake now carries `Init_caseId` +
  `Capture_caseId_matched`/`Capture_caseId_unassigned` + the **3 Run-a-Child-Flow cards**
  (`Run_classify_persist` → `Run_parse` → `Run_status_evaluate`) that pass `caseId` down the chain.
  These were already present in `flows/definitions/intake.definition.json` (the orchestrator target) —
  confirmed byte-for-byte, no change needed there.
- **Webhook preserved.** The Office 365 `OnNewEmailV3` **trigger node was kept byte-identical** so the
  existing digital@ webhook subscription survives (clientdata can't re-arm an Office 365 webhook —
  memory `flow-webhook-trigger-provisioning`).
- **classify-persist creating Evidence — VERIFIED by a live test email** (the child now receives the
  attachments array + subject/from and writes one `cr1bd_evidences` row per attachment to Blob).
- **Two live BUG FIXES reconciled into the repo** (`flows/definitions/`):
  1. **`payloadhash` truncation (real bug, both intake variants).** The Case-create actions wrote the
     `subject|from` seed un-truncated → `cr1bd_payloadhash` (MaxLength **80**) overflowed (**89 chars**)
     → long-subject emails created **NO case**. Wrapped the value in **`@take(..., 80)`** in
     `Create_case_matched` **and** `Create_case_unassigned` in **both** `intake.definition.json` and
     `intake-shared-mailbox.definition.json`.
  2. **Child flows need a `Response` action** to be callable via Run-a-Child-Flow. Added
     `Respond_to_parent` ("Respond to a PowerApp or flow") to **`parse.definition.json`**
     (returns `instructionBytesB64`/`instructionName` + `parsed`/`contractVersion`) and
     **`status-evaluate.definition.json`** (returns the readiness result: `status`/`statusCode` +
     `fieldsValid`/`imagesValid`). `classify-persist.definition.json` already had one.
- **Parser runtime apiId** — definitions correctly bind the **portable logical** id `shared_ceparser`
  (matched against `connection-references.json`; ALM rebinds to the physical runtime id at import), so
  **no stale `new_collision-…` apiId existed in any definition** to fix. Recorded the physical runtime
  id (`shared_new-5fcollision-20engineers-20parser-5ff48c20e0e0674f63`) in `flows/README.md` for the
  operator's connection bind only.
- **Gate: `node verify-all.mjs` = 6/6** (Code App build + 204 vitest, Dataverse parity, **flow linter
  114/114**, parser 37 / enrichment 18 pytest).
- **Residuals (not regressions):** (a) the **parser Function 502** is **fixed (2026-06-19, regression-guarded)** —
  on 2026-06-19 16:49 UTC an unreadable/corrupt instruction PDF escaped as an unhandled 502; the handler now
  returns **422 for unreadable documents** → routes to `needs_review`, no retry (guarded by the regression
  test `test_unreadable_document_returns_422`); `Audit_parser_failed` also absorbs a parser 5xx so status
  still advances. **Not a live blocker.** (b) the intake trigger **`concurrency = 1`** is the documented
  **webhook-risk** edit, **deferred** — changing it re-arms the live webhook in the designer.

---

## 🔔 Update — 2026-06-19 (review 190626 actioned): UI/UX review pass (branch `review/190626-ui-pass`)
The binding manual review **`docs/reviews/190626/`** was actioned end-to-end — **all 8 tasks (~44 issues)**,
checklist complete, **built green + 204/204 tests + pushed live (`pac code push`) + verified on the deployed
player**. Headlines:
- **Nav IA re-cut:** first-class expandable **Queues** group → Instructions (awaiting images) / Images only /
  Ready for review / **Exceptions**; **Corpus→Provider settings**, **Audit→Action logs** (real page over the
  audit seam); new **Add evidence** second intake; **Done-today** dropped as a page.
- **Dashboard:** funnel re-cut to **New / Not ready / Review / Submitted** (Parsing/Box/Chasing/Ready folded
  in); redundant "drainable now" row + dev copy removed; Exceptions bar added.
- **Case view + chasers** decluttered: Export-JSON gated to ready, minimalistic Job-Sheet chasers (no
  Mark-held / ADR caption; "Log as chased" auto-note), one no-image warning, "Imported details" panel.
- **New case** rebuilt (17 fixes): drag-drop, automatic case-type, **split identity fields**
  (VRM / Work provider / Principal / Case-PO / Claim No / Insured Name), **Date of Incident**, gated DVLA/DVSA
  **"Look up vehicle"** + postcodes.io **"Normalise address"**, manual-entry path, EVA required set; no dev copy.
- **Provider settings** (was Corpus): reference-data cards (Repairers 61 / Image sources 23 / Inspection
  addresses 174); de-jargoned assisted-import.
- **Broad-review:** removed the floating red `SectionHeading` hairline; documented the **EVA field model**
  (`docs/architecture/eva-field-model.md`) + the **5 enrichment/AI status checks** — DVLA/DVSA **gated-off**
  (make/model/mileage only, **no VAT**), OCR built-not-deployed, postcodes.io **live**, AI/Document-AI
  **not present** (parsing is PyMuPDF). New gated `data/enrichment-client.ts`.
- **Convention:** `docs/reviews/<DDMMYY>/` reviews are now documented as **binding** (README + CLAUDE.md +
  AGENTS.md) — superseded only by a later review.

---

## 🔔 Update — 2026-06-19 (PM): Azure deploys live + UI pass (branch `feat/m1-live-activation`)
- **Parser Function REDEPLOYED** (`cespike-parser-dev-…`, FC1). Vendored the EVA payload schema into the
  package (`functions/parser/contracts/`) + fixed the resolver order, so `/api/parse` no longer emits a
  spurious `schema_unavailable` issue. **Live-verified:** returns the 12 EVA fields incl. **B2**
  `claimant_telephone` (`07700900123`) + `claimant_email` extracted from document text. (B2 → **Done**.)
- **Inspection-address matcher — REMOVED root-and-stem 2026-06-23 (ADR-0013).** A runtime Function was briefly
  deployed this session on a misreading (`Loc` is an EVA-export artifact, not an intake input). It and its Azure
  resources were deleted; the inspection address is now an **offline-derived full-address suggestion** (in
  `cr1bd_inspectionaddress`) that staff **manually pick** (or "Image Based Assessment" with a reason) — no runtime
  matcher. See `docs/architecture/inspection-address-corpus.md`.
- **OCR host — DEPLOYED 2026-06-19 (Running).** Function App `cespkocr-fn-dev-glju3v` (Functions-on-ACA,
  scale-to-zero 0..5, HTTPS-only) pulls `ce-ocr:latest` from ACR `cespkocracraeee76`. The prior 3×
  `Failed to provision revision … Operation expired` was the **AcrPull RBAC-propagation race** (the role
  was created in the same deployment as the app); fixed with a **pre-granted user-assigned identity** for
  AcrPull (separate ARM deploy) + `siteConfig.acrUserManagedIdentityID` (PR #7). Connector wiring +
  `OCR_SCANNED_PDF_ENABLED`/`PLATE_OCR_ENABLED` flip remain. (ROADMAP 5a / B-full → deployed.)
- **Live UI/UX pass** (Chrome DevTools, deployed app): logo renders (data-URI), **real Dataverse data**
  (2 NEW cases, no mock), dashboard KPIs + nav + manual-intake screen render, honest empty states, **no CSP
  violations / no font errors**, parser connector **consented**. One pre-existing **non-fatal** console
  error remains (`React.createElement … undefined`; app renders fully). The browser file-upload→parse click
  couldn't be automated through the nested player iframe, but the parse path is verified end-to-end at the
  connector API level + the connection is consented.
- **Architecture review** run as a multi-agent ultracode workflow (Azure efficiency / Code App / flows /
  dead-code / UI-UX, with adversarial verification) — see the final report.
- **M1 flow-chain activation: prepared + de-risked, NOT forced.** Verified the live `CS Intake` is the
  **simple** (non-orchestrator) flow and the children (`classify-persist`/`parse`/`status-evaluate`) are
  **OFF + stale** vs the repo. Full activation re-arms the live webhook + rebinds Run-a-Child-Flow cards —
  genuine `[RESERVED-FOR-USER]` designer work that must **not** be forced via API onto the working digital@
  webhook. Precise steps captured in **`docs/activation/m1-flow-chain-activation.md`**.
  **→ SUPERSEDED by the 2026-06-19 (late) update above: the chain was subsequently WIRED LIVE via CLI**
  (orchestrator cards added to `CS Intake`, the `OnNewEmailV3` trigger node kept byte-identical so the
  webhook survived, classify-persist creating Evidence verified by a live test email). Residuals there:
  parser 502 (fixed 2026-06-19, regression-guarded by `test_unreadable_document_returns_422`) + trigger `concurrency=1` (still the deferred webhook-risk edit).
- **Deliberately NOT deployed (resource-conscious):** `evavalidation` (status-evaluate does readiness
  inline → the connector is unused by design) and `evasentry` (EVA REST is Phase 3c/M2; M1 uses JSON
  drag-drop). All deployed compute is FC1 (~£0 idle) or ACA scale-to-zero.

## 🔔 Update — 2026-06-19: parser connector wired, corpus loaded, EVA/address/OCR built (gated-OFF)
- **Manual-intake parse is no longer CSP-blocked.** The CE Parser custom connector
  (`new_collision-20engineers-20parser`) was updated to expose the `api_key` parameter (the
  `x-functions-key` was previously undefined, so connections couldn't carry it); a **Connected**
  connection now exists (`01b43be8542148efbcd1284b8ca64013`, "Collision Engineers Parser"), so
  connection reference `cr1bd_ceparser` is now **Bound**. The Code App calls the parser through it
  (`pac code add-data-source` → `CollisionEngineersParserService`; bridged by
  `src/data/parser-connector-transport.ts`). The **old raw-fetch path was removed** —
  `mockup-app/src/data/parser-config.ts` deleted and `fetchParserTransport` gone — so the function
  key is **no longer in the client bundle** (it lives on the connection). **204/204 app tests pass**;
  app rebuilt + pushed.
- **Provider corpus incorporation LOADED** — `dataverse/.build/10–14` ran idempotently and all
  14-verify checks **PASSED**: `WorkProvider` **390 updated** (`Corpus 2026-06-18` provenance,
  SEED→active / ARCHIVE→inactive; 11 excluded, 2 review-skipped, 12 placeholder names);
  `Repairer` **20** named full-postcode yards + **14** garage matches; `InspectionAddress` **174**
  rows (all Confirmed Physical, all with postcodes); `ImageSource(kind=repairer)` **20** with **98**
  WorkProvider N:N links. **37 over-length "principal codes" deferred** (EVA-export NAME-ARTIFACTS, not
  real codes — the `cr1bd_principalcode` cap **stays 8**; canonicalise the 5 active businesses, individuals
  go VRM-keyed — see [docs/reference/over-length-principal-codes.md](./docs/reference/over-length-principal-codes.md)); GGP→GG and ZEN==ZENITH merges deferred to the
  clarifying-info phase.
- **Built this session, gated-OFF, DEPLOY PENDING (not yet live):** EVA Sentry REST v1.2
  (`functions/evasentry` — two-request `Files` submission `/Instruction/Inspection` → `/Note/SubmitNote`,
  payload-hash idempotency, pytest **42/42**; `finalize-eva-box` refined); **OCR host** (`ocr/`, ROADMAP 5a, **no longer deferred** — scanned/image-PDF
  fallback, Dockerfile + Azure Container Apps Bicep + plate/pdf adapters); parser **B2** (claimant
  telephone/email now extracted with provenance + tests); plans authored for every remaining phase
  (3c/4a/5a/5b/5c) + `docs/plans/README.md`; IaC hardened (workspace-based App Insights, storage
  `allowSharedKeyAccess:false`, right-sized memory). _(A runtime inspection-address matcher was also built
  this session but later **removed root-and-stem 2026-06-23** — built on a misreading; the inspection address
  is now offline-derived full-address suggestions + manual confirm, ADR-0013.)_
- **Known follow-ups (still pending):** Azure deploys for `evasentry`, `ocr` (ACA:
  build+push image then deploy Bicep), and the **parser Function REDEPLOY** (also fixes
  `EVA_PAYLOAD_SCHEMA_PATH` so the EVA payload schema loads from the package, not cwd); the **Phase-1
  flow-chain activation on `digital@`** (turn on classify-persist / parse / status-evaluate, bind
  `cr1bd_evidenceblob`, re-publish the intake orchestrator); operator-gated items unchanged (live
  Info/Engineers/Desk inboxes, DVSA/DVLA/EVA/Box secret injection, EVA test drag-drop).
  (`evavalidation` could later fold into the parser Function app — both secret-free Python.)

## 🔔 Update — 2026-06-18 (PM): live debug session (verified against cloud + deployed app)
- **Email intake is now LIVE & verified.** Root cause of "emails don't create cases": the `CS Intake`
  flow had only ever been **injected via the Dataverse `clientdata` API**, so its Office 365 webhook
  subscription was never registered (Flow `/triggers` API = 500, **zero runs ever**, even though the
  flow showed *On* with the correct V3 trigger and `digital@` bound). Neither a Flow-API stop/start nor
  a plain designer Save fixed it. **Fix:** in the make.powerautomate.com designer, deleted the trigger
  and **re-added a fresh "When a new email arrives (V3)"** (re-enabling concurrency=1 to clear
  `CannotDisableTriggerConcurrency`), then Saved → a test email produced a **Succeeded** run and a real
  `cr1bd_cases` row. See memory `flow-webhook-trigger-provisioning`.
- **Logo is NOT broken** — confirmed on the live deployed app via Chrome DevTools (both logo assets
  HTTP 200, no font/CSP errors, current build hash). Earlier reports were a **cached old build**;
  hard-refresh resolves it. (One unrelated console error remains: `React.createElement … undefined`.)
- **Manual-intake "parse" — root cause found:** the deployed Code App is blocked by the **Code App CSP
  default `connect-src 'none'`**, which forbids the app's raw cross-origin `fetch()` to the parser
  Function. The Function + CORS are healthy (curl: OPTIONS 204, POST 400, correct ACAO). **Fix (chosen):**
  route through the **CE Parser custom connector** (same-origin via the SDK; key in the connection).
  **Done 2026-06-19** — connector exposes `api_key`, connection `01b43be8…` Connected, app calls
  `CollisionEngineersParserService`; raw-fetch path deleted. See memory `codeapp-csp-use-connectors`.

## ✅ Live then — Power Platform era (Sandbox `Collision Engineers - Dev`, NOT Default)

> _Historical snapshot of the **decommissioned** Power Platform deployment — superseded by the Azure
> PaaS stack at the top of this file. Retained for provenance; not the live system._

| Piece | Status | Where |
|---|---|---|
| **Parser Function** | Live, extracting real PDFs (provider/claimant/dates/address/VRM/ref), 12-field EVA contract, function-level auth | Azure **Flex Consumption (FC1)**, `cespike-parser-dev-…`, UK South |
| **Dataverse schema** | Built — 11 tables, 19 choice sets, 15 relationships, 3 alt keys, 18 env-vars (11 M1 + 7 Phase-7 Box) | Solution `CollisionSpike`, prefix `cr1bd` |
| **Provider corpus** | **Incorporated + 2026-06-19 verify passed** — `WorkProvider` **390 updated** (SEED→active / ARCHIVE→inactive, `Corpus 2026-06-18` provenance; 37 over-length codes are EVA-export name-artifacts, cap stays 8 — see over-length-principal-codes.md), `Repairer` **20** named yards + **14** garage matches, `ImageSource(kind=repairer)` **20** (shared storage yards), `InspectionAddress` **174** known-sites (all Confirmed Physical), **98** N:N links. Idempotent (`dataverse/.build/10–14`); all 14-verify checks passed. | Sandbox |
| **Parser custom connector** | Created, points at the live host | Sandbox |
| **Code App** | Live + wired to Dataverse; **manual-intake** (upload → parse → Case) works, **parse now routed via the CE Parser connector** (no longer CSP-blocked; key off the bundle); logo/fonts/nav fixed | `mockup-app/`, app `da7ba7af-…` |
| **Enrichment Function** | Deployed + **gate ON in Dev** (`ENRICHMENT_ENABLED=true`, flipped 2026-06-21; live-verified `BC23JZE`→Ssangyong Rexton); calls **DVSA + DVLA directly** (Entra `client_credentials` + `X-API-Key`); **no Google Cloud gateway**. DVSA/DVLA secrets are now **Key Vault references** (populated 2026-06-23, verified live 200) | `cespkenrich-fn-gi62sd`, KV `cespkenrichkvgi62sd` |
| **Cloud flows (×15)** | Imported **`state=off`** (except the Claude-wired `case-resolve`, ON); connection refs unbound | Solution `CollisionSpikeFlows` |

## ⛔ Built but NOT activated (operator-gated — live-services boundary)

- **Live email intake** — the intake flow is imported **off** with **placeholder connector bindings**
  (real names: `SharedMailboxOnNewEmailV2` / `folderId` / `hasAttachments`). It has a **MinIntakeDate
  guard (2026-06-17)** + an **attachment filter** (documented as temporary, to be replaced by full
  email routing later). Until the operator binds the Outlook shared-mailbox connection and turns it on,
  **no emails become Cases** → see "Why emails don't show" below.
- **EVA / Box** — EVA is JSON drag-drop now (`EVA_API_ENABLED=false`); Sentry REST API later. Box
  archival not activated. Needs EVA **test** creds in Key Vault + Box folder-casing confirmation (B5).
  The **Phase-7 Box pivot** (folder-at-parse-confirm, File-Request chasers, webhook intake) has its
  **Dataverse schema + env-vars applied live (all five `BOX_*` gates OFF)**; the `box-webhook` Function is
  **deployed gated-off (secret-free)**; the `cr1bd_box_rest` connector and the Box flows are **authored
  offline, not imported/bound**, and no `BOX_*` gate is flipped. The BUSINESS-account live test (CCG + File Request + `FILE.UPLOADED`) is the
  long pole (see the 2026-06-22 entry above + [docs/gated.md](./docs/gated.md) item 5).
- **Enrichment** — ✅ **no longer gated: ACTIVATED in Dev** (`ENRICHMENT_ENABLED=true`, flipped 2026-06-21;
  live-verified `BC23JZE`→Ssangyong Rexton). Listed here for history only; see the 2026-06-21 update above.

## 🔎 "Emails don't show/populate" — RESOLVED 2026-06-18 (PM)

The app was always **correct** — it renders Cases from Dataverse (`cr1bd_cases`). The empty state was
real because the `CS Intake` flow's **Office 365 webhook subscription was never provisioned** (it had
been API-injected, never published through the Flow service). After rebuilding the V3 trigger in the
designer, an inbound email to `digital@collisionengineers.co.uk` now creates a `cr1bd_cases` row
(verified: Succeeded run + Case "CE intake test 4 fresh trigger"). Still **no mock data** — these are
real email-sourced rows. Remaining email gates: provider **auto-match** needs `knownemaildomains`
seeded (run `dataverse/.build/15-seed-emaildomains.ps1`), and downstream `Classify+Persist` / `Parse`
/ `Status Evaluate` are still `off` (so attachments/evidence/parse/status don't advance yet).

---

## 🆕 This session (2026-06-18)

- **Provider/garage/location data analysis** — `raw/principalandrepairersheets/` EVA exports analysed
  into `raw/principalandrepairersheets/outputs/` (tasks 1–8 + `claudeschoice/` + `reports/`),
  reproducible via `outputs/_scripts/run_all.py`. Headlines: EVA **principal code is the join key**
  (not the name; LEGAL names are "FAO The Court" placeholders — firm is in the address); the REPAIRER
  list (Scottish) ≠ where inspections happen (English storage yards); **137 active principals are not
  on the job sheet**; 264/440 principals dormant >12m; 57% of located cases carry only a **part
  postcode**. Actionable outputs: `reports/provider_corpus_recommendation.csv`,
  `reports/loc_principal_analysis.md`, `reports/principal_address_worklist.md`. See the memory note
  `provider-corpus-analysis`.
- **Corpus incorporated into live Dataverse** — `dataverse/.build/10–14` (+`_corpus-common.ps1`) loaded the
  confirmed analysis: WorkProvider 45→**392** (176 active / 216 archived-dormant), Repairer 38→**61**,
  ImageSource 4→**23** (shared yards), **174** `InspectionAddress` known-sites, **98** N:N links. §9 verify
  passed; idempotent re-run = no-op. Plans: `docs/plans/phase-1-intake-and-case-tracking/corpus/dataverse-corpus-incorporation.md` (confirmed) +
  `docs/plans/phase-1-intake-and-case-tracking/corpus/clarifying-info-ingestion.md` (the operator-confirmed second phase).
- **Research** — `docs/research/` (00 strategy + 01 Power-Platform + 02 Azure/AI + 03 domain + index):
  next moves = activate intake (operator) ∥ corpus incorporation (done) → **address-matching + fast-confirm**;
  explicit anti-features (no EVA REST / image-AI / AI Search / mock data yet).
- **Code App fixes** — broken **logo** (top-left) and brand **fonts** now bundle correctly under the
  Code App subpath (moved `public/assets`+`public/fonts` → `src/`, imported as modules / relative
  `url()`, Vite-fingerprinted); added a **Dashboard** nav item to the rail. `npm run build` green.
- **Email-population diagnosis** (above) — no code change; documented activation path.

## 🟡 Decisions needed (surfaced 2026-06-18)

> Tracked in the operator registry **[docs/gated.md](./docs/gated.md)** — H10 (sender domains) and
> S10 (the 37 over-length "principal codes" — EVA-export NAME-ARTIFACTS, not real codes; the
> `cr1bd_principalcode` cap **stays 8**, NOT widened — see the disposition below and
> [docs/reference/over-length-principal-codes.md](./docs/reference/over-length-principal-codes.md)).

1. **Email auto-matching needs sender domains.** Provider matching is by **sender email domain only**
   (`WorkProvider.knownemaildomains`). The data analysis carried **no domains**, so only the ~16
   prior-seeded providers have one — the other ~376 of the 392 are **blank**, so nothing will auto-match
   until domains are supplied. **Action:** provide per-provider sender domain(s) (from the job-sheet Inbox
   column or sample real emails); then `15-seed-emaildomains.ps1` upserts them idempotently. A domain that
   maps to >1 active provider is an **intermediary** (ADR-0011), not a provider domain.
2. **37 over-length "principal codes" are EVA-export NAME-ARTIFACTS, not real codes** (e.g. `R1AMMCLASS`,
   `THECARHIRE`, `T&KMOTORS`) — skipped by the incorporation. The `cr1bd_principalcode` cap **stays 8**
   (NOT widened). **Disposition:** **canonicalise only the 5 active recurring businesses** (WHITELINE,
   BLACKLINE, SILVERLINE, PROACTIVE, WATERMANS); **defer SILVER 100** (different/unclear Case/PO process);
   **reclassify the within-24m individuals as VRM-keyed** (an individual/private claimant uses the **VRM** as
   the Case/PO key — no minted Principal code); **disregard the 19 used >24 months ago**. Full list +
   per-row dispositions: [docs/reference/over-length-principal-codes.md](./docs/reference/over-length-principal-codes.md).

## Blockers (DEPLOY-RUNBOOK §0)

> Full hard/soft operator registry: **[docs/gated.md](./docs/gated.md)**. M1 snapshot below.

| ID | State |
|---|---|
| B1 gateway grant | **Obviated** — gateway removed, direct DVSA/DVLA |
| B3 13th EVA field | **Resolved** — contract is 12 fields |
| B4 Code Apps enablement | **Resolved** — enabled on the env; app pushed |
| B2 parser telephone/email | **Built** — claimant telephone/email now extracted with provenance + tests; parser REDEPLOY pending to go live |
| B5 EVA creds + Box casing | **Open** — operator (EVA test creds in KV, Box UPPERCASE folder check). The Box pivot (Phase 7) has its Dataverse schema + env-vars applied live (all `BOX_*` gates OFF); the `box-webhook` Function is deployed gated-off (secret-free), while the connector/flows are authored offline, **not imported/bound**; the BUSINESS-account test (CCG + File Request + `FILE.UPLOADED`) is the long pole — gated.md item 5. |

## Key docs
- **Forward worklist:** [ROADMAP.md](./ROADMAP.md) (§ Now / Next / Later) · **What needs the operator:** [docs/gated.md](./docs/gated.md) · **Live registry (authoritative numbers):** [docs/architecture/live-environment.md](./docs/architecture/live-environment.md) / [LIVE_FACTS.json](./LIVE_FACTS.json)
- **Operational charter / rules:** [AGENTS.md](./AGENTS.md) · backlog now in [ROADMAP.md](./ROADMAP.md)
- Architecture: [docs/architecture/](./docs/architecture/README.md) · ADRs: [docs/adr/](./docs/adr/README.md) · Plans: [docs/plans/](./docs/plans/) · live deploy: [docs/azure/](./docs/azure/README.md)
- Analysis: `raw/principalandrepairersheets/outputs/reports/`
