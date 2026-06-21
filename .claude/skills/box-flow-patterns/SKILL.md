---
name: box-flow-patterns
description: Power Automate cloud-flow fragments for the collisionspike Box pivot — copy-pasteable Logic Apps definition JSON for the Box-specific flows (box-folder-create, box-file-request-copy, the finalize-eva-box folder-augment delta, case-resolve survivor-folder ensure, box-blob-purge) plus the house conventions (gates are READ not defined, unified connector operationIds, BOX_ID_LITERAL_RE linter idiom, audit-every-branch). Use when building, editing, reviewing, or verifying any Box flow, or when you need the exact definition shape, @-expression, gate-read, or linter idiom for a Box op. Box-scoped companion to the power-automate-flow skill (which owns M1 intake + the EVA/byte-upload finalize core); contract names follow box-rest-api + 00-BUILD-PLAN.md. Pairs with the power-automate-flow-builder agent.
---

# Box flow patterns (collisionspike Box-centric pivot)

Copy-pasteable Power Automate / Logic Apps **`definition`** fragments for the Box flows. Ground truth is
**00-BUILD-PLAN.md Waves 1-2-5** + `box-integration-pivot/plans/04-power-automate-flows.md`; connector
op-names + auth come from the **box-rest-api** skill. This is the **Box-scoped companion** to
`power-automate-flow` (which owns M1 intake + the EVA/byte-upload finalize core) — it carries **only the
Box deltas**, not a second copy of the intake/EVA patterns.

## When to reach for this
- Building/editing/reviewing any Box flow: `box-folder-create`, `box-file-request-copy`, the
  `finalize-eva-box` **augment delta**, `case-resolve` survivor-folder ensure, `box-blob-purge`.
- You need the exact definition shape, an `@`-expression, a gate-read, or the linter idiom for a Box op.

This skill is **[BUILD] only**: author definitions and verify them offline. **Never** activate a Box
flow, bind a live Box connection, or call Box — those are operator steps. Claude never holds a Box
credential.

## Pattern index
| # | Fragment | Read | Wave / plan |
|---|---|---|---|
| 1 | `box-folder-create` — Request+Response child; `CreateFolder name=@toUpper(casePo)` under `BoxArchiveRootId`; guard `empty(cr1bd_boxfolderid)`; swallow 409; stamp `cr1bd_boxfolderid`+`boxsyncedat`; audit `box_folder_created` | `references/01-box-folder-create.md` | W1 / 04 §5 |
| 2 | `box-file-request-copy` — input `{caseId, fileRequestTemplateId, folderId}`; **guard `empty(folderId)→folder_not_ready`** (never call Box with a null `folder.id`); `CopyFileRequest status:"active"`; response `{fileRequestUrl, expiresAt, outcome}` (`outcome ∈ sent\|gated_off\|folder_not_ready`) | `references/02-box-file-request-copy.md` | W2 / 04 §7 |
| 3 | `finalize-eva-box` **augment delta** — folder **pre-exists**, so finalize *augments* not creates; migrate the hard-coded `BoxArchiveRootId` to read `cr1bd_BOX_FOLDER_ROOT_ID`; keep the S2 `GetFileContentByPath_V2` real-bytes → first-party `CreateFile`; `box_synced` stamped LAST | `references/03-finalize-augment-delta.md` | W1 / 04 |
| 4 | `case-resolve` survivor-folder ensure — idempotent `box-folder-create` on a merged single-pair | `references/04-case-resolve-ensure.md` | W1 / 04 §9 |
| 5 | `box-blob-purge` — `Recurrence` with `startTime`; `PurgeGraceDays` default 7; gate `BOX_API_ENABLED`; delete Blob evidence where `box_synced AND boxsyncedat < now-grace` via `DeleteFile_V2`; **never the Box copy** | `references/05-box-blob-purge.md` | W5 / 04 §11 |

## House conventions every fragment follows
- **Gates are READ, never DEFINED.** A Box flow reads a `BOX_*` env-var's value and branches; the names
  + defaults are owned by **dataverse-data-architect** (plan 05), default OFF.
- **Connector ops are the UNIFIED operationIds** (`CreateFolder`, `CopyFileRequest`, `GetSharedLink`,
  `ListFolder`, `CreateWebhook`, …) — they MUST equal the generated `*Service` method names
  (box-rest-api).
- **Bytes stay first-party.** `shared_box_rest` (the custom connector) ops **never** appear in
  finalize's byte path — bytes go via first-party `shared_box` `CreateFile` after
  `GetFileContentByPath_V2` (the S2 fix). Only the **folder** is created via the custom connector.
- **Connection-ref name is UNPINNED** (00-BUILD-PLAN: repoint `cr1bd_box` vs parallel `cr1bd_box_rest`)
  — fragments reference it via a **placeholder**, not an assertion.
- **Linter:** extend `BOX_ID_LITERAL_RE` to flag hard-coded `parent_id|folder_id|file_request_id`
  literals (NOT `name:"<digits>"` — the folder name is the UPPERCASE Case/PO, not all-digits); allow
  `box-blob-purge`'s `status`+`boxsyncedat` `ListRecords` as the documented exception.
- **Audit every branch.** Write an `AuditEvent` row at each outcome (`box_folder_created`,
  `box_file_request_copied`, `box_upload_received`).
- **Folder timing.** `cr1bd_casepo` (and therefore the folder) exists at **parse-confirm**, not at
  EVA-submit — `box-folder-create` runs inside intake's `Scope_generate_casepo` after
  `Update_case_casepo`.

## Offline build-verification (the only run this skill performs)
`node flows/validate-flows.mjs` must print `OK` — well-formed JSON; references only declared connection
refs; each `BOX_*`-gated flow registered with its gate in `flow-state.json`; `shared_box_rest` ops never
in `finalize-eva-box`'s byte path; balanced `@`-expression parens.

## Hard boundary (cross-link, don't duplicate)
`finalize-eva-box`'s **EVA 12-field payload, the 2-previews-then-all photo order, the byte upload via
first-party `CreateFile` after `GetFileContentByPath_V2`, and the `box_synced`-stamped-LAST idempotency
latch** belong to **`power-automate-flow` Pattern 6** + **eva-sentry-api** — this skill owns **only the
Box delta** (folder pre-exists → augment; the connector-vs-first-party byte split). The **webhook
RECEIVER is NOT a flow** (it is an Azure Function — azure-integration-engineer + box-rest-api); reference
it for the flow contract (the `CS Status Evaluate` re-invoke) but do not author it here. **Connector
OpenAPI authoring is azure's** — fragments **BIND** the connector, they don't define it. Two settled
reconciliations: the Code App invokes copy/shared-link via **DIRECT connector ops** and finalize via a
**Dataverse submit-signal** (no SAS-fronted flow) — so these Box flows are **Request-triggered
children**, not app-POST targets.
