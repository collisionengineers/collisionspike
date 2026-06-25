# Refactor / Re-platform Research — collisionspike

**Date:** 2026-06-25 · **Status:** Advisory research — the operator decides; nothing here is a
committed decision. · **Scope set by operator:** small team (~3–10 intake staff, low-hundreds of
cases/month, plan ~2–3× growth); drivers = **(1) cost/licensing, (2) reduce Microsoft vendor
lock-in, (3) capability/control**; **a full greenfield re-platform is acceptable**.

This folder answers: *what would it cost and take to move collisionspike off the Microsoft Power
Platform, and where to?* Each candidate has its **own named folder** with cost, billing model,
refactor requirements, lock-in profile, UK/EU residency, and cited sources.

| # | Folder | Target |
|---|---|---|
| 00 | [`00-current-architecture-baseline`](./00-current-architecture-baseline/README.md) | What we run now + component portability (the grounding doc) |
| 01 | [`01-powerapps-to-azure`](./01-powerapps-to-azure/README.md) | Power Platform → pure Azure PaaS |
| 02 | [`02-desktop-app-hosted-backend`](./02-desktop-app-hosted-backend/README.md) | Desktop client + thin hosted backend |
| 03 | [`03-migration-to-aws`](./03-migration-to-aws/README.md) | Amazon Web Services |
| 04 | [`04-migration-to-google-cloud`](./04-migration-to-google-cloud/README.md) | Google Cloud |
| 05 | [`05-supabase`](./05-supabase/README.md) | Supabase (managed Postgres BaaS) |
| 06 | [`06-cloudflare`](./06-cloudflare/README.md) | Cloudflare (Workers + D1 + R2) |
| 07 | [`07-vps-self-hosted`](./07-vps-self-hosted/README.md) | Self-hosted VPS (Hetzner / DigitalOcean) |
| 08 | [`08-paas-fly-render-railway`](./08-paas-fly-render-railway/README.md) | App-platform PaaS (Fly / Render / Railway) |
| 09 | [`09-other-setups-nocode-hybrid`](./09-other-setups-nocode-hybrid/README.md) | Low-code, BaaS, serverless-Postgres, hybrid |
| 10 | [`10-outlook-m365-integration`](./10-outlook-m365-integration/README.md) | **Cross-cutting:** how each target reads the Outlook shared mailboxes (via Graph) |
| 11 | [`11-email-intake-mx-routing`](./11-email-intake-mx-routing/README.md) | **Cross-cutting:** the MX-routing alternative — route a dedicated intake address off Microsoft |
| 12 | [`12-ai-layer-copilot-foundry-api`](./12-ai-layer-copilot-foundry-api/README.md) | **Cross-cutting:** the AI layer — Copilot/Copilot Studio vs Azure AI Foundry vs direct API |

---

## TL;DR

1. **Every alternative is cheaper than today, and the gap widens with growth.** The current stack is
   **per-user licensed**: Power Apps Premium is **$20/user/month and code apps *require* it** for
   every end user — **~$100/mo at 5 staff, ~$200/mo at 10**, before Power Automate licensing and
   Dataverse storage overage. Every migration target bills by **consumption** and lands **flat at
   ~$5–90/month regardless of headcount**.

2. **The migration effort is roughly the same (~16–23 weeks) wherever you go** — because the cost is
   replacing **Dataverse + the 15 Power Automate flows** (~30–40% of effort), which you rebuild on
   *any* target. The differentiator between targets is **run-cost, lock-in, and how much existing
   code carries over** — not rebuild size. (Full breakdown in
   [`00`](./00-current-architecture-baseline/README.md).)

3. **The one target with near-zero rebuild for part of the stack is Azure PaaS** — the **6 Azure
   Functions stay exactly as they are**. That makes it the lowest-effort cost win.

4. **The lowest *lock-in* answers are Postgres-based** (Supabase, Neon, a VPS) — standard Postgres
   exits cleanly with `pg_dump`. The lowest *sticker price* is Cloudflare (~$5) but its edge runtime
   **can't run the Python PyMuPDF parser**.

5. **Reject the hybrid "keep Dataverse, drop the licenses" path** — it doesn't save money
   (~$48/GB-month storage) and rests on a likely non-compliant licensing reading.

6. **Outlook stays — and that quietly favours Azure.** Intake runs off **3 Outlook shared mailboxes**,
   and **you're migrating the app, not the email system**. On **Azure**, the intake trigger is the
   *same* Office 365 Outlook connector in Logic Apps — near lift-and-shift. On **every non-Microsoft
   target** (AWS/GCP/Supabase/Cloudflare/VPS/PaaS) it becomes a **Microsoft Graph subscription +
   webhook + 7-day renewal loop** — ~$0 to run, but a real extra build. (This **corrects** the earlier
   "AWS → SES / GCP → Gmail" framing, which wrongly assumed relocating the company's email.) Full
   detail in [`10`](./10-outlook-m365-integration/README.md).

---

## Master cost matrix (realistic monthly, ~3–10 staff, UK/EU region)

| Target | Cheapest-sane | Robust | Scales w/ staff? | Lock-in | Functions carry over? | Relational DB? |
|---|---|---|---|---|---|---|
| **Power Platform (today)** | **~$100 (5u) / ~$200 (10u)** + PA + storage | higher | **Yes (per-seat)** | **High** | n/a | Dataverse |
| **01 Azure PaaS** | **~$21–34** | ~$89 | No | Medium | ✅ **zero port** | ✅ Postgres |
| **03 AWS** | ~$22–25 | ~$125–150 | No | Medium | ↻ Lambda rewrite | ✅ RDS Postgres |
| **04 GCP** | ~$35 (Postgres) / ~$5–10 (Firestore) | ~$180–230 | No | Low→High | ↻ Cloud Run port | ✅/❌ |
| **05 Supabase** | **~$25** flat | ~$25–75 | No | Low data / Mod platform | partner/keep | ✅ Postgres |
| **06 Cloudflare** | **~$5** | ~$5–10 | No | Low data / Mod–High compute | ⚠️ **parser doesn't fit** | ❌ SQLite (D1) |
| **07 VPS (Hetzner)** | **~$10 raw** + ~4–8 eng-hrs/mo ops | ~$33–39 (DO+mgd PG) | No | **None** | ✅ container | ✅ Postgres |
| **08 PaaS (Fly/Render/Railway)** | ~$8–48 | ~$45–48 | No | Low | ✅ container | ✅ Postgres |
| **02 Desktop + backend** | ~$10–30 + ~$300–500/yr signing | similar | No | Low | ✅ runs locally | per backend |
| **09 Stack (React + n8n + Neon)** | **~$10–20 self-host** | ~$230 managed | No | Low | ✅ container | ✅ Neon Postgres |

*Power Platform figures are 3-vote-verified; Azure SWA/Functions/Logic Apps verified; all other
figures are from a targeted primary-source pass (official pricing pages, June 2026) — see
**Methodology** below. DB rates assume an always-on small instance; case file bytes stay in **Box**
on every target, which keeps storage/egress negligible everywhere. The table prices **run-cost**; it
does not show the **Outlook-intake "Graph tax"** — a ~$0-to-run but real **build** effort on every
non-Microsoft target (Azure reuses the native connector). See [`10`](./10-outlook-m365-integration/README.md).*

---

## Recommendation

There are **two sensible finalists**, and the choice hinges on how strictly you weight driver (2),
*reduce Microsoft lock-in*:

### A. If "off Power Platform, onto portable Postgres" satisfies the lock-in goal → **Azure PaaS (01)**
- **Why:** lowest migration effort (the **6 Functions stay**, Key Vault stays, **the Outlook intake
  trigger is the *same* Office 365 connector in Logic Apps**, the team keeps familiar tooling/identity),
  biggest cost drop for least risk (**~$21–34/mo vs ~$100–200**), Dataverse → **standard Postgres**
  (portable), and you escape Power Platform's per-user licensing + CSP/connector limits (driver 3).
  Strong UK residency. The two most Microsoft-flavoured pieces — the Functions and the Outlook intake
  — both carry over with little change.
- **Caveat:** you're still an Azure tenant — a *partial* answer to "reduce Microsoft lock-in." But
  you're now on industry-standard primitives (Postgres, containers, OIDC), which is the part that
  actually matters for portability.

### B. If you want to genuinely de-risk Microsoft → **Supabase (05) or Neon + n8n + kept React app (09)**
- **Why:** **~$10–25/mo**, **lowest lock-in** (vanilla Postgres exits with `pg_dump`; n8n workflows
  are portable JSON; the React app is ~65–70% reusable), and the **Python parser runs as a container**
  (unlike Cloudflare). Supabase bundles auth + DB + storage in one $25 flat fee; the Neon-based
  self-hosted stack is even cheaper.
- **Caveat:** more migration friction than Azure PaaS (the 6 Functions leave Azure and become
  containers; you assemble auth + orchestration yourself or via Supabase/n8n) — **plus the Outlook
  intake "Graph tax"**: reading the shared mailboxes from a non-Microsoft host needs an Entra app +
  Graph subscription + webhook + 7-day renewal loop (~$0 to run, but real build effort — see
  [`10`](./10-outlook-m365-integration/README.md)). Outlook can't be escaped without relocating the
  company's email, which is out of scope.

### Supporting calls
- **AWS (03) / GCP (04):** only if leaving Microsoft entirely is a *strategic* goal. Same cost band
  as Azure PaaS but a full Functions rewrite **and** new lock-in (Cognito/Step Functions, or
  Firestore/Identity Platform) — so dominated by Azure PaaS on effort and by Supabase/VPS on lock-in.
- **VPS (07):** cheapest infra and zero lock-in, but the ~4–8 eng-hrs/month of ops is the real cost —
  attractive only with in-house sysadmin bandwidth; pair with managed Postgres (Neon/DO) to de-risk.
- **Desktop (02):** a **complement** (single-operator power-tool reusing the existing pywebview
  parser GUI), not the primary surface for a shared-queue team workflow.
- **Hybrid keep-Dataverse (09E):** ❌ reject — no cost saving, licensing risk.

### Suggested next step
Pick between finalist **A** and **B**, then do a **time-boxed spike** of the single biggest cost
driver — **the Dataverse→Postgres schema + re-expressing 2–3 representative flows** (intake, dedup,
EVA-submit) on the chosen target — to validate the ~16–23 week estimate before committing. The
React `DataAccess` seam means the UI can be pointed at a mock/real backend during that spike with
minimal disruption. **If the chosen target is non-Microsoft, make the Outlook intake the
first thing you spike** — stand up the Entra app + a Microsoft Graph mail subscription + a webhook
receiver against one test mailbox ([`10`](./10-outlook-m365-integration/README.md)); it's the part
most likely to surprise on effort, and confirming it de-risks the whole intake path.

---

## Methodology & confidence

- **Codebase facts** (folder 00, portability verdicts, effort estimate) come from two read-only
  scouts of this repo on 2026-06-25 — high confidence.
- **Power Platform licensing + Azure SWA/Functions/Logic Apps figures** were produced by the
  `deep-research` workflow and **survived 3-vote adversarial verification against primary Microsoft
  sources** — high confidence.
- **All other target costs** (AWS, GCP, Supabase, Cloudflare, Fly/Render/Railway, Hetzner/DO,
  low-code/BaaS/serverless-Postgres, Azure DB/auth) come from a **targeted primary-source pass**:
  five research agents fetching official pricing pages + the Azure Retail Prices API (June 2026,
  UK/EU regions). These are **published rates**, but the multi-component monthly *totals* are
  arithmetic **estimates** and were **not** put through the same 3-vote gate — each folder flags
  PUBLISHED vs ESTIMATE inline.
- ⚠️ **Cloud pricing shifts frequently.** Examples caught during research: the Power Apps per-app SKU
  was retired for some new-buyer channels (Jan 2026); Hetzner raised CPX prices (15 Jun 2026). Two
  load-bearing figures couldn't be machine-read from live JS-rendered tables (Render flat tiers,
  some GCP rates) and are marked "verify before contracting." **Re-confirm any figure in the
  provider's live calculator before commitment.**
- UK/EU **data residency** is achievable on every target (each folder names the region), but the
  *identity/auth layer* is the recurring residency caveat (Entra EMEA-not-UK-pinned; Firebase Auth
  historically US; Cloudflare EU-not-UK). Confirm per-provider DPAs for claimant PII.

> Following project convention ([`docs/reviews/README.md`](../../reviews/README.md) precedence), this
> is **research**, ranked below binding reviews and ADRs. If a direction is chosen, capture it as an
> **ADR** so it becomes part of the decision record.
