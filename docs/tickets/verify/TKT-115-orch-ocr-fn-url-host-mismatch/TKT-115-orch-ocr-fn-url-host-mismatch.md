---
id: TKT-115
title: Fix orch OCR_FN_URL host — it points at azurewebsites.net but the OCR app is Functions-on-ACA (azurecontainerapps.io)
status: verify
priority: P1
area: platform
tickets-it-relates-to: [TKT-064, TKT-089]
research-link: docs/tickets/verify/TKT-115-orch-ocr-fn-url-host-mismatch/evidence/diagnosis-2026-07-08.md
---

# Fix orch OCR_FN_URL host — wrong domain (azurewebsites.net) for a Functions-on-ACA app

## Problem

Every plate-OCR and scanned-PDF-OCR call from **cespk-orch-dev** fails at the fetch layer with
`fetch failed`. App Insights (`cespk-orch-dev`, appId `7c7ea68a-…`) showed **~382 traces since
2026-07-04** matching `[extractImages] plate OCR failed ... fetch failed`.

**Root cause (confirmed live 2026-07-08).** The orchestration app-setting is
`OCR_FN_URL=https://cespkocr-fn-dev-glju3v.azurewebsites.net`, but the OCR Function App
`cespkocr-fn-dev-glju3v` is **Functions-on-Azure-Container-Apps**
(`kind: functionapp,linux,container,azurecontainerapps`), whose only ingress FQDN is
`cespkocr-fn-dev-glju3v.proudwave-aa00ada9.uksouth.azurecontainerapps.io`. An ACA-hosted Function
App is **not** reachable at `*.azurewebsites.net` — that hostname does not exist (NXDOMAIN). So the
native `fetch()` in `orchestration/src/lib/functions-client.ts` (`callFunction(OCR, …)`) rejects at
DNS resolution (`ENOTFOUND`), which Node surfaces as the generic `TypeError: fetch failed`. The
orchestration catches it best-effort and logs `e.message` only, so the real cause never reached the
trace.

This is **not** a bad key (that would be `→ 401`), **not** a 4xx/5xx from the host (that would be
`fn POST plate-ocr → <status>`), and **not** the missing-setting guard (the setting is present, just
wrong). The other retained Python functions genuinely are on `*.azurewebsites.net` (FC1), so the
`*.azurewebsites.net` convention was copied to this one app that doesn't follow it — the setting was
wired 2026-06-30 and only started failing when `PLATE_OCR_ENABLED` was flipped `true` (2026-07-03),
matching the 2026-07-04 onset.

**Two live paths are broken by this one setting** (both read the `OCR` target
`OCR_FN_URL`/`OCR_FN_KEY`):
1. **Plate OCR** — `orchestration/src/functions/activities/extractImages.ts:155-166` `callPlateOcr`.
   The OCR fallback that sets `registration_visible` when the gpt-5 image classifier abstains/returns
   null (TKT-064) is silently lost, so extracted images can be wrongly held as "still needs a photo
   showing the registration."
2. **Scanned-PDF OCR** — `orchestration/src/functions/activities/parse.ts:369-375` `callOcrPdf`
   (gate `OCR_SCANNED_PDF_ENABLED=true`). Its `if (!process.env.OCR_FN_URL)` guard passes (the URL is
   set), then the fetch fails, so image-only/scanned instruction PDFs never get OCR'd.

## Evidence

- [Diagnosis note](./evidence/diagnosis-2026-07-08.md) — live probe transcript (DNS + reachability +
  App Insights) and appIds.
- Live 2026-07-08 (WSL `az`, read-only):
  - `az functionapp show -g rg-collisionspike-dev -n cespkocr-fn-dev-glju3v` →
    `state: Running`, `kind: functionapp,linux,container,azurecontainerapps`,
    `defaultHostName: cespkocr-fn-dev-glju3v.proudwave-aa00ada9.uksouth.azurecontainerapps.io`.
  - `getent hosts cespkocr-fn-dev-glju3v.azurewebsites.net` → **no resolution** (NXDOMAIN);
    `curl POST …azurewebsites.net/api/plate-ocr` → `curl (6) Could not resolve host` (http_code 000).
  - `curl POST …azurecontainerapps.io/api/plate-ocr` (no key) → **401** (host reachable + healthy,
    just needs the function key).
  - OCR host App Insights (`cespkocr-ai-dev`, appId `efa0532c-…`): **zero** requests over the last 6
    days — nothing is reaching the host, consistent with the DNS failure.
- Registry values: `LIVE_FACTS.json` `gates.cespk-orch-dev.OCR_FN_URL`
  (`https://cespkocr-fn-dev-glju3v.azurewebsites.net`) + `appInsightsComponents`.

## Proposed change

- **Correct the app-setting** on `cespk-orch-dev` (the fix; per docs/azure/deploy.md + secrets — a
  config-only change, no redeploy):
  `OCR_FN_URL=https://cespkocr-fn-dev-glju3v.proudwave-aa00ada9.uksouth.azurecontainerapps.io`
  (leave `OCR_FN_KEY` KV ref `cespk-pg-kv-dev/ocr-fn-key` unchanged; `functions-client.ts` appends
  `/api/plate-ocr` and `/api/ocr-pdf`). Take the value from the live `defaultHostName`, not by hand.
- **Robustness caveat (record, don't necessarily build):** the ACA ingress FQDN carries an
  environment-generated infix (`proudwave-aa00ada9`) and would change if the `cespkocr-env-dev`
  managed environment or the app were recreated. The authoritative source is
  `az functionapp show … --query defaultHostName`. Consider a follow-up to resolve the OCR host from
  `defaultHostName` at deploy time (or a startup self-check) rather than a hand-entered literal, so
  this footgun can't recur silently.
- **Doc maintenance (required by the change):** update `LIVE_FACTS.json`
  (`gates.cespk-orch-dev.OCR_FN_URL`, bump `lastVerified`) + the human mirror
  `docs/architecture/live-environment.md`, then `VERIFY_LIVE=1 node verify-all.mjs`.

## Acceptance

- [ ] `OCR_FN_URL` on `cespk-orch-dev` resolves via DNS and returns 401 (no key) / 200 (with key) at
      `/api/plate-ocr` and `/api/ocr-pdf`.
- [ ] After the fix, a fresh (or replayed) intake with an extracted vehicle photo that the classifier
      abstains on records `registration_visible` via the OCR fallback (no `plate OCR failed` trace).
- [ ] A scanned/image-only instruction PDF routes through `/api/ocr-pdf` and coalesces an extraction
      (no `fetch failed` in the parse activity).
- [ ] `cespkocr-ai-dev` App Insights shows incoming `/api/plate-ocr` requests after the fix.
- [ ] `LIVE_FACTS.json` + `docs/architecture/live-environment.md` updated; `VERIFY_LIVE=1 node
      verify-all.mjs` green.

## Research

Distilled 2026-07-08 from a read-only verification pass on TKT-089 (not an operator drop-note); raw
diagnostic material in [evidence/](./evidence). Relates to TKT-064 (the gpt-5 image classifier whose
abstention is what makes the OCR fallback matter) and TKT-089 (the evidence/registration-visible
lane).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Diagnosis note](./evidence/diagnosis-2026-07-08.md)
