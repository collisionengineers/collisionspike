# 40 — Costing & servicing

Aim: the **cheapest sane** Azure bill, flat regardless of headcount. Figures are UK South list rates
(reconfirm via the Azure Pricing calculator / Retail Prices API before committing — pricing drifts).

## Monthly run-cost (≈3–10 staff, low-hundreds cases/mo)

| Component | Cheapest sane | Note |
|---|---|---|
| SPA — Static Web Apps | **£0** (Free) | Free tier is enough; Standard (~£7/mo) only for linked-backend reverse-proxy/SLA (D6) |
| Data API — Functions (Flex Consumption) | **~£0** | Free grant covers low-hundreds cases/mo |
| Orchestration — Functions (Flex Consumption) + Storage queues | **~£0–3** | Durable history + queue storage are pennies |
| Existing 6 Functions | **unchanged** | already in the bill today |
| **Database — Postgres Flexible B1ms, 32 GB** | **£0 for 12 mo¹ / then ~£15–18** | ¹free **only on a free-account sub** — see below |
| Auth — Entra workforce | **£0** | staff on the workforce tenant aren't billed; no External ID |
| Key Vault + App Insights + Storage | **~£1–5** | <£1 KV (×2: existing + new `cespk-pg-kv-dev` break-glass), 5 GB/mo App Insights free, pennies for the two new host storage accounts (`cespkapistdev01`/`cespkorchstdev01`) + blob |
| Graph change-notification subscription | **£0** | no charge for the subscription itself |
| **TOTAL** | **~£1–8/mo (yr 1 on free-account DB) · ~£16–26/mo thereafter** | flat vs headcount |

**Versus today:** Power Apps Premium is **$20/user/mo** and code apps require Premium per end user —
**~£80–160/mo at 5–10 staff in seats alone**, before Power Automate licensing and Dataverse overage.
The migration removes the per-seat axis entirely.

## ¹ The Postgres free-tier note (verified on Microsoft Learn + `az`)
Azure Database for PostgreSQL **Flexible Server B1ms + 32 GB storage + 32 GB backup is free for 12
months** (750 hours/month — enough to run continuously) on an Azure **free-account** subscription.

**The current subscription qualifies.** `rg-collisionspike-dev` sits in `Azure subscription 1`
(`e6076573…`), quotaId **`FreeTrial_2014-09-01`** — a Free Trial, i.e. a free-account sub. So provision
Postgres **in place** and the **DB is £0 for year 1** (~£180–216 saved); no second subscription.

**The runway (verified on Microsoft Learn — *"Avoid charges with your Azure free account"* + *"Create
services included with Azure free account"*):** a Free Trial gives **$200 of credit for 30 days** *and*
12 months of limited free services. Because the substrate above runs at **~£0/mo** (Postgres free,
Functions/SWA/Graph on free grants), almost none of the $200 is consumed — so the **binding deadline is
the 30-day calendar expiry, not credit burn**. That is the operator's **~4 weeks of runway**: provision
now, build, and **upgrade to Pay-As-You-Go before day 30**.

**Caveat (Q1 action in [`02`](./02-decisions-and-open-questions.md)):** at day 30 the credit expires; you
**must upgrade to PAYG** to keep paid resources running, or the sub (and the existing Functions/KV/ACR) is
disabled. The 12-month free allowances — incl. Postgres B1ms (750 hrs + 32 GB + 32 GB backup) —
**survive the upgrade** (Learn: *"After you upgrade, you'll have continued access to free services for 12
months"*). So: upgrade to PAYG early, keep the free DB. After the 12 months the DB is ~£15–18/mo and the
totals above apply. Upgrading mid-trial also lets you spend any remaining credit through the new PAYG sub
until the original 30-day mark.

## Provisioning the substrate (P1)
The whole P1 substrate is scripted, **idempotent**, in [`assets/iac/provision.sh`](./assets/iac/provision.sh)
(bash + `az`): Postgres `cespk-pg-dev` (B1ms/32 GB/PG16, Development workload → free-account allowance),
the two Flex-Consumption Node 20 Function Apps (`cespk-api-dev`, `cespk-orch-dev`) + their host storage,
the Free Static Web App (`cespk-spa-dev`), system-assigned identities, the break-glass DB-admin vault
(`cespk-pg-kv-dev`, password generated + stored in KV, never hardcoded), and the **Key Vault Secrets
User** grants. It only **adds** resources to `rg-collisionspike-dev` — it never touches the existing
6 Functions, ACR, Blob, observability, or the EVA/Box/enrich vaults. `DRY_RUN=1 bash provision.sh`
prints the plan without changing anything. Each `az create` flag is verified against the Learn topics
named in the script header.

## Why Durable over Logic Apps saved a little (D2)
Durable/queue Functions run on the consumption free grant (~£0) where Logic Apps Consumption would be
~£5–15/mo. The saving is real but small; the **real cost of D2 is build effort** (the Graph webhook +
renewal, ~1–2 wks) and the **R5 reliability burden** (renewal must not lapse) — budgeted in
[`22`](./22-orchestration-migration.md), not here.

## Servicing runbook (post-cutover, steady state)
- **Patching:** Postgres Flexible Server auto-applies minor patches in its maintenance window; pick an
  off-hours window. Functions runtime is managed.
- **Backups:** Postgres point-in-time restore within the 7-day default retention (raise if needed,
  small cost). Blob `cespkevidstdev01` keeps soft-delete + versioning.
- **Cost control:** if the app is idle overnight, Postgres can be **stopped** (stays stopped up to 7
  days, no compute charge, storage only) — but stopping breaks the always-on intake unless the
  webhook/queue tolerates the gap; for an intake mailbox, **keep it running**.
- **The mandatory alert (R5):** App Insights alert on "no Graph notification AND no successful renewal
  in N hours" → intake has silently stopped. This is the single most important servicing signal.
- **Secrets rotation:** rotate DVSA/DVLA (and later EVA/Box) creds in Key Vault; KV references pick up
  new versions automatically when referenced without a pinned version.
- **Scaling headroom:** B1ms covers the stated load with ~2–3× growth; step to B2s (~£60/mo) only if
  connection/CPU pressure shows in metrics — not pre-emptively.
