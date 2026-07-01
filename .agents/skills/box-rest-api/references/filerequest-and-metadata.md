# File Requests, metadata, and tier-gating

## File Request — copy-from-template only
Box exposes **no create-from-scratch** for File Requests: *"the API only allows the creation of new file
requests by copying an existing file request associated to another folder."* So:
1. **Hand-build ONE template** in the Box web app (operator / box-integration-architect): capture form =
   email + description + the **required `vehicle_registration` metadata field**. Record its
   `file_request_id` → `BOX_FILE_REQUEST_TEMPLATE_ID`.
2. Per case: `POST /2.0/file_requests/{templateId}/copy` onto the Case/PO folder → a live upload link.
3. Lifecycle: `PUT status:inactive` to expire a chaser link; `DELETE` to remove; `GET` to read.

**The free-text description is NOT machine-readable at any tier** (verified 2026-06-21): not on the
`FILE.UPLOADED` webhook, not on the file `description` (that is the owner's prompt), not a comment, no
submissions API. It surfaces only to a human in the Box UI. So reg capture on **orphaned** uploads uses
**filename-VRM / uploader-emails-the-reg / human triage** — NOT the description. (See
`box-integration-pivot/09-metadata-role.md`.)

## Metadata (the structured reg field) — Business Plus
- Enterprise **metadata template** (Admin Console → Content → Metadata) with `vehicle_registration`
  (+ optional `case_reference`/`principal_code`/`status`). The File-Request form writes it on upload —
  this IS machine-readable (unlike the description).
- **Gated at Business Plus.** Base **Business** covers File Requests + webhooks + folders (Wave 0/1);
  Business Plus is needed only for this metadata FIELD (Wave 2 reliability for the orphaned path).
  Metadata-Query: `POST /2.0/metadata_queries/execute_read`, SQL-like, single-template, no joins,
  Collaborator-scope, ≤100/page, instant.
- **Most uploads need NO reg capture:** the per-case File-Request link is bound to the Case/PO folder,
  and the Case already carries the parsed VRM. Metadata is a later **optional** upgrade for the
  image-only / no-case path — not a Wave 0/1 blocker.

## Tier ladder (USD list, 3-seat min — orientation only, confirm live)
| Plan | Storage | File Requests | Webhooks/API | Metadata |
|---|---|---|---|---|
| Business Starter (~$5) | 100 GB cap | — | — | — |
| **Business (~$15)** | unlimited | ✅ | ✅ | — |
| **Business Plus (~$25–33)** | unlimited | ✅ | ✅ | **✅** |
| Enterprise / + / Advanced | + Governance, Zones, Box AI (metered), Automate HTTPS/AI | | | |

**Do not conflate:** Business Plus = the File-Request metadata FIELD. Box **Automate** "metadata
events/actions" are a separate, higher **Enterprise+** tier (see
`box-integration-pivot/08-relay-automate-assessment.md`).
