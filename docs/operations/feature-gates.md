# Feature gates — what every switch does, in plain language

This page explains every feature flag ("gate") in the system: what it actually controls, what changes
if it's on vs off, and its live state as read directly from Azure on **2026-07-20**. It is written for a
non-engineer to understand the *implications* of flipping a switch, not to replace the code.

**Updated 2026-07-21** for the AI-and-assistant section only: `AI_ASSIST_ENABLED` and `AI_CHAT_ENABLED`
were re-read live and then deliberately turned **off**; `IMAGE_ANALYSIS_ENABLED` and `MCP_SERVER_ENABLED`
were re-read and left **on**. Every other row on this page still carries its 2026-07-20 reading.

**How to read "Live state" below:** a gate only has an effect on the one app/service that actually reads
it (see "Read by"). If a name doesn't appear in that app's settings at all, it behaves as **off** — the
system doesn't treat "not set" as "on."

Authoritative machine-readable state lives in [`LIVE_FACTS.json`](../../LIVE_FACTS.json); this page is
the plain-language companion. See also the code-level inventory at
[`docs/tickets/now/TKT-159-feature-gate-intent-audit/evidence/code-derived-gate-inventory-2026-07-20.md`](../tickets/now/TKT-159-feature-gate-intent-audit/evidence/code-derived-gate-inventory-2026-07-20.md).

## AI and assistant features

| Gate | Plain-language meaning | On = | Off = | Live (2026-07-21) |
|---|---|---|---|---|
| `AI_ASSIST_ENABLED` | Lets staff request AI-written suggestions (e.g. drafting text) in the app. | Staff can trigger an AI suggestion. The AI model connection **is** configured (`gpt-5`), so this makes real model calls — see the correction below. | The Assistant panel disappears from the case page entirely, and the suggestion route becomes an honest no-op: no model calls, no cost. Suggestions already stored are **not** deleted, but staff lose the only screen from which to accept or reject them. | **OFF** (`cespk-api-dev`) — flipped from ON at 2026-07-21T11:32:55Z by explicit operator direction ("disable the AI assistant"). Reversible in one command, no deploy. |
| `AI_CHAT_ENABLED` | Turns on a read-only chat drawer where staff can ask the assistant questions about a case. | The chat panel appears and can answer using only read access — it cannot change anything. | No chat panel: the assistant button vanishes from the top of the screen and the chat route politely refuses. This also makes `ASSISTANT_WRITE_TIER_ENABLED` unreachable, because the chat drawer is its only way in. | **OFF** (`cespk-api-dev`) — flipped from ON at 2026-07-21T11:32:55Z by explicit operator direction. Reversible in one command, no deploy. |
| `ASSISTANT_TOOLSET_V2` | Switches the assistant's internal "toolbox" (what it's allowed to look up) to the newer, centrally-managed list. | Assistant uses the current registry-driven tool list. | Assistant falls back to the older hardcoded toolset. | **ON** (`cespk-api-dev`) — but inert while `AI_CHAT_ENABLED` is off. |
| `ASSISTANT_WRITE_TIER_ENABLED` | The riskier tier: lets the assistant *propose* a change, which a human then confirms before it executes. | Assistant can propose write actions for a human to approve/execute; it can never write unilaterally. | Assistant is read-only — suggestion only, no propose/confirm flow. | **ON** (`cespk-api-dev`) — but **unreachable** while `AI_CHAT_ENABLED` is off, since the chat drawer is its only entry point. The flag still reads "on" while nothing can use it. |
| `MCP_SERVER_ENABLED` | The master switch for exposing case data to external AI tools (like Claude or other agents) over a standard protocol (MCP), read-only. | External AI tools can connect and read case data (subject to their own role). | No external AI tool can connect at all. | **ON** (`cespk-api-dev`) — re-read live 2026-07-21 and left on. ⚠️ Note this is **not** covered by turning the two assistant gates off: external AI tools can still read case data. See "Known gaps". |
| `EMAIL_AI_ENABLED` | *(see "Needs definition" below for the full explanation)* An optional AI second opinion on classifying an inbound email, layered on top of a free deterministic classifier that always runs. | The system asks an AI model to double-check ambiguous email classifications; writes only to an internal suggestion field, never routes mail itself. | Only the deterministic (rule-based, $0) classifier runs — no AI involved in email triage. | **ON** (`cespk-orch-dev`) — has been live-acting before, see TKT-120 |

## Image handling and evidence

| Gate | Plain-language meaning | On = | Off = | Live (2026-07-20) |
|---|---|---|---|---|
| `IMAGE_ROLE_CLASSIFY_ENABLED` | *(see "Needs definition" below)* An AI step, run automatically on every incoming photo, that decides what the photo actually shows (e.g. "this is the number plate," "this is damage") and whether a registration plate is visible in it. This is the classifier that owns the real fields staff and the system rely on. | New photos get auto-tagged with a role/registration status as they arrive. | New photos are all marked "unknown role" — nothing downstream that depends on role knows what a photo is of. | **ON** (`cespk-orch-dev`) |
| `IMAGE_ANALYSIS_ENABLED` | *(see "Needs definition" below)* A separate, on-demand "tell me more about this image" AI pass a staff member can trigger — checks things like whether a vehicle is present, whether it matches other photos, and suggests an inspection address. It never overwrites the role/registration fields the classifier above owns — it only writes suggestions. | Staff can generate additional AI observations about a specific image on request. Sends image content to an AI service (flagged for privacy review — DPIA-gated). | The "Generate image analysis" action is unavailable. | **ON** (`cespk-api-dev`) — re-read live 2026-07-21 and left on. ⚠️ Since `AI_ASSIST_ENABLED` went off, its output has **nowhere to appear**: the Assistant panel was the only screen showing these suggestions, so they are still written but invisible and un-actionable. See "Known gaps". |
| `DELETE_CASE_IMAGE_ENABLED` | Lets a staff member permanently delete one photo from a case (removes it from every store: archive, cloud storage and the database). | Any signed-in staff member can permanently delete any case image. This is a real, irreversible action — not limited to test cases at the API layer (the archive/Box side is locked to a test folder, the other two stores are not). | The "Delete image" button is present in the UI but does nothing (an honest "disabled" response) — no image can ever be deleted this way. | **ON** (`cespk-api-dev`) — flipped 2026-07-20 by explicit operator direction; live delete/readback proof not yet run, see TKT-160 |
| `MCP_IMAGE_INGEST_ENABLED` (+ `MCP_IMAGE_INGEST_BOX_ROOT_ID`) | Lets an external automated tool (e.g. a folder-watcher on someone's PC) upload photos straight into the matching case by reading a vehicle registration plate, without a human clicking anything. | The upload pathway exists in the code, but see the caveat: a second, independent safeguard (a special "just for this" security permission) must also exist, and it currently doesn't, so nobody can actually use this yet even though the switch is on. | The pathway is switched off entirely. | **ON** (`cespk-api-dev`) — flipped 2026-07-20; currently a no-op for everyone because the dedicated security permission it also requires (`CollisionSpike.ImageIngest`) has never been created, see TKT-154 |

## Public capture (guided photo sessions)

| Gate | Plain-language meaning | On = | Off = | Live (2026-07-20) |
|---|---|---|---|---|
| `CAPTURE_SESSIONS_ENABLED` | Lets a staff member create/manage a "send this person a link to upload photos" session. | Staff can issue/cancel capture links for a case. | Staff cannot create capture sessions. | **ON** (`cespk-api-dev`) — see risk note below |
| `PUBLIC_CAPTURE_ENABLED` | The public-facing side: whether an external person (e.g. the other driver) can actually use a capture link to upload photos, with no login. | Anyone holding a valid capture link can upload photos from their phone/browser. | A capture link, even if issued, returns "not available" to the public visitor. | **ON** (`cespk-api-dev`) — ⚠️ **found live-on without its documented security prerequisite; see risk note below** |
| `CAPTURE_DIRECT_UPLOAD_ENABLED` | Whether the system will hand out a direct, time-limited upload permission straight to cloud storage (faster/cheaper than routing every photo through the server). | Uploads go straight to storage using a short-lived, exact-file permission. | Uploads are refused with a "try again" response. | **ON** (`cespk-api-dev`) — see risk note below |
| `CAPTURE_CLEANUP_ENABLED` | The nightly housekeeping job that expires old capture sessions and deletes files nobody ever finished submitting. | Old/abandoned capture data is automatically cleaned up on a schedule. | Nothing is auto-deleted; the job exists and runs on schedule but does nothing while off. | **OFF** — correctly gated off pending its own dedicated test proof; the job itself is fully built, this is not a missing feature |

**⚠️ Risk note (2026-07-20):** the three "ON" capture gates above were found live during this audit — this
was **not a change made this session**, and nothing in the tickets or the live-state registry records an
approved decision to turn them on. The feature's own ticket (TKT-200) is still marked not-ready
("PENDING"), and its design explicitly requires a network-level lockdown (only allow traffic through the
official front door, not directly to the raw web address) *before* these are switched on — that lockdown
does not exist, and building it means standing up a new piece of Azure infrastructure, not a quick
setting change. Right now, the three public upload routes are reachable directly, without that
protection. The operator's decision on 2026-07-20 was to leave this as-is and document it rather than
change anything further this session. See `docs/tickets/now/TKT-200-guided-capture-sessions/changes.md`
for the full technical trail.

## Box / Archive (document and photo storage)

| Gate | Plain-language meaning | On = | Off = | Live (2026-07-20) |
|---|---|---|---|---|
| `BOX_API_ENABLED` | Master switch for talking to Box (the archive/storage system) at all. | The system can create folders, upload/download/delete files in Box. | No Box calls happen anywhere. | **ON** (both `cespk-api-dev` and `cespk-orch-dev`) |
| `BOX_FOLDER_AT_INTAKE_ENABLED` | Whether a Box folder is automatically created for a case the moment it's opened. | Every new case gets its Box folder immediately. | Case folders aren't auto-created (would need to happen some other way). | **ON** |
| `BOX_FILEREQUEST_ENABLED` | Whether the system can generate a Box "file request" link (a way to ask someone outside the company to upload a file into a specific folder). | File-request links can be generated. | That capability is unavailable. | **ON** |
| `BOX_REG_FOLDER_ENABLED` | *(see "Needs definition" below)* A newer, more specific behavior: creating a Box holding-folder keyed by vehicle registration plate rather than case, for photos that arrive before they're matched to a case. | The system will create these new registration-keyed folders — a new folder-naming pattern under the Box root, which the ticket that built this said needs explicit operator sign-off first. | The system falls back to its existing behavior for unmatched images (`reg_folder_gate_off`). | **ON** (`cespk-orch-dev`) — confirmed by the operator (2026-07-20) as a deliberate, approved flip. TKT-034's own prose still describes it as dark/pending; that ticket text is stale, not the live state. The post-flip live proof (one reg-keyed folder create observed end to end) still hasn't been recorded. |

## Triage (automatic email/case routing rules)

All six of these only take effect together, and only on the orchestration service (`cespk-orch-dev`), not the customer-facing API. If all are off, the system just falls through to its existing default routing behavior — nothing breaks, it simply skips the newer automated rules.

| Gate | Plain-language meaning | Live (2026-07-20) |
|---|---|---|
| `TRIAGE_REF_GATE_ENABLED` | The base rule: try to match an inbound email to a case using its reference/job number. | **ON** |
| `TRIAGE_CANCELLATION_ENABLED` | Recognize and route cancellation-type emails automatically. | **ON** |
| `TRIAGE_IMAGES_ROUTING_ENABLED` | Automatically route emails that just contain photos to the right case. | **ON** |
| `TRIAGE_CASE_UPDATE_ENABLED` | Automatically apply routine case-update information from an email. | **ON** |
| `TRIAGE_AUTO_ATTACH_ENABLED` | If there's exactly one obvious matching case (an exact reference match), skip the "are you sure?" step and attach automatically instead of just suggesting it. Has no effect unless the ref-gate rule above is also on. | **ON** |
| `TRIAGE_PRE_INSTRUCTION_ENABLED` | Recognize a specific category of early-stage instruction emails and route them through their own lane. | **ON** |
| `TRIAGE_PARSE_FED_ENABLED` | Lets what the parser reads INSIDE an attached document (its registration/reference and what kind of document it is) inform how the inbound email is triaged — so an email whose only case-reference lives inside the PDF can still be matched, and a photos-only PDF with a generic name is recognised. The document is read BEFORE triage decides (PLAN-014). | **ON** (`cespk-orch-dev`) — flipped from its ship-dark default @ 2026-07-21T04:27:50Z (TKT-296). Kill-switch: unset (or set false) to fall back to the byte-identical pre-reorder triage decision; the parse→triage reorder itself stays live regardless. Behavioural post-flip proof (`parseFedApplied=true` on a live arrival) not yet banked — no inbound has been triaged since the flip; tracked as TKT-296's residual follow-up. |

## Location, vehicle data and document reading

| Gate | Plain-language meaning | On = | Off = | Live (2026-07-20) |
|---|---|---|---|---|
| `LOCATION_ASSIST_ENABLED` | Master switch for helping staff pick/confirm an inspection address using mapping data. | Location suggestions are available. | No location assistance. | **ON** |
| `AZURE_MAPS_ENABLED` | Whether the mapping data itself (Azure Maps) is connected. | Real map/geocoding data backs location suggestions. | Even with location-assist on, no real map data is available. | **ON** |
| `LOCATION_ASSIST_AI_ENABLED` | An extra AI step layered on top of location-assist: when the basic lookup isn't confident, escalate to an AI model that can look at photos for location clues. | The system will use AI vision as a fallback for hard-to-place addresses. | Only the non-AI lookup runs. | **ON** |
| `ENRICHMENT_ENABLED` | Whether the system automatically looks up extra vehicle details (make/model/etc.) from a registration plate. **Confirmed 2026-07-20: this is the single, sole gate for both DVSA (MOT history) and DVLA (vehicle registration/VES) lookups** — there is no separate DVSA-only or DVLA-only switch anywhere in the codebase (`services/functions/vehicle-enrichment/function_app.py:210` is the one check, guarding both providers before either is called). DVLA specifically isn't flag-gated at all — it's silently skipped only when its API key is absent, a config-presence behavior, not a toggle. The sibling `dvla-dvsa-connector` repo is a thin pass-through with no lookup logic of its own, so it adds no additional gate. | Vehicle details (including DVSA/DVLA data) are auto-filled from external data sources. | No auto vehicle lookup at all — DVSA and DVLA together, not separately. | **ON** |
| `MILEAGE_ESTIMATE_AUTOFILL_ENABLED` | Whether the vehicle-lookup service is also allowed to *guess/estimate* a mileage figure (from MOT history) and fill it in automatically when there's no real reading. | An estimated mileage is auto-filled if no real reading exists — currently on accuracy evidence limited to a 24-row synthetic test (average error ~379 miles), and the safeguard meant to guarantee a real reading always outranks an estimate hasn't been proven live. | Mileage is only ever recorded from a real reading, never estimated. | **ON** (`cespkenrich-fn-gi62sd`) — flipped 2026-07-20 by explicit operator direction, having been shown the accuracy/precedence gaps above; owning ticket TKT-152 stays PENDING, see "Known gaps" below. |
| `PLATE_OCR_ENABLED` | Whether the system tries to automatically read a number plate out of a photo. | Plates in photos are auto-read into text. | No automatic plate reading. | **ON** (`cespk-orch-dev`) |
| `OCR_SCANNED_PDF_ENABLED` | Whether the system tries to read text out of a scanned (image-only) PDF document, as a fallback when normal text extraction finds nothing. | Scanned documents get an OCR pass so their content isn't invisible to the system. | Scanned PDFs with no embedded text stay unreadable to the system. | **ON** (`cespk-orch-dev`) |
| `PDF_MAPPER_ENABLED` | Whether incoming PDF documents are automatically parsed into structured case data. | Documents are auto-parsed. | Documents arrive but aren't automatically read into structured fields. | **ON** |
| `GLOBAL_SEARCH_ENABLED` | The search bar that looks across all cases at once. | Staff can search everything from one box. | No global search endpoint. | **ON** |

## Mail handling

| Gate | Plain-language meaning | On = | Off = | Live (2026-07-20) |
|---|---|---|---|---|
| `OUTLOOK_MOVE_ENABLED` | Whether the system is allowed to move emails between Outlook folders on the company's behalf. | Processed emails get filed into the right Outlook folder automatically. | Emails stay wherever they arrived; nothing is moved. | **OFF** (both apps) |
| `DONE_SENT_EMAIL_ENABLED` | Watches the *Sent Items* folder to detect when a staff member's own outgoing email means a case should be marked done. | The system watches for these sent-email signals and can flag a case as complete off the back of one. | No sent-email-based auto-completion. | **ON** (`cespk-orch-dev`) |
| `CHASER_SEND_ENABLED` | Whether an automated reminder/chaser message is actually sent to someone who hasn't responded. | ⚠️ **Even when on, this does not currently send a real message** — the code only records that a send "would have happened" (an audit-only stub); the real Outlook/WhatsApp send is not yet built. | No chaser activity at all, real or fake. | **OFF** (`cespk-orch-dev`) — and would be a no-op even if flipped on, see "Known gaps" below |

## Retroactive case reconstruction (rebuilding history for older cases)

| Gate | Plain-language meaning | Live (2026-07-20) |
|---|---|---|
| `RETRO_CASE_ENABLED` | Master switch for reconstructing a case's history from old archive/email records. | **ON** (both apps) |
| `RETRO_OUTLOOK_SEARCH_ENABLED` | Whether reconstruction is allowed to search Outlook, not just the archive. | **ON** |
| `RETRO_RELATED_INGEST_ENABLED` | Whether reconstruction also pulls in related correspondence it finds, not just the primary thread (capped at 25 new links per run). | **ON** |
| `RETRO_ADOPT_ARCHIVE_PO_ENABLED` | Whether a purchase-order number discovered in the old archive is adopted verbatim as the case's reference. | **OFF** — deliberately, current dev/test posture; scheduled to flip at production cutover, see TKT-219 |

## Case lifecycle / destructive actions

| Gate | Plain-language meaning | On = | Off = | Live (2026-07-20) |
|---|---|---|---|---|
| `AUDIT_CASES_ENABLED` | Turns on the case-auditing feature. | Auditing is active. | No case auditing. | **ON** |
| `CASE_DISPOSITION_ENABLED` | *(see "Needs definition" below)* A nightly scheduled job that irreversibly blanks personal/claim data (name, VRM, claim/policy references, EVA fields) out of cases whose retention period has expired — a GDPR-style scheduled erasure, not a row delete. **Currently scheduled for full removal, not just left off** — see below. | The job would run nightly and erase eligible cases' PII — but it's also inert today for a second reason (see right). | Nothing happens; the job no-ops on its nightly tick. | **OFF** (`cespk-orch-dev`) — and would still be a no-op even if flipped on: the column that decides eligibility (`retention_expires_at`) is never written by any code today. |

## Two gates that currently do nothing (dead code)

| Gate | What the name implies | Actual live effect |
|---|---|---|
| `AZURE_VISION_ENABLED` | Sounds like it should turn on an Azure Vision (image-recognition) integration. | **Nothing reads this flag anywhere in the codebase.** Flipping it on or off currently has zero effect on the running system. |
| `VALUATION_ENABLED` | Sounds like it should turn on vehicle valuation lookups. | **Nothing reads this flag anywhere in the codebase either.** Same as above — it's a name in the registry with no code behind it yet. |

`EVA_API_ENABLED` sits between these two states: real code exists for parts of it (webhook handling,
finalization), but the piece that actually polls the vendor for a report status is an intentional stub
that logs "poll body is not built" even when the gate is on, and the vendor credentials it needs are
currently unresolved in Key Vault. So today, turning it on would not make EVA submissions actually work.

## Needs definition — the four flags the operator asked to have defined precisely

**`EMAIL_AI_ENABLED`** — An always-free, rule-based email classifier runs on every inbound email
regardless of any setting. This flag controls one extra, optional step: sending the email to an AI model
for a *second opinion* when the deterministic pass is ambiguous. It writes only to an internal suggestion
field used for triage quality — it never files, moves, or routes an email by itself, and it has no effect
on whether an email reaches a case. Read by `cespk-orch-dev` only. Currently **ON**, and per historical
ticket evidence has been live-acting (used in a real classification, TKT-120) rather than untested.

**`IMAGE_ROLE_CLASSIFY_ENABLED` vs `IMAGE_ANALYSIS_ENABLED`** — these are two separate AI features that
sound similar but do different jobs for different reasons:

- `IMAGE_ROLE_CLASSIFY_ENABLED` runs **automatically** on every photo as it comes in, as part of the
  normal intake pipeline (read by `cespk-orch-dev`). It decides the photo's *role* (e.g. what it's a
  photo of) and whether a number plate is visible in it. This classifier **owns the real, load-bearing
  fields** other parts of the system depend on (the image's role code, whether a plate is visible, and
  can flow into the case's registration/address fields).
- `IMAGE_ANALYSIS_ENABLED` is triggered **on demand** by a staff member clicking a button for one
  specific image (read by `cespk-api-dev`, a different service). It's a broader, more exploratory AI
  look — is a vehicle present, does it match other photos of the same vehicle, is there readable
  background text, can it suggest an inspection address. Critically, by design **it is never allowed to
  overwrite the fields the role-classifier above owns** — it only ever writes new suggestions, never
  touches the live registration/role/address data. It's also flagged for a stricter privacy review (data
  gets processed off-region) than the role-classifier is.

In short: one is the automatic, foundational classifier that the rest of the system trusts; the other is
an optional, additive "tell me more" tool that can never override the first one's answers.

**`BOX_REG_FOLDER_ENABLED`** — when a photo arrives before it can be matched to any known case (e.g. the
registration plate isn't recognized yet), this flag controls whether the system creates a brand-new kind
of holding folder in Box, named by the vehicle's registration plate rather than by its `case_po` (the
case's single reference number, formatted like a PO number — there is no separate "Case" vs "PO" naming
scheme, just the one `case_po` field). This is a genuinely new naming pattern under the shared Box folder
root, which is why the owning ticket (TKT-034) requires explicit sign-off before it's used live —
introducing a second naming pattern into the shared archive tree is a decision, not just a technical
flip. It's read by `cespk-orch-dev`. Once a real case later exists for that same registration, a second
function (`adoptArchiveHolding`) moves the held files into the case's real folder and removes the
temporary reg-keyed one. **This audit found it live (`true`) on 2026-07-20**, contradicting TKT-034's own
text (which still describes it as dark) — the operator has since confirmed this was a deliberate, approved
flip; TKT-034's written verdict is stale and should be updated to match, and the ticket's own post-flip
live proof (one reg-keyed folder create observed end to end) still hasn't been recorded.

**`CASE_DISPOSITION_ENABLED`** — a nightly timer job (`case-disposition-timer`, 02:00 daily) that finds
cases whose retention clock has expired and that aren't under legal hold, then runs a single UPDATE that
irreversibly blanks their personal/claim data: all 12 EVA submission fields, the vehicle registration and
case reference, the case name (replaced with `[disposed]`), and eight overview-snapshot fields (claimant,
insurer, policy/claim numbers, incident date, repairer). It never deletes the row, and it never touches
Evidence/Blob/Box content — that's a separate mechanism. Nothing else in the codebase calls this job; it
only ever runs from its own timer. It's a classic scheduled data-retention/privacy-erasure action, not a
"finalize the case" business step.

It's currently doubly inert: the gate is off, **and** even if flipped on, the database column that decides
which cases are eligible (`retention_expires_at`) is never written by any code path today, so the job
would still find zero cases to act on.

**More importantly, this isn't a stable "off, revisit later" switch.** A live P0 ticket,
[`TKT-206-remove-runtime-data-policy-controls`](../tickets/now/TKT-206-remove-runtime-data-policy-controls/TKT-206-remove-runtime-data-policy-controls.md)
(status `now`, not started), has this entire feature — the job, its two internal routes, and its four
supporting columns (`retention_expires_at`, `legal_hold`, `legal_hold_reason`, `held_by`) — scheduled for
full removal. The operator has reclassified automated privacy-driven retention/erasure as an unwanted
restriction that can block authorized project processing from full case context, not as protection worth
keeping. It has zero test coverage, and its cited design rationale (ADR-0017) doesn't exist in the repo
(the ADR sequence jumps 0016 → 0018). Treat this gate as "scheduled for deletion," not "intentionally off."

## Known gaps found during this audit (not fixed, just surfaced)

- **"Turn off the AI assistant" does not turn off all AI (2026-07-21).** `AI_ASSIST_ENABLED` and
  `AI_CHAT_ENABLED` are independent leaves, not parents. With both off, two AI paths are still live:
  `IMAGE_ANALYSIS_ENABLED` still runs and still writes image suggestions, and `MCP_SERVER_ENABLED` still
  serves case data to external AI tools. Anyone reading "the assistant is disabled" should not infer
  either of those is closed. Each is owned by a separate ticket (TKT-016, TKT-110) and needs its own
  operator decision.
- **Image-analysis suggestions are now written but invisible (2026-07-21).** The Assistant panel was the
  only place a case's AI suggestions were shown. With `AI_ASSIST_ENABLED` off and
  `IMAGE_ANALYSIS_ENABLED` on, new suggestion rows keep accumulating with no screen to review them, and
  any already-pending ones can no longer be accepted or rejected by staff. Nothing is deleted. Either
  turn `IMAGE_ANALYSIS_ENABLED` off too, or accept that it is producing unreviewable output.
- **The AI model connection is configured, contradicting the code comments (2026-07-21).**
  `AI_MODEL_ENDPOINT` and `AI_MODEL_DEPLOYMENT` (`gpt-5`) are both set live on `cespk-api-dev`.
  `packages/domain/src/gates.ts` previously claimed they were absent and that the suggestion route was
  therefore an honest no-op. It was not: before the flip, the route made real model calls. The comment is
  corrected in the same change as this note.
- **`ASSISTANT_WRITE_TIER_ENABLED` reads on but is unreachable (2026-07-21).** The chat drawer is its
  only entry point, so with `AI_CHAT_ENABLED` off the flag advertises a capability nothing can invoke.
  Left as-is deliberately; worth resolving so the registry doesn't overstate live capability.
- **`CHASER_SEND_ENABLED` is a stub even when on.** The code path that should send a real reminder
  (via Outlook/WhatsApp) only records an audit row today — see the table above.
- **`AZURE_VISION_ENABLED` and `VALUATION_ENABLED` are unused code.** No harm in either state, but they
  shouldn't be read as "features that exist and are just off" — there's no feature behind them yet.
- **`BOX_REG_FOLDER_ENABLED` live state contradicts ticket prose** — resolved: the operator confirmed the
  live flip was deliberate (2026-07-20). TKT-034's written verdict still says dark/pending and needs
  updating to match; its own post-flip live proof step has still not been recorded.
- **Public capture (`PUBLIC_CAPTURE_ENABLED` + friends) is live without its documented security
  prerequisite** — see the risk note in the capture section above.
- **`internalArchiveHoldingAdoptionCandidates`/`internalArchiveHoldingRegister` are currently failing on
  every call** on the live API — unrelated to any gate, a probable stale-deploy issue under active
  diagnosis in TKT-228; not fixed in this pass.
- **`MILEAGE_ESTIMATE_AUTOFILL_ENABLED` went live ahead of its own ticket's proof gates.** TKT-152 is
  explicit that a production-scale calibration holdout, a live precedence proof and provider credential
  rotation should all land before go-live; none of them has. The operator made an informed decision to
  accept that risk rather than wait — this is now flagged as active, live-risk work in TKT-152
  (moved back to `now`), not a resolved item.

## Live readback sources (2026-07-20)

`az functionapp config appsettings list` against `cespk-api-dev`, `cespk-orch-dev`,
`cespkbox-fn-v76a47`, `cespkloc-fn-a7tzj2`, `cespkenrich-fn-gi62sd`, `cespkocr-fn-dev-glju3v`; a
subscription-wide Front Door/CDN resource search; `az functionapp config access-restriction show` on
`cespk-api-dev`; and `npx box folders:get 0` (operator-run) confirming the Box test-folder identity. Full
detail and file:line code citations are in
[`evidence/code-derived-gate-inventory-2026-07-20.md`](../tickets/now/TKT-159-feature-gate-intent-audit/evidence/code-derived-gate-inventory-2026-07-20.md)
and the dated entries in each owning ticket's `changes.md`/`verification.md`.
