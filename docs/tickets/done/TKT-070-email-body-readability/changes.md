# Changes — TKT-070: Inbox email previews are one unreadable line — keep line breaks, cut noise

## Status
not started

## PLAN-003 classifier wave — 2026-07-09

**Shipped:**
- New pure util **`packages/domain/src/domain/email-body-clean.ts`** (`cleanEmailBodyForPreview`) —
  line breaks preserved; blank runs collapsed to one; quoted reply chains cut (Original-Message /
  underscore dividers, Gmail "On … wrote:", Outlook From:/Sent: header blocks, ">"-lines — mirroring
  the engine's `_sender_written_text` conventions); bracketed image/link garbage removed
  (`[https://…]`, `[cid:…]`, `<tel:…>`/`<mailto:…>`/angle-link duplicates); remaining URLs shortened
  to their host; the signature tail cut after the sign-off + one short name line; legal boilerplate
  markers (registered office / authorised-and-regulated / disclaimer / "reserves copyright" /
  "proud members of" …) truncate outright. Exported from the @cs/domain barrel.
- **Wired in**: `services/orchestration/src/workflows/intake/fetchMessage.ts` (the `replace(/\s+/g,' ')`
  collapse REPLACED; `BODY_PREVIEW_CAP` unchanged) and `services/orchestration/src/workflows/retro/retro-envelope.ts`
  (same recipe). **PREVIEW ONLY** — the full `body` still feeds `extractVrm` and the parser
  (acceptance's regression guard; the sniff call sites are untouched).
- **Tests (14, all passing first run)** — pinned on the verbatim QDOS garbage shape from the
  2026-07-08 operator note (typed body survives; ASSIST-EMAIL-SIGNATURES image URLs, tel:/angle
  links, "Proud members", "reserves copyright" all gone; sign-off + name kept; phone dropped) plus
  Outlook/Gmail/divider chain cuts, paragraph + blank-line structure, URL→host, legal-only footer,
  nullish inputs.

**Deploys:** domain rebuilt + orch republished (68 fns) 2026-07-09 — new intakes now store the
multi-line cleaned `body_preview`. No schema/SPA change (the Inbox already renders pre-wrap).

**Remainders:** backfill of EXISTING rows deliberately NOT done (old previews lost their line breaks
at capture; a re-fetch-from-Graph backfill is the optional scope the spec left open). Live proof
class (a real new intake's stored preview + an Inbox screenshot) is the verifier's.
