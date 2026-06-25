# 06 — Cloudflare (Workers + D1 + R2 + Pages + Queues)

> **One-line verdict.** The **cheapest sticker price of any option — ~$5/mo** (the Workers Paid base;
> everything else fits inside included allotments at this scale). The trade is the **highest lock-in
> of the cheap options**: the data is portable (D1 is SQLite, R2 speaks S3), but the **Workers
> runtime + bindings are proprietary**, and the **Python parser (PyMuPDF) does not fit** the Workers
> edge runtime.
>
> Pricing confidence: **published** from Cloudflare's developer pricing pages.

See [`00-current-architecture-baseline`](../00-current-architecture-baseline/README.md).

---

## Monthly run-cost — **~$5/mo**

| Component | Included on Workers Paid ($5/mo) | Overage |
|---|---|---|
| **Workers** (compute) | 10M requests + 30M CPU-ms | $0.30/M req, $0.02/M CPU-ms |
| **D1** (SQLite DB) | 5 GB storage + 25 **billion** rows read + 50M written | $0.75/GB, $0.001/M read, $1/M written |
| **R2** (object storage) | 10 GB-mo, **egress free** | $0.015/GB-mo |
| **Pages** (SPA hosting) | static assets **free + unlimited** | — |
| **Queues** | 1M ops/mo | $0.40/M |

At low-hundreds of cases/mo every meter resolves to **$0 overage**, so the whole platform is the **$5
Workers Paid subscription**. The only way above $5 is D1 storage > 5 GB or traffic > 10M req/mo —
both unlikely here. Case bytes live in Box, so R2 is ~$0 too.

## Billing model

Flat **$5/mo Workers Paid minimum** (paid even at zero usage) bundling base allotments + metered
usage on top. Allowances pool **per account**. No per-user licensing.

## What you'd rebuild — ⚠️ the big caveat

- **6 Functions → Workers:** the JS/light ones port to the Workers runtime, **but the document
  parser uses PyMuPDF (native Python)** — this **cannot run on Workers' V8-isolate edge runtime**.
  You'd keep the parser as a container elsewhere (Azure/Cloud Run/Fly) and call it, or use Cloudflare
  Containers (newer, heavier). This splits the architecture.
- **Dataverse → D1 (SQLite):** schema as SQLite DDL. D1 is fine for low-write case metadata; note
  SQLite's single-writer model and size limits vs Postgres.
- **React app → Pages** (free, unlimited static hosting) — clean.
- **15 flows → Workers + Queues + Cron Triggers** — re-authored as code.

## Vendor lock-in profile — **LOW (data) / MODERATE–HIGH (compute)**

- **Data: portable.** D1 = SQLite (dumps to SQLite/Postgres); R2 speaks the **S3 API** (swap to
  S3/MinIO).
- **Compute: sticky.** The **Workers runtime** (V8 isolates, not standard Node — `nodejs_compat`
  only partial), the **bindings model** (`env.DB`/`env.QUEUE`/`env.BUCKET`), Queues, and
  `wrangler.toml` are proprietary. Moving off = re-hosting functions on a conventional runtime +
  swapping bindings. Contained for a small app, but real.

## UK/EU data residency

✅ Both **D1 and R2 support an `eu` jurisdiction** that pins storage/processing to the EU for GDPR.
**Critical caveat: the jurisdiction is set at creation only and is permanent/immutable** — get it
right the first time. (Non-binding `weur`/`eeur` location hints also exist.) Note: there is no
*UK-specific* jurisdiction, only EU; and Workers compute runs at the nearest edge globally (the `eu`
jurisdiction constrains D1/R2 data, not necessarily every compute hop).

## Pros / Cons

**Pros:** cheapest sticker price (~$5); generous free allotments; free R2 egress; portable data
(SQLite + S3 API); fast global edge. **Cons:** **Python parser doesn't fit Workers** (architecture
splits); proprietary runtime/bindings (moderate–high compute lock-in); SQLite (D1) is less capable
than Postgres for relational case data + reporting; EU (not UK-specific) residency, set-once.

## Sources

- https://developers.cloudflare.com/workers/platform/pricing/ — "$5/month", "10 million included", "30 million CPU ms"
- https://developers.cloudflare.com/d1/platform/pricing/ · https://developers.cloudflare.com/r2/pricing/ · https://developers.cloudflare.com/queues/platform/pricing/ · https://developers.cloudflare.com/pages/functions/pricing/
- https://developers.cloudflare.com/d1/configuration/data-location/ (`eu` jurisdiction, immutable) · https://developers.cloudflare.com/r2/reference/data-location/
