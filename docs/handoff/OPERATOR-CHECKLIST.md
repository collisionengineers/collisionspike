# OPERATOR CHECKLIST — collisionspike (things only you can do)

_Assembled 2026-06-28 by the agent team. These are the items the team **cannot** self-serve — they need
an Exchange/Entra admin action, an external credential, or a Box-side artifact. Everything else (Box auth
fix, env, hardening, IaC) is being done by the team and tracked in the sibling `0X-*.md` handoff docs._

Live stack (verified): RG **`rg-collisionspike-dev`** (uksouth), sub `e6076573-…`. Apps all Running.
The system is **read-only + manual case-create** until item **#1** below is done.

---

## #1 — Exchange-RBAC mailbox grant → turns on automated email intake (THE functional unlock)

Today no automated intake runs: the orchestration app `cespk-orch-dev` is deployed + wired (42 functions)
but the intake mailboxes are **not Exchange-RBAC-scoped**, so no Graph subscription/poll can read mail.

**Identity to grant:** intake app **`CollisionSpike Graph Intake`**, appId
`5d37a155-2af8-4878-b96a-6faad5207137` (tenant `858cf5b3-…`).

**Mailboxes.** Live `GRAPH_INTAKE_MAILBOXES` is currently **engineers@ + digital@** (test set).
For **production** the target is **info@ + engineers@ + desk@** (drop `digital@` — it's the dev mailbox).
Grant the test pair first, prove the path, then update the setting + grant the prod set.

**How (Exchange Online PowerShell — needs a real terminal, not the `!` prefix; WAM browser auth fails):**
```powershell
Connect-ExchangeOnline -Device          # device-code flow; a plain Connect-ExchangeOnline may fail "window handle"
# grant resource-scoped Application Mail.Read (NOT Mail.Read.Shared), no Global-Admin consent:
New-ServicePrincipal -AppId 5d37a155-2af8-4878-b96a-6faad5207137 -ServiceId <objectId> -DisplayName "CollisionSpike Graph Intake"
New-ManagementScope    -Name "CollisionSpike-Intake-Scope" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'engineers@collisionengineers.co.uk' -or PrimarySmtpAddress -eq 'digital@collisionengineers.co.uk'"
New-ManagementRoleAssignment -App 5d37a155-2af8-4878-b96a-6faad5207137 -Role "Application Mail.Read" -CustomResourceScope "CollisionSpike-Intake-Scope"
```
(The original helper was `C:\Users\Alex\grant-exo-rbac-intake.ps1` on the old PC — re-create it here, or run the cmdlets directly. Full detail: `docs/azure/entra-graph.md`.)

**⚠️ The ~50-minute cache trap (do not fight it).** Right after the grant, Graph calls return
**403 `ExtensionError … Access is denied`** even though `Test-ServicePrincipalAuthorization` says
`InScope: True`. The permission cache holds the stale "deny" for **30 min – 2 h**, and **probing keeps it
alive**. Correct sequence: **grant → leave the app totally idle ≥30 min (no token probes, no `graph-renew`)
→ then fire it once.** Do NOT loop graph-renew.

**Trigger intake once the cache clears:**
```bash
KEY=$(az functionapp keys list -g rg-collisionspike-dev -n cespk-orch-dev --query masterKey -o tsv)
curl -X POST "https://cespk-orch-dev.azurewebsites.net/admin/functions/graph-renew" \
  -H "x-functions-key: $KEY" -H "content-type: application/json" -d '{"input":""}'   # expect 202
```

**Then verify end-to-end:** send a test email to a scoped mailbox → confirm a `Case` row appears in
Postgres (`cespk-pg-dev` / db `collisionspike`, table `case_`) with the right status, dedup, and provider
match. Scale to the prod mailbox set after the test pair passes.

**For prod, update the setting first** (it's JSON, NOT csv — a bad value silently parses to zero mailboxes):
```bash
az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev \
  --settings GRAPH_INTAKE_MAILBOXES='[{"mailbox":"info@collisionengineers.co.uk","minIntakeDate":"2026-06-27T00:00:00Z"},{"mailbox":"engineers@collisionengineers.co.uk","minIntakeDate":"2026-06-27T00:00:00Z"},{"mailbox":"desk@collisionengineers.co.uk","minIntakeDate":"2026-06-27T00:00:00Z"}]'
```

---

## #2 — Staff app-role assignment (otherwise everyone but one person gets 403)

Only **one** staff principal is assigned an app role on the Data API today; every other staff member
gets **403**. Assign roles in **Entra → Enterprise Applications → the API app
`fa2fb28c-fef6-40a4-8d3b-ae6725891d72` → Users and groups**:
- **`CollisionSpike.User`** — normal staff.
- **`CollisionSpike.Superuser`** — full privilege (settings / feature-gates / audit / corpus-write).
- (`CollisionSpike.Engineer` is defined but not yet enforced — skip.)

Assign the full staff roster before broad rollout.

---

## #3 — EVA Sentry test credentials

EVA stays gated OFF until **test** creds are injected. Provide Minotaur Sentry **test** API
credentials → they go into KV `cespkevakvufa3ci` as references, then `EVA_API_ENABLED` is flipped (after
the Minotaur one-principal-code patch + the parity test). Until then, EVA uses the JSON drag-drop export
path. (The drag-drop export into the EVA **test** env to confirm acceptance is also an operator action.)

---

## #4 — Box: the two Box-side artifacts (auth itself is being fixed by the team)

✅ **Done by the team:** live Box JWT auth is fixed and the `BOX_*` gates are set on the box-fn + api +
orch (box-fn smoke-test returns HTTP 200; folder `CCPY26050` listed). Full record in `02-box-activation.md`.
The remaining items are **Box-side / operator** because they can't be created from Azure:
- **File-Request template.** Hand-build the one template File Request in Box (with the
  `vehicle_registration` metadata), then set its id as `BOX_FILE_REQUEST_TEMPLATE_ID` on the apps that mint
  File Requests. Until then folder-create + the upload webhook work; File-Request copy does not.
- **`FILE.UPLOADED` webhook subscription.** Subscribe the webhook (root or per-case) to point at
  `https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook`; the receiver verifies the dual-key HMAC
  against the two webhook secrets. Then exercise: upload → evidence-attach → `box_upload_received` audit →
  status re-eval. This is the single biggest empirical Box unknown — test it deliberately.
- **Scope lock.** `BOX_ALLOWED_ROOT_ID=392761581105` pins everything to the test folder. Clear/repoint it
  to the production archive root to go beyond testing.

---

## #5 — Operational hygiene (recommended, not blocking)

- **Azure Monitor heartbeat alert** on intake once it's live (alert if no successful intake poll in N hours).
- **App Insights sampling/cap** — currently none; the one sleeper cost item. Set a daily cap or sampling.
- Keep `digital-3339-resource` (AIServices S0) and ACR Basic — both likely load-bearing (Vision for
  location-assist; OCR image). Don't tear down.

---

_The team will append to this file as more operator items surface. Status of the self-serve streams is in
`00-environment.md`, `01-stack-health.md`, `02-box-activation.md`, `03-api-hardening.md`, `04-iac-and-pii.md`._
