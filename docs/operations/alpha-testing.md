# Alpha testing — QDOS single-provider cutover

Operating procedure for PLAN-015: run the live system as a controlled alpha on one work provider
(QDOS), fed by staff forwards into the dedicated shared mailbox
`instructions@collisionengineers.co.uk`, with EVA exercised in shadow against the vendor test
environment and a local shadow instance continuing email evaluation on the three real mailboxes.

Every phase below is an operator-executed live action. Repository merges alone change nothing:
the new behaviour ships dark (ADR-0027) and activates only through the phases here. Nothing in
this procedure touches CarClaims.

Related pages: [deployment](./deployment.md) · [database operations](./database.md) ·
[feature gates](./feature-gates.md) · [archive operations](./archive.md) ·
[staff forwarding guide](../product/staff-forwarding-guide.md). Owning plan:
[PLAN-015](../tickets/plans/PLAN-015-app-alpha-testing.md).

## Ordering constraints (read first)

1. **Phase 0 before Phase 6, always.** The `finalize-eva-box` starter hardening (TKT-298) must be
   deployed before `EVA_API_ENABLED` is flipped anywhere — the pre-hardening route was anonymous
   and becomes live-capable the moment the EVA and Box gates are both on.
2. **Quiesce before backup, backup before wipe.** The re-scope (Phase 2) stops new arrivals; wait
   for in-flight work to drain before Phase 3, and complete Phase 3 before any Phase 4 deletion.
3. **Bank evidence same-day.** Application Insights runs on free-tier retention and the usable
   KQL window collapses within hours — copy query results into the owning ticket's evidence the
   day they are produced.

## Phase 0 — land dark and deploy

1. Merge the PLAN-015 slices (TKT-298…TKT-302); run `node verify-all.mjs`.
2. Deploy `cespk-api-dev` and `cespk-orch-dev` per [deployment](./deployment.md) (Windows `func`).
   Hold the staff-SPA deploy until Phase 5 (its panel removal is staff-visible).
3. Create the shadow queue — queues are not auto-created:
   `az storage queue create -n eva-shadow-submit --account-name cespkorchstdev01 --auth-mode login`.
4. Prove dark: a normal "Submit to EVA" export still only transitions the case; the
   `eva-shadow-submit` queue stays empty; orchestration logs show no shadow activity.

## Phase 1 — Exchange RBAC for the alpha mailbox

The shared mailbox `instructions@collisionengineers.co.uk` already exists (non-public; only
internal staff forwards). Extend the Exchange Online RBAC recipient scope so the Graph intake
application covers it (extend `CollisionSpike-Intake-Prod` or add a parallel scope + assignment).

Verify with `Test-ServicePrincipalAuthorization` — expect `Mail.ReadWrite` `InScope=true` for the
new mailbox. Do **not** verify with `az`/Entra queries: the app's Entra side is deliberately empty
and always reads as no-permissions (see [live environment](./live-environment.md)).

Confirm staff can forward into the mailbox before Phase 2.

## Phase 2 — re-scope intake (quiesce point 1)

1. Choose the cutover instant (UTC). On `cespk-orch-dev` set:
   `GRAPH_INTAKE_MAILBOXES=[{"mailbox":"instructions@collisionengineers.co.uk","minIntakeDate":"<cutover instant>"}]`
2. Force a maintenance pass: `POST https://cespk-orch-dev.azurewebsites.net/api/graph-renew?code=<function key>`.
   The summary must show `created` for the new mailbox Inbox (plus its SentItems entry while
   `DONE_SENT_EMAIL_ENABLED` is on) and `pruned` entries for the info@/engineers@/desk@ Inbox and
   SentItems subscriptions. Re-POST once more — the second pass must be renew-only (steady state).
3. Bank the two summaries plus the `graph-subscription-created`/`graph-subscription-pruned`
   App Insights events into the ticket evidence same-day.
4. Quiesce: wait until Durable `intakeOrchestrator` shows zero Running/Pending instances and the
   `intake-messages`, mirror and backfill queues are empty. The pruned mailboxes stop notifying
   the instant their subscriptions are deleted.

`minIntakeDate` must be the cutover instant, never earlier — a lifecycle resync floors at
`max(minIntakeDate, now − lookback)`, and an early floor plus bulk-copied history would pull old
mail in. Staff must never bulk-copy historic mail into the mailbox (see the
[staff forwarding guide](../product/staff-forwarding-guide.md)).

## Phase 3 — backup (before any deletion)

- Blob: `az storage blob download-batch --account-name cespkevidstdev01 -s evidence -d <dated local dir> --auth-mode login`.
  Record the blob count and a hash manifest alongside the download.
- Database: RLS-complete dump via the Entra-admin path — see
  [database operations §Full backup, wipe and reseed](./database.md#full-backup-wipe-and-reseed-alpha-reset).
- Continuity capture (saved with the backup): current `case_po_floor` rows AND the per-prefix
  maximum `case_po` sequence observed in `case_` — Phase 4 re-seeds floors from these.

## Phase 4 — wipe and reseed (quiesce point 2)

Follow [database operations §Full backup, wipe and reseed](./database.md#full-backup-wipe-and-reseed-alpha-reset)
exactly: pre-flight baseline currency, drop/recreate the schema, rebuild from `database/baseline`
(constraints last), apply the seeds, re-seed `case_po_floor` at
`GREATEST(old_floor, observed_db_max)` per prefix, then run the post-rebuild probes. The apps may
briefly error on database traffic during the window — do the whole phase in one sitting.

Sanity-check the QDOS floors against real-world maxima (Archive folder names, EVA) — an
under-floored prefix would mint colliding Case/POs.

## Phase 5 — blob clear and staff-visible changes

1. `az storage blob delete-batch --account-name cespkevidstdev01 -s evidence --auth-mode login`;
   verify the container is empty. **Never touch `cespkorchstdev01`** — Durable control state,
   including the subscription-monitor singleton, lives there.
2. The operator empties the Box test folder `392761581105` by hand ([archive rules](./archive.md)
   still apply — no automated Archive deletion). `BOX_FOLDER_ROOT_ID` is unchanged.
3. Capture off on `cespk-api-dev`: `PUBLIC_CAPTURE_ENABLED=false`, `CAPTURE_SESSIONS_ENABLED=false`,
   `CAPTURE_DIRECT_UPLOAD_ENABLED=false` (`CAPTURE_CLEANUP_ENABLED` is already off). This also
   closes the standing TKT-200 unprotected-ingress risk noted in [feature gates](./feature-gates.md).
   Public capture links now answer "Capture is not available"; the capture site's shell keeps
   serving but can do nothing.
4. Deploy the staff SPA (TKT-300 hides the guided-photos panel).
5. Alpha gate trims on `cespk-api-dev` (each reversible by a single setting):
   - `DELETE_CASE_IMAGE_ENABLED=false` — irreversible delete whose designated-test proof
     (TKT-160) has never run; the alpha wants an untouched dataset.
   - `MCP_IMAGE_INGEST_ENABLED=false` — a fail-closed no-op today anyway; ship-dark hygiene.
   - `IMAGE_ANALYSIS_ENABLED=false` — with the assistant panel off (2026-07-21) its output has no
     review surface and would accumulate write-only rows.
   - `DONE_SENT_EMAIL_ENABLED` stays **on** (self-scopes to the alpha mailbox after Phase 2).
   - `MCP_SERVER_ENABLED` — operator choice; read-only and independent of the assistant shutdown.
   - Everything else (triage rungs, parse-fed, Box gates, enrichment, retro) is unchanged — the
     alpha exercises the real pipeline.

## Phase 6 — enable the EVA shadow (order matters)

Precondition: Phase 0 deployed the hardened starter and the shadow consumer.

1. Write the vendor **UAT** credentials into the EVA Key Vault (`cespkevakvufa3ci`) under the
   exact secret names the app's Key Vault references point at (read the reference URIs from
   `az functionapp config appsettings list -n cespkeva-fn-ufa3ci`). Confirm `EVA_BASE_URL` and
   `EVA_REQUEST_FROM`; restart the app so the references resolve. **The base URL is the same for
   test and production — the credentials alone decide which environment receives submissions
   (ADR-0005). Confirm with the vendor that the pair is the UAT pair before the first submission.**
2. `EVA_API_ENABLED=true` on `cespkeva-fn-ufa3ci` (the Function's edge gate) **and** on
   `cespk-orch-dev` (the `evaSubmit` activity + shadow consumer gate; the Data API does not read
   it). Confirm `EVASENTRY_FN_URL` and `EVASENTRY_FN_KEY` are present on `cespk-orch-dev`.
3. `EVA_SHADOW_AUTOSUBMIT_ENABLED=true` on `cespk-api-dev`; confirm
   `OUTLOOK_MOVE_QUEUE_SERVICE_URL` is present there (the shadow queue rides its fallback).
4. Do not invoke the EVA report poll — it is an intentional stub; the shadow scope is
   submission-only.

## Phase 7 — acceptance smokes, then record

Smokes (bank each same-day):

1. **Subscriptions** — the maintenance summary lists exactly the alpha mailbox; re-verify the
   next day that the durable monitor renewed it.
2. **QDOS instruction, plain-forwarded** — the re-attached jobsheet document parses; the provider
   resolves to QDOS from document content (the staff `From` is correctly unmatched); embedded
   photos land as case images; the Case/PO mints at floor+1. The same arrival banks TKT-296's
   outstanding `parseFedApplied` live proof. Also smoke one forward-as-attachment instruction —
   it must still classify and parse (that route is tolerated for instructions, wrong for photo
   emails).
3. **Images email** — routes to the open case; an unmatched one exercises the holding-folder
   lane (and can bank TKT-034's outstanding live proof).
4. **Export + shadow** — staff export downloads the JSON; the case reaches `eva_submitted`; the
   `eva-shadow-{caseId}` orchestration completes; the vendor test environment shows the
   instruction and photos in the export's order; compare the export JSON with the submitted
   payload as parity evidence.
5. **Capture off** — the public capture routes answer 404, the upload permission route 503, the
   staff panel is gone, the capture site shell is inert.
6. **Old mailboxes** — one probe email to info@ produces no live row, and the local shadow's
   poller ingests it instead (one probe proves both sides).
7. **Post-wipe invariants** — case counts started at zero; only alpha cases exist; numbering
   continued without collision.

Then record: update `LIVE_FACTS.json` + its evidence snapshot (`npm run check:live-facts`),
[feature gates](./feature-gates.md) live columns, [live environment](./live-environment.md), the
config-capture bicep defaults, and the owning tickets' `changes.md`/`verification.md`.

## Local shadow bring-up

Prerequisites: Node 20, Azure Functions Core Tools, Azurite, local PostgreSQL.

1. Build the local database exactly as the Phase 4 rebuild (baseline → constraints → seeds);
   create a local `cespk_app` login first so the baseline grants apply.
2. `services/data-api` local settings: Azurite (`AzureWebJobsStorage`), local `PG*`
   (`PGUSER=cespk_app`), the real `ENTRA_TENANT_ID`/`API_AUDIENCE` values (there is no dev auth
   bypass), all gates false.
3. `services/orchestration` local settings:
   - Azurite; `DATA_API_URL=http://localhost:7071`; `DATA_API_TOKEN` minted with
     `az login --scope "<api audience>/.default"` then `az account get-access-token` (about an
     hour's life — run the shadow attended and re-mint on 401s).
   - The real Graph intake app credentials from the approved secret store (never printed or
     committed); `GRAPH_INTAKE_MAILBOXES=[]` so subscription maintenance stays inert.
   - `INTAKE_POLL_ENABLED=true`; `INTAKE_POLL_MAILBOXES` = the three real mailboxes, each with
     `minIntakeDate` set to the Phase 2 cutover instant; `INTAKE_POLL_CRON` as desired.
   - Parsing: `PDF_MAPPER_ENABLED=true` plus `PARSER_FN_URL`/`PARSER_FN_KEY` pointed at the
     deployed parser (stateless — simplest), or a local `func start` of `services/functions/parser`.
   - Triage: the four `TRIAGE_*` rungs and `TRIAGE_PARSE_FED_ENABLED` true;
     `TRIAGE_AUTO_ATTACH_ENABLED=false`. Everything else false/unset — in particular
     `BOX_API_ENABLED`, `EVA_API_ENABLED`, `OUTLOOK_MOVE_ENABLED`, `DONE_SENT_EMAIL_ENABLED`,
     `EMAIL_AI_ENABLED`, `IMAGE_ROLE_CLASSIFY_ENABLED`, `ENRICHMENT_ENABLED` and the capture
     gates, so the shadow never writes anywhere live.
4. Start: Azurite → data-api (port 7071) → orchestration (port 7072) → optionally the web app.
5. Confirm: poll ticks log per mailbox; `intake-…` orchestrations start; `inbound_email` rows
   grow in the local database; source `.eml` blobs land in the Azurite `evidence` container.
6. Evaluation: the shadow accumulates the raw material; label and export per
   `scripts/evaluation/email/export-live-labels.md`, and keep `scripts/evaluation/email/run_eval.py --check`
   green against the committed corpus.

## Rollback

Every step is reversible:

- **Intake**: restore the three-mailbox `GRAPH_INTAKE_MAILBOXES` value and POST `graph-renew` —
  maintenance recreates the subscriptions and prunes the alpha one (drop the entry) or keep both.
- **Gates**: unset `EVA_SHADOW_AUTOSUBMIT_ENABLED` / `EVA_API_ENABLED` (shadow stops instantly);
  re-flip the capture gates only with the TKT-200 ingress question re-examined.
- **Data**: `pg_restore` the Phase 3 dump; re-upload the blob download. The Box folder is the
  operator's own copy decision.
- **SPA**: redeploy the prior commit (restores the guided-photos panel).
