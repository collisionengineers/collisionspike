# Changes — TKT-115: Fix orch OCR_FN_URL host mismatch

## Status
verify — the config fix is APPLIED LIVE to `cespk-orch-dev` and proven reachable + authenticating end
to end; behavioural proof on a live intake (OCR fallback actually runs on a real photo) is verify-stage.

## Change applied — 2026-07-08 (main loop, operator-authorised direct fix)

Config-only live change (no code, no redeploy). Value taken from the live `defaultHostName`, not by hand:

- **`OCR_FN_URL` on `cespk-orch-dev`**: `https://cespkocr-fn-dev-glju3v.azurewebsites.net` (NXDOMAIN)
  → **`https://cespkocr-fn-dev-glju3v.proudwave-aa00ada9.uksouth.azurecontainerapps.io`** (the ACA
  ingress FQDN). Applied via `az functionapp config appsettings set` from WSL2; read back confirmed.
  `OCR_FN_KEY` (KV ref `cespk-pg-kv-dev/ocr-fn-key`) left unchanged. The setting change restarts the
  orch, which picks up the new value.

## Files touched (repo, doc-maintenance)
- `LIVE_FACTS.json` — `gates.cespk-orch-dev.OCR_FN_URL` → ACA FQDN; `lastVerified` bumped; a dated
  `docDrift` entry added (root cause + the reachability/auth proof + the robustness follow-up).
- `docs/operations/live-environment.md` — a `⚠️ TKT-115` note on the OCR line (host was wrong →
  NXDOMAIN → silent `fetch failed` 2026-07-04→08; no literal URL — that stays only in LIVE_FACTS).

## Not done (deliberate)
- No code change. A **robustness follow-up** (resolve the OCR host from `defaultHostName` at deploy time
  / a startup self-check, so the ACA `proudwave-aa00ada9` infix can't silently break again) is recorded
  in the ticket's Proposed-change §; candidate for its own small ticket.

## Summary
The OCR Function App `cespkocr-fn-dev-glju3v` is Functions-on-ACA, reachable only on its
`*.azurecontainerapps.io` ingress FQDN; the orch's `OCR_FN_URL` used the FC1 `*.azurewebsites.net`
convention, which NXDOMAINs, so every plate-OCR + scanned-PDF-OCR `fetch()` failed from 2026-07-04
(when `PLATE_OCR_ENABLED` went live). Correcting the one app-setting to the live ACA FQDN restores the
path — proven live: `/api/plate-ocr` + `/api/ocr-pdf` return **401** (no key) and **400** (with the KV
`ocr-fn-key` on an empty body = reachable, key accepted, function processing), while the old host still
NXDOMAINs.
