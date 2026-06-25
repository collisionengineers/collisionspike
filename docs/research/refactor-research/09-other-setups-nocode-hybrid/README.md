# 09 — Other Setups: Low-Code, BaaS, Serverless-Postgres & Hybrid

> **One-line verdict.** No single product here replaces the *whole* Power Platform — they replace
> **layers**. The realistic non-Microsoft stack is a **combination**: a UI/internal-tool layer +
> **n8n** (the strongest direct Power Automate replacement) + a **serverless Postgres** (Neon).
> Self-hosted, that's **~$10–20/mo** (one VPS); fully managed, **~$230/mo** — both with materially
> lower lock-in than Power Platform's ~$200/mo. **The one option to reject is the hybrid
> "keep-Dataverse" path** — it neither saves money nor stays cleanly licence-compliant.
>
> Pricing confidence: per-unit rates **published**; multi-seat totals are **estimates** from those
> rates. Several enterprise/self-host tiers are sales-gated (flagged below).

See [`00-current-architecture-baseline`](../00-current-architecture-baseline/README.md).

---

## What each option replaces

| Layer | Options |
|---|---|
| **UI + workflow** (Power Apps-like internal tool) | Retool, Budibase, Appsmith |
| **Workflow only** (Power Automate replacement) | **n8n** |
| **DB + auth + functions** (BaaS) | Appwrite, Firebase |
| **DB only** (Dataverse replacement) | **Neon** (serverless Postgres), PlanetScale |
| **Hybrid** (keep Dataverse, drop PP licensing) | ❌ reject |

---

## A. Low-code / internal-tool platforms (UI layer)

| Tool | ~10-user monthly | Lock-in | Fit |
|---|---|---|---|
| **Retool** | Team ~$65 · Business realistic ~$255 (worst ~$500) | **High** (proprietary, no free prod self-host) | Best builder DX; priciest; would duplicate the React Code App already built |
| **Budibase** | **$0 self-host** · cloud ~$184 | **Low** (GPLv3) | Good OSS internal-tool UI + automations; best exit story of the three |
| **Appsmith** | **$0 self-host** · Business cloud flat **$150** | **Low** (Apache-2.0) | Cheapest predictable; flat per-user, no builder/end-user split |

> Note: the team **already has a polished React Code App** (~65–70% portable). Adopting a low-code UI
> tool would mean *throwing that away* — so these matter mainly if you'd rather maintain a low-code
> tool than React. Keeping the React app + a backend (folders 01/05/07/08) is usually the better
> reuse story.

## B. n8n — the direct Power Automate replacement (workflow layer)

- **Cloud:** Starter €20/mo (2.5k exec) · **Pro €50/mo (~$54)** (10k exec) · Business €667/mo. Users
  **unlimited on every plan** (billing is per *execution*, not per seat).
- **Self-hosted Community Edition: free** (fair-code; the "no reselling as SaaS" restriction doesn't
  bite internal use) — **the cost-optimal answer: software free + ~$8–20/mo VPS, no execution cap.**
- **Fit: strongest direct replacement for the 15 flows** — HTTP/REST nodes for EVA/DVSA/DVLA/Box +
  parser/enrichment calls, schedule nodes for chasers, branching for the dedup ladder + status
  machine. Workflows are portable JSON → **lowest lock-in** of any orchestration option.
- ⚠️ **Execution trap:** use Graph/webhook *push* triggers, not minute-polling IMAP (polling alone
  ≈ 43k exec/mo and blows past Pro). Self-host removes the cap entirely.

## C. Backend-as-a-Service (DB + auth + functions layer)

| Tool | ~10-user monthly | Lock-in | Fit |
|---|---|---|---|
| **Appwrite** | **$25 Cloud Pro** · **$0 self-host** | Low–Moderate (self-hostable, but Appwrite-specific SDK) | Bundles auth + 6 functions + storage + DB cheaply; **but doc/collection DB, not true relational** |
| **Firebase (Blaze)** | **~$0–3** (inside free tiers) | **Highest** (no self-host, proprietary Firestore NoSQL) | Cheapest bill on the whole list, but worst relational fit + deepest captivity |

> Both BaaS options are **NoSQL** — a poor fit for relational case data (Case↔Provider↔Repairer↔docs +
> reporting). If you want BaaS *and* relational, **Supabase** (folder [05](../05-supabase/README.md))
> is the Postgres-native answer.

## D. Serverless Postgres (Dataverse-replacement DB, mix with any compute)

| Tool | ~now monthly | At 2–3× growth | Lock-in | Note |
|---|---|---|---|---|
| **Neon** | **~$0–25** (Free → Launch $0.106/CU-hr + $0.35/GB) | ~$35–50 | **Low** (standard Postgres) | **Scales compute to zero when idle**; branching; AWS **Frankfurt + London**. Strong detachable system-of-record |
| **PlanetScale** | ~$15–30 (PS-5/10 HA) | ~$30–50 | Low–Moderate | **No free tier** (removed 2024); **no scale-to-zero** (always-on fee); MySQL/Vitess + Postgres GA; EU: Dublin/Frankfurt/NL |

**Neon is the standout** here for an intermittent internal app: standard Postgres (low lock-in) +
scale-to-zero (near-$0 when idle) + a London region. Pair it with any compute (containers on a VPS,
Cloud Run, Fly) and the React app.

## E. Hybrid — keep Dataverse, drop Power Platform licensing — ❌ REJECT

The question: keep Dataverse as system-of-record via its Web API/OData, but drive it from your own
React app + Functions to escape Power Apps/Automate per-user licensing. **It doesn't work
economically or compliantly:**

- **PAYG Dataverse exists** (link an environment to an Azure subscription, no upfront commitment) —
  but the **storage meter is punishing: $48/GB-month** (~137× Neon's $0.35/GB), and the cheaper
  $40/GB rate needs prepaid licenses anyway.
- **The clean per-API-call meter is NOT billable yet** — "Power Platform requests" at $0.00004/req/day
  is flagged *"coming soon"* and, even at GA, bills only above each user's daily entitlement (which
  presupposes a base license).
- **Multiplexing rule:** Microsoft licenses Dataverse by *who accesses the data*, not the front-end.
  A custom React app + Functions over the Web API is classic multiplexing — the humans behind it
  **generally still each need a Power Apps/Dynamics license**. The "no licenses, just meters" reading
  is **likely non-compliant**.
- **Verdict:** worst of both worlds — still ~$48/mo+ on storage alone, on an unbilled preview meter +
  a shaky licensing interpretation. Keep Dataverse only for *native Microsoft integration* reasons,
  **never for cost**.

---

## Ranking (monthly $ for ~10 users · lock-in · fit)

| Option | Layer | Monthly (realistic) | Lock-in | Fit |
|---|---|---|---|---|
| Firebase Blaze | DB+auth+fn+host | ~$0–3 | Highest | Poor (NoSQL) |
| **Neon** | DB only | ~$0–25 | **Low** | **Best detachable DB** |
| PlanetScale | DB only | ~$15–30 | Low–Mod | Solid, but always-on |
| Appwrite | BaaS bundle | ~$25 / $0 self-host | Low–Mod | Doc-DB, not relational |
| **n8n** | Workflow | ~$54 / **$0 self-host** | **Lowest** | **Best Power-Automate replacement** |
| Appsmith | UI+workflow | $0 self-host / $150 | Low | Cheap UI (but you have React) |
| Budibase | UI+workflow | $0 self-host / ~$184 | Low | OSS UI |
| Retool | UI+workflow | ~$100–255 | High | Premium DX, priciest |
| **Hybrid Dataverse** | keep DB | ~$48+ (risky) / ~$200 | High | ❌ reject |

**A realistic full non-Microsoft stack** = **React app (kept) + n8n + Neon + a host** →
**~$10–20/mo fully self-hosted** (one VPS running n8n + Neon-or-Postgres) up to **~$230/mo** fully
managed (Appsmith Business $150 + n8n Pro $54 + Neon ~$25, if you also swap React for a low-code UI)
— versus **~$200/mo Power Apps Premium**, with materially lower lock-in.

## Sources

- Retool https://retool.com/pricing · Budibase https://budibase.com/pricing/ · Appsmith https://www.appsmith.com/pricing
- n8n https://n8n.io/pricing/ · Appwrite https://appwrite.io/pricing · Firebase https://firebase.google.com/pricing
- Neon https://neon.com/pricing · PlanetScale https://planetscale.com/pricing
- Dataverse PAYG meters https://learn.microsoft.com/en-us/power-platform/admin/pay-as-you-go-meters · https://learn.microsoft.com/en-us/power-platform/admin/pay-as-you-go-overview
