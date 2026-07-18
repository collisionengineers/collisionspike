# 00 — Overview, findings register, and Plan 0 handoff

**Status: non-binding working draft. Superseded on distillation.**
Validated against `main` at `de9c3f9d` on 2026-07-17.

This document holds the shared evidence base for the whole series (so the later drafts can cite it
instead of repeating it) and the handoff for **Plan 0** — executing the already-authored ADR rewrite.

---

## Part A — Findings register (read-only discovery, 2026-07-17)

Every item below is a concrete duplication, non-canonical route, or clutter finding with the file(s)
that carry it. Severity is by drift risk, not size.

### Code duplication

- **A — Managed-identity token mint, ~9 near-identical copies (highest leverage).** The same
  `IDENTITY_ENDPOINT` + `X-IDENTITY-HEADER` fetch with a `{value, expiresAt}` cache is hand-rolled in:
  `services/orchestration/src/adapters/data-api-http.ts`, `.../archive-mirror-api.ts`,
  `.../provider-archive-api.ts`, `.../box-maintenance-api.ts`, `.../aoai.ts`,
  `services/orchestration/src/platform/blob.ts`, `services/data-api/src/features/assistant/chat-client.ts`,
  `services/data-api/src/features/evidence/blob-store.ts`,
  `services/data-api/src/features/inbound/outlook-queue.ts`. Several carry comments that literally say
  "mirrors `lib/data-api.ts`" — copy-paste drift already acknowledged in-code. No shared server-runtime
  package exists to host it, because `@cs/domain` is deliberately browser-safe / SDK-free. → **PLAN-007**.
- **B — Data-API HTTP request wrapper, 4 copies.** `request()`/`post()` (base-URL trim, Bearer, Accept,
  204 handling, `detail.slice(0,500)` error) duplicated across the four orchestration `-api` adapters;
  the three narrow ones are the same file with a different 3-method outbox tail. → **PLAN-007** (wrapper),
  **PLAN-008** (adapters).
- **C — Two parallel Python-function key-auth clients.**
  `services/orchestration/src/adapters/functions-client.ts` (`callFunction`) and
  `services/data-api/src/platform/http/service-client.ts` (`callFn`) wrap the same Python services and
  re-declare overlapping types (`callParser`, `callPlateOcr`/`PlateOcrResult`, `callLocationSuggest`, Box
  facade ops). → **PLAN-008**.
- **D — Box facade wrappers, 2 copies.** The Box *token mint* is correctly centralised in
  `services/functions/box-webhook/box_client.py`; only the HTTP *facade wrappers* are duplicated (the
  `box.*` object in `functions-client.ts` vs `callBox*` in `service-client.ts`). Falls out of C. → **PLAN-008**.
- **E — Python per-service token cache + retry.** Every Python service re-implements a `_CachedToken` +
  locked `get_token(force_refresh)` + bounded 429/5xx backoff: `box-webhook/box_client.py`,
  `eva-sentry/eva_client.py`, `vehicle-enrichment/dvsa_client.py` + `dvla_client.py`, and MSI variants in
  `box-webhook/blob_source.py` / `data_api_client.py`. `services/functions/README.md` declares each
  service "independently packaged" — a **doctrine**, so this is a decision to affirm or reverse, not an
  unconsidered dup. → **PLAN-011**.
- **F — No shared retry primitive** in either language. → **PLAN-007** (TS), **PLAN-011** (Python).
- **G — Storage MI-token + SAS helper duplicated.** `services/orchestration/src/platform/blob.ts` and
  `services/data-api/src/features/evidence/blob-store.ts` both define `storageMiToken()` +
  `miCredential`; `outlook-queue.ts` repeats the mint for the queue plane. → **PLAN-007**.
- **H — Cross-language second source of truth (parity, not shareable).** The vendored parser engine
  (`services/functions/parser/cedocumentmapper_v2`) re-expresses VRM / case-type / EVA-field rules that
  `@cs/domain` owns in TypeScript. Not literally shareable; already guarded by `*_vendored_in_sync.py`
  tests. → **PLAN-011** (extend parity coverage).
- **I — Secret/PII detection reinvented in 4 contexts.** `packages/domain/src/domain/pii-scrub.ts`,
  `scripts/maintenance/cloud-inventory/04-redact-sweep.ps1`,
  `scripts/checks/hashed-signature-matcher.mjs` (+ `forbidden-signatures.json`) and
  `scripts/checks/check-binary-content.py`. → **PLAN-010** (unify the pattern *source* as data).

### Route / endpoint landscape

- **Three lanes in data-api** for overlapping capability: the staff lane (`withRole` Entra JWT, the
  feature `routes.ts`), the internal service-to-service lane (MSI, 11 modules gathered by
  `services/data-api/src/platform/http/register-internal-routes.ts` — four under `cases/` alone:
  `internal-resolution` / `internal-operations` / `internal-maintenance` / `internal-archive-holding`),
  and the BFF proxy lane (`.../platform/http/proxy-routes.ts` re-exposing parser + location-suggest that
  orchestration also calls). → **PLAN-008**.
- **Outbox-drain pattern repeated 3×** — a data-api outbox-routes file, an orchestration monitor, and a
  narrow orchestration adapter, once each for archive-mirror / provider-archive / box-file-request
  (`features/archive/mirror-outbox-routes.ts` + `archive-mirror-monitor.ts` + `archive-mirror-api.ts`, and
  the provider / box-maintenance siblings). → **PLAN-008**.
- **T8 — trust seam.** `services/data-api/src/features/inbound/internal/service-support.ts` accepts any
  valid Entra token with no subject/app-role check. Deliberate-looking but undocumented. Plan 0 mints
  this as ticket T8; **PLAN-008 adopts it as its first step** (decide the trust model before consolidating
  the routes it guards).
- **Dark-but-deliberate gated lanes** (never treated as dead; `LIVE_FACTS` is authority): MCP server
  (`MCP_SERVER_ENABLED`), MCP image ingestion, sent-items lane (`DONE_SENT_EMAIL_ENABLED`), Outlook move
  (`OUTLOOK_MOVE_ENABLED`), capture lane (`publicCapture`), EVA submission (`evaSubmission`).

### Estate (from `cloud-inventory-2026-07-17.md`)

- Legacy EVA-validation app `cespkeval-fn-6c6fxd` + its storage `cespkevalst6c6fxd` still running despite
  documented retirement — **PLAN-006's TKT-215 owns the use-audit** (in `verify`). → **PLAN-009** consumes
  that verdict.
- Undocumented `valuationbot-mcp` container image in the registry, and a `P2P Server` app registration
  with no recorded purpose — both MCP/integration-shaped. → **PLAN-009** (confirm-then-dispose).
- Empty EVA Key Vault `cespkevakvufa3ci` (two unresolved references); SCM basic-auth still on for 6 helper
  apps; no alerting anywhere. → **PLAN-009** (hygiene; alerting only flagged).
- Infra bicep split: central `infrastructure/{api,orch,spa}.bicep` vs per-Python-service
  `services/functions/*/infra/main.bicep`. → **PLAN-009** (rationalise; watch TKT-206 riders).
- `LIVE_FACTS.json` drift: subscription is Pay-As-You-Go not Free Trial; Data API 146 fns (was 144),
  orchestration 105 (was 101). → **PLAN-009** refresh (last ticket).

### Scripts

- Hash-inventory core near-duplicated 3×: `scripts/maintenance/generate-repository-inventory.mjs`,
  `.../generate-checkout-inventory.mjs`, `.../reconcile-repository-reset.mjs`. → **PLAN-010**.
- Repo-shape guards spread across 5 files (`scripts/repository-hygiene.mjs`,
  `scripts/checks/check-repository-layout.mjs`, `.../check-repository-data-authority.mjs`,
  `.../check-tracked-outputs.mjs`, `.../repository-files.mjs`). → **PLAN-010**.
- Email-eval material in 3 places: `scripts/evaluation/email/` (the settled canonical, already linked by
  the realignment README), `scripts/eval-email/` (fold in), and `emailevals/` (a sibling repo + taxonomy
  authority — **untouched**). → **PLAN-010**.

---

## Part B — Plan 0 handoff (execute `workingspace/adr-rewrite.txt`)

`workingspace/adr-rewrite.txt` is a complete, operator-reviewed, second-opinion-endorsed execution plan.
It is executed **as written** — no re-planning — but with the delta pass below applied first, because
`main` has moved since the spec was validated.

### ⚠️ Delta pass required before executing (moved-base reconciliation)

The spec was validated on 2026-07-16 against a main where **TKT-219 was still on a feature branch**. As of
`de9c3f9d` that is no longer true. Verified 2026-07-17:

1. **TKT-219 (`e5e8f6cd`) is now merged into main.** It changed `docs/adr/0002-*` (3 lines) and
   `docs/adr/0022-*` (33 insertions). A later retro commit `58d7ca09` (TKT-225/226) added a further 12
   lines to `0022`.
2. **Consequences for the spec:**
   - **C3 / D3 / the Risks-section "do NOT import 0022" note are stale.** 0022 already carries its
     2026-07-16 amendment *and* the TKT-222 related-correspondence directive on main. The action is
     unchanged in effect — **still do not re-touch 0022** — but `decisions.md` D3 must cite the *merged*
     commit as the provenance, not "lands with TKT-219 / exists only on the branch".
   - **0002's "absorbs uncommitted cosmetic reflow already in tree" is stale** (Phase 3 superseding-rewrite
     list). That reflow is now **committed** via `e5e8f6cd`. The 0002 rewrite must baseline against the
     committed 0002, not an uncommitted working-tree version.
   - Re-verify the C10 (0004 ↔ 0022 cross-link) and CONTEXT "Retroactive Case" wording against the
     now-merged 0022 text before editing.
3. **Everything else in the spec re-confirmed intact:** 0007 and 0017 both still present (rename /
   deletion targets valid); the ADR count is 25; the finding anchors this series depends on all exist.

**Recommendation:** fold this delta into `adr-rewrite.txt` as a short `Δ 2026-07-17` reconciliation block
(the spec already uses `Δ` for second-opinion additions, and the operator ruling was "modify this plan
file rather than execute immediately"), then execute. Because `adr-rewrite.txt` is a user-owned
`workingspace/` file, **the operator must approve that edit** — an agent may not modify it unprompted
(AGENTS.md).

### Execution runbook (once the delta block is in and approved)

Follow `adr-rewrite.txt` phases 1–6 verbatim:

1. **Phase 1** — create `docs/reviews/160726/` (`overview.md`, `review.md`, `decisions.md` D1–D17,
   `checklist.md`), add the index row to `docs/reviews/README.md`.
2. **Phase 2** — delete `0017`; `git mv` `0007` → `0007-image-acquisition-channels.md`; keep 0013/0008 slugs.
3. **Phase 3** — the ADR rewrites / amendments / clarifications plus every `Δ` quality rider.
4. **Phase 4** — `docs/adr/README.md` row + conventions-block updates; `CONTEXT.md` term updates; the
   back-link pass.
5. **Phase 5** — mint T1–T9 in `docs/tickets/backlog/` from **TKT-238 up** (rescan first), reserving
   ADR numbers **0026–0030** for T9; regenerate ticket views.
6. **Phase 6** — branch `docs/adr-review-160726` from HEAD; **stage docs/tickets paths explicitly**
   (never `git add -A` — the working tree carries ` M .gitignore`, an unrelated user change to preserve;
   `workingspace/adr-rewrite.txt` is never staged); ledgers **stage-then-regenerate**
   (`generate-repository-inventory.mjs` → stage → `reconcile-repository-reset.mjs --write` → stage); run
   the check battery + full `node verify-all.mjs`; commit `docs(adr): …`; **push/PR only on operator
   request** (the spec's own rule).

### Load-bearing outputs the rest of the series consumes

- **Corrected ADR corpus** — every later plan cites it.
- **T8** (service-trust seam) — adopted as PLAN-008's step 1.
- **T9** (platform-ADR backfill, reserving 0026–0030) — PLAN-008 step 4 and PLAN-009 ticket 5 wait on it;
  it is operator-drafted, so it is the slowest gate in the series.
