# TKT-145 — live-proof staging record (2026-07-10)

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
