# 08 — App-Platform PaaS (Fly.io / Render / Railway)

> **One-line verdict.** The "container PaaS" middle ground: deploy a Dockerfile + managed Postgres,
> get **low lock-in** (standard OCI images + Postgres) with **no ops burden** and **no per-user
> licensing**. Run-cost **~$8–48/mo** depending on provider and whether the DB is managed. The
> **Python parser runs fine** (real containers, unlike Cloudflare). A pragmatic low-lock-in home that
> sits between a raw VPS (cheaper, more ops) and a hyperscaler (pricier, more lock-in).
>
> Pricing confidence: Fly.io, Railway, Hetzner/DO figures **published**; Render's flat tiers are
> **published-via-secondary** (its live table is JS-rendered) — verify before contracting.

See [`00-current-architecture-baseline`](../00-current-architecture-baseline/README.md).

---

## Monthly run-cost

| Provider | Scrappy | Middle / robust | Billing model |
|---|---|---|---|
| **Fly.io** | **~$8–10** (1 machine + *unmanaged* PG) | ~$42–48 (Managed Postgres Basic $38 + machine) | Pay-as-you-go, **billed per second**; no free tier since Oct 2024 |
| **Railway** | ~$11–22 usage (Hobby $5 min) | **~$20–25** (Pro $20 min, usage absorbed) | Usage-based (RAM $10/GB-mo, CPU $20/vCPU-mo) + plan minimum |
| **Render** | ~$14 (Starter $7 + Basic-256 PG ~$6) | **~$45** (Standard $25 + Basic-1gb PG $19) | Flat per-service fee, prorated per second; SPA free as Static Site |

Notes: **Fly** Managed Postgres (MPG) is the HA/backups option ($38/mo, 1 GB); plain "Fly Postgres"
is *unmanaged* (cheap but you own it). **Railway** — your 3–10 staff are **not** seats (only devs
with dashboard access are); Pro's $20 includes $20 of usage that absorbs most of a small footprint.
**Render** — the free Postgres **expires after 30 days** (not viable for prod); host the React SPA
free as a Static Site.

## Billing model

All three are **consumption/flat-fee hybrids with no per-user licensing**. Fly is purest
pay-per-second; Railway is usage + plan minimum; Render is flat per-service. None scale the bill with
staff headcount.

## What you'd rebuild

Ship the app + 6 Functions as **Docker containers** (the parser's PyMuPDF runs natively — a plus),
managed/standard **Postgres** for the Dataverse replacement, and a workflow engine (n8n) or
background worker for the 15 flows. React SPA hosts as a static site (Render) or a tiny container.
Roughly the same rebuild as the VPS option but with the provider handling TLS, deploys, and (if you
pay for it) managed Postgres + failover.

## Vendor lock-in profile — **LOW**

All three run standard **OCI/Docker images** (portable) and standard **managed Postgres** (`pg_dump`
out). The only provider-specific artifacts are config files (`fly.toml` / `render.yaml` /
`railway.json`) + some networking glue — config-only, low effort to re-express. Migration = `pg_dump`
+ redeploy the same images elsewhere. Among managed options this is about as portable as it gets
(behind only a raw VPS).

## UK/EU data residency

- **Fly.io:** London `lhr`, Amsterdam `ams`, Frankfurt `fra`, Paris `cdg` (MPG in lhr/ams/fra). ✅ UK option.
- **Render:** Frankfurt, Germany (put web service + Postgres both in Frankfurt; no cross-region private networking).
- **Railway:** EU West (Amsterdam) `europe-west4`.

All US-HQ companies → DPA + EU region mitigate; none offer a German-sovereignty story as strong as
Hetzner.

## Pros / Cons

**Pros:** low lock-in (Docker + Postgres); no ops burden (managed TLS/deploys/optional managed PG);
Python parser runs natively; no per-user licensing; cheap at this scale. **Cons:** pricier than a raw
VPS for equivalent compute; Fly's cheap path uses *unmanaged* Postgres (ops risk); Render's free PG
expires; smaller ecosystems than hyperscalers; US-HQ.

## Sources

- Fly.io — https://fly.io/docs/about/pricing/ · MPG https://fly.io/docs/mpg/ · regions https://fly.io/docs/reference/regions/
- Render — https://render.com/docs/compute-plans · https://render.com/docs/free (PG expiry) · https://render.com/docs/regions · https://render.com/pricing (verify live)
- Railway — https://railway.com/pricing · https://docs.railway.com/reference/pricing · https://docs.railway.com/deployments/regions
