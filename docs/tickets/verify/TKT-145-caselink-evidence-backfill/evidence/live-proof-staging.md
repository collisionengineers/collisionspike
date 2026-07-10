# TKT-145 — live-proof staging record (2026-07-10)

> **SUPERSEDED (same day, 16:39Z): the e1301dc9/EREF9 stage below was MOOTED by the TKT-140
> drain** — at 15:45:12Z the drain's rung-1 link cased the EREF9 email onto QDOS26023, so the
> suggestion (still `pending`) no longer exercises the uncased→accept→backfill path: the accept's
> FILL-IF-EMPTY guard (`WHERE case_id IS NULL`) makes accepting it a complete no-op
> (`promoted:false`, no enqueue, no note). **The operative stage is §Re-stage below —
> suggestion `025c8ce2-a4bf-4ed7-a57d-2c1a25231975`.** The original record is kept for the trail.

## Re-stage (2026-07-10 16:39Z) — SQL-staged in the live rung's exact shape

No natural pending case_link remained on any still-uncased attachment-bearing email (fresh
discovery returned 0 rows — the drain consumed the only one), so ONE suggestion was staged per
the original brief's allowance, in the exact shape `internalTriageSuggestLink` writes for a
ref-gate **vrm-tier** `suggest_attach`:

- `suggested_value` = `{ targetCaseId, casePo, sourceMessageId, decisionInputs: { rung: 'ref_gate',
  matchTier: 'vrm', matchCount: 1, openCaseMatches: [the single match], conversationSiblingCaseIds: [],
  caseUpdateApplied: true, autoAttachApplied: false, hasAttachments: true, imagesOnly: false,
  staged: 'TKT-145 live-proof re-stage 2026-07-10 (drain mooted e1301dc9)' } }` — the `staged`
  marker is the one deliberate extra key (provenance honesty);
- `rationale` = the exact `matchLabel('vrm')` wording: *"Matches open case A.QDOS26034 by its
  registration — suggested attaching this email to it."*;
- `confidence NULL`, `model_version 'triage-policy-v1'`, `review_state` left to default `pending`;
- PLUS the route's case-scoped `inbound_link_suggested` (100000035, info, actor NULL) audit row,
  `after` = `{suggestionId, targetCaseId, sourceMessageId, inboundEmailId}` — full route parity.

The INSERT was `WHERE NOT EXISTS`-guarded like the route's own idempotency; run as WSL
Entra-admin + `SET ROLE csadmin` under transient firewall rule `tkt145-insert-*`, trap-deleted
(readback confirmed only `AllowAzureServices` remains).

| field | value |
|---|---|
| **staged suggestion id** | **`025c8ce2-a4bf-4ed7-a57d-2c1a25231975`** (`pending`, created 2026-07-10 16:39:10Z) |
| staged audit id | `da5d3067-ee5d-4f89-b655-627d413373c6` (inbound_link_suggested, case-scoped) |
| **inbound email** | `b958a35b-b32f-41c2-b49c-a1290e36bf00` — "Engineer Riage-Our claim REF: 46573/1- Vehicle registration: SW18EAY", **desk@collisionengineers.co.uk**, received 2026-07-02 22:49Z; readback: `has_attachments=t`, `case_id NULL`, `triage_state new` |
| source_message_id | `<LO6P302MB0028C41A7C30CCCE77D32D9992F52@LO6P302MB0028.GBRP302.PROD.OUTLOOK.COM>` |
| **target case** | `0b07b3d3-ecd6-49ed-9e35-a95e841aabf0` = **A.QDOS26034** (VRM **SW18EAY** — verified the ONLY open case with that registration, matchCount 1; status `missing_images`, created 2026-07-08) |
| **baseline before accept** | evidence rows **24** · "Attachments to add" notes **0** |

**Operator step:** in the SPA inbox, open the uncased **desk@** email "Engineer Riage-Our claim
REF: 46573/1- Vehicle registration: SW18EAY" and **Accept** its case-link suggestion to
**A.QDOS26034** (suggestion `025c8ce2…`). Do NOT bother with e1301dc9 — mooted (clicking it is a
harmless idempotent no-op).

**Known race:** the TKT-140 drain queue is still working (99 drainable rows); if its rung-1 links
this email first, this stage moots the same way (safe no-op) and a fresh pair must be staged.
Recorded backup pair (verified uncased + single-open-VRM-match at staging time): email
`90dff75d-a347-4f25-ba5d-4e5b6b8e20fc` ("MT25 FXW", engineers@, 2026-07-07) → case
`87e79f62-0218-4bfc-8957-0c285536ad6e` (VRM MT25FXW, no case_po, `needs_review`).

---

## ~~Original stage — MOOTED by the TKT-140 drain (kept for the trail)~~

## No synthetic staging was needed — a REAL pending case_link already exists

Discovery (WSL Entra-admin `digital@collisionengineers.co.uk` + `SET ROLE csadmin`, transient
firewall rule `tkt145-stage-*`/`tkt145-base-*` trap-deleted — verified only `AllowAzureServices`
remains after each window):

```sql
SELECT s.id, s.inbound_email_id, s.suggested_value->>'targetCaseId', s.suggested_value->>'casePo'
  FROM ai_suggestion s JOIN inbound_email e ON e.id = s.inbound_email_id
 WHERE s.suggestion_type = 'case_link' AND s.review_state = 'pending'
   AND e.case_id IS NULL AND e.has_attachments = true;
```

→ exactly one row, written by the LIVE ref-gate rung on 2026-07-03 (no INSERT of ours):

| field | value |
|---|---|
| **suggestion id** | `e1301dc9-5936-4507-b5ef-df8adb410aa3` |
| inbound_email_id | `84c72717-21b4-44d9-a7ad-a34c8048cf93` |
| suggestion_type / review_state | `case_link` / `pending` |
| model_version / rationale | `triage-policy-v1` / "Matches open case QDOS26023 by its job reference — suggested attaching this email to it." |
| suggested_value.decisionInputs | `rung: ref_gate`, `matchTier: job_ref`, `imagesOnly: true`, `hasAttachments: true`, `matchCount: 1` |
| **target case** | `0476fa7c-76e7-4890-b071-f4bbdb736275` = **QDOS26023** (VRM EX72YXW, status `missing_images`, created 2026-07-02) |

## The email (previously-uncased, attachment-bearing — the exact TKT-145 class)

| field | value |
|---|---|
| inbound_email.id | `84c72717-21b4-44d9-a7ad-a34c8048cf93` |
| subject | `(EREF9) RTA on 19/06/2026 : Mr Kandasamy Naguleswaran (Our Ref: AMA/46296/1, Veh…` |
| source_mailbox | `desk@collisionengineers.co.uk` |
| source_message_id | `<LO2P302MB010657617E5DE928C931F932DFF42@LO2P302MB0106.GBRP302.PROD.OUTLOOK.COM>` |
| has_attachments / case_id / triage_state | `true` / `NULL` / `new` |
| received_on | 2026-07-03 15:26:56+00 |

## Baseline on the target case QDOS26023 (BEFORE the operator accept)

- **evidence rows: 4** — `LtrtoEngineerIn.pdf` (instruction), `message.eml` (email),
  `LtrtoEngineerIn__RJS_UnknownVRM_img_1_2.jpeg` + `LtrtoEngineerIn__RJS_UnknownVRM_img_1_1.png`
  (extracted images, sha256 present), all `source_label = 'auto-intake'`, created 2026-07-02.
- **notes: 0** (no "Attachments to add" note exists — the success path must keep it that way).
- case status: `missing_images`.

## The operator step (deliberately NOT performed by the implementer)

In the SPA inbox, open the uncased **desk@** email "(EREF9) RTA on 19/06/2026 : Mr Kandasamy
Naguleswaran…" (received 2026-07-03) and **Accept** its case-link suggestion to **QDOS26023**
(suggestion `e1301dc9-5936-4507-b5ef-df8adb410aa3`). That accept is the live proof.
