# 02 — Decisions & open questions

Every architectural fork, the options weighed, and the choice. **All decisions D1–D10 + Q1 are
resolved.** The only outstanding item is the P0 operator **action** under Q1 (upgrade the Free Trial
→ Pay-As-You-Go before the ~30-day credit window lapses) — a task, not an undecided fork, and one the
operator has **weeks** of runway on (spend is ~£0/mo, so the binding deadline is the trial's calendar
expiry, not credit burn — see [`40`](./40-costing-and-servicing.md)). Append to the **RESOLVED log**
as new forks are decided during execution.

## Resolved (operator-confirmed)

### D1 — System-of-record database → **Postgres Flexible Server B1ms**
| Option | Pros | Cons | Cost |
|---|---|---|---|
| **Postgres Flexible B1ms** ✅ | No cold start (predictable UX); native **RLS** for the role model; first-class drivers in both Node and Python; flat cost | Always-on (small fixed floor) | Free 12 mo on a free-account sub; else ~£15–18/mo |
| Azure SQL Serverless | ~£0 when idle (auto-pause) | Multi-second cold start after a pause; punishing (~£60+/mo) if it never idles | variable |
**Why:** an internal staff tool wants predictable latency; RLS cleanly reproduces the two Dataverse
security roles; Postgres is the most portable exit. **Free-tier caveat → see the open question (Q1).**

### D2 — Orchestration → **Durable / queue Functions**
| Option | Pros | Cons | Cost |
|---|---|---|---|
| **Durable / queue Functions** ✅ | Pure code, cheapest to run (consumption free grant); no new service; one ecosystem | **No managed shared-mailbox trigger** → build a Microsoft Graph change-notification webhook + renewal loop (~1–2 wks); no visual run-history | ~£0–5/mo |
| Logic Apps Consumption | Same Office 365 Outlook trigger (near lift-and-shift); visual designer + run history | Azure-specific workflow JSON; pennies/run but more than Durable | ~£5–15/mo |
**Why (operator override of the Logic Apps recommendation):** keeps everything in the Functions
runtime the team already operates and minimises run-cost; the price is the Graph-webhook build, fully
specified in [`22`](./22-orchestration-migration.md). **Risk R5** (renewal lapse) is owned there.

### D3 — Power Platform teardown → **Delete the Dev sandbox entirely**
After cutover is green **and** a final cold CSV export is archived off-repo, delete the sandbox,
both solutions, flows, connectors, and the Code App. Stops all Power Platform licensing and removes
the legacy surface. Alternative (keep an empty sandbox as fallback) leaves residual licensing/admin
surface and contradicts "not live + no legacy." Sequence in [`90`](./90-deprovision-power-platform.md).

### D4 — Old docs/ADRs → **Archive off-repo, then delete**
Copy to an off-repo archive (or orphan `archive` branch), then remove from the working tree. No
in-repo "legacy/superseded" stubs. Working tree ends clean; nothing lost outside the archive + git
history. Lists in [`91`](./91-documentation-rewrite-delete.md).

### D5 — Data API tier → **Standalone Flex Consumption Function App** (not SWA managed API)
Per Microsoft Learn, **SWA managed Functions are HTTP-only, Consumption-only, capped at 45s, and have
no managed identity and no Key Vault references** — but the new API must hold a Postgres connection +
KV secrets and validate Entra tokens. So the API is a **standalone Function App** (matching the six
already deployed); the SPA calls it with an MSAL bearer token. Detail in [`21`](./21-backend-api-build.md).

### D6 — SPA host → **Static Web Apps, Free tier**
Free is enough: the API is a separate Function App reached by bearer token + CORS. Go **Standard**
(~£7/mo) only if you later want the `/api` reverse-proxy (linked backend, no CORS) or an SLA.

### D7 — Feature-flag home → **Plain Function app-settings**
The ~28 gates become app-settings (free, restart-to-change). Move to **App Configuration** (~£1/mo,
runtime flips + a flag UI) only if you start flipping gates often at runtime. Mapping in [`10`](./10-settings-migration.md).

### D8 — Auth → **Entra workforce via MSAL, staff-only**
Internal intake tool; no external/portal users → **no External ID**. Staff sign in with their
existing Entra accounts (free on the workforce tenant). The two Dataverse roles become Entra app
roles. Detail in [`31`](./31-auth-migration.md).

### D9 — Migration folder → **top-level `migration/`**
Sibling to `docs/` so it never pollutes the docs index and is deletable wholesale at P9.

### D10 — Language for the new backend code → **TypeScript for the new API + orchestration; Python kept for the existing 6 Functions**
| Option | Pros | Cons |
|---|---|---|
| **TypeScript (new API + orchestration)** ✅ | The API and orchestration evaluate the **same business rules** the TS frontend already has (`mockup-app/src/contracts/` + `src/domain/`) — reuse **one shared copy**, end-to-end shared types | A second backend runtime alongside the Python Functions |
| Port the rules to Python | One backend runtime | **Two copies of the business rules** (TS frontend + Python backend) maintained forever, guarded by a parity test; permanent divergence risk |
**Why:** the worst outcome is maintaining the EVA-readiness / status-machine / dedup rules **twice in
two languages**. The new API + orchestration are the components that share those rules with the
frontend, so they go **TypeScript** and import a shared domain package. The existing 6 Functions
(parser, enrichment, EVA, Box, OCR) are standalone compute/integration that **don't** touch those
rules — they **stay Python, untouched**. Net: a clean split — **one shared TS rules "brain," Python
leaf integrations.** Detail in [`21`](./21-backend-api-build.md) + [`22`](./22-orchestration-migration.md).

---

## Q1 — Which Azure subscription hosts the new stack? — **RESOLVED**

**Finding (verified via `az`):** the existing subscription holding `rg-collisionspike-dev` is itself an
**Azure Free Trial** — `Azure subscription 1` (`e6076573-23a5-46a8-acef-7e22d264e5db`),
quotaId **`FreeTrial_2014-09-01`**. So there is **no split-subscription trade-off**: provision Postgres
B1ms in **this same subscription** to claim the **12-months-free** DB *and* sit beside the existing
Functions/KV. Q1's earlier "fresh free-account sub vs current PAYG sub" framing is moot — the current
sub already *is* a free-account sub.

**The remaining caveat (now the real action):** a Free Trial's $200 credit lasts **30 days**; after
that the subscription must be **upgraded to Pay-As-You-Go** to keep running paid resources, or it (and
the already-deployed Functions/KV) gets disabled. Upgrading to PAYG is free in itself and the
**12-month free-service allowances — including Postgres B1ms (750 h + 32 GB storage + 32 GB backup) —
survive the upgrade**. Free Trial also carries lower quotas/spending caps than PAYG (our footprint is
modest, but a quota bump needs PAYG).

**Runway (per [`40`](./40-costing-and-servicing.md)):** because the planned footprint sits inside the
free allowances (Postgres free for 12 months; Functions/SWA/KV on free grants), monthly spend is ~£0,
so the credit does **not** burn down — the binding deadline is purely the trial's **calendar 30-day
expiry**, i.e. **roughly four weeks of runway**. **Provisioning the substrate now, while still on the
trial, is fine and expected** (P1) — the upgrade is not a precondition to provision, only a deadline to
beat before the window closes.

**Action (P0/P1):** check the remaining trial days (Portal → Subscriptions → *Azure subscription 1*),
provision Postgres + the new apps in this subscription now, and **upgrade the trial to Pay-As-You-Go**
(same blade → Upgrade) before the 30-day window lapses. Costing in [`40`](./40-costing-and-servicing.md).

---

## RESOLVED log
- *(P0)* D1–D9 confirmed this session.
- *(P0)* **D10 added** — new API + orchestration in **TypeScript** (share the frontend's domain/contract
  rules as one package); existing 6 Functions stay Python. Flip from the original "port to Python" rec,
  to avoid maintaining the business rules twice.
- *(P0)* **Q1 resolved** — current sub `e6076573…` is a **Free Trial** (quotaId `FreeTrial_2014-09-01`),
  so it already qualifies for the 12-month-free Postgres B1ms; provision in-place, no second sub.
  ~£0/mo spend ⇒ **~4 weeks of runway** (the deadline is the trial's calendar 30-day expiry, not credit
  burn); provisioning now on the trial is acceptable. Open action: **upgrade trial → Pay-As-You-Go**
  before the 30-day window lapses (keeps the free DB; avoids the existing Functions/KV being disabled).
- *(append new decisions here as they are made during execution, with date + who decided)*
