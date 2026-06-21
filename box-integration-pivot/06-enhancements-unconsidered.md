# 06 — Box features the proposal didn't name (and the corpus angle)

The operator asked specifically: *what features does Box have that would assist or enhance this plan that
I haven't considered — especially given Box holds years of past case history?* Here they are, each with
**what it does · the plan/cost · the concrete fit · whether to do it now or later.** Cross‑cutting rule:
**every one of these is reached through the custom Box REST connector** (CCG/JWT), gated by its own
env‑var — never the first‑party connector, never raw fetch.

## A. Box Metadata + the Metadata‑Query API — a Box‑native search index ⭐

- **What:** store structured case attributes (Principal, **VRM**, status, dates, inspection modality,
  dedup hash) as a **metadata template cascaded onto each Case/PO folder**, then query Box directly with
  `POST /2.0/metadata_queries/execute_read` — SQL‑like over template values, scoped to a folder subtree.
- **Cost:** standard API (no AI Units); needs metadata → **Business Plus**. Limits: 500 templates &
  512 KB/file, ≤100 results/page, **no joins**.
- **Fit:** answers *"find the case folder for VRM X," "all RJS cases ready_for_eva in 2025"* from Box
  itself — and it's the **same metadata** the File Request form captures, so reg flows end‑to‑end:
  upload form → folder metadata → queryable. **A genuine enhancement**, and it's the mechanism that makes
  "Box is the central reference" searchable rather than just a tidy drawer.
- **When:** Phase C, alongside File Request (both want the same template). **Keep Dataverse authoritative**
  for the hard relational logic; Box metadata is a convenience mirror, not the case DB.

## B. Box AI over the historical corpus — the "years of past cases" angle ⭐

Two distinct uses:

1. **Extract at intake** — `POST /2.0/ai/extract_structured` against an inbound instruction/job‑sheet
   PDF, mapped to a template mirroring the **EVA 12‑field contract** (auto‑OCR included), to **pre‑fill
   or cross‑check** the deterministic `cedocumentmapper` parser. A useful **fallback** for documents the
   parser can't read. *(1 file/call; loop per doc.)*
2. **Ask across the archive** — *"have we assessed this VRM before?", "prior RJS image‑based cases"* —
   true corpus Q&A is **Box AI for Hubs** (20,000 files/Hub, 2 M enterprise‑wide), which builds and
   maintains the vector index for you.

- **Cost / tier:** API extraction works on **Business/Business Plus but with purchased, metered "AI
  Units" (no rollover; ~$10/1,000)**; corpus **Hubs Q&A is Enterprise Plus / Enterprise Advanced, UI‑led.**
- **When:** later, as a deliberate budget/tier decision. The historical‑corpus Q&A is the most
  *strategically* interesting (institutional memory over years of cases) but the **most expensive** to
  unlock. Pilot Extract‑at‑intake first (cheap, bounded), evaluate Hubs separately.

## C. Box Doc Gen — generate the output documents

- **What:** render a **Word template + JSON** into docx/pdf via `POST /2.0/docgen_batches`, dropped
  straight into the Case/PO folder (companion/valuation reports, instruction acknowledgements, chaser
  letters).
- **Cost / tier:** **Enterprise Advanced only**; box‑version 2025.0.
- **Fit:** overlaps the existing **CE document skills** (client‑side). A later either/or, not part of the
  base pivot. Flag, don't build.

## D. Box Governance — retention + legal hold over evidentiary records ⭐

- **What:** **retention policies** (modifiable/non‑modifiable; folder/classification/metadata‑triggered;
  disposition delete/none) and **legal holds** (`POST /2.0/legal_hold_policies`) — all API‑driven (scope
  `manage_data_retention`).
- **Cost / tier:** paid **Governance add‑on** (Enterprise; *bundled* at Enterprise Plus).
- **Fit:** **strong** — these are insurance/engineering **evidentiary** records with statutory retention
  needs. A retention policy keyed on the case metadata template auto‑retains each Case/PO folder for the
  required period then disposes; a **legal hold** can be dropped on a specific case folder (via a Power
  Automate action) the moment a case becomes disputed, guaranteeing its instruction/`.eml`/photos/EVA
  JSON/report are immutably preserved. Pairs directly with (A).
- **When:** later, but **the most defensible "buy a higher tier" justification** of the set — it's
  compliance value, not convenience.

## E. Box Shield — classification / DLP / threat detection

- **What:** auto + manual security classification, classification‑based access, native DLP,
  anomaly/malware/ransomware detection; alerts via the events stream to a SIEM.
- **Cost / tier:** paid add‑on (Enterprise); **Shield Pro** (Dec 2025) adds an AI classification agent.
- **Fit:** moderate — case files carry **PII** (claimant name/tel/email, VRM) and third‑party images;
  auto‑classification + DLP + malware scanning of an inbox‑fed, externally‑uploaded archive is real
  protection. **Consider** if the PII/security posture is a concern; not core to the workflow.

## F. Box Sign — e‑signature

- **What:** create/track signature requests via API on a document in the case folder; signed copy
  retained in place. **Included Business+** (Sign *API* embedding is a Platform consumption charge).
- **Fit:** low‑to‑moderate — only if an intake step needs a signed authority/acknowledgement. Park it.

## G. Box Relay + the Workflow‑Trigger API — Box‑native automation (use sparingly)

- **What:** no‑code Box workflows; an external **Workflow‑Trigger API** can start a manual‑start Relay
  flow from Power Automate.
- **Fit:** **do not** re‑implement the intake pipeline in Relay (Power Automate owns it). Relay is for
  **Box‑native housekeeping** — e.g. trigger an internal review/retention workflow on the finished
  Case/PO folder at EVA‑submit. Advanced (metadata‑triggered) Relay is Enterprise‑tier.

## H. Native email‑to‑folder upload — a zero‑build intake variant

- **What:** Box can enable **email uploads** so a folder gets a unique upload email address.
- **Fit:** a **low‑tech complement** to File Request for senders who prefer email — each Case/PO folder
  could expose an upload address. Caveat: **50 MB/file**, enterprise‑wide on/off, less control than File
  Request. Worth knowing as a fallback channel.

---

## Other ideas / "thought trees" worth surfacing

- **Make the File Request form *the* structured‑intake surface.** Because the form captures **metadata**,
  a richer template (reg, claimant, provider, loss date) means uploads arrive **pre‑structured** — the
  webhook Function can create a near‑complete case from an image‑only upload, not just attach files.
- **Reg as the universal join key.** The reg captured on every File Request is the same key the ADR‑0010
  reg‑merge uses — so File Request uploads, image‑only drop‑boxes, and instruction cases all converge on
  one identifier. Make the reg field **required** on the chaser template.
- **"Open in Box" instead of embed.** If the `frame-src` CSP change is unwanted, skip the iframe and give
  staff **server‑minted shared‑link deep‑links** — 90% of the "see the files" value, zero CSP change.
- **Box as the operator's read view, Dataverse as the machine's write model.** Humans browse the Box
  folder; the pipeline reads/writes Dataverse + Blob. The metadata mirror keeps them aligned without
  making Box load‑bearing for logic.
- **Don't over‑buy.** The cheapest *useful* configuration is **Business Plus + File Request + webhook +
  metadata**. AI/Hubs/Doc Gen/Governance are each separate, later, tier‑gated decisions — adopt on
  evidence of need, not up front.
