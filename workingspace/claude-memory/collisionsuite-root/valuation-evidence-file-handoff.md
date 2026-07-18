---
name: valuation-evidence-file-handoff
description: "The capture→renderer evidence FILE handoff (valuationbot 3.5.0 + collisionrenderer 0.2.4) that replaced inline base64 on Desktop — root, block shape, sha256-mandatory rule, and why inline could never work"
metadata: 
  node_type: memory
  type: project
  originSessionId: c3550705-d655-4fb2-9171-b2eb7aa70b51
---

Inline capture delivery could never round-trip Claude Desktop for a real evidence set: 5 captures
≈ 1 MB base64 ≈ hundreds of thousands of tokens the MODEL must re-emit into
`render_valuation_outputs` (proven live 2026-07-03, jake2: "too large to transmit through this
interface in one call" — Desktop end-to-end renders with full packs had likely NEVER worked).

**Why:** any future "just pass the bytes through the model" design is physically impossible at
evidence-pack sizes; references + shared disk is the only Desktop-viable shape.

**How to apply (the shipped convention — contracts/schemas/valuation/v1/evidence-transfer.md):**
- Root `%LOCALAPPDATA%\CollisionEngineers\evidence` (`VALUATIONBOT_EVIDENCE_ROOT` /
  `COLLISIONRENDERER_EVIDENCE_ROOT` overrides; `${…}` literals read as unset). Connector writes
  `batch-<yyyymmdd>-<hex>/` dirs, 7-day sweep; renderer only reads.
- `capture_advert_pages` `delivery: file|inline` — file is the stdio/Desktop default; blocks become
  `{url,status,filename,evidence_path,sha256,bytes}` with `pdf_base64:""`; wire-budget machinery
  (980KB packing, worst-offender ladder) is SKIPPED in file mode. Cache hits re-write a fresh file
  into the current batch dir.
- Renderer `EvidencePathResolver`: root containment (canonical, case-insensitive,
  separator-safe), `.pdf`, ≤2MB, **sha256 MANDATORY + must match** — the model relaying references
  can't point the renderer at other files or altered bytes. Inline `pdf_base64` wins when both
  present → CR 0.2.4 is a superset, publish it BEFORE valuationbot 3.5.0.
- The skill's job is transport only: relay capture blocks VERBATIM into `captures[]` (SKILL.md
  steps 6/8); `captured_pdf_path = evidence_path` for the dev-only local fallback.
- CaptureResult contract (search-result.schema.json) gained optional `evidence_path/sha256/bytes`.

Related: [[project-renderer-convergence]], [[valuation-capture-quirks]],
[[valuation-suite-integration-map]] (its "exact-url capture match" and "1MB base64" seams are now
addressed; skill duplication seam resolved — canonical skill lives in the VAC repo).
