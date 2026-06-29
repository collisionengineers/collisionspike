---
name: box-integration-pivot-findings
description: "Verified findings + recommendation for the Box-centric intake pivot (dossier at repo-root box-integration-pivot/). KEY reusable constraint: any Box automation beyond plain file upload needs a CUSTOM Box REST connector (CCG/JWT) — the first-party connector is file-only + OAuth-only."
metadata: 
  node_type: memory
  type: project
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

**Dossier:** `box-integration-pivot/` at the collisionspike repo root (README + 00–07), produced
2026-06-21 from a deep-research workflow (29 agents; grounding + 7 web angles + 19 adversarial
verifiers vs primary Box sources). Evaluates the operator's proposal to re-centre intake on Box
(Case/PO + Box folder at instructions-arrival; File Request image chasers; webhook intake).

**DECISION: APPROVED by the operator 2026-06-21 — the pivot is going ahead.** Build planning is underway
via a workflow writing ordered plans into `box-integration-pivot/plans/` (00-BUILD-PLAN + 6 section plans:
docs/app/azure/flows/dataverse/box). The agreed shape:

**Verdict: viable, better for image-collection/organisation, NOT cheaper — an ADDITIVE,
phased, env-gated hybrid, keeping Dataverse authoritative (Box Metadata has no joins; can't run
dedup/status/Case-sequencing). Do NOT pivot for cost** — evidence already lives in cheap Azure Blob
(`cespkevidstdev01/evidence`), not Dataverse File, so Box (per-seat, unlimited) is storage-neutral.

**Reusable verified Box constraints (the durable part — recur on ANY future Box work):**
- **First-party MS Box connector is FILE-ONLY + interactive-OAuth-only** (Standard class, not Premium):
  no folder-create, no shared-links, no webhooks, no File Requests, no metadata. So everything beyond
  plain upload/download needs a **CUSTOM Power Platform connector over Box REST + a service identity
  (Client-Credentials Grant / JWT)**; secret on the connection/Key Vault (cf. [[codeapp-apikey-connector-connection]]).
- **File Request API = COPY-FROM-TEMPLATE only** (`POST /file_requests/{id}/copy`) — no create-from-scratch.
  Build ONE template by hand in the web app, record its id, copy per Case/PO folder. The capture form
  (reg field) is baked into the template; metadata capture gates at **Business Plus**.
- **Webhooks** (`FILE.UPLOADED`, folder-scoped) are real but **best-effort, no latency SLA, at-least-once,
  droppable**; also fire on move-in. Need HMAC verification + dedup + a reconciliation sweep. The
  File-Request→FILE.UPLOADED firing is **undocumented — LIVE-TEST**. Target = Azure Function (the
  first-party connector's file-created trigger is Events-backed, ≤1-day lag, no subfolders).
- **Start on BASE BUSINESS (~$15/user/mo); Business Plus DEFERRED / metadata OUT OF SCOPE** (operator
  2026-06-21). Metadata is the only Business-Plus gate. **Verified 2026-06-21: the File-Request free-text
  *description* is NOT API/webhook-readable at any tier** (not on the webhook, not on the file, no comment,
  no submissions API) — so reg capture WITHOUT metadata = **filename-VRM / uploader-emails-the-reg / human
  triage**; and most uploads are **case-bound** (per-case link → folder; Case already holds the parsed VRM)
  so need **no** reg capture at all. Business Plus's metadata field is a later *optional reliability*
  upgrade for the orphaned image-only path, **not a blocker**. See `box-integration-pivot/09-metadata-role.md`.
- **Code App CSP**: only an **iframe (Box Embed widget)** can embed, after an admin `frame-src` edit;
  **UI Elements are blocked** (cf. [[codeapp-csp-use-connectors]]).
- **Box AI** API = 25 files/call; corpus Q&A = Box AI for Hubs (UI-only, Enterprise Plus+), metered AI
  Units (Business/Business Plus include none).

The existing `finalize-eva-box` archival (built, OFF, mis-wired CreateFolder + S2 byte bug) is reused and
moved forward to case-creation in the plan. Cross-ref [[queue-case-model]], [[codeapp-csp-use-connectors]],
[[codeapp-apikey-connector-connection]].
