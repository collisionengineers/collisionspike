# Code-derived gate inventory — 2026-07-20

> ✅ **UPDATE, same day (2026-07-20 later pass): live-verified.** A fresh, operator-authenticated
> `az functionapp config appsettings list` readback was taken against every relevant app
> (`cespk-api-dev`, `cespk-orch-dev`, `cespkbox-fn-v76a47`, `cespkloc-fn-a7tzj2`, `cespkenrich-fn-gi62sd`,
> `cespkocr-fn-dev-glju3v`), resolving nearly every "not pinned" row below and Tension #1 (the AI/model
> config was NOT absent as a stale code comment claimed — `AI_MODEL_ENDPOINT`/`AI_MODEL_DEPLOYMENT` are
> both set live, and every AI gate this file worried about is confirmed **ON**). See
> [`docs/operations/feature-gates.md`](../../../../operations/feature-gates.md) for the current
> plain-language state of every gate and [`changes.md`](../changes.md) for the full session trail
> (including two live incidents found along the way — a capture-ingress exposure and a stale
> archive-holding deploy — and two gates flipped live by explicit operator direction:
> `DELETE_CASE_IMAGE_ENABLED`, `MCP_IMAGE_INGEST_ENABLED`). **The table below is now historical —
> superseded by `feature-gates.md` — and is kept for its code citations, not as current live state.**
>
> ❌ **Factual correction (2026-07-21).** The `OUTLOOK_MOVE_ENABLED` row below says
> *"needs `Mail.ReadWrite` Exchange re-consent"*. That is **wrong** — the grant already exists and did
> when this file was written. Live `Test-ServicePrincipalAuthorization` against the Graph Intake app
> shows `Application Mail.ReadWrite` `InScope=true` for `info@`, `engineers@` and `desk@`, via Exchange
> Online RBAC scopes `CollisionSpike-Intake-Prod` and `CS-Intake-EngDigital`. The gate is off-and-
> intentional, but it is off **by gate alone** — no permission blocks the move. The error is
> understandable: the Entra side is empty, so `az`/Graph queries of the app registration show no roles
> at all. Use `Test-ServicePrincipalAuthorization`, never `az`, to settle mailbox permission questions.
>
> ⚠️ **NEEDS VERIFICATION / FACT-CHECK BEFORE USE.** This inventory was assembled by reading the
> repository (`packages/domain/src/gates.ts`, service source, `LIVE_FACTS.json`, ADRs, and ticket
> specs) plus the *committed* `LIVE_FACTS.json` snapshot (`lastVerified: 2026-07-19T22:40:05Z`). It
> was **not** cross-checked against a live `az functionapp config appsettings list` / `az webapp
> config appsettings list` readback on `cespk-api-dev`, `cespk-orch-dev`, or the retained Function
> apps. `LIVE_FACTS.json` itself states some fields are **carried forward, not re-minted** (the
> subscription offer and the app-tier function counts). Per TKT-159's own acceptance criteria, a
> code/registry inventory is not sufficient proof — every row marked **"not pinned"** below must be
> confirmed with a fresh read-only app-settings readback (and, where noted, a behavioral smoke test)
> before being treated as ground truth or used to justify enabling/disabling anything. Nothing in
> this file was used to change a live setting; it is read-only source material for TKT-159's
> acceptance criteria (code-derived inventory, classification, drift-flagging).
>
> CarClaims is out of scope per the hard operator rule and does not appear below.

## Methodology

- **Code side:** `packages/domain/src/gates.ts` is the single TypeScript gate registry (server-only,
  reads `process.env`, every accessor defaults to `false`/`''` on a missing var — ADR-0027 ship-dark
  model, all gates default-OFF). Re-exported by `services/data-api/src/features/settings/gates.ts`;
  read directly by orchestration activities. The SPA never imports it — it reads gate state over
  `/api/gates/*` (`gate-routes.ts`), which fails closed to all-off on any error. The four Python
  Function services (`box-webhook`, `eva-sentry`, `vehicle-enrichment`, `location-assist`) do **not**
  share the TS reader — each parses its own `*_ENABLED` at the edge, so an activated gate must be set
  on every app that enforces it, not just the TS registry.
- **Live side (as far as this pass could establish without an app-settings readback):**
  `LIVE_FACTS.json` `safetyGates` (explicit booleans, authoritative where present) and
  `deliberatelyUnavailable[]` (capability-level, not flag-level). Where LIVE_FACTS does **not** pin a
  raw flag value, this file says "not pinned" — that is a gap in this pass, not a claim the flag is
  off.
- **Intent audit ticket that owns this work:** TKT-159 itself (this ticket) — its acceptance criteria
  (code-derived inventory, classification, live/registry drift-flagging, CI drift check) are what this
  file is scoped to feed, not to close on its own.

## Master gate table

Classification key (TKT-159 acceptance line 2): **on-and-required** / **off-and-intentional** /
**awaiting-implementation-or-dependency** / **retired-dead-code**. Live state: **DARK** = pinned
`false` in `LIVE_FACTS.safetyGates` or listed in `deliberatelyUnavailable`; **ON** = pinned `true`;
**not pinned** = LIVE_FACTS does not fix the raw value — **verify live before treating as fact**.

| Flag (env var) | Controls | Read-at | Default | Live state (LIVE_FACTS) | Classification (proposed — verify) |
|---|---|---|---|---|---|
| `OUTLOOK_MOVE_ENABLED` | Outlook mail filing/move (SPA action + Data API enqueue + orch mover) | `gates.ts:124` | off | **DARK** — `safetyGates.outlookMove.{dataApi,orchestration}=false` | off-and-intentional — needs `Mail.ReadWrite` Exchange re-consent |
| `EVA_API_ENABLED` | EVA REST submission | `gates.ts:22`; `eva-sentry/function_app.py:255` | off | **DARK** — `safetyGates.evaSubmission=false`; in `deliberatelyUnavailable` | awaiting-dependency — vendor multi-principal support + parity test; EVA Key Vault is empty (see estate section) |
| `VALUATION_ENABLED` | Valuation lookup | `gates.ts:24` | off | **DARK** (`deliberatelyUnavailable`, not in `safetyGates`) | awaiting-dependency — "pending separate approval" |
| `DELETE_CASE_IMAGE_ENABLED` | Hard-delete of one case image (Archive+Blob+row) | `gates.ts:67`; `gate-routes.ts:112` | off | **DARK** — `safetyGates.deleteCaseImage=false` | awaiting-dependency — pending designated-test-case proof (TKT-160) |
| `PUBLIC_CAPTURE_ENABLED` | 6 anonymous `/api/public/capture/*` routes | `gates.ts:99` | off | **DARK** — `safetyGates.publicCapture=false` | awaiting-dependency — no rate-limit/CORS yet (TKT-200) |
| `CAPTURE_SESSIONS_ENABLED` | Staff capture-session lifecycle routes | `gates.ts:97` | off | **DARK** (guided-capture family) | awaiting-dependency (TKT-200) |
| `CAPTURE_DIRECT_UPLOAD_ENABLED` | SAS minting for direct browser Blob upload | `gates.ts:101` | off | **DARK** (guided-capture family) | awaiting-dependency (TKT-200) |
| `CAPTURE_CLEANUP_ENABLED` | Capture retention/cleanup timer | `gates.ts:103` | off | **DARK** — `safetyGates.captureCleanup=false` | awaiting-dependency — pending designated-test-case proof |
| `MCP_IMAGE_INGEST_ENABLED` | Autonomous MCP image write lane | `gates.ts:90` | off | **DARK** — `safetyGates.mcpImageIngestion=false` | awaiting-dependency — pending dedicated app-role + standard-client proof (TKT-154) |
| `MCP_IMAGE_INGEST_BOX_ROOT_ID` | Test-root id for MCP ingest | `gates.ts:91` | `''` | not pinned (empty ⇒ inert) | tied to the above |
| `MCP_SERVER_ENABLED` | Read-only MCP server (Streamable-HTTP) | `gates.ts:86` | off | **not pinned**; `enabledCapabilities` lists "read-only MCP" — **verify raw flag** | claimed on-and-required — verify |
| `ASSISTANT_WRITE_TIER_ENABLED` | In-app assistant WRITE tier propose→confirm→execute | `gates.ts:81` | off | **not pinned** in `safetyGates`; `enabledCapabilities` lists "human-confirmed assistant writes"; `changes.md` 2026-07-14 entry recorded a live readback of `true` on `cespk-api-dev` | **on-and-required (per 2026-07-14 readback, itself due for re-confirmation)** |
| `ASSISTANT_TOOLSET_V2` | Registry-driven read adapter for assistant | `gates.ts:73` | off | not pinned | verify |
| `AI_ASSIST_ENABLED` | AI suggestion surface + server model-call path | `gates.ts:40`; `gate-routes.ts:92` | off | not pinned; `enabledCapabilities` lists "AI suggestions" | claimed on — verify; also depends on `AI_MODEL_ENDPOINT`/`AI_MODEL_DEPLOYMENT` being configured (see tension below) |
| `AI_CHAT_ENABLED` | Read-only assistant chat drawer | `gates.ts:45` | off | not pinned; 2026-07-14 readback recorded `true` on `cespk-api-dev` (`verification.md:8`) | on — per that readback, due for re-confirmation |
| `IMAGE_ROLE_CLASSIFY_ENABLED` | gpt-5-vision role/registration classifier on intake images | `gates.ts:50` | off | not pinned | verify |
| `IMAGE_ANALYSIS_ENABLED` | Staged image-analysis suggestion producer | `gates.ts:60` | off | not pinned; `enabledCapabilities` lists "image analysis"; **DPIA-gated** per ADR/gate comment | tension flagged below — verify |
| `LOCATION_ASSIST_AI_ENABLED` | AI vision-reasoning escalation on location-assist | `gates.ts:33`; `location-assist/ai_reasoning.py:224` | off | not pinned; operator-blocked per gate comment (prod AI sign-off) | off-and-intentional (operator-blocked) — base `locationAssist` is separately on |
| `GLOBAL_SEARCH_ENABLED` | Global `GET /api/search` | `gates.ts:76` | off | not pinned | verify |
| `DONE_SENT_EMAIL_ENABLED` | Sent-email→case `done` detector; creates SentItems Graph subs | `gates.ts:118` | off | not pinned | verify |
| `BOX_REG_FOLDER_ENABLED` | Reg-keyed Box holding-folder rung (TKT-034 step 2) | `gates.ts:186` | off | not pinned; TKT-034 verification says step 2 built dark, steps 1+3 live | awaiting-dependency — new folder-naming semantic needs operator approval |
| `TRIAGE_REF_GATE_ENABLED` / `TRIAGE_CANCELLATION_ENABLED` / `TRIAGE_IMAGES_ROUTING_ENABLED` / `TRIAGE_CASE_UPDATE_ENABLED` | Individual triage-policy rungs (ADR-0019) | `gates.ts:162-165` | off | not pinned | verify (all four off ⇒ proceed_default) |
| `TRIAGE_AUTO_ATTACH_ENABLED` | Auto-attach promotion of ref-gate (TKT-093) | `gates.ts:172` | off | not pinned; operator-blocked per gate comment | off-and-intentional — verify |
| `TRIAGE_PRE_INSTRUCTION_ENABLED` | Pre-instruction lane (TKT-084, taxonomy v3) | `gates.ts:180` | off | not pinned | verify |
| `PDF_MAPPER_ENABLED` | PDF mapper parse path | `gates.ts:20` | off | not pinned; `enabledCapabilities` "document parsing" ⇒ likely on | verify |
| `ENRICHMENT_ENABLED` | Vehicle enrichment | `gates.ts:21`; `vehicle-enrichment/function_app.py:210` | off | not pinned; `enabledCapabilities` "vehicle enrichment" ⇒ likely on | verify |
| `AZURE_MAPS_ENABLED` | Azure Maps (part of `locationAssistEnabled` AND-combo) | `gates.ts:23,225` | off | not pinned; part of "location assistance" | verify |
| `LOCATION_ASSIST_ENABLED` | Location-assist master (AND-combo) | `gates.ts:29,225` | off | not pinned; `enabledCapabilities` "location assistance" | verify |
| `AZURE_VISION_ENABLED` | Azure Vision | `gates.ts:25` | off | not pinned | verify |
| `OCR_SCANNED_PDF_ENABLED` | Scanned-PDF OCR | `gates.ts:26` | off | not pinned; "scanned-document OCR" ⇒ likely on | verify |
| `PLATE_OCR_ENABLED` | Plate OCR | `gates.ts:27` | off | not pinned; "plate and scanned-document OCR" ⇒ likely on | verify |
| `AUDIT_CASES_ENABLED` | Case auditing | `gates.ts:28` | off | not pinned | verify |
| `CHASER_SEND_ENABLED` | Chaser send | `gates.ts:34` | off | not pinned | verify |
| `CASE_DISPOSITION_ENABLED` | Nightly PII-erasure timer job on retention-expired cases (irreversible field-blank, not a row delete) | `gates.ts:35`; `orchestration/workflows/intake/case-disposition.ts` | off | **OFF** confirmed live (`cespk-orch-dev`); doubly inert — `retention_expires_at` is never written by any code | **scheduled for deletion, not off-and-intentional** — TKT-206 (P0, `now`) has this whole feature queued for removal; see `docs/operations/feature-gates.md` |
| `EMAIL_AI_ENABLED` | Email AI | `gates.ts:36` | off | not pinned | verify |
| `BOX_API_ENABLED` | Box/Archive API master | `gates.ts:106`; `location-assist/photo_source.py:125` | off | **ON** — "Archive folders and file requests" enabled; writes scope-locked (see below) | on-and-required, but writes constrained |
| `BOX_FOLDER_AT_INTAKE_ENABLED` | Create Box case folder at intake | `gates.ts:107` | off | not pinned | verify |
| `BOX_FILEREQUEST_ENABLED` | Box file requests | `gates.ts:108` | off | not pinned; "file requests" enabled ⇒ likely on | verify |
| `RETRO_CASE_ENABLED` | Master switch, retro case reconstruction | `gates.ts:134` | off | **ON** — `safetyGates.retroReconstruction` implies both apps `true` | on-and-required |
| `RETRO_OUTLOOK_SEARCH_ENABLED` | Outlook `$search` rung of retro | `gates.ts:135` | off | **ON** (orchestration `true`) | on-and-required |
| `RETRO_RELATED_INGEST_ENABLED` | Retro related-correspondence ingest (TKT-225) | `gates.ts:154` | off | **ON** (orchestration `true`, set `2026-07-17T02:05:00Z`) | on-and-required |
| `RETRO_ADOPT_ARCHIVE_PO_ENABLED` | Adopt discovered archive-folder PO as `case_po` | `gates.ts:144` | off | **DARK/dev-posture** — `safetyGates.dataApi=false` | off-and-intentional — flips only at production cutover after TKT-004 floor seeding (TKT-178 runbook) |
| `RETRO_BOX_ARCHIVE_ROOT_IDS` | Read-only Box archive root(s) retro may search | `gates.ts:136` | `''` | **`3221031282`** (both apps; repointed 2026-07-16) | on-and-required (config) |

### String / config vars (empty ⇒ inert, honest no-op)

| Var | Controls | Read-at | Live value (LIVE_FACTS) |
|---|---|---|---|
| `AI_MODEL_ENDPOINT` / `AI_MODEL_DEPLOYMENT` | Model config gating every AI path (`aiAssistConfigured`, `aiChatEnabled`, `imageRoleClassifyEnabled`, `imageAnalysisEnabled`, `locationAssistAiEnabled`) | `gates.ts:206-207` | A dated `gates.ts` code comment claims these are **absent** in live app-settings (⇒ every AI gate an honest no-op regardless of its boolean). **This directly contradicts `enabledCapabilities` listing "AI suggestions and image analysis" as enabled — needs a live readback to resolve, see tension #1 below.** |
| `OUTLOOK_MOVE_QUEUE_SERVICE_URL` | Orch queue endpoint (AND-combo `outlookMoveEnabled`) | `gates.ts:212` | not pinned |
| `EVIDENCE_BACKFILL_QUEUE_SERVICE_URL` | Evidence-backfill queue; falls back to `OUTLOOK_MOVE_QUEUE_SERVICE_URL` | `gates.ts:218` | not pinned |
| `ENRICHMENT_API_BASE`, `EVA_BASE_URL`, `VALUATION_API_BASE`, `LOCATION_ASSIST_API_BASE`, `BOX_FOLDER_ROOT_ID`, `BOX_FILE_REQUEST_TEMPLATE_ID` | Service base URLs / Box ids | `gates.ts:194-199` | not pinned |

### Direct `process.env` kill-switches outside the registry

| Flag | Controls | Read-at | Default | Live |
|---|---|---|---|---|
| `GRAPH_IMAGE_FLOOR_DISABLED` | `_DISABLED` kill-switch for the signature/logo decorative-image floor filter on Graph attachments. Default off ⇒ filter **active** | `orchestration/src/adapters/graph.ts:259-264` | off (filter active) | not pinned |
| `MILEAGE_ESTIMATE_AUTOFILL_ENABLED` | Mileage-estimate autofill (TKT-152) | `vehicle-enrichment/function_app.py:168` | off | **ON** (`cespkenrich-fn-gi62sd`) — flipped 2026-07-20 by explicit operator direction, ahead of TKT-152's own production-holdout/precedence-proof/credential-rotation gates; see `TKT-152/changes.md` and `docs/operations/feature-gates.md` |
| `BOX_READONLY_ROOT_IDS` | Read-only archive scope-lock on box-webhook facade | `box-webhook/box_client.py:271`, `function_app.py:441` | `''` | **`3221031282`** live (repointed 2026-07-16) — ⚠️ TKT-107 ticket text still cites the older `4077648161`, likely stale ticket prose, not a live discrepancy |

## Box write scope-lock (guardrail, not a feature flag)

`LIVE_FACTS.safetyGates.boxWrites`: `allowedRootId: "392761581105"`, scope `"approved test folder only"`.
Box writes are constrained to one test root even with `BOX_API_ENABLED` on — distinct from the
read-only `BOX_READONLY_ROOT_IDS` above.

## Deliberately unavailable (capability-level, `LIVE_FACTS.deliberatelyUnavailable`)

1. EVA REST submission — pending vendor multi-principal support + a parity test
2. Valuation lookup — pending separate approval
3. Public guided capture — pending abuse-control + device acceptance
4. Individual image deletion — pending designated-test-case proof
5. Capture cleanup — pending designated-test-case proof
6. MCP image ingestion — pending dedicated app-role + standard-client proof

## Access / permissions not enforced

- `access.engineerRole` = `"defined but not enforced or assigned"` — the role exists but nobody holds
  it. Ties to `operatorWatchItems`: "assign application roles before adding further staff accounts."
- `mailIntake.permissionBoundary` = Exchange-scoped application read access only; no tenant-wide
  Microsoft Graph application role or delegated grant observed.

## Estate items relevant to gate readiness (not flags, but block a flip)

- **EVA Key Vault `cespkevakvufa3ci`** — confirmed empty for secrets (0); keys/certs plane unconfirmed
  (`ForbiddenByRbac` on the auditing identity). `cespkeva-fn` reads `EVA_CLIENT_ID`/`EVA_CLIENT_SECRET`
  as Key Vault references that are currently **unresolved** — i.e. `EVA_API_ENABLED` cannot function
  today even if flipped. Owning ticket: TKT-254.
- **evaValidation** (`cespkeval-fn-6c6fxd`) — still deployed, 0 requests/90d, `source: null`, kept as a
  rollback guard; retirement is operator-gated (TKT-252), not performed.

## Tensions / drift this pass could NOT resolve — flag for live verification

**Resolution update (2026-07-20, later pass):** Tension #1 is RESOLVED — see the banner at the top of
this file and `docs/operations/feature-gates.md`. Tension #3 is substantially resolved (a live readback
across `cespk-api-dev` and `cespk-orch-dev` now pins nearly every "not pinned" row — the two exceptions
are the two dead gates `AZURE_VISION_ENABLED`/`VALUATION_ENABLED`, which are absent everywhere because no
code reads them, not because they're unconfirmed). Tension #2 was not specifically re-checked this pass.
Two NEW findings surfaced by the live readback that this file could not have predicted:
`BOX_REG_FOLDER_ENABLED` is live `true` on `cespk-orch-dev`, contradicting this file's row 66 and TKT-034's
own prose (both said dark) — the operator has since confirmed (2026-07-20) this was a deliberate, approved
flip; TKT-034's written verdict still needs updating to match, see `feature-gates.md` and
`TKT-034/verification.md`; and
`PUBLIC_CAPTURE_ENABLED`/`CAPTURE_SESSIONS_ENABLED`/`CAPTURE_DIRECT_UPLOAD_ENABLED` are live `true`,
contradicting row 50-52 and `LIVE_FACTS.json`'s prior `false` reading, with no ingress-lockdown
prerequisite in place — see the risk note in `feature-gates.md` and `TKT-200/changes.md`.

1. **AI/assistant capability tension.** `LIVE_FACTS.enabledCapabilities` lists "AI suggestions and
   image analysis", "read-only MCP", and "human-confirmed assistant writes" as **enabled**, but the
   corresponding raw flags (`AI_ASSIST_ENABLED`, `IMAGE_ANALYSIS_ENABLED` [DPIA-gated],
   `MCP_SERVER_ENABLED`, `ASSISTANT_WRITE_TIER_ENABLED`) are default-off in `gates.ts` and **not**
   pinned in `safetyGates`. A dated `gates.ts` comment additionally claims
   `AI_MODEL_ENDPOINT`/`AI_MODEL_DEPLOYMENT` are absent live, which — if still true — would make every
   AI-dependent gate an honest no-op regardless of its boolean. **This is the single biggest open
   question this inventory surfaces; it needs a live `az functionapp config appsettings list` (or
   `az webapp config appsettings list`) readback on `cespk-api-dev` for: `AI_ASSIST_ENABLED`,
   `AI_CHAT_ENABLED`, `IMAGE_ANALYSIS_ENABLED`, `IMAGE_ROLE_CLASSIFY_ENABLED`,
   `ASSISTANT_WRITE_TIER_ENABLED`, `MCP_SERVER_ENABLED`, `AI_MODEL_ENDPOINT`, `AI_MODEL_DEPLOYMENT`.**
   The 2026-07-14 partial readback in `changes.md`/`verification.md` (which found
   `ASSISTANT_WRITE_TIER_ENABLED=true` and `AI_CHAT_ENABLED=true`) is six days stale relative to this
   pass and does not cover the rest of the list.

   > ✅ **RESOLVED 2026-07-21 — the readback was run.** Full result and telemetry in
   > [`ai-gates-flip-2026-07-21.md`](./ai-gates-flip-2026-07-21.md). Live on `cespk-api-dev`:
   > `AI_ASSIST_ENABLED=true`, `AI_CHAT_ENABLED=true`, `IMAGE_ANALYSIS_ENABLED=true`,
   > `MCP_SERVER_ENABLED=true`, `ASSISTANT_TOOLSET_V2=true`, `ASSISTANT_WRITE_TIER_ENABLED=true`,
   > `AI_MODEL_ENDPOINT` set, `AI_MODEL_DEPLOYMENT=gpt-5`.
   >
   > **The `gates.ts` claim was WRONG.** The model endpoint and deployment are present, so the
   > AI-dependent gates were *not* honest no-ops — the suggestion route was making real model calls.
   > That comment is corrected at `packages/domain/src/gates.ts`.
   >
   > `AI_ASSIST_ENABLED` and `AI_CHAT_ENABLED` were then flipped to `false` by explicit operator
   > direction (11:32:55Z). The other six were read only and left untouched.
   >
   > Two names from the requested list remain unread: `IMAGE_ROLE_CLASSIFY_ENABLED` (it lives on
   > `cespk-orch-dev`, not `cespk-api-dev`, so this pass could not have covered it) and
   > `MCP_IMAGE_INGEST_ENABLED`. Both still need their own read.
2. **`RETRO_ADOPT_ARCHIVE_PO_ENABLED`** has no `orchestration` key in `LIVE_FACTS.safetyGates`
   (only `dataApi`) — confirm whether orchestration reads this flag at all, or whether the key is
   simply omitted because it's data-api-only.
3. Every row marked **"not pinned"** in the master table above (the large majority) has no
   `safetyGates` entry at all — LIVE_FACTS's own coverage of the ~40 gates in `gates.ts` is partial.
   That gap is itself the acceptance-criteria target of TKT-159 ("A machine-readable registry check
   fails CI when code gate names, documented intended states and tracked live-state entries drift") —
   this file is raw input to closing that gap, not the close-out.

## What this file does NOT establish

- No live app-settings readback was performed in this pass (no Azure write, no Azure read either —
  purely repo/registry analysis).
- No behavioral smoke test was run against any live surface.
- No restart/health/telemetry monitoring was performed.
- No claim here should be used to justify enabling or disabling a live setting without the fresh
  readback + smoke test TKT-159's acceptance criteria require.

## Sources read

`packages/domain/src/gates.ts`, `services/data-api/src/features/settings/gates.ts`,
`services/data-api/src/features/settings/gate-routes.ts`, `services/orchestration/src/adapters/graph.ts`,
`services/functions/{box-webhook,eva-sentry,vehicle-enrichment,location-assist}/**`,
`docs/adr/0027-ship-dark-gate-model.md`, `LIVE_FACTS.json` (`lastVerified 2026-07-19T22:40:05Z`),
`docs/operations/live-environment.md`, `docs/operations/cloud-inventory-2026-07-17.md`,
`docs/tickets/{now,backlog,verify,blocked}/**` (TKT-034, TKT-078, TKT-093, TKT-095, TKT-107, TKT-111,
TKT-152, TKT-154, TKT-160, TKT-195, TKT-200, TKT-216, TKT-252, TKT-253, TKT-254), this ticket's own
`changes.md`/`verification.md`.
