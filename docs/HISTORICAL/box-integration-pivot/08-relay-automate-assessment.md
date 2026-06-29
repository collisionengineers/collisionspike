# 08 — Box Relay / Box Automate: do they have potential here?

> **Date:** 2026‑06‑21 · **Verdict: marginal‑to‑none for this pivot at our tier — keep the build as
> designed.** Investigated at the operator's request before committing to the build. Two parallel
> research agents mined the local Box docs mirror + verified against developer.box.com / support.box.com /
> box.com. Confidence: high on tier‑gating and the webhook question; items marked **UNVERIFIED** could not
> be confirmed from primary sources.

## What they are

- **Box Relay** = Box's no‑code, **linear** content‑workflow builder (triggers → outcomes, single
  straight‑line execution; no conditional/parallel branching at core tier).
- **Box Automate** = the **next‑generation successor that replaces Relay** (a strict superset: visual
  builder, conditional + parallel branching, loops, advanced variables, workflow sharing, AI‑agent steps,
  a **custom HTTPS step**). **GA 28 Apr 2026, turned ON by default** — an org must *manually disable* it in
  the Admin Console if it doesn't want it (active workflows pause on disable). Treat "Relay" as "the linear
  core of Automate."

## The decisive fact: tier‑gating

The capabilities that would matter for CE are gated **1–2 tiers above the pivot's base‑Business floor**
(metadata‑event/AI/HTTPS‑step features sit at Business Plus → Enterprise → Enterprise Advanced):

| Capability | Business / Business Plus | Enterprise / Enterprise Plus | **Enterprise Advanced** |
|---|---|---|---|
| File/folder/task/**File‑Request**/Sign events; manual‑start; multi‑step; notifications; scheduled; dynamic naming; watermark; **looping**; reporting | ✅ | ✅ | ✅ |
| **Conditional/parallel branching**, advanced variables, workflow sharing | Limited | ✅ | ✅ |
| **Metadata‑event triggers/actions**, automated classification, transfer ownership | ❌ | ✅ | ✅ |
| **Custom HTTPS step** ("call an external API"), **AI agents in workflows**, **Box Extract**, Box Forms / Doc Gen / Sign‑as‑outcome / Hubs | ❌ | ❌ | **✅ only** |

So at our tier we'd get **linear core workflows only**. The genuinely interesting bits — the HTTPS step
and AI/Extract — are **Enterprise Advanced**, a big commercial step.

## The key question — could Box Automate replace the bespoke `box-webhook` Function?

**Idea:** instead of subscribing a raw `POST /webhooks` + verifying Box's HMAC ourselves, a Box Automate
workflow with a *File Uploaded* trigger calls OUT (custom HTTPS step) to a Power Automate Request trigger /
Azure Function — letting Box originate the call.

**Answer: no — not a real simplification.**
- **Tier:** the custom HTTPS step is **Enterprise Advanced only** (triple‑verified) — a **multi‑tier jump**
  from the pivot's base‑Business floor purely to avoid writing one Function.
- **Security:** roughly a wash, arguably worse — you trade "verify an HMAC you didn't issue" for "manage an
  outbound credential inside Box's connection store + secure the PA trigger's SAS URL." More secret sprawl.
- **Observability / IaC:** worse — failures surface in **Box's** run‑tracking, not your Azure App Insights /
  Dataverse run history, and the Box workflow **can't be source‑controlled** with your IaC. Deactivation
  doesn't stop in‑progress runs.
- **Reliability:** raw platform webhooks retry up to ~10×; the HTTPS‑outcome retry/dead‑letter behavior is
  **UNVERIFIED**.

**Keep the bespoke `box-webhook` Function** (HMAC‑verified, idempotent, in the authoritative Azure/Dataverse
stack). Note: `POST /workflows/{id}/start` is **inbound only** (push files *into* a workflow) — there is **no**
"Automate calls you on FILE.UPLOADED" REST trigger other than the EA‑gated HTTPS outcome.

## The one genuinely additive slice (core tier)

**In‑Box human review/approval of the finished report**, via the **manual‑start Workflow Trigger API**:
- PA's existing EVA+Box finalization flow, after archiving the report PDF to the Case/PO folder, calls
  `POST /2.0/workflows/{id}/start` (≤20 files; returns `204`; needs the **"Manage Box Relay" OAuth scope**
  on our Box app — additive to `root_readwrite`/`manage_webhook`) to kick off a pre‑built manual‑start
  workflow → approval task to a senior engineer → on approve, move to a "Final" subfolder / notify.
- **Core tier (Business or higher)** for task + move + notify. (Box **Sign** as the approval mechanism would push it
  to Enterprise Advanced.)
- **Honest caveat:** this may be **redundant** with the Code App "Review" queue (the human‑in‑the‑loop check
  already happens there, pre‑submit). Adopt only if an *in‑Box, file‑level* audit trail is specifically
  wanted. **Optional, later, nice‑to‑have — not recommended for the initial build.**

## Everything else — duplicative or out of lane

- **Metadata‑triggered folder routing / stage‑gating** (Enterprise+) — duplicates the Dataverse status
  machine; mirroring status into Box metadata just to trigger Relay adds a sync surface. Skip.
- **AI auto‑classification / metadata extraction at upload** (Enterprise Advanced, billed per **AI Unit**) —
  duplicates the authoritative `cedocumentmapper` parser + enrichment; splits the source of truth.
- **Watermarking** — Box watermark is a *dynamic per‑viewer leak‑tracing overlay*, **not** a static brand
  stamp; it does **not** do "brand the report." Branding belongs in document generation.
- **Notifications / collaborator management** — PA + Outlook/Graph already do this, more flexibly (Relay's
  add‑collaborator outcome can't even set Co‑owner or external email).
- **Retention** — that's **Box Governance**, not Relay/Automate.

## Build impact — none

Relay/Automate **remove zero components** from the planned architecture. The webhook Function, the
PA‑owned folder‑create flow, the custom CCG connector, and the Dataverse‑authoritative model all stand
(Wave 0 / Wave 2 unchanged). Box Automate is a content‑side engine with **no relational store and a locked
service identity** — structurally unsuited to be the system of record.

## Two caveats to carry into the ADR

1. **Box Automate is on‑by‑default at GA (28 Apr 2026).** Decide consciously: if CE isn't using it, the
   operator should **disable it in the Admin Console** (governance hygiene) so staff don't build shadow
   workflows on case folders.
2. **Box Automate is NOT fully interoperable with Box Governance / Shield / Box Zones / Information
   Barriers / Keysafe** (per Box's own limitations). Since the pivot considers **Box Governance** for
   evidentiary‑record retention ([06](./06-enhancements-unconsidered.md)), do not assume Automate +
   Governance compose cleanly — verify if both are ever adopted.

## Verdict

**Not required for the pivot.** Keep the bespoke `box-webhook` Function + PA/Dataverse‑authoritative design
exactly as planned. Re‑evaluate Box Automate's HTTPS step / AI classification **only if** CE independently
buys **Enterprise Advanced** for other reasons — and even then, prefer the webhook for ingest. The single
core‑tier upside (in‑Box report approval via the manual‑start API) is an optional later nicety, not a
build‑changer.

**UNVERIFIED (carried honestly):** exact Business‑tier branching "limit"; whether `POST /workflows/{id}/start`
formally targets *Automate* (vs legacy Relay) workflows; the HTTPS‑outcome's allowed methods / response
mapping / rate limits / retry semantics; published per‑org workflow‑count caps.

## Sources
Local mirror `automationsresearch/box/markdown/` (216–221 Automate; 556–571 Relay; 053/038 legacy). Box:
[Differences Relay↔Automate](https://support.box.com/hc/en-us/articles/51191572681107) ·
[Automate features by plan (217)] · [Workflow Trigger API](https://support.box.com/hc/en-us/articles/4402964550163-Workflow-Trigger-API) ·
[POST /workflows/{id}/start](https://developer.box.com/reference/post-workflows-id-start/) ·
[GET /workflows](https://developer.box.com/reference/get-workflows/) ·
[Watermarking Files](https://support.box.com/hc/en-us/articles/360044195253) · [box.com/automate](https://www.box.com/automate).
