# 04 — Target architecture & phased build

The architecture that makes the pivot real, expressed as a **phased, additively‑gated** build. Each
phase is independently valuable and independently revertible (env‑var gated). **Dataverse stays the
system of record**; Box becomes the content + intake + archival layer.

## The one prerequisite that unlocks everything

```
                          ┌─────────────────────────────────────────┐
   Code App (CSP          │  Custom Box REST connector  (CCG/JWT)    │
   connect-src 'none')    │  service identity = Box Service Account  │
        │  (button →)     │  scopes: root_readwrite, manage_webhook  │
        ▼                 │  secret on the connection / Key Vault    │
   Power Automate  ──────►│  POST /folders · /file_requests/{id}/copy│
   (CS * flows)           │  PUT shared_link · POST /webhooks · …     │
                          └─────────────────────────────────────────┘
                                            │  HTTPS REST
                                            ▼
                                       api.box.com
        Box  ──webhook FILE.UPLOADED──►  Azure Function (HTTP trigger)
                                         · verify BOX-SIGNATURE HMAC + 10‑min replay
                                         · 2xx within 30s
                                         · write Dataverse Evidence + re‑evaluate status
```

Why this is mandatory (from [01](./01-box-capabilities-verified.md) §6/§7): the **first‑party Box
connector is file‑only and interactive‑OAuth only** — it cannot create folders, mint File Requests,
manage shared links, subscribe webhooks, or run as a service. So:

- **Custom Power Platform connector over Box REST**, authenticated by **Client‑Credentials Grant** as the
  enterprise **Service Account** (`box_subject_type=enterprise`, App Access Only). Register a **Platform
  app (Server Auth)** in the Box Developer Console; an Admin **authorizes it in the Admin Console**.
  Secret on the connection / Key Vault, **never** in the client bundle (the parser `api_key` pattern).
- **Azure Function webhook receiver** (fits the existing FC1 Function estate) — public HTTPS:443,
  reputable‑CA cert; verify the `BOX-SIGNATURE-PRIMARY/SECONDARY` HMAC‑SHA256 + reject timestamps >10 min;
  add a function‑key as a second gate; respond `2xx` within 30 s, then do the work.

**Gate:** `BOX_API_ENABLED` (Dataverse env‑var), sibling to `EVA_API_ENABLED` etc.

## Phase B1 — Folder + archival at case‑creation

Bring the **already‑built `finalize-eva-box` archival forward** to case‑creation, fixed to the **real**
connector contract (delete the fictional `CreateFolder`; create the folder with `POST /2.0/folders` via
the custom connector; for byte uploads use the first‑party `CreateFile` *after* an Azure‑Blob
`GetFileContentByPath_V2` read — the S2 fix already specified in `box-archival-pipeline.md`).

- On **case‑create**: `POST /2.0/folders` → UPPERCASE Case/PO folder under the archive root.
- As evidence persists (the existing `CS Classify+Persist` already writes bytes to Blob): also copy the
  bytes into the Box folder, so the **`.eml` + instruction PDF + images** are in Box **from day one**.
- The folder name = Case/PO. Handle the **provisional‑name‑then‑rename** case (folder before principal
  confirmed) or mint at parse‑confirm (seconds later). **Box folder names are case‑insensitive** —
  keep exactly **one UPPERCASE folder per case** (a lowercase sibling 409s).
- The EVA‑time finalisation stays, but now **augments** an existing folder instead of creating it.

**Outcome:** Box is the durable, human‑navigable case record from first contact — the "central
reference" win — with **zero new licence features** beyond storage + API.

## Phase B2 — File Request image chaser (the highest‑value piece)

- **One‑time:** hand‑build a **template File Request** ("image chaser") in the Box web app, with the
  capture form = email + description + a **`vehicle_registration` metadata field** (needs Business Plus).
  Record its `file_request_id`.
- **Per case (button → flow):** the job‑sheet **"copy chaser"** button calls a flow →
  `POST /2.0/file_requests/{templateId}/copy` with `folder.id` = the Case/PO folder, `status:"active"`,
  optional `expires_at` for the temporary variant → returns the **live upload URL**; the app copies the
  chase message + URL to the clipboard.
- **Upload → webhook → Function → Dataverse:** the sender drag‑drops images (no Box account); the Box
  folder's `FILE.UPLOADED` webhook hits the Azure Function, which writes Evidence rows (or copies bytes
  back to Blob for the parser/EVA path) and re‑runs `CS Status Evaluate` so the case advances
  Not Ready → Review automatically. **Disambiguate uploads from moves** (the event fires on both).

> **Live‑test gate:** before relying on B2, confirm empirically that a **File Request upload fires
> `FILE.UPLOADED`** on the target folder — Box documents the upload lands in the folder and the trigger
> fires on folder uploads, but never states the end‑to‑end path. (Fallback if it doesn't: poll with a
> Box Metadata‑Query/`ListFolder` on a timer, or the first‑party connector's ≤1‑day trigger.)

**Gate:** `BOX_FILEREQUEST_ENABLED`.

## Phase B3 — Permanent File Request for image‑only senders

- A **dedicated Box folder per repeat sender**, each with a **permanent** (non‑expiring) File Request
  carrying the **`vehicle_registration`** field.
- Uploads land with the reg captured as **metadata**; the webhook Function matches the reg to an open
  instruction case (reusing the **reg‑merge** logic, ADR‑0010) and **moves/links** the images into the
  Case/PO folder. If no instruction case yet → hold the images against the reg until one arrives (the
  existing "images‑without‑instructions" hold, now with a tidy Box home).

## Phase B4 — Surface Box in the Code App (optional)

- Embed the Case/PO folder via the **Box Embed widget** `<iframe src="…app.box.com/embed/s/{sharedLink}">`.
  Requires: (a) an admin **`frame-src` CSP edit** to add the Box origin (per‑environment, via PPAC /
  `PowerApps_CSPConfigCodeApps`); (b) a **shared link minted server‑side** by the custom connector.
  **Preview‑only**, with a third‑party‑cookie caveat. **UI Elements are not viable** under the CSP.
- Lower‑touch alternative: keep the Code App reading Dataverse/Blob as today, and provide **"Open in
  Box"** deep links (server‑minted shared links) rather than an in‑app embed.

## Phase C — Enhancements (separate decisions, higher tiers)

Each is independently gated and most need a higher tier / metered AI Units — see
[06‑enhancements‑unconsidered.md](./06-enhancements-unconsidered.md):

- **Box Metadata‑Query** as a Box‑native search index over Case/PO folders (`BOX_METADATA_ENABLED`).
- **Box AI** Extract to pre‑fill the EVA 12 fields / cross‑check the parser; Ask/Hubs over the historical
  corpus (`BOX_AI_ENABLED`; AI Units; Hubs = Enterprise Plus+).
- **Box Doc Gen** for branded reports/letters into the case folder (Enterprise Advanced).
- **Box Governance** retention + legal hold over evidentiary records (Enterprise add‑on).

## Env‑var gates (mirror the existing feature‑flag pattern)

| Var | Default | Gates |
|---|---|---|
| `BOX_API_ENABLED` | `false` | the custom REST connector + webhook receiver (the unlock) |
| `BOX_FOLDER_AT_INTAKE_ENABLED` | `false` | folder + archival at case‑creation (B1) |
| `BOX_FILEREQUEST_ENABLED` | `false` | File Request chaser + webhook intake (B2/B3) |
| `BOX_EMBED_ENABLED` | `false` | the Code App iframe embed (B4; also needs the `frame-src` CSP edit) |
| `BOX_METADATA_ENABLED` / `BOX_AI_ENABLED` | `false` | the Phase‑C enhancements |

## Boundary (per `live-services-boundary` + AGENTS.md)

- **Claude can build:** the custom connector definition, the Azure Function, the flow rewrites, the
  template‑copy/webhook logic, the env‑var gates, lint — all offline/verifiable.
- **Operator‑only:** creating the Box **Platform app + Admin‑Console authorization**, supplying the
  **`client_secret`**, the interactive Box sign‑in for the first‑party connection, the **`frame-src` CSP
  change**, and the live confirmations (does the webhook fire? does the File‑Request upload trigger it?).
- **No Box credential is ever held or fetched by Claude.**
