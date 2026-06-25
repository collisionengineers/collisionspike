# 05 — Supabase (managed Postgres BaaS)

> **One-line verdict.** A **single ~$25/mo flat fee** buys Postgres + Auth + Storage + Edge Functions
> with quotas that dwarf this workload, **low data lock-in** (it's vanilla Postgres), and a
> **London region**. The strongest "cut cost *and* lock-in" candidate for a relational app — the data
> layer exits cleanly with `pg_dump`. Pair with the existing Functions (kept elsewhere or rewritten
> as Edge Functions).
>
> Pricing confidence: **published** from supabase.com/pricing; the ~$25 all-in is an estimate built
> on published allotments (nothing here exceeds the included quotas).

See [`00-current-architecture-baseline`](../00-current-architecture-baseline/README.md).

---

## Monthly run-cost

| Plan | Cost | Verdict for this app |
|---|---|---|
| Free | $0 | ❌ disqualified for production — 500 MB DB cap, **auto-pauses after 1 week idle** |
| **Pro** | **~$25/mo** | ✅ the answer — flat fee, spend-cap ON by default |
| Team | $599/mo | overkill (SOC2/ISO, 14-day backups) |

**What Pro's $25 includes** (all published): 8 GB DB disk (then $0.125/GB), $10/mo compute credit
(covers a Micro instance), 100 GB storage (then $0.0213/GB), 250 GB egress (then $0.09/GB), **100,000
auth MAU** (then $0.00325/MAU), 2M Edge Function invocations (then $2/M). A 3–10 user app uses ~0.01%
of the MAU quota; case bytes live in **Box**, so storage/egress are ~$0. First real overage only
appears if the DB exceeds 8 GB or you size up compute (Small +$5/mo, Medium +$50/mo).

## Billing model

Flat **per-organization** monthly plan + usage overages; compute billed per-project; a **spend cap is
ON by default on Pro** so you can't accidentally overrun. **No per-user licensing** — your 3–10 staff
are not Supabase seats.

## What you'd rebuild

- **Dataverse → Supabase Postgres:** schema as DDL; use Postgres **Row-Level Security** (a real
  strength) for the access model; audit via triggers; feature-gates as a config table.
- **Auth → Supabase Auth (GoTrue):** RLS policies key off `auth.uid()`.
- **6 Functions:** either keep them where they are (Azure/Cloud Run/container) and let them hit the
  Supabase Postgres over the wire, **or** rewrite as Supabase Edge Functions (Deno) — the parser's
  PyMuPDF engine is Python, so Edge Functions are a poor fit for it; keep the parser as a container.
- **15 flows:** Supabase has no workflow engine — pair with **n8n** (see
  [09](../09-other-setups-nocode-hybrid/README.md)) or pg_cron + Edge Functions.

## Vendor lock-in profile — **LOW (data) / MODERATE (platform)**

- **Data: low.** Vanilla Postgres — `pg_dump`/`pg_restore` to any host. GoTrue, PostgREST, Storage
  API, Realtime are all open-source and **self-hostable** (official Docker compose) — worst case you
  run the same stack yourself.
- **Sticky bits:** auth migration (identities, OAuth wiring, RLS policies), Edge Functions
  (Deno + Supabase deploy model), the dashboard/pooler.

## UK/EU data residency

✅ Projects can be created in **London `eu-west-2`** and **Frankfurt `eu-central-1`** (+ Ireland,
Paris, Zurich, Stockholm). Pick the specific region, not the generic "Europe" label. Supabase offers
a DPA; Team plan adds SOC2/ISO 27001.

## Pros / Cons

**Pros:** one flat low fee for DB+auth+storage+functions; Postgres = low lock-in + relational fit
(ideal for case data); RLS; London region; open-source self-host escape hatch. **Cons:** no built-in
workflow/orchestration engine (the 15 flows need a partner tool); Edge Functions don't suit the
Python parser; US-HQ company (DPA + EU region mitigate); compute beyond Micro adds cost as you grow.

## Sources

- https://supabase.com/pricing — Pro "$25/month", "$10/month compute credits", "8 GB disk (then $0.125/GB)", "100,000 MAU (then $0.00325/MAU)", "2M edge function invocations"
- https://supabase.com/docs/guides/platform/compute-and-disk · https://supabase.com/docs/guides/functions/pricing
- https://supabase.com/docs/guides/platform/regions — "West Europe (London), eu-west-2"
