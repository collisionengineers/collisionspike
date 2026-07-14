# Day-0 smoke checks

The **first-hour smoke pack** — run immediately after the [runbook.md](./runbook.md) cutover completes,
before staff are told the system is live. Each check names its **exact command/route**, the **expected
result**, and a **what-if-fail** pointer into [support-playbook.md](./support-playbook.md). Work top to
bottom; a failure that can't be corrected forward means stop and consider [rollback.md](./rollback.md).

> **Do not run this pack now.** TKT-178 must first hold the signed/checksummed job spreadsheet,
> authenticated contract-verified production EVA API evidence, the exact production Archive root with
> proven explicit write/rename/merge/retarget authority, backup/restore proof, the frozen approved ledger
> hash and a named completed cutover window. Use only the exact ingress and EVA-ready canaries nominated in
> that ledger for production proof; do not create a disposable case, email or upload. Manual EVA drag-drop and test,
> mirror, configured-default or Viewer-only Archive roots do not satisfy the cutover gates.
>
> **Command text is not mutation authority.** This smoke pack is read-only around the two one-shot canary
> leases that the named TKT-178 run already authorised. Do not manually renew or
> change Graph subscriptions, call a retro starter, mutate Outlook, create a case, write database/Archive/
> configuration state, or submit another EVA operation. The run ID, signed ledger/hash, exact artifact hashes,
> named window and fence tokens—not this document—authorise the two journaled operations.

Live numbers, gate values, the mailbox set, Box root id and Graph subscription expiries are **not
re-embedded here** — read them from the registry
[`architecture/live-environment.md`](../../architecture/live-environment.md) (single source
[`LIVE_FACTS.json`](../../../LIVE_FACTS.json)) at smoke time.

> **Platform routing.** `az` / `psql` run from **WSL2 Ubuntu** (az logged in there); the browser checks
> run on **Windows** against the deployed SPA. State the platform per command.

## How to run each kind of check

- **DB reads MUST use `SET ROLE csadmin`.** The tables carry `FORCE ROW LEVEL SECURITY`; a read as any
  non-owner role (or as `cespk_app` without `app.role`) is **filtered to 0 rows** — you will think intake
  is dead when it isn't. `csadmin` (table owner) bypasses RLS, so it reads the true unfiltered state. Connect
  per the [postgres.md](../../azure/postgres.md) runbook (transient firewall rule → Entra `digital@` token →
  `psql` → `SET ROLE csadmin;`), and drop the firewall rule on exit.
- **Data-API routes (`/api/*`) are Bearer-only** (Entra JWT, `403`/`401` fail-closed). Drive them from a
  **signed-in SPA session** (a `CollisionSpike.User`/`Superuser` staff login on
  `https://proud-sky-04e318b03.7.azurestaticapps.net`) — read the value off the UI, or copy the request from
  browser DevTools. Raw `curl` needs a real MSAL access token (`aud = api://fa2fb28c…`); an unauthenticated
  `curl` returning `401` only proves the route is fail-closed, not that data is right.
- **Provider reads** use only the independently verified read-only path named by the approved run. A function
  key does not itself authorise a provider mutation.

---

## 1. Intake is alive — a real email creates a case

The load-bearing check: a live email lands as an `inbound_email` row and (for new work) a `case_`.

**Do it after the approved window.** Observe the exact journaled ingress canary by its immutable message and
queue/outbox IDs in the production mailbox set (registry
[`live-environment.md`](../../architecture/live-environment.md)). Do not select another arrival, send a
synthetic production email or create a disposable case solely for proof.

**Verify (WSL, `SET ROLE csadmin`):**
```sql
SET ROLE csadmin;
SELECT id, source_mailbox, source_message_id, graph_message_id, received_on, category_code, case_id
FROM inbound_email
WHERE source_mailbox = '<journaled-mailbox>'
  AND source_message_id = '<journaled-source-message-id>'
  AND graph_message_id = '<journaled-graph-message-id>';
```
Cross-check the returned inbound ID against the journaled queue/outbox ID; elapsed time is supporting evidence,
never the lookup key.

**Expected:** the exact canary has the correct `source_mailbox`, a sensible
`category_code` and, for new work, a non-null `case_id`. Cross-check the case:
```sql
SELECT case_po, status_code, work_provider_id, box_folder_id
FROM case_ WHERE id = '<case_id>';
```
`status_code` should be `new_email`/`ingested`, `work_provider_id` matched by sender domain, EVA fields
pre-filled with provenance, `box_folder_id` set (see check 3).

**If it fails:** zero rows as `csadmin` = intake genuinely not firing → [support-playbook.md](./support-playbook.md)
§ *Graph webhook / intake dead* (check the `graph-webhook` `499`/cold-start burst in App Insights and the
subscription health in check 2). Zero rows only when **not** `csadmin` = an RLS/role mistake, not an outage.

## 2. Graph subscriptions healthy + renewing

Intake rides **Graph PUSH change-notification subscriptions**, kept alive by the durable
`subscriptionMonitorOrchestrator` (a plain timer can't wake the scale-to-zero FC1 app).

**Verify — read-only subscription state:** use an approved Graph `GET /subscriptions` reader and retain the
response hash. It must show exactly the approved subscription set, resource and mailbox mapping, immutable
IDs and future `expirationDateTime` values from the registry. Do not call `POST`, `PATCH` or `DELETE`, and do
not call the `graph-renew` endpoint merely to make this check pass.

**Verify — a source-bearing *unattended* renew has fired.** This check remains blocked until Precondition 0
ships the versioned custom event; the current ordinary trace text is shared by manual, timer and durable
paths and is not certification evidence. Then query App Insights component `cespk-orch-dev`:
```kql
customEvents
| where name == "graph-renewal-success" and timestamp > ago(24h)
| where tostring(customDimensions.source) == "durable_monitor"
| where isnotempty(tostring(customDimensions.durableInstanceId))
| project timestamp, subscriptionId=tostring(customDimensions.subscriptionId),
          nextExpiry=todatetime(customDimensions.nextExpiry),
          durableInstanceId=tostring(customDimensions.durableInstanceId)
| order by timestamp desc
```
**Expected:** at least one event from `durable_monitor` at the expected cadence, after the most recent
source-bearing `manual_http` event, with a future expiry for every approved subscription.

**If it fails:** a missing/unexpected subscription, an expiry inside ~24h, or zero unattended renewals →
[support-playbook.md](./support-playbook.md) § *Graph subscription expiry / renewal*. Do not repair it during
the smoke and then count the same interval as unattended proof. A manual renewal invalidates this evidence;
fix under separate authority and wait for a fresh source-bearing `durable_monitor` event.

## 3. Approved production Archive folder + File Request/webhook configuration

Every new case mints a Case/PO-named Archive folder. The ingress canary proves exact placement. Separately,
the production File Request template and destination webhook must already have been staged and independently
read back before the final root commit through the signed-run exact-target operation while the proved
Box-event buffer prevented evidence/status writes.

**Verify — exact folder identity:** read `case_.box_folder_id` for the canary, then use the independently
verified canonical read-only object-metadata operation for that exact ID. Assert returned object ID equals
the DB value, `parent.id` equals the exact approved production root, and `name` equals the canary's Case/PO.
Also read back `BOX_ALLOWED_ROOT_ID` plus both `BOX_FOLDER_ROOT_ID` settings and require the same root. A root
listing or same-name folder is insufficient. The current facade exposes child listing but no proven metadata
route; until that capability exists and is independently verified, this check and cutover remain blocked.

**Verify — configuration readback:** both apps return the approved template ID; provider metadata returns the
exact production-target webhook ID, target root and callback; the journal says whether it pre-existed or was
created by this run; the buffer checkpoint proves no pre-release event mutated a case. The live mirror-root
webhook is not a substitute. Do not manufacture a claimant upload
inside the bounded window. Observe the first later ordinary genuine upload under separate post-signoff
monitoring; a failure then follows [support-playbook.md](./support-playbook.md) § *Box facade / webhook*.

## 4. Authenticated production EVA API result

This check is impossible while EVA REST remains gated (`EVA_API_ENABLED` absent — Minotaur
one-principal-code limit), so the smoke pack and cutover remain blocked. A manual drag-drop export can
support ordinary work but is not authenticated production API proof.

**Do it after the approved window.** Observe the exact journaled EVA-ready case's authenticated production
API round-trip and retain its redacted request/response correlation with the frozen TKT-178 ledger and
persisted operation record. A worker recycle or response loss must resume/status-check without resubmission.

**Expected:** EVA's production API accepts the payload under the verified contract. **Photo order is
mandatory:** 2 preview photos first (vehicle
overview + main-damage closeup), then **all** photos in sequence **including those two again**; the overview
must show the **full registration**; any photo with a person's reflection is excluded.

**If it fails before EVA dispatch:** keep the fence and use the approved LIFO inverse journal; do not replace
the failed API proof with drag-drop. **If the vendor accepted the request or the response is unknown:** query
by the persisted correlation and recover forward—never blind-resubmit or reverse identity-bearing state as
if no business event occurred. Use
[support-playbook.md](./support-playbook.md) § *EVA export* to separate payload-shape defects from vendor
authentication/contract failures.

## 5. Signed-in SPA read paths are healthy

**Do it read-only.** In a signed-in staff session, load dashboard, queue and both journaled case pages; inspect
network responses without clicking dismiss/file/merge/remove, opening a chat exchange, or invoking any action
that writes an audit or triage row.

**Expected:** the SPA assets and bearer-protected reads succeed, both canaries show the ledger-approved
identities/status/evidence, and no CORS/401/403/5xx or mutation request appears. AI chat's live exchange is a
separately authorised post-signoff check because even a read-only question writes an `assistant_chat` audit
event; it is not part of TKT-178 smoke.

## 6. Dashboard counts reconcile

The pipeline cards and the queue lists must show the **same** number for the same queue (the 123-vs-124
class of defect).

**Do it (signed-in SPA):** open the dashboard; note the NOT READY / needs-action counts on the pipeline
cards, then open each named queue (`/queue/not-ready`, etc.) and count the rows.

**Verify — the number is real (WSL, `csadmin`):**
```sql
SET ROLE csadmin;
SELECT status_code, count(*) FROM case_ GROUP BY status_code ORDER BY status_code;
```
**Expected:** the pipeline card, the queue list length, and the status rollup agree (NEW folds into NOT
READY per the single-source fix); no queue shows a different total in two places; same-VRM twins render as a
collapsed count chip, not silent duplicate rows.

**If it fails:** a card and its queue disagree, or a count doesn't match the DB rollup →
[support-playbook.md](./support-playbook.md) § *Dashboard / queue counts* (the `statusToStage` vs
`filterQueue` single-source contract).

## 7. Independent ledger, queue and audit reconciliation

Do not choose an arbitrary historical email or call `/retro-case` for smoke. That would mutate production
outside the signed ledger. Instead, an independent reader verifies the same frozen run and both canaries.

**Verify (read-only):** reproduce the ledger's final category counts; check every typed checkpoint and
inverse-stack state; prove the ingress canary has one inbound row, one canonical case, one Case/PO and one
exact Archive folder identity; prove the ready-case canary has one persisted EVA operation; and prove held queue/outbox work resumed once
in original order with no duplicate allocation, provider submission or evidence bytes. Query audit rows from
the named window and account for every success, held conflict and failure against the signed ledger.

**Expected:** 100% ledger balance, no unexplained source/object, no temporary/NULL committed Case/PO, no
orphaned relationship, no duplicate canary side effect and no Outlook mutation. An unexplained count or an
ad hoc retro invocation fails the smoke; use [support-playbook.md](./support-playbook.md) § *Retro
reconstruction* only for diagnosis under separate authority.

---

## Sign-off

All seven checks must be green. The exact Archive ID/parent/root result and authenticated EVA result must be
green for the same ledger/run and its two designated canaries and cannot be waived or explained amber. Only then hand the system to
staff and move to steady-state [support-playbook.md](./support-playbook.md). A pre-EVA red follows the
approved inverse journal; a post-EVA accepted/unknown result follows forward recovery in
[rollback.md](./rollback.md).

**After any live change made during smoke:** update [`LIVE_FACTS.json`](../../../LIVE_FACTS.json) (bump
`lastVerified`) + the [registry mirror](../../architecture/live-environment.md), then
`VERIFY_LIVE=1 node verify-all.mjs`.
