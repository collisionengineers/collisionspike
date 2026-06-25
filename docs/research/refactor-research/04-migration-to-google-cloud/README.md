# 04 — Migration to Google Cloud (GCP)

> **One-line verdict.** Cloud Run is the most natural home for the 6 Python functions (container
> port), and the relational path lands at **~$35/mo cheapest-sane** (dominated by the **Cloud SQL
> ~$30/mo always-on floor**; ~$200/mo robust). A Firestore path is near-free (~$5–10/mo) but forces a
> NoSQL data-model rewrite and **high lock-in**. Comparable to AWS — chosen only to leave Microsoft.
>
> Pricing confidence: Cloud Run, Workflows, Eventarc, Pub/Sub, Identity Platform, Firestore free
> tiers are **published**; Cloud SQL instance rates are **published-via-Google-text + 3rd-party
> trackers with a europe-west2 uplift estimate** — confirm in the GCP Pricing Calculator before
> committing.

See [`00-current-architecture-baseline`](../00-current-architecture-baseline/README.md).

---

## The stack (europe-west2, London)

| Layer | GCP target |
|---|---|
| UI | **Firebase Hosting** (~$0) |
| Compute | **Cloud Run** (incl. 2nd-gen "Cloud Run functions") — 6 functions |
| Data | **Cloud SQL for PostgreSQL** (relational, recommended) *or* **Firestore** (NoSQL, near-free) |
| Orchestration | **Workflows + Eventarc + Pub/Sub** |
| Auth | **Identity Platform / Firebase Auth** (50k MAU free) |
| Email intake | **Microsoft Graph → Cloud Run webhook** (Outlook stays — see [10](../10-outlook-m365-integration/README.md)) — *not* Gmail; the company is on M365 |
| Files | **Box** — unchanged |

## Monthly run-cost

| Component | Cheapest-sane | Robust | Note |
|---|---|---|---|
| SPA (Firebase Hosting) | $0 | ~$1–5 | Free tier covers a small SPA |
| Compute (Cloud Run) | **$0** (scale-to-zero) | ~$45–63 (1 warm instance) | Free tier 180k vCPU-s + 2M req |
| **Database — Cloud SQL Postgres (g1-small)** | **~$30** | HA 1vCPU/3.75GB **~$115** | **No scale-to-zero — fixed floor** |
| *(alt: Firestore)* | **~$0** | grows w/ ops | Free tier 50k reads/20k writes per day; but NoSQL rewrite |
| Orchestration | $0 | ~$1–5 | Free tiers cover this volume |
| Auth (Identity Platform) | $0 | $0 | 50k MAU free |
| Email intake (Microsoft Graph) | **~$0** | ~$0 | Graph free with existing M365 licences; build = webhook + renewal, see [10](../10-outlook-m365-integration/README.md) |
| Logging / backups / misc | ~$5 | ~$15 | |
| **TOTAL** | **~$35/mo** (Cloud SQL) · **~$5–10** (Firestore) | **~$180–230/mo** | |

## Billing model

Consumption; no per-user licensing. **Cloud SQL has no scale-to-zero**, so the ~$30 DB floor is the
bulk of the cheapest-sane bill — everything else fits in free tiers. **Bill does not grow with staff
headcount.**

## What you'd rebuild

- **6 Functions → Cloud Run (2nd-gen):** the most natural port of any cloud target — Python
  container, near lift-and-shift.
- **React app → Firebase Hosting** calling your own Cloud Run APIs (replaces the Power Apps
  connector/Dataverse binding with a DIY API + Identity Platform auth).
- **Dataverse → Cloud SQL Postgres:** schema + RLS + audit + business rules + feature-gates
  (relational fit). *Or* Firestore (near-free but no joins/relational integrity — poor fit for
  Case↔Provider↔Repairer↔documents + reporting).
- **15 flows → Workflows + Eventarc + Pub/Sub + Cloud Run** (YAML/code, no drag-and-drop).
- **Outlook intake → Microsoft Graph subscription + Cloud Run webhook + renewal loop** (Outlook
  stays the mail system; you keep the Graph subscription alive ≤7 days — see
  [10-outlook-m365-integration](../10-outlook-m365-integration/README.md)). **Not** Gmail.

## Vendor lock-in profile — **LOW (relational path) to HIGH (Firestore path)**

| Component | Lock-in |
|---|---|
| Cloud SQL (Postgres) | **Low** — `pg_dump` anywhere |
| Cloud Run (containers) | **Low** — OCI images run anywhere |
| Firebase Hosting | Low |
| Pub/Sub | Medium |
| Eventarc / Workflows | Medium — GCP-specific glue |
| Identity Platform | Medium–High — user/password-hash migration to leave |
| **Firestore** | **High** — proprietary NoSQL, no portable equivalent; exit = data + query rewrite |

The Cloud Run + Cloud SQL Postgres path is close to lift-and-shift portable; leaning into Firestore +
Identity Platform + Eventarc pushes the profile to MEDIUM–HIGH.

## UK/EU data residency

✅ **europe-west2 = London.** Regional Cloud SQL, Cloud Storage, Firestore (`europe-west2`), Cloud Run
keep data at rest in London. GDPR/UK-GDPR DPA + SCCs, UK adequacy, ISO 27001/SOC 2/27018.
**Caveats:** **Identity Platform / Firebase Auth is the main residency gap** — auth user data is not
guaranteed to stay in europe-west2 (historically US); verify per-service before relying on it.
Firebase Hosting/CDN are global edge (fine for public SPA assets, not regulated data). US-HQ → CLOUD
Act governance consideration.

## Pros / Cons

**Pros:** Cloud Run is the cleanest Functions port; Firestore path is the cheapest near-free option
if NoSQL is acceptable; strong analytics/AI adjacencies. **Cons:** Cloud SQL has no scale-to-zero
(fixed floor); **email intake still depends on M365 via Microsoft Graph — Outlook isn't escaped**, and
that subscription/webhook/renewal build is extra effort (GCP has no native Outlook connector);
Firestore + Identity Platform are high-lock-in; auth residency caveat; full rebuild like AWS, so less
attractive than Azure PaaS (where Functions *and* the native Outlook connector already live) unless
leaving Microsoft is the goal.

## Sources

- Cloud Run — https://cloud.google.com/run/pricing · Cloud SQL — https://cloud.google.com/sql/pricing · Firestore — https://cloud.google.com/firestore/pricing
- Workflows — https://cloud.google.com/workflows/pricing · Eventarc — https://cloud.google.com/eventarc/pricing · Pub/Sub — https://cloud.google.com/pubsub/pricing
- Identity Platform — https://cloud.google.com/identity-platform/pricing · Firebase Hosting — https://firebase.google.com/docs/hosting/usage-quotas-pricing
- Outlook intake via Microsoft Graph — see [10-outlook-m365-integration](../10-outlook-m365-integration/README.md) · Confirm region rates — https://cloud.google.com/products/calculator
