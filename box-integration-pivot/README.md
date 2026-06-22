# Box‑Integration Pivot — viability dossier

> **Date:** 2026‑06‑21 · **Status (updated 2026‑06‑22):** ✅ APPROVED 2026‑06‑21 → **BUILT in the working
> tree and PARTLY LIVE.** The **Phase‑7 Box Dataverse schema + env‑vars ARE applied live** (the
> `cr1bd_case`/`cr1bd_evidence` Box columns + all `cr1bd_BOX_*` env‑vars exist in Dev, **all `BOX_*` gates
> OFF** default and current). The **box‑webhook Azure Function, the `cr1bd_box_rest` custom connector, and
> the Box cloud‑flows are AUTHORED OFFLINE (state=off) — not deployed/imported/bound live.** The hard
> unlock — the always‑on Box account integration (CCG token mint, `FILE.UPLOADED` webhook, template File
> Request) — is **deferred to a future BUSINESS‑account phase** (the free Box test account cannot sustain
> CCG/webhooks/File‑Requests); a free‑account demo (case `SBL26001`) proved the folder+upload+shared‑link
> pattern **manually**. The ordered build plan is in [`plans/`](./plans/) (`00-BUILD-PLAN.md` + six section
> plans); this dossier remains the verified rationale. The shipped phase docs live at
> [`docs/plans/phase-7-box-integration/`](../docs/plans/phase-7-box-integration/) (the operator-chosen
> phase number is **7**; see the note in `plans/00-BUILD-PLAN.md`). · **Author:** Claude, from a
> deep‑research workflow (3 grounding agents → 7 web‑research angles → 19 adversarial verifiers; see
> [00‑method‑and‑sources.md](./00-method-and-sources.md)).
>
> **The proposal under evaluation:** re‑centre the intake workflow on **Box** — generate the **Case/PO
> and a Box folder the moment instructions arrive** (not at EVA submit), make that folder the central
> reference for everything, chase images with Box **File Request** upload links, and let Box
> **webhooks** ping the automation when an upload lands. (Operator's own words preserved in
> [03‑current‑system‑and‑what‑changes.md](./03-current-system-and-what-changes.md).)

---

## TL;DR verdict

**Viable — yes. Better for the upload/organisation problem — yes. Cheaper — no (cost‑neutral at best;
do not pivot for price). A wholesale re‑centring — not recommended; a phased, additive hybrid is.**

Every load‑bearing Box capability the proposal needs is **real**, but each carries a caveat that
changes *how* it must be built, and three of them are decisive:

1. **The first‑party Microsoft Box connector cannot do almost any of this.** It is file‑only: no
   folder‑create, no shared‑links, no webhooks, no File Requests, no metadata, interactive‑OAuth only.
   The whole pivot therefore requires a **custom Power Platform connector over the Box REST API with a
   service identity (Client‑Credentials Grant / JWT)** — plus an Azure Function to receive webhooks.
   This is a known, bounded path (the repo already names it as the "escalation" for a service
   identity), but it is *materially more than "wouldn't require much additional functionality."*
2. **File Request cannot be created from scratch via API — only copied from a hand‑built template.**
   Box states verbatim: *"the API only allows the creation of new file requests by copying an existing
   file request associated to another folder."* So the "button mints an upload link" idea works, but
   the mechanism is: build **one** template File Request by hand once → `POST /file_requests/{id}/copy`
   onto each Case/PO folder. The capture form (vehicle reg) is baked into that template.
3. **The plan floor is base Box Business (~$15/user/mo, 3‑seat minimum)** — base Business covers folders,
   File Requests, webhooks and CCG (the whole base pivot). **Business Plus (~$25–33/user/mo)** is needed
   **only** for the deferred **Metadata** feature (the optional structured registration‑capture field on
   the upload form, a later reliability upgrade) — it is the optional metadata tier, not the floor.

**Cost:** the pivot is **storage‑cost‑neutral**. Evidence already lives in cheap **Azure Blob**
(`cespkevidstdev01/evidence`), *not* expensive Dataverse File — so there is no big storage bill for Box
to kill. Box is per‑seat, not per‑GB; for a few seats it is a flat ~$540–1,800/yr and only "wins" on
price above several TB on hot storage (Blob Cool/Cold/Archive always undercut it). The base pivot runs on
base **Business** (~$15/user/mo); **Business Plus** is an optional later upgrade for the metadata field
only. **The justification must be workflow, UX, external‑upload ergonomics and governance — never price.**

**Recommendation:** adopt Box **earlier and more deeply, but additively** — keep **Dataverse as the
system of record** (Box Metadata has no joins; it cannot run dedup/status/Case‑sequencing). Bring the
already‑built Box archival **forward to case‑creation**, add **File Request + webhook** image intake,
and treat the richer features (Box AI over history, Metadata‑Query search, Doc Gen, Governance) as
later, separately‑gated, higher‑tier phases. Full plan in
[04‑target‑architecture.md](./04-target-architecture.md) and
[07‑flaws‑risks‑open‑questions.md](./07-flaws-risks-and-open-questions.md).

---

## The eight load‑bearing claims, verified

Each was checked adversarially against **primary Box sources** (developer.box.com / support.box.com /
box.com). Full reasoning + citations in [01‑box‑capabilities‑verified.md](./01-box-capabilities-verified.md).

| # | Claim the proposal rests on | Verdict | The decisive caveat |
|---|---|---|---|
| 1 | File Request can be generated per‑case via API | **Partly true** | **Copy‑from‑template only** — no create‑from‑scratch; build one template by hand, then copy per folder |
| 2 | A webhook pings on a File‑Request upload | **Partly true** | `FILE.UPLOADED` is real & folder‑scoped, but **best‑effort (no latency SLA)** and the File‑Request→event link is **undocumented — live‑test it** |
| 3 | Unlimited storage on the cheapest plan | **Partly true** | Unlimited starts at **"Business" (~$15)**, *not* the cheapest "Business Starter" (100 GB cap) |
| 4 | File Request + Webhooks + CCG on one realistic plan | **Confirmed** | **base Business (~$15/user/mo, 3‑seat min)** covers the base pivot; **Business Plus** is needed only for the optional Metadata field |
| 5 | Box content embeds in the Code App despite CSP | **Partly true** | Only an **iframe (Box Embed widget)** survives, and only after an admin widens `frame-src`; **UI Elements are blocked** |
| 6 | An official Box Power Automate connector covers this | **Partly true** | Connector is **file‑only**; folder‑create, shared‑links, webhooks, File Requests all need **raw REST / custom connector** |
| 7 | Box AI can query the historical case corpus | **Partly true** | API is **25 files/call**; true corpus Q&A is **Box AI for Hubs — UI‑only, Enterprise Plus+**, metered "AI Units" |
| 8 | Permanent File Request links per image‑only sender | **Confirmed** | Real (one folder per sender); structured registration capture needs **Business Plus** metadata (optional later tier) |

---

## What it would cost (orientation — detail in [02‑plans‑and‑cost.md](./02-plans-and-cost.md))

- **Box licence:** base **Business**, ~$15/user/mo annual list, **3‑seat minimum ≈ $540/yr** even for 1–2
  real users, covers the base pivot. **Business Plus** (~$25–33/user/mo, ≈ $900/yr) is an **optional later
  upgrade** for the metadata field only. (GBP not machine‑readable on box.com; figures are USD list from
  box.com + trackers.)
- **Storage:** cost‑neutral vs today's Azure Blob; Box wins on price only above ~4.6 TB (hot) and never
  vs Blob Cool/Cold/Archive.
- **Box AI / Doc Gen / Governance / Hubs:** extra, metered or higher‑tier (Enterprise/Enterprise
  Plus/Enterprise Advanced + "AI Units"). Not part of the base pivot.
- **Build cost:** a custom Box REST connector (CCG), an Azure Function webhook receiver with HMAC
  signature verification, and the flow rewiring — the real "expense" is engineering, not licence.

---

## Recommended path (one screen)

1. **Build the unlock** — a custom Power Platform **Box REST connector (CCG service identity)** +
   an Azure Function **webhook receiver**. Gate everything behind a `BOX_API_ENABLED` env‑var.
   *(Without this, none of the rest is reachable from the Code App or a service.)*
2. **Folder + archival at case‑creation** — bring the already‑built `finalize-eva-box` archival
   forward, fixed to the real connector contract. Box becomes the durable evidence home from day one;
   the `.eml`, instruction PDF, images and EVA JSON all land in one Case/PO folder.
3. **File Request image chaser** — template‑copy a per‑case upload link; the job‑sheet "copy chase"
   button calls a flow that mints the link and returns it to the clipboard. **Live‑test** that the
   upload fires the webhook → Function → Dataverse.
4. **Permanent File Request** folders for repeat image‑only senders (VRM captured on the form → matched
   to a case via Box Metadata + the existing reg‑merge logic).
5. **Later, separately‑gated phases** — Box Metadata‑Query search, Box AI over the historical corpus,
   Doc Gen reports, Governance retention + legal hold. Each is a tier/cost decision of its own.

**Keep Dataverse authoritative throughout.** Box is the content + intake + archival + governance layer,
**not** the case database.

---

## How to read this folder

| File | What it answers |
|---|---|
| [00‑method‑and‑sources.md](./00-method-and-sources.md) | How this was researched & verified; confidence; the full source list |
| [01‑box‑capabilities‑verified.md](./01-box-capabilities-verified.md) | The verified capability reference — File Request, webhooks, storage, auth, connector, embedding, metadata, AI — each with verdict + caveat + sources |
| [02‑plans‑and‑cost.md](./02-plans-and-cost.md) | Plan ladder, the base‑Business floor (Business Plus = optional metadata tier), add‑ons, the Azure‑vs‑Box cost comparison |
| [03‑current‑system‑and‑what‑changes.md](./03-current-system-and-what-changes.md) | Current architecture, where Box sits today, what changes in the **system** and in **CE processes** |
| [04‑target‑architecture.md](./04-target-architecture.md) | The proposed Box‑centric architecture, integration seams, sequence, env‑var gates |
| [05‑comparison‑better‑or‑worse.md](./05-comparison-better-or-worse.md) | Current (Box‑at‑EVA) vs Box‑centric: better / worse / neutral, overlap, what's impossible or worse on Box |
| [06‑enhancements‑unconsidered.md](./06-enhancements-unconsidered.md) | Box features the proposal didn't name — Metadata‑Query, Box AI over history, Doc Gen, Governance, Shield, Sign, Relay |
| [07‑flaws‑risks‑open‑questions.md](./07-flaws-risks-and-open-questions.md) | Flaws not yet considered, risks, open questions, decision matrix & recommendation |
| [08-relay-automate-assessment.md](./08-relay-automate-assessment.md) | **Box Relay / Box Automate deep-dive** — verdict: **not required** for the pivot (the valuable bits are Enterprise/EA-gated & duplicate existing logic); one optional core-tier slice |
| [plans/](./plans/) | The ordered build plan: **`00-BUILD-PLAN.md`** + six section plans (docs · app · azure · flows · dataverse · box) |

> **Placement note:** this folder sits at the repo root for visibility as an active strategic
> initiative under evaluation. If you'd prefer it under `docs/research/`, it relocates cleanly — say the
> word.
