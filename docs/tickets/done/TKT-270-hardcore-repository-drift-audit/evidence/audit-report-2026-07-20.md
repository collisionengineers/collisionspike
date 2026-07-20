# Hardcore repository duplication & drift audit — 2026-07-20

**Base/head:** `main` @ `f6b3cda3` (after PLAN-011 #130 merged; PLAN-007–011 all landed).
**Method:** read-only, subagent-driven (workflow `wf_07a02a81-abe`, 4 parallel dimension audits, 624k tokens).
Each finding rests on a **structural / behavioural** comparison (contract, owner, lifecycle, security, failure
semantics) — lexical hits alone are not evidence. Only tracked runtime source was audited
(`services/{data-api,orchestration}/src`, `packages/{domain,server-runtime}/src`, `apps/web/src`, `scripts`,
`tools`, `services/functions/**`, `LIVE_FACTS.json`, `docs/operations`, governance ledgers); the untracked
top-level `functions/`, `orchestration/`, `api/` build/dist trees were excluded.

**Scope of what the series already consolidated (so every finding below is a genuine residual):** PLAN-007
managed-identity mint / Data-API HTTP core / storage token / bounded retry; PLAN-008 focused-Function client,
`withServiceAuth` trust seam, internal route aggregation, Durable monitor lifecycle, route/authority guard;
PLAN-010 scripts hash/path/signature single-source; PLAN-011 Python packaging doctrine, auth-conformance
inventory, cross-language VRM/Case-PO parity.

## Findings (13) and dispositions

| # | Dimension | Finding | Disposition |
|---|---|---|---|
| M1 | equivalent mechanism | Evidence content-SHA-256 producer (6 sites) + hex validator (8 sites), with a `/i`-vs-strict alphabet split | **TKT-275** (new) |
| M2 | equivalent mechanism | Canonical stable-JSON idempotency request-digest ×3 (+3 order-sensitive), with a `localeCompare`-vs-default-sort + `undefined`-vs-`null` split | **TKT-275** (new) |
| M3 | equivalent mechanism | `safeText` error-body truncation triplicated verbatim across the 3 orchestration transport adapters | **TKT-275** (new) |
| A1 | duplicate authority | Two `recomputeStatus` writers of `case_.status_code` (case-support vs service-support), both reachable from the staff lane | **TKT-276** (new) |
| A2 | duplicate authority | `status_recompute_completed_generation` advance duplicated: canonical `acknowledgeStatusRecompute` vs inline SQL in `service-support.recomputeStatus` | **TKT-276** (new) |
| C1 | cross-language | Delivered-images-only attachment rule mirrored Py `email_classifier` ↔ TS `triagePolicy`, no parity guard | **TKT-277** (new) |
| C2 | cross-language | Third VRM canonicaliser `canonicalize_registration` (vehicle-enrichment) mirrors `canonicalizeVrm`, outside the parity guard | **TKT-277** (new) |
| C3 | cross-language | Evidence-kind MIME fallback **diverges**: box-webhook `image/*` wildcard vs domain explicit `{jpeg,jpg,png}` table | **TKT-277** (new) |
| C4 | cross-language | EVA 12-field **format** validation reimplemented in Py `validate_core_payload` vs the AJV schema; only the key list is guarded | **TKT-277** (new) |
| C5 | cross-language | Case/PO token-shape regex mirror Py `CASEREF_RE` ↔ TS `CASE_PO_SHAPE_RE`, no automated guard | **TKT-277** (new) |
| R1 | registry/doc | `LIVE_FACTS.parser.functionCount=4` contradicts the committed evidence snapshot (5) and `function_app.py` (5 routes) | **TKT-273** (existing) |
| R2 | registry/evidence | `LIVE_FACTS.dataApi.functionCount=144` vs committed snapshot 146; the "over-count" resolution was never written back and its provenance is self-contradictory | **TKT-273** (existing) |
| R3 | registry/doc | `live-environment.md` header "last verified 2026-07-16" contradicts `LIVE_FACTS.lastVerified` (2026-07-19) and the doc's own re-verification section | **TKT-273** (existing) |

No finding was dispositioned an intentional exception; several *candidate* equivalences were rejected during
the audit as intentional (e.g. the per-adapter error mappers PLAN-007 deliberately kept separate, and the
VRM D1/D2 allowed divergences the parser-parity guard already pins).

## Finding detail

### M1 — Evidence content-SHA-256 producer + hex validator (→ TKT-275)
The lower-case hex SHA-256 of raw evidence bytes is the TKT-133 `(case_id, sha256)` dedup/twin-merge key. The
producer `createHash('sha256').update(bytes).digest('hex')` is repeated verbatim in 6 runtime sites across
both services (`blob.ts:66`, `imagesUnmatched.ts`, `upload-route.ts:174`, `capture-upload.ts:402`,
`mcp-image-ingestion.ts:542`, `intake-route.ts:100`). The validator `/^[0-9a-f]{64}$/` is re-declared in 8+
sites — and the alphabet is **not uniform**: `internal-persist-routes.ts:66` (`SHA256_HEX_RE /i`) and
`merge-evidence.ts:7` (`/i` + `toLowerCase`) accept upper-case while the rest are strict lower-case. A correctness
residual, not just tidiness. No shared helper exists (`contentSha256`/`hashBytes` grep → 0).

### M2 — Canonical stable-JSON request-digest (→ TKT-275)
Three private `stableJson(value)` serializers (`manual-intake-operation.ts`, `intake-operation.ts`,
`vehicle/persistence.ts`) each feed a persisted idempotency/replay `request_hash`. They are **not byte-compatible**:
manual/provider use `Object.keys().sort()` (UTF-16) + `undefined`→`'undefined'`; vehicle uses
`Object.entries().sort(localeCompare)` + `'null'`. Reinforcing: `internal-operations-routes.ts:81`,
`upload-support.ts:157/171` do the same job with order-**sensitive** `JSON.stringify`, so reordered-key payloads
can defeat those guards. One `requestDigest(value)` with a defined key-order + primitive policy removes the split.

### M3 — `safeText` triplicated (→ TKT-275)
Byte-identical `safeText(res)` (500-char cap, `'<no body>'` sentinel) in `graph.ts:614`, `functions-client.ts:433`,
`data-api-http.ts:69`. Pure formatting, no error-contract coupling — the sub-helper TKT-249's transport-core
consolidation left behind. Move to `@cs/server-runtime` as `safeErrorText`.

### A1+A2 — case status-recompute authority (→ TKT-276)
Two same-named `recomputeStatus` functions (`case-support.ts:205`, `service-support.ts:119`) each authoritatively
advance `case_.status_code` via the identical `statusForReviewCase(readinessInputForCase(...))` contract, `writeAudit`,
and `maybeSuggestOverviewChase`. The split is **not** a lane boundary — the staff lane invokes both. And
`service-support.recomputeStatus` re-inlines the `GREATEST/LEAST` generation-ack SQL that `status-recompute.ts`
exposes as the canonical `acknowledgeStatusRecompute` (the `route-authority-inventory.json` single writeAuthority
for `status_recompute_completed_generation`). Unify into one parametrised writer that routes the ack through the helper.

### C1–C5 — cross-language residuals (→ TKT-277)
Five Python↔TS rule mirrors beyond the TKT-269 VRM/Case-PO-marker pair, none behind a parity guard:
- **C1** images-only-delivery predicate (`email_classifier _delivered_images_only` ↔ `triagePolicy deliveredImagesOnly`) — identical regexes today; a one-sided edit silently splits the Stage-A subtype from the Stage-B triage.
- **C2** `canonicalize_registration` (`_NON_ALNUM.sub('',upper)`) is a third copy of `canonicalizeVrm`; the enrichment key and the case-domain key must stay identical.
- **C3** evidence-kind MIME fallback **already diverges** (Py `image/*` wildcard vs TS explicit `{jpeg,jpg,png}`) for `image/tiff|heic|webp|gif|bmp` — dormant on the live Box path but a real class difference; the "mirrors EXACTLY" claim is wrong.
- **C4** EVA payload **format** validation: Py `validate_core_payload` imperatively reimplements the AJV schema's patterns/enums/oneOf; a schema change would not propagate.
- **C5** Case/PO token-shape `CASEREF_RE` ↔ `CASE_PO_SHAPE_RE` (documented mirror, no guard).
Disposition: widen the parser-domain parity corpus to cover C1/C2/C5, add a shared classify-attachment corpus for C3
(and correct the docstring), and extend the EVA schema parity test to assert `validate_core_payload` for C4.

### R1–R3 — registry/doc/evidence disagreement (→ TKT-273)
- **R1** `LIVE_FACTS.parser.functionCount=4` vs the committed `cloud-inventory-2026-07-17.md` (5, named) and `function_app.py` (5 `@app.route`). No dated read-only evidence backs the 4.
- **R2** `dataApi.functionCount=144` vs snapshot 146; the "snapshot over-counts" resolution lives only in the dossier + TKT-257, was never written back to the snapshot (still 146 in four places), and the dossier's basis is internally contradictory.
- **R3** `live-environment.md:3` header "last verified 2026-07-16" vs `LIVE_FACTS.lastVerified` 2026-07-19 and the doc's own 2026-07-19 re-verification section (a TKT-257 refresh residual).
TKT-273 ("Add the LIVE_FACTS and ledger integrity standing check") is the systemic owner: its A3 credential-gated
read-only re-read fails closed on exactly this registry-vs-evidence class; its remediation should re-mint the counts
from a fresh read-only `/functions` read (or correct them to the evidence), write the resolution back into the
snapshot, and derive the doc's verified-date from `LIVE_FACTS`.

## Coverage & reproducibility

A reviewer can re-run each dimension read-only: (a) grep the producer/validator/`stableJson`/`safeText` patterns and
compare contract/owner/lifecycle; (b) diff the `recomputeStatus` bodies and the generation-ack SQL; (c) diff the
named Py/TS callables per C1–C5; (d) compare `LIVE_FACTS.json` numeric fields against `cloud-inventory-2026-07-17.md`,
`function_app.py` route counts, and `live-environment.md`. Full structured findings: workflow `wf_07a02a81-abe`
`journal.jsonl`.
