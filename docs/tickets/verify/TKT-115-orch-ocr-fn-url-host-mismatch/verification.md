# Verification — TKT-115: Fix orch OCR_FN_URL host mismatch

## Verdict
VERIFIED-LIVE (config fix applied + endpoint reachable/authenticating) — with the **behavioural**
acceptance lines (a real intake's OCR fallback) still PENDING live traffic. Fix applied by the main loop
under direct operator authorisation; a ticket-verifier or the next real OCR intake closes the remaining
lines before `done`.

## Evidence (live, 2026-07-08 — WSL `az` + curl)
- **OCR app is ACA** — `az functionapp show -g rg-collisionspike-dev -n cespkocr-fn-dev-glju3v`:
  `state: Running`, `kind: functionapp,linux,container,azurecontainerapps`,
  `defaultHostName: cespkocr-fn-dev-glju3v.proudwave-aa00ada9.uksouth.azurecontainerapps.io`,
  `httpsOnly: true`.
- **Setting applied + read back** — `OCR_FN_URL` on `cespk-orch-dev` now
  `https://cespkocr-fn-dev-glju3v.proudwave-aa00ada9.uksouth.azurecontainerapps.io` (config-only; no redeploy).
- **Reachability / auth ladder** (acceptance line 1 — PROVEN):
  - old host `…azurewebsites.net` → **NXDOMAIN** (`getent hosts` no resolution) — the bug.
  - new ACA FQDN, **no key** → `/api/plate-ocr` = **401**, `/api/ocr-pdf` = **401** (reachable, auth required).
  - new ACA FQDN, **with the KV `ocr-fn-key`** on `{}` → `/api/plate-ocr` = **400**, `/api/ocr-pdf` = **400**
    (key accepted, function processing — rejects the empty body; a valid image → 200).
- **Registry** — `LIVE_FACTS.json` `gates.cespk-orch-dev.OCR_FN_URL` + `docDrift` updated; mirror noted.

## Pending / gaps (behavioural — need live intake traffic)
- **Acceptance 2** — a real/replayed intake with a classifier-abstained vehicle photo records
  `registration_visible` via the OCR fallback, with no `[extractImages] plate OCR failed` trace.
- **Acceptance 3** — a scanned/image-only instruction PDF routes through `/api/ocr-pdf` and coalesces
  an extraction (no `fetch failed` in the parse activity).
- **Acceptance 4** — `cespkocr-ai-dev` App Insights shows **orch-originated** `/api/plate-ocr` +
  `/api/ocr-pdf` requests (the two 401/400 probes above were operator-originated curls, not the orch).
- **Acceptance 5** — `VERIFY_LIVE=1 node verify-all.mjs` green: the live `OCR_FN_URL` now matches
  `LIVE_FACTS.json` (manually confirmed via read-back); run the full VERIFY_LIVE diff from a host with
  both node + `az` to close this line formally (node runs on Windows, az in WSL2 — see the platform note).

## How to re-verify
1. `az functionapp config appsettings list -g rg-collisionspike-dev -n cespk-orch-dev -o json | grep -A2 OCR_FN_URL`
   → the ACA FQDN.
2. App Insights `cespk-orch-dev` (appId `7c7ea68a-…`): `traces | where message has "plate OCR failed" | where timestamp > <fix time>`
   → the `fetch failed` stream stops after the fix.
3. App Insights `cespkocr-ai-dev` (appId `efa0532c-…`): `requests | where timestamp > <fix time>`
   → incoming `/api/plate-ocr` + `/api/ocr-pdf` once a live intake exercises OCR.
4. `getent hosts` the OCR_FN_URL host resolves; `curl -X POST <host>/api/plate-ocr` (no key) → 401.

## Confidence + unread surfaces
High on the config fix + reachability (directly probed live). The behavioural lines depend on a real
intake with a vehicle photo flowing through the orch OCR path, which was not forced here.
