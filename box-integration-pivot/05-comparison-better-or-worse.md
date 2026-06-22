# 05 — Box‑centric vs the current plan: better, worse, or neutral?

This answers the operator's direct questions: *compared to my current system (Box only at EVA submit),
is this better or worse? What's not possible on Box? What's possible but worse? What overlaps?*

## The two designs

- **Current (Box‑at‑EVA):** Box is an **archival sink** at the *end* — `finalize-eva-box` copies the
  finished evidence set into a Case/PO folder when the case goes to EVA. Everything before that lives in
  Outlook + Azure Blob + Dataverse.
- **Proposed (Box‑centric):** Box is the **front door and the spine** — Case/PO folder at first contact,
  File Request uploads, webhook‑driven intake, files surfaced from Box, Box as the "central reference."

## Feature‑by‑feature

| Dimension | Current (Box‑at‑EVA) | Box‑centric | Verdict |
|---|---|---|---|
| **Image collection** | chase by email/WhatsApp; sender emails attachments; you fish them out | **File Request** upload link → drag‑drop, no account, straight into the case folder | **Better** (materially — this is the standout win) |
| **"Stop digging through e‑mails"** | the case is scattered (Outlook + Blob + Dataverse) until EVA | one **Case/PO folder** holds `.eml` + instruction + images + EVA JSON + report from day one | **Better** |
| **Upload notification** | none until you look | **webhook** pings the pipeline on upload (best‑effort) | **Better** (with the live‑test caveat) |
| **Image‑only senders** | held and chased manually | **permanent drop‑box** per sender with reg capture → auto‑match | **Better** |
| **External collaboration** | email round‑trips | account‑free upload + (optional) shared‑link views | **Better** |
| **Records governance** | Blob lifecycle + Dataverse audit | + Box **retention / legal hold / classification** (higher tier) | **Better** (if you buy it) |
| **Cost** | cheap Blob, no extra SaaS seat | + ~$540/yr+ Box seat (base Business; +~$360/yr for the optional Business Plus metadata tier); storage neutral | **Worse** (modestly) |
| **Architecture complexity** | first‑party connector at one step | + custom REST connector, webhook Function, HMAC, token lifecycle | **Worse** (more moving parts) |
| **Source‑of‑truth clarity** | Dataverse is unambiguously authoritative | Box folder *and* Dataverse must be kept in sync | **Worse** (a real risk — see [07](./07-flaws-risks-and-open-questions.md)) |
| **Case database / dedup / status / Case‑seq** | Dataverse | unchanged — **Box can't do this** | **Neutral** (stays in Dataverse) |
| **Parsing / enrichment** | Azure Functions | unchanged | **Neutral** |
| **In‑app file viewing** | evidence rows / Blob | Box **iframe** embed (needs a CSP edit; preview‑only) | **Slightly worse ergonomically**, nicer UX once enabled |

## What is **not possible** on Box (must stay in Dataverse/Azure)

- **Relational case logic** — the ADR‑0010 **dedup ladder**, **Case/PO sequencing**, field‑level
  **provenance**, the **11‑value status machine**. Box Metadata has **no joins** and Box Relay is
  limited file‑trigger automation; neither can run this.
- **Deterministic document parsing** — `cedocumentmapper` has no Box equivalent (Box AI is probabilistic,
  a *complement*, not a replacement).
- **DVSA/DVLA enrichment** — compute Box doesn't have.
- **The orchestration pipeline** — the 10 `CS *` flows are Power Automate; Box Relay can't reproduce them.
- **A real "create empty folder + form" in one move via the first‑party connector** — folder‑create and
  File Request are **REST‑only**; the connector is file‑only.
- **Create‑a‑File‑Request‑from‑scratch via API** — **copy‑from‑template only** ([01](./01-box-capabilities-verified.md) §1).

## What is **possible but worse** on Box

- **Near‑real‑time eventing** — Box webhooks are **best‑effort, no SLA, at‑least‑once, droppable**, vs a
  tightly‑ordered internal flow. Fine for "an upload happened," not for anything needing exactly‑once or
  ordering. Requires **dedup + signature verification** you must build.
- **Embedding files in the app** — only the **iframe/Box Embed** path survives the CSP, and only after an
  admin `frame-src` edit; it's **preview‑only** with a third‑party‑cookie caveat. Richer **UI Elements
  are blocked**. The current Dataverse/Blob viewing is less pretty but unconstrained.
- **Search over case attributes** — Box **Metadata‑Query** is a flat, no‑join, ≤100‑results‑per‑page,
  512 KB‑per‑file index; useful as a *Box‑native* lookup but weaker than Dataverse queries. Keep
  Dataverse authoritative and treat Box metadata as a convenience mirror.
- **Corpus‑wide AI Q&A** — only via **Box AI for Hubs**, which is **UI‑only and Enterprise Plus+**; the
  API path is **25 files/call**. Possible, but tier‑ and budget‑gated.

## What **overlaps** (and how to resolve it)

- **Archival** — both designs archive to a Case/PO folder. *Resolution:* the Box‑centric design **reuses
  the same `finalize-eva-box` logic**, just moved to case‑creation and fixed for the real connector. No
  duplication — it's the *same* archival, earlier.
- **Storage** — Azure Blob and Box would both hold the bytes. *Resolution:* keep **Blob as the byte
  source** (cheap, already wired, feeds the parser/EVA), Box as the **human‑facing + archival** copy.
  Don't make Box the only store unless you accept the cost/latency trade.
- **Workflow automation** — Power Automate and Box Relay both automate. *Resolution:* **Power Automate
  owns the pipeline**; Relay only for Box‑native housekeeping (retention triggers, internal review
  routing on the finished report). Don't re‑implement intake in Relay.
- **Document generation** — Box Doc Gen vs the CE document skills. *Resolution:* a later choice; Doc Gen
  is a server‑side alternative (Enterprise Advanced), the skills are client‑side. Not part of the base
  pivot.

## Net verdict

**Better where it matters most to the operator — image collection and "one place per case" — and worse
on cost, complexity and source‑of‑truth discipline.** None of the "worse" items is a blocker; each has a
clean mitigation (keep Dataverse authoritative, keep Blob as byte source, gate features, live‑test the
webhook). The decisive reframing: this is **not** "Box instead of Azure," it is **"Box in front of, and
around, the existing Azure/Dataverse pipeline."** Adopt it for the **workflow**, build it **additively**,
and don't expect it to save money.
