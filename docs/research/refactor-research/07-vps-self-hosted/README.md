# 07 — Self-Hosted VPS (Hetzner / DigitalOcean)

> **One-line verdict.** The **lowest infra cost (~$10/mo raw, Hetzner)** and the **highest portability
> of any option (essentially zero lock-in)** — but the cheap box hides the real cost: **~4–8
> engineer-hours/month of unavoidable ops** (patching, backups + tested restores, monitoring, no
> managed DB, no failover). The true TCO is *labour*, not the server. Best for a team comfortable
> owning a Linux box; risky as a single point of failure.
>
> Pricing confidence: **published** Hetzner/DigitalOcean rates. ⚠️ A Hetzner price adjustment took
> effect **15 June 2026** — see below.

See [`00-current-architecture-baseline`](../00-current-architecture-baseline/README.md).

---

## Monthly run-cost (raw infrastructure)

| Option | Cost | Spec |
|---|---|---|
| **Hetzner CX33** (recommended pick) | **~€8.99 (~$10)** all-in | 4 vCPU / 8 GB / 80 GB + 20 TB traffic + €0.50 IPv4 |
| Hetzner CX23 | €5.49 | 2 vCPU / 4 GB / 40 GB |
| Hetzner CAX11 (Arm) | €5.99 | budget Arm option |
| DigitalOcean droplet | $24 (4 GB/2 vCPU) – $48 (8 GB/4 vCPU) | + Managed Postgres from **$15.15/mo** |

⚠️ **Material change:** Hetzner's **15 June 2026** adjustment raised the AMD **CPX** line +144–209%
(CPX22 €7.99 → **€19.49**) but the Intel/Arm **CX/CAX** lines only ~33–38%. **The value pick is now
the CX line, not CPX** — the old "CPX22 ≈ €7.99" anchor is stale.

Realistic totals: **(a) Hetzner single VPS, all-in-one (Postgres + containers + Caddy) ≈ $10/mo**;
**(b) DigitalOcean droplet + Managed Postgres ≈ $33–39/mo** (buys back the scariest ops item).

## ⚠️ The hidden ops cost — the real TCO

With a plain VPS you own everything a PaaS does for you:

- OS patching / CVEs (~1–2 hrs/mo)
- **Postgres backups *and tested restores*** + upgrades/tuning (~2–4 hrs/mo, standing data-loss risk)
- Monitoring / alerting setup + upkeep
- TLS pipeline ownership
- **No managed DB, no automatic failover** — a single VPS is a single point of failure; 2am recovery
  is manual

**Realistic steady-state ~4–8 engineer-hours/month**, spiking on incidents. At £50–75/hr that's
**~£200–600/mo of labour** — the true cost is human time, not the €9 box. DigitalOcean's Managed
Postgres (~$15) buys back the single scariest part of that list.

## Billing model

Flat hourly-accrued fee **capped at a monthly maximum** — you pay for the provisioned box whether
busy or idle (the opposite of consumption pricing; does **not** scale to zero). No per-user licensing.

## What you'd rebuild

Everything runs as you choose — typically `docker compose` with Postgres + your API + the 6 Functions
as containers (the **Python parser runs natively here — no runtime constraints**, a real plus over
Cloudflare/edge options) + a workflow engine (n8n) + Caddy/nginx for TLS. Dataverse → Postgres,
15 flows → n8n or cron workers. You also build backups, monitoring, and deployment yourself.

## Vendor lock-in profile — **NONE (highest portability of all)**

Plain Linux VM + Docker + standard Postgres — nothing proprietary in the app or data path. Migration
Hetzner ↔ DO ↔ AWS ↔ on-prem = provision a VM, `docker compose up`, restore a Postgres dump. The
deliberate inverse of managed-PaaS lock-in. This is the strongest possible answer to driver (2)
*reduce vendor lock-in*.

## UK/EU data residency

✅ Hetzner DCs: **Nuremberg, Falkenstein (DE), Helsinki (FI)** — German company, GDPR-native, strong
EU sovereignty story (no US parent → no CLOUD Act exposure). DigitalOcean EU: **FRA1 (DE), AMS3 (NL),
LON1 (UK)** — use FRA1/AMS3 (or LON1 for UK) for EU-only. Note: **you become the data processor for
ops** — backups/logs residency is your responsibility.

## Pros / Cons

**Pros:** cheapest infra; zero lock-in; full control/capability (any runtime, incl. the Python
parser); excellent EU sovereignty (Hetzner). **Cons:** you own all ops (the dominant real cost);
single point of failure unless you build HA; no managed services; least suitable if the team lacks
sysadmin bandwidth. **Strongly consider a managed Postgres (DO Managed PG, or Neon — see
[09](../09-other-setups-nocode-hybrid/README.md)) even on a VPS, to remove the riskiest ops item.**

## Sources

- https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ (15 Jun 2026; CX23 €5.49, CX33 €8.49, CPX22 €19.49) · https://www.hetzner.com/cloud
- https://www.digitalocean.com/pricing/droplets · https://www.digitalocean.com/pricing/managed-databases ($15.15/mo) · https://docs.digitalocean.com/platform/regional-availability/
