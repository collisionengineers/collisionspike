# 03 — The current system, and what the pivot changes

## The proposal (operator's own framing, preserved)

> *"Change this to be centred around Box primarily… Since Box offers unlimited storage even with the
> lowest plans, use this much earlier in the process for organization. When we receive instructions,
> **this becomes the moment that a Case/PO number is generated and assigned**, rather than when
> submitting to EVA. The instructions and the e‑mail get stored immediately, and this becomes the
> **central point of reference** for everything, rather than digging through e‑mails.*
>
> *The main feature… is the **File Request** on Box… a custom upload‑only link that can be sent… along
> with a chase message for images… This would drop the images straight into a folder on Box. Two types
> of File Request folders: **temporary links** generated automatically that expire when chasing for
> images, and **permanent file request folders** for anyone that sends images with no instructions… The
> [job‑sheet] chaser button… makes an API request to Box for the corresponding Case/PO folder, activates
> it as a file request, and copies that link to the user's clipboard…*
>
> *…**Webhook**… sends a message to a URL when an event occurs… if one of the File Request links is
> used, it can instantly ping an automation chain… Files on our 'system' would be either linked or
> embedded from Box itself. Any case on our system would require a Box folder corresponding. Any merge
> would take an image‑only folder on Box and merge that into a Case/PO folder."*

This is a sound instinct. The analysis below shows it is **largely additive to** — not a replacement
for — what already exists, and that the current system is already *closer* to it than it looks.

## The current system (verified, live)

```
3 Outlook shared inboxes (digital@ live)
        │  OnNewEmailV3
        ▼
  CS Intake  (parent orchestrator) ──► Run‑a‑Child‑Flow:
        ├─ CS Classify+Persist  → attachments + .eml → Azure Blob (cespkevidstdev01/evidence)
        │                          + one Dataverse Evidence row per file (storagePath, SHA256, kind)
        ├─ CS Parse             → cedocumentmapper Function (Case fields, principal)
        └─ CS Status Evaluate   → image rules + readiness → status (11‑value machine)
        │
        ├─ Scope_generate_casepo  → Case/PO minted AFTER parse, once principal confirmed
        ├─ CS Enrich  (ON)        → DVSA MOT + DVLA, direct via Entra
        └─ CS Finalize EVA + Box  (OFF) → EVA JSON drag‑drop  +  Box archival (built, mis‑wired)
```

Key facts the pivot must build on:

- **Evidence already lives in Azure Blob**, not Dataverse — `cespkevidstdev01` / container `evidence`,
  path‑referenced from the Dataverse `Evidence` table; **no bytes inlined in Dataverse**. The **`.eml`
  is already captured** (since 2026‑06‑20).
- **Case/PO is already generated in intake** — `Principal + YY + 3‑digit seq` (e.g. `AX26001`) — but
  **after parse**, once `cr1bd_evaworkprovider` is confirmed (you need the principal to form the code).
  Stored canonical; **lowercase for EVA**, **UPPERCASE for Box**.
- **Box is already the archival destination** — `finalize-eva-box` copies images (2‑previews‑then‑all
  order), `.eml`, PDFs and the EVA JSON into a per‑case **UPPERCASE Case/PO folder**. It is **built but
  OFF**, and **mis‑wired**: it invents a `CreateFolder` op the first‑party connector doesn't have and
  uploads the Blob *path string* instead of file *bytes* (the "S2" bug). It needs the rewrite in
  `docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md` before activation.
- **Dataverse is the system of record** — 11 tables, the dedup ladder (ADR‑0010), the Case/PO
  sequencing, field‑level provenance, the 11‑value status machine, the 3 queues (Not Ready / Review /
  Held).
- **The Code App cannot call Box directly** — CSP `connect-src 'none'`; all external I/O goes through
  Power Platform connectors or Power Automate.

## What changes — in the system

| Area | Today | After the pivot |
|---|---|---|
| **Box timing** | Box folder created at **EVA‑submit finalisation** | Box folder created at **case‑creation / instructions intake** |
| **Box access** | first‑party `cr1bd_box` connector (file‑only, OAuth) | **+ a custom Box REST connector (CCG service identity)** for folders, file‑requests, webhooks, shared‑links, metadata |
| **Folder creation** | (mis‑wired `CreateFolder`) | `POST /2.0/folders` via the custom connector at intake (folder name = Case/PO) |
| **Image intake** | email attachments only | **+ File Request** (template‑copy per case) → upload lands in the Box folder |
| **Upload notification** | n/a | **Box webhook `FILE.UPLOADED` → Azure Function → Dataverse** (new evidence event, status re‑evaluate) |
| **Image‑only senders** | held, manually chased | **permanent File Request** folder per sender; uploads matched by captured **reg** + the existing reg‑merge |
| **Merge** | reg‑match merges instruction + image **cases** in Dataverse | + the **image‑only Box folder's contents move into the Case/PO folder** on merge |
| **Viewing files** | evidence rows / Blob | **+ Box Embed iframe** in the Code App (needs a `frame-src` CSP edit) |
| **Case attributes** | Dataverse columns | **+ a Box Metadata template** cascaded on the Case/PO folder (mirror of key fields, for Box‑native search) |

## What changes — in CE processes

- **Case/PO is "born" at first contact.** Instead of an internal id that appears at EVA time, the Case/PO
  exists from the moment instructions arrive, and **everything for that case (e‑mail, instruction PDF,
  images, enrichment, EVA JSON, final report) lives in one named Box folder** — the "stop digging
  through e‑mails" win. *(Implementation nuance: the code needs the principal to mint the Case/PO. Either
  create the folder under a provisional name and **rename** once the parser confirms the principal — a
  cheap REST call — or accept that the folder appears seconds later at parse‑confirm, which is what
  happens today.)*
- **Chasing images becomes a link, not a request.** The job‑sheet **"copy chaser" button** triggers a
  flow that **template‑copies a File Request onto the Case/PO folder** and returns the live URL; staff
  paste it into WhatsApp/e‑mail. The sender drag‑drops images with **no Box account**, straight into the
  case. *(The button can't call Box directly — CSP — so it calls a flow; the clipboard copy is the only
  client‑side step.)*
- **Image‑only senders get a standing drop‑box.** Repeat repairers who send images before instructions
  get a **permanent** per‑sender File Request with a **registration field**; uploads are captured with
  the reg and **auto‑matched** to the instruction case when it arrives (reusing the reg‑merge).
- **WhatsApp stays manual** — unchanged from ADR‑0003 (WhatsApp Business, human‑sent). The File Request
  link is just text to paste; no automated WhatsApp send is added.

## What Azure services get *replaced*? — essentially **none**

This is the question the proposal most needs answered plainly:

| Service | Replaced by Box? |
|---|---|
| Parser Azure Function (`cedocumentmapper`) | **No** — Box has no equivalent deterministic parser (Box AI is a *complement/fallback*, [06](./06-enhancements-unconsidered.md)) |
| Enrichment Function (DVSA/DVLA via Entra) | **No** |
| Dataverse (case DB, dedup, status machine, Case/PO sequencing, provenance) | **No** — Box Metadata has no joins; cannot run this |
| Power Automate orchestration (the 10 `CS *` flows) | **No** — Box Relay is limited file‑trigger automation, not this pipeline |
| Code App | **No** |
| **Azure Blob evidence storage** | **Optionally** — Box could become the evidence store of record, but Blob is cheaper for cold bytes; the pragmatic design keeps **Blob as the byte source** and Box as the **human‑facing + archival** copy |

**Conclusion:** the pivot **adds a Box layer (intake + organisation + archival + governance); it does not
remove an Azure layer.** That is why it is best framed as an *additive, phased* change — see
[04‑target‑architecture.md](./04-target-architecture.md) — and why the cost case is workflow/UX, not
substitution savings.
