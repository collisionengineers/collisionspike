# Consolidated operator checklist

The flat inventory of operator inputs/decisions plus the missing engineering prerequisites for the future
cutover. Existing operator mechanics may include a portal path or illustrative command; commands for the
unimplemented executor/compiler/fences intentionally do not exist and this file is not runnable end to end.
The live tracker with the full rationale behind each item is [`docs/gated.md`](../../gated.md) (item ids
**A/B/C/D/E**); the ordered go-live-day specification is
[`runbook.md`](./runbook.md); the gate-state snapshot is [`readiness-matrix.md`](./readiness-matrix.md).

Live numbers, gate values, function counts, the mailbox set and Box/Graph state are **not re-embedded
here** — read them from the registry [`architecture/live-environment.md`](../../architecture/live-environment.md)
(single source [`LIVE_FACTS.json`](../../../LIVE_FACTS.json)) at the time you act.

> **TKT-178 is blocked; this document is not current cutover authority.** Do not run any production
> Archive root/write, Case/PO floor/renumber or EVA reconciliation action unless one approved pack contains
> all three operator inputs — the signed/checksummed job spreadsheet, authenticated contract-verified
> production EVA API evidence, and the exact production Archive root with proven explicit
> write/rename/merge/retarget authority — plus backup/restore proof, the frozen approved dry-run hash and a
> named live window. Manual EVA drag-drop and test, mirror, configured-default or Viewer-only Archive roots
> do not satisfy those gates.
>
> **Command text is not mutation authority.** This planning pass authorises no live action. Every mutation
> needs separate explicit operator approval; TKT-178 additionally requires its named run ID, signed
> ledger/hash, exact artifact hashes, named window and live fence token. Otherwise reads only: do not
> renew/change Graph subscriptions, invoke an ad hoc retro starter, mutate Outlook, manually create a case,
> write database/Archive/configuration state, or call/submit EVA. Rollback authority is limited to the signed
> inverse journal.

> **Platform routing.** `az` / `psql` run from **WSL2 Ubuntu** (az logged in there); Exchange-RBAC admin
> is **Windows PowerShell** (`ExchangeOnlineManagement`); Box CLI / Box web / git / node run on
> **Windows**; portal actions are any browser. Each command below is prefixed with its platform.

---

## Legend

- **[MUST]** — do before go-live (blocks the cutover or blocks staff/intake correctness).
- **[FOLLOW]** — safe to do after go-live; the system runs correctly without it (an enhancement, a
  chaser nicety, or a gated-off future path).
- **[BLOCKED FUTURE WINDOW]** — a scripted TKT-178 step that must not run until every global cutover gate
  above passes and the named operator window opens.

---

## MUST — before go-live

### 0. Sign off the data-correction reprocess  ·  **[MUST]** — the gate on the whole cutover

**What / why you:** the DB is the complete record (the Inboxes hold only ~⅓ of processed emails — the
rest are in Deleted Items), so the go-live data fix is an **in-place reprocess** of existing rows through
the fixed classifier, **not** a mailbox wipe-and-rebuild (that was proven non-viable and abandoned). The
reprocess is **blocked on the P2 classifier fix-wave** and must run green with the SPA showing correct
data before any cutover step runs. Sign-off is a **judgement call only you can make** (does the corrected
data look right).

**Do (you, reviewing):** after the agents report P2 green + the reprocess complete, spot-check the SPA
dashboard/inbox/queues against a handful of known cases; confirm no obvious misclassification remains.
Context: [`GO_LIVE_SPRINT_PLAN.md`](./README.md) (P2 → in-place reprocess → P3V).

**Verify:** you are satisfied the on-screen data is correct per current logic — then, and only then, start
step 1.

---

### 1. Upgrade the subscription to Pay-As-You-Go  ·  **[MUST]** — [gated.md A1](../../gated.md)

Standing hard deadline (not a cutover step, but it gates everything): the subscription is an **Azure Free
Trial** (`quotaId FreeTrial_2014-09-01`) and the whole stack disables at the ~30-day mark unless upgraded;
the 12-month free Postgres allowance survives the upgrade.

**Portal:** Azure portal → **Subscriptions → `e6076573-…` → Upgrade** (or **Cost Management + Billing**) →
convert Free Trial to **Pay-As-You-Go**, add a payment method.

**Verify (WSL):** `az account show` prints subscription `e6076573-…`, state **Enabled**, and `quotaId`
is no longer `FreeTrial_2014-09-01`; every resource in `rg-collisionspike-dev` is running.

---

### 2. Assign staff app-roles  ·  **[MUST]** — [gated.md C1](../../gated.md)

Only one staff principal is app-role-assigned; everyone else `403`s until you assign them.

**Portal:** Entra → **Enterprise applications** → the API app (`cespk-api-dev` / `CollisionSpike`; v2
tokens carry `aud` = API client-id `fa2fb28c…`) → **Users and groups → Add user/group** → pick each staff
member → assign **`CollisionSpike.User`** (or **`CollisionSpike.Superuser`** for full-privilege admins).
Do **not** assign `CollisionSpike.Engineer` (defined, not enforced).

**Verify:** each person signs out/in and loads the SPA
(`https://proud-sky-04e318b03.7.azurestaticapps.net`) without a `403`.

---

### 3. Complete the provider corpus — domains + PHA principal  ·  **[MUST]** — [gated.md D3/D4](../../gated.md)

Sender-domain auto-matching is complete only once the remaining domainless providers and the **PHA
(Parkhouse) principal code** are supplied — business knowledge only you hold.

**Do (you supply):**
- The real business domain (or "none") for the remaining domainless providers (**Fairway, Regent, Castle,
  Stallion, Relay**, …) and the public-domain case (**NETWORK HD UK / YM Law → `gmail.com`**).
- The **PHA/Parkhouse principal code** — its insert sits commented in
  `migration/assets/schema/seed/916_provider_domain_corrections.sql`.

**Apply (WSL, via the [postgres.md](../../azure/postgres.md) runbook):** as a reviewed additive seed
delta — transient firewall rule → connect as Entra `digital@` → `SET ROLE csadmin` → `\i` the delta →
drop the rule. A domain serving >1 active provider stays ambiguity-guarded (intermediary path, never a
match key).

**Verify:** the delta header SELECTs show each provider's `known_email_domains` populated and the PHA row
active; the corpus count moves in the registry [`live-environment.md`](../../architecture/live-environment.md).

---

### 4. Approve production Archive reconciliation and root retarget  ·  **[BLOCKED FUTURE WINDOW]** — [TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)

New case folders currently mint under the **dev mirror root `392761581105`**. Before go-live, confirm the
**real production Box root folder** where live Case/PO folders should be created. The allocator does not use
that root as a “latest folder + 1” shortcut: it must mint above the canonical persisted database maximum and
the complete approved-ledger historical floor, failing closed when the authoritative floor is unavailable.

This root switch is part of the single TKT-178 cutover and is not an independent go-live action. Keep the
Box Function write scope and both apps on `392761581105` until the same approved input pack contains the signed/checksummed job spreadsheet,
an authenticated and contract-verified production EVA API result, the exact production Archive root plus
proven and explicitly approved least-privilege write/rename/merge/retarget scope, backup/restore proof, a
frozen approved dry-run hash and a named live window. A configured default, test, mirror, Viewer-only or
unverified root is not approval.

**Do (you, for that future window):** identify the intended production root in the Box web app, retain its
exact id and approve the reconciliation ledger. Independently prove that the acting service identity has
only the write capabilities the approved ledger requires; ordinary test-root access does not prove this.

**Future reconciliation — do not run now and execute after section 5:** after backup/restore and inverse
rehearsal, engage the rehearsed write fence for all ledger-scoped database/Archive objects, manual creation,
allocators/workers and preserve new arrivals in durable queues while Graph acknowledgement/enqueue and renewal
stay alive. Revalidate the approved high-water delta. Under an immutable allowlist of exact ledger-listed
source and destination object IDs, apply only the frozen ledger's approved database/folder/file rename,
merge and move actions while all three root settings retain their pre-window values. Every action
must checkpoint the object id, before/after parent/name/checksum and result; conflicts, missing bytes, newer
content or drift stop that row without overwrite/delete. Execute only pre-approved inverse operations if a
verify fails.

**Final future root commit (WSL) — do not run now:** only after all ledger-listed database/Archive actions and
invariants pass, narrow the Box Function fail-closed scope to the exact destination, then set both app mint
roots. Never clear the scope lock:
```
az functionapp config appsettings set -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --settings BOX_ALLOWED_ROOT_ID=<prod-root-id>
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-api-dev  --settings BOX_FOLDER_ROOT_ID=<prod-root-id>
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev --settings BOX_FOLDER_ROOT_ID=<prod-root-id>
```

**Verify in that window:** all three readbacks match the exact approved root and the database/Archive ledger
balances while the fence remains held. Exercise only the atomically claimed ingress canary's one-shot lease
after File Request/webhook configuration and EVA prerequisites pass. Verify its DB `box_folder_id` using canonical metadata for that
exact immutable object: returned ID equals the DB ID, `parent.id` equals the approved root and name equals
Case/PO. A root listing/name match is insufficient. Release ordinary work only after Archive is green for
the ingress canary and EVA is green for the separately pre-approved ready-case canary in the same run.

---

### 5. Approve the Case/PO ledger and floor seeding  ·  **[BLOCKED FUTURE WINDOW]** — [TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)

The live mint restarted near 001 after the 2026-06-30 reset while the real archive numbering is far ahead.
Full procedure: [`case-po-sequence-cutover.md`](../case-po-sequence-cutover.md) (§ "Future cutover
window"). Do not run the commands below until TKT-178 has the signed/checksummed job spreadsheet,
authenticated/verified production EVA, the exact approved production Archive target plus proven write
scope, backup/restore proof, a frozen approved dry-run hash and a named operator window.

**Do (you supply for that future window):** the signed/checksummed spreadsheet as the sole active-roster
authority. Authenticated production EVA, approved production Archive and read-only Outlook are evidence,
not alternate roster authorities. Review every disagreement and every source-only/out-of-scope disposition;
approve the complete closed-world per-case/folder mapping, historical prefix maxima, collision graph and
inverse ledger hash. Test, mirror, configured-default and Viewer-only roots do not satisfy the production
target/write gate.

**Future apply — command intentionally absent until the deterministic compiler exists.** The current
`case-po-floor-from-folders.mjs` helper consumes raw names and embeds the run date, so its output cannot be
the approved cutover artifact. The future compiler must consume the canonical ledger/run id, emit stable
SQL, and verify the exact approved byte hash before applying through the
[postgres.md](../../azure/postgres.md) runbook (`SET ROLE csadmin`). Apply only ledger-listed deterministic
mapping components through the new canonical batch service; the one-case `PATCH` route cannot atomically
execute swaps/cycles. Floors use every valid historical allocation per prefix. Stop on drift/conflict/floor
read failure; do not clear a PO for later allocation, overwrite a human value or improvise a number.

Ordinary single-case stamping when staff genuinely EVA-add a trial case may continue as current business
handling before the window. It is not a bulk cutover action or evidence and must not be used to bypass the
frozen ledger.

**Verify:** `GET /api/cases/next-po?principal=<X>` returns `source: 'floor'` (or a DB max above it) for
every active principal with fail-closed floor health. The atomically claimed journaled ingress canary—not an
undefined future arrival—must land above the reconciled historical maximum. Keep floor reads fail-closed for
all prefixes while their historical floors remain authoritative. Do not mint disposable live work.

---

### 6. Finish Outlook filing — separately approved pre-window move test  ·  **[MUST]** — [gated.md B4](../../gated.md)

The `Application Mail.ReadWrite` Exchange-RBAC grant landed 2026-07-03 and `OUTLOOK_MOVE_ENABLED=true` on
both apps; only the permission-cache wait and **your own separately approved live test** remain (you asked
to test this yourself — no automated live move will be run). This test is ordinary operational verification,
not part of TKT-178. It must finish before the cutover snapshot or wait until after sign-off. During the
TKT-178 window, operators and automation may not send, move, delete, categorise or mark Outlook items.

**Do (you):**
1. **Wait** for the Exchange-RBAC permission cache (~30 min–2 h; leave the app idle, don't poll). A move
   clicked too early `403`s / reports `failed` — retry after the wait.
2. **Live-test:** click "File to …" on a test row in the SPA inbox.

**Verify:** the email moves in Outlook, the row reads "Filed to …" and flips to Handled, and `audit_event`
carries `outlook_move_requested` → `outlook_moved`. Record the result in
[TKT-054/verification.md](../../tickets/done/TKT-054-ui-work/verification.md).

---

### 7. Enable the agent UI verification sweep  ·  **[MUST]** — sprint P4 gate ([GO_LIVE_SPRINT_PLAN.md](./README.md) §P4)

The P4 "UI is actually CLEAN" mandate runs a full browser sweep of the deployed SPA (all routes + drawers)
via **claude-in-chrome**. The agent can drive the browser only if you **pick/connect a Chrome browser** and
grant the extension site permission — a one-time human enablement.

**Do (you, Windows Chrome):**
1. Open Chrome with the **claude-in-chrome** extension installed, and **sign in to the SPA**
   (`https://proud-sky-04e318b03.7.azurestaticapps.net`) with a role-assigned staff account (from step 2).
2. In the extension, **grant site-level permission** for `proud-sky-04e318b03.7.azurestaticapps.net` so the
   agent can open tabs and read the page.
3. Tell the agent which connected browser to use when it starts the sweep.

> **Safety:** the TKT-178-window sweep is strictly read-only against the live SPA: no dismiss, file, merge,
> remove, chat or other action that writes triage/audit/business state. Any interactive sweep runs separately
> before the snapshot or after sign-off under explicit operator approval.

**Verify:** the agent reports the browser connected and completes the 11-route sweep with screenshots.

---

## Remaining gated and post-go-live actions

### 8. Archive reconstruction — root ids + listing  ·  **[BLOCKED FUTURE WINDOW]** — [TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)

Rung-1 any-status linking already acts (`RETRO_CASE_ENABLED=true`). This activates the additional **Box
reconstruction rung** (R2). Do not independently wire a historical or production root. The signed
spreadsheet, authenticated production EVA API evidence and exact approved production Archive root must
first reconcile to the same frozen TKT-178 ledger; any required write authority and named window must also
be approved. Existing read-only lookup configuration is evidence only, not permission to switch roots or
run reconstruction.

**Do (you, Box web + Admin Console):**
1. **Read the real archive root id(s)** from the Box web app URL (`https://app.box.com/folder/<id>` — the
   historical archive, NOT the live mirror root). Multiple per-year/per-provider roots are fine
   (comma-separated).
2. **Grant the Box service account Viewer** on each root: Box Admin Console → the folder → **Share** →
   invite the service-account email from the app's `Config.JSON` (read-only by scope lock: list/search/
   download — never create/upload/delete).
3. **Sanity-check 5–10 folders:** are they named EXACTLY the Case/PO (a suffixed `CCPY26050 - Smith`
   variant needs a flagged prefix-match arm)? Do they reliably contain the original instruction `.eml`?

**Future apply (WSL) — do not run now; only if the approved TKT-178 ledger explicitly includes these
read-only Archive roots:**
```
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev     --settings RETRO_BOX_ARCHIVE_ROOT_IDS=<id,id,…>
az functionapp config appsettings set -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --settings BOX_READONLY_ROOT_IDS=<id,id,…>
```

**Verify:** `az functionapp config appsettings list` readback shows the ids on both apps; a facade
`box/search` under a configured root returns 200. Do not run an ad hoc reconstruction or enable a mailbox
starter for proof; any database/Archive action must already be a ledger-listed executor action. Tracker:
[TKT-058/verification.md](../../tickets/done/TKT-058-retro-case-creation/verification.md).

---

### 9. Stage the File Request template + production webhook  ·  **[BLOCKED FUTURE WINDOW]** — [TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)

`BOX_FILEREQUEST_ENABLED` is already true, but the template id is empty. The mirror-root webhook is already
subscribed/live; that is not the required production-destination subscription. The current facade cannot
pre-stage a target outside its mirror write root, and the current receiver writes evidence/status
synchronously. TKT-178 therefore also requires the missing versioned exact-target staging operation and a
durable Box-event hold/fence before either state can be a pre-root hard gate.

**Do (you, Box web):** hand-build the template File Request per
[`box-activation.md`](../../azure/box-activation.md) §5, read its id.

**Future apply (WSL; only inside the approved fence before the final root commit):** record both apps' exact
prior values, then:
```
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-api-dev  --settings BOX_FILE_REQUEST_TEMPLATE_ID=<id>
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev --settings BOX_FILE_REQUEST_TEMPLATE_ID=<id>
```
(Only after that new staging/buffering capability is deployed and proved may the executor preserve an exact
pre-existing production-target **`FILE.UPLOADED` webhook** or create it from proven absence. Journal immutable
ID/target/callback and `created_by_run`; never widen the ordinary facade root to make creation succeed.)

**Verify before root commit:** independent app-setting and provider `GET` readback equals the approved
template ID plus exact production destination/callback, and a production event is durably held with no
evidence/status write. Any missing capability or mismatch aborts while roots are unchanged. Do not wait for
or manufacture a claimant upload in the bounded window; observe the first later ordinary genuine upload
under post-signoff monitoring.

---

### 10. Supply and verify the production EVA API  ·  **[BLOCKED CUTOVER MUST]** — [TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)

Staff can still use the existing drag-drop export for ordinary case handling, but that is not a substitute
for TKT-178's production reconciliation evidence. The final cutover requires the production EVA REST path
to authenticate successfully and pass the expected contract probe for the relevant principals. The API is
currently blocked (`EVA_API_ENABLED` absent; the one-principal-per-submission limitation is unresolved), so
TKT-178 and every production Archive/root/sequence action remain blocked.

**Do (you), when the vendor unblocks REST:** supply the approved credentials through Key Vault (never in
code), verify the API contract in test, then obtain a successful authenticated production contract probe
without changing a case. Retain redacted request/response evidence and the named approval in TKT-178. Before
any genuine submission, the implementation must also prove persisted operation state plus vendor
idempotency/correlation (or status-before-retry) across response loss and worker recycle; the current
process-local replay cache does not pass.

**Verify for the future window:** reconcile the signed spreadsheet, production EVA result and approved
production Archive inventory to the same frozen ledger. Only after that ledger and window are approved may
the exact pre-existing journaled EVA-ready canary round-trip once with the required photo order and visible
registration. Accepted/unknown EVA dispatch is the irreversible boundary; recover by persisted correlation
and forward reconciliation, never blind resubmission or a pretend rollback.

---

### 11. Policy / legal inputs + evidence-store hardening  ·  **[FOLLOW]** — [gated.md E1/E2](../../gated.md)

Business/legal decisions only you can make; they keep the data-protection posture open but block **no**
runtime intake. Supply the **retention period** (+ anonymise-vs-delete policy), the **lawful basis** for
DVSA/DVLA enrichment + valuation, the **legal-hold** rule, **ICO registration** + DVLA data-use terms, and
the **per-AI-gate production sign-off** for any future AI gate. Before any purge/disposition job is armed,
harden the evidence store `cespkevidstdev01` (blob soft-delete + versioning + container-delete-retention)
and the Key Vaults (purge-protection) — a privileged live change ([gated.md E1](../../gated.md)).

---

> **After any live change above:** update [`LIVE_FACTS.json`](../../../LIVE_FACTS.json) (bump
> `lastVerified`) + the [registry mirror](../../architecture/live-environment.md), then
> `VERIFY_LIVE=1 node verify-all.mjs`.
