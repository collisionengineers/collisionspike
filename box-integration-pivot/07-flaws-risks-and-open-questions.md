# 07 — Flaws, risks, options & open questions

The operator asked: *are there flaws I haven't thought about?* Yes — eight worth surfacing, none fatal,
several that change the build. Then the risks, the options ("thought trees"), the decisions you owe, and
the recommendation.

## Flaws in the proposal as stated

1. **"It can be done via the API so it wouldn't require much additional functionality" — understated.**
   The first‑party Box connector can't do *any* of the pivot's verbs (folder‑create, File Request,
   webhook, shared‑link, metadata). It **all** needs a **custom Box REST connector with a service
   identity (CCG/JWT)** plus an **Azure Function** to receive webhooks with HMAC verification. That's a
   real build, not a button.

2. **File Request can't be created from scratch — only copied from a hand‑built template.** The capture
   form (the reg field) is **baked into the template** and can't be varied per case by the copy call. So
   one template per "form shape," configured once by hand, then copied. Workable, but not the
   "activate the folder as a file request" mental model in the proposal.

3. **"Create a Box folder the moment instructions arrive" has a timing wrinkle.** The folder name *is*
   the Case/PO, and the Case/PO needs the **principal**, which comes from the parser. So either create a
   **provisional folder and rename** once the principal is confirmed, or accept the folder appears at
   **parse‑confirm** (seconds later) — which is essentially what happens today. Box folder names are
   **case‑insensitive**, so keep exactly **one UPPERCASE folder per case** (a lowercase sibling 409s).

4. **Dual source of truth.** Making Box "the central reference" while Dataverse remains the system of
   record means **two stores to keep in sync**. Box Metadata has **no joins** and can't run dedup/status/
   sequencing, so Dataverse *must* stay authoritative — which means the Box folder is a **mirror**, and
   mirrors drift. Mitigation: one‑way authority (Dataverse writes the Box metadata, never the reverse for
   case logic), and treat Box as content + human view, not logic.

5. **The webhook is best‑effort, and the File‑Request→event link is unproven.** Box webhooks have **no
   latency SLA**, are **at‑least‑once with no ordering**, can be **silently dropped** (permission‑blocked
   actions; expired app session), and **`FILE.UPLOADED` also fires on moves**. And **no Box doc states a
   File‑Request upload fires `FILE.UPLOADED`** — it's an inference to **live‑test**. Build **dedup +
   signature verification + a reconciliation sweep** (periodic `ListFolder`/Metadata‑Query) so a missed
   event can't strand a case.

6. **Anonymous uploads need an identity.** A permanent image‑only drop‑box receives files from someone
   with no Box account — *which case do they belong to?* Only the **reg captured on the form** ties them
   to a case, and a sender can mistype or omit it. Make the reg **required**, and route unmatched uploads
   to a **Held/triage** state rather than guessing.

7. **CE domain rules aren't Box's job.** The **photo order** (2 previews first, overview showing the full
   reg), the **person‑reflection exclusion**, the **image rules** for EVA readiness — Box won't enforce
   any of these. They stay in the Dataverse status machine / human review exactly as now. Box collects;
   the pipeline validates.

8. **Data residency for claimant PII.** UK/GDPR residency via **Box Zones** requires **Enterprise + 10
   seats + a consulting package** — at odds with the "few seats" profile. If in‑UK processing of claimant
   PII is mandated, that's a tier/seat decision (or a reason to keep PII in Dataverse/Blob and store only
   non‑PII evidence in Box). Confirm the residency requirement before committing.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Webhook misses / no SLA strand a case | Med | dedup + periodic reconciliation sweep; status re‑evaluate is idempotent |
| File‑Request→`FILE.UPLOADED` doesn't fire | Med | **live‑test first**; fallback to timed `ListFolder`/Metadata‑Query poll |
| Box/Dataverse drift (dual truth) | Med | Dataverse authoritative; Box metadata written one‑way; never run case logic off Box |
| Public webhook endpoint | Med | mandatory **HMAC signature verification + 10‑min replay window**; function‑key second gate; secret in Key Vault |
| Rate‑limit/throttle on bursts (link minting, batch AI extract) | Low‑Med | pace calls (1,000/min/user, 240 uploads/min/user; connector 100/conn/60s); exponential backoff on 429 |
| Cost creep (AI Units no‑rollover, higher tiers for Hubs/Doc Gen/Governance) | Med | gate each feature; pilot before committing; AI Units are metered, not flat |
| Vendor lock‑in to Box | Low | evidence bytes also kept in Blob (byte source of truth); export is folder‑level |
| 3‑seat minimum floor | Low | accept ~$900/yr as the entry cost even for 1–2 users |

## Options (thought‑trees)

| Option | What | Cost | When it's right |
|---|---|---|---|
| **0. Do nothing** | keep Box‑at‑EVA archival only | lowest | if image collection isn't a pain point (it is) |
| **1. Minimal File Request** | Business tier, File Request + webhook, **reg in free‑text** (no metadata) | ~$540/yr + build | tight budget; accept weaker matching/search |
| **2. Additive hybrid** ⭐ | Business Plus; folder+archival at intake, File Request, webhook, metadata; **Dataverse authoritative** | ~$900/yr + build | **recommended** — the standout wins without re‑platforming |
| **3. Full re‑centre** | Box as spine, minimise Dataverse | high + risk | **not recommended** — Box can't run dedup/status/sequencing |
| **4. Hybrid + enhancements** | Option 2 + AI/Governance/Hubs over time | higher tiers + metered | once Option 2 proves out and institutional‑memory/compliance value is wanted |

## Open questions (decisions you owe before building)

1. **Budget & seats:** is **Business Plus (~$900/yr, 3‑seat min)** acceptable, or is the **Business
   minimal** option (no metadata, reg in free‑text) the starting point?
2. **Source of truth:** confirm **Dataverse stays authoritative** and Box is the content/mirror layer
   (recommended), vs any ambition to make Box load‑bearing for logic (advise against).
3. **Folder timing:** **provisional‑folder‑then‑rename** at first contact, or **mint at parse‑confirm**
   (seconds later)? Recommend the latter (simpler, matches today).
4. **Storage:** keep **Azure Blob as the byte source** and Box as the human/archival copy (recommended),
   or migrate bytes to Box (cost/latency trade)?
5. **Embedding:** are you willing to make the **`frame-src` CSP change** for an in‑app Box iframe, or
   prefer **"Open in Box" deep‑links** (no CSP change)?
6. **Data residency:** is in‑UK processing of claimant PII mandated? (Drives whether Box Zones / a higher
   tier is needed, or PII stays in Dataverse/Blob.)
7. **Enhancements appetite:** is the **historical‑corpus Box AI / Governance** value worth a future
   higher tier + metered units, or is the base intake pivot the whole scope?

## Recommendation

**Proceed with Option 2 (additive hybrid), phased and env‑gated, keeping Dataverse authoritative — and
explicitly *not* for cost reasons.** Build the **custom Box REST connector + webhook Function** first (the
unlock), then **folder+archival at intake**, then the **File Request image chaser** (the highest‑value
piece — **live‑test the webhook firing**), then **permanent drop‑boxes**. Defer AI/Doc Gen/Governance/
Hubs as separate, evidence‑driven, tier‑gated decisions. This captures the real wins the operator is
after — account‑free image collection and one searchable place per case from first contact — without
betting the relational core of the system on a content platform that can't run it.

> **Next step if you want it:** I can turn the [04](./04-target-architecture.md) phases into a proper
> `docs/plans/` build checklist and an ADR ("Box‑centric intake — additive hybrid"), and draft the custom
> Box REST connector definition (CCG) + the webhook‑receiver Function — all offline/buildable; the Box
> Platform app, its secret, and the CSP change stay operator‑gated.
