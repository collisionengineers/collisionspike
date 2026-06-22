# 02 — Plans & cost

> **Headline:** the floor for the base pivot is **base Box Business** (~$15/user/mo, **3‑seat minimum ≈
> $540/yr list**) — it covers folders, File Requests, webhooks and CCG. **Box Business Plus** (~$25–33/
> user/mo, ≈ $900/yr) is an **optional later tier** needed **only** for the Metadata reg‑capture field.
> The pivot is **storage‑cost‑neutral** — evidence already lives in cheap Azure Blob, not expensive
> Dataverse File — so **do not justify the pivot on price**. Its value is workflow, UX, external‑upload
> ergonomics and governance.
>
> All figures are **USD list** (box.com renders prices client‑side, so GBP needs a sales quote; USD list
> corroborated across Vendr / Costbench / G2). Treat as "approximate list, pre‑discount."

## The Box plan ladder

| Plan | ~$/user/mo (annual) | Storage | Max file | API calls/mo | Notable | Metadata? |
|---|---|---|---|---|---|---|
| Business Starter | ~$5 (~$7 mo) | **100 GB (capped)** | 2 GB | 50K | the only capped Business tier | ❌ |
| **Business** ⭐ (the floor) | ~$15 (~$20 mo) | **Unlimited** | 5 GB | 50K | integrated Box AI, File Requests, webhooks, CCG | ❌ |
| **Business Plus** (optional metadata tier) | **~$25 (~$33 mo)** | Unlimited | 15 GB | 50K | **Metadata**, unlimited external collaborators | ✅ |
| Enterprise | ~$35 (~$47 mo) | Unlimited | 50 GB | 100K | 1K AI Units/mo, Box Hubs, advanced Relay | ✅ |
| Enterprise Plus | ~$50 | Unlimited | 150 GB | 100K | 2K AI Units/mo, **Box Governance bundled** | ✅ |
| Enterprise Advanced | (quote) | Unlimited | 500 GB | quote | 20K AI Units, **Doc Gen API**, Box Forms, AI Studio, custom Extract agents | ✅ |

All Business tiers carry a **3‑seat minimum**. (Consumer Individual/Personal Pro tiers lack admin
console, File Requests, API and metadata — unsuitable.)

## Why the floor is base Business (and what Business Plus adds)

Walking the proposal's requirements against the gates:

| Requirement | Gated at |
|---|---|
| Unlimited storage | Business |
| File Requests | Business |
| Webhooks + Platform API (50K calls/mo incl.) | every Business tier |
| CCG service identity | every Business tier |
| **Metadata template fields on the upload form** (to capture the **registration**) — **optional** | **Business Plus** |

**The whole base pivot runs on base Business (~$15).** Folder‑create, File Requests, webhooks and the
CCG service identity are all covered by base Business — so base Business is the floor.

**Business Plus buys one optional thing: the structured Metadata field.** Without it, a File Request can
still capture the sender's email and a **free‑text description** (and the reg can be carried via
filename‑VRM / the uploader emailing the reg / human triage — see
[09](./09-metadata-role.md)). To get a *typed, queryable* reg field (and the Box‑native search it
enables, see [06](./06-enhancements-unconsidered.md)), you upgrade to **Business Plus** — a **later,
optional reliability upgrade**, not a prerequisite.

> Base **Business (~$15)** suffices for File Request + webhooks + CCG. **Business Plus** is worth it only
> when the typed reg field / metadata‑driven search is wanted — defer it until then (see
> [09‑metadata‑role.md](./09-metadata-role.md)).

## Consumption add‑ons (only if/when you use them)

Box Platform add‑on, billed on usage, on top of the seat licence:

| Add‑on | ~Price | Needed for |
|---|---|---|
| Core API calls beyond the included 50K/100K | ~$2.35 / 1,000 calls | very high call volume / external app users |
| **AI Units** | ~$10 / 1,000 units/mo (annual) | Box AI Ask/Extract (Business/Business Plus include **none**) |
| Doc Gen | ~$0.15 / doc | report/letter generation (API is **Enterprise Advanced** only) |
| Sign API | ~$1.20 / signature request | embedded e‑sign |

Box **Shield** and **Governance** are separate paid add‑ons (Enterprise tiers; Governance is *bundled*
at Enterprise Plus). Exact per‑add‑on dollar pricing is gated behind Box sales.

## Azure / Dataverse vs Box — the storage cost reality

The crucial grounding fact: **case evidence already lives in Azure Blob** (`cespkevidstdev01`, container
`evidence`), referenced by `storagePath` in Dataverse — **not** in Dataverse File. The expensive option
(Dataverse File overage ~**$2/GB‑mo**, ~10× Blob Hot, ~100–440× Blob Cool/Cold/Archive) was **already
avoided**. So there is **no large storage bill for Box to eliminate.**

**Per‑GB‑month (LRS, ~UK South):**

| Store | $/GB‑mo | ≈ £/GB‑mo |
|---|---|---|
| Azure Blob **Hot** | $0.0208 | ~£0.016 |
| Azure Blob **Cool** | $0.0115 | ~£0.012 |
| Azure Blob **Cold** | $0.0045 | ~£0.004 |
| Azure Blob **Archive** | $0.002 | ~£0.001 (+rehydrate $0.022/GB + $5.50/10k reads) |
| Dataverse **File** overage | ~$2.00 | — |
| **Box** | **per‑seat, not per‑GB** (unlimited) | — |

**The crossover (3 Box seats vs Azure Blob):**

- 3 Box seats ≈ **$540–1,800/yr flat** (Business→Enterprise), regardless of volume.
- 5 TB on Blob ≈ **$1,278/yr Hot · $707 Cool · $123 Archive**.
- Box **overtakes** Blob **Hot above ~4.6 TB**, **Cool above ~8.4 TB**, and **never** beats Archive.

**Interpretation:** for the firm's profile (a few seats, evidence growing into the low‑TB range over
years), Box and Azure storage are **the same order of magnitude**. Box trades a *per‑GB* line for a
*per‑seat* line. It does **not** reduce cost — and the spend Box **cannot** remove (the parser and
enrichment Functions, Dataverse, Power Automate, the Code App) is the bulk of the recurring bill anyway.

## Total cost of ownership — the honest picture

| Cost line | With the pivot |
|---|---|
| Box base Business licence (floor) | **new** ~$540/yr+ (3‑seat min); Business Plus (~$900/yr) only if the optional metadata field is later wanted |
| Azure Blob evidence storage | **unchanged** (you may keep it as the bytes source even with Box — see [04](./04-target-architecture.md)) |
| Parser + enrichment Functions, Dataverse, Power Automate, Code App | **unchanged** |
| Engineering to build it | **the real cost** — custom Box REST connector (CCG), Azure Function webhook receiver w/ HMAC verification, flow rewiring, live‑testing |
| Box AI / Doc Gen / Governance / Hubs | **only if adopted** — higher tier + metered AI Units |

**Bottom line:** budget the base pivot as **a new ~$540/yr+ SaaS line (base Business, 3‑seat min) plus an
engineering build**, justified by **upload ergonomics, organisation and governance** — not as a cost
saving (add ~$360/yr for Business Plus only if/when the optional metadata reg field is wanted). Azure is
*cheaper* for cold bytes; Box is *better* for the human upload/collaboration workflow. They are not
competing for the same job.
