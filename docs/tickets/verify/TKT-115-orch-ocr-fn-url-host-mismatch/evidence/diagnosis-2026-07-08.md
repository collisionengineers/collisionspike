# Diagnosis — orch OCR_FN_URL host mismatch (2026-07-08)

Origin: read-only verification pass on TKT-089. App Insights for **cespk-orch-dev**
(appId `7c7ea68a-d14f-4196-ae58-d83711b7eb2a`) showed ~382 traces since 2026-07-04 matching
`[extractImages] plate OCR failed ... fetch failed`.

## Code path
- `orchestration/src/functions/activities/extractImages.ts:155-166` — OCR fallback (`callPlateOcr`)
  fires only when the gpt-5 image classifier abstains/returns null (`!classified`).
- `orchestration/src/lib/functions-client.ts` — `OCR = { urlEnv: 'OCR_FN_URL', keyEnv: 'OCR_FN_KEY' }`;
  `callFunction` does `fetch(`${OCR_FN_URL}/api/plate-ocr`, { headers: { 'x-functions-key': … } })`.
  An HTTP non-2xx throws `fn POST plate-ocr → <status>`; the observed `fetch failed` is instead a
  native undici rejection (no HTTP response — DNS/connect layer). The catch logs `e.message` only.
- Same `OCR` target also used by `callOcrPdf` → `orchestration/src/functions/activities/parse.ts:369-375`
  (`OCR_SCANNED_PDF_ENABLED=true`); its `if (!process.env.OCR_FN_URL)` guard passes, then fetch fails.

## Live probes (WSL `az`, read-only)

### OCR host state
```
az functionapp show -g rg-collisionspike-dev -n cespkocr-fn-dev-glju3v \
  --query '{name,state,kind,defaultHostName,httpsOnly,managedEnv}' -o json
-> state: Running
   kind: functionapp,linux,container,azurecontainerapps
   defaultHostName: cespkocr-fn-dev-glju3v.proudwave-aa00ada9.uksouth.azurecontainerapps.io
   httpsOnly: true
   managedEnv: .../managedEnvironments/cespkocr-env-dev
```

### DNS + reachability
```
getent hosts cespkocr-fn-dev-glju3v.azurewebsites.net
  -> NO DNS RESOLUTION (NXDOMAIN)

getent hosts cespkocr-fn-dev-glju3v.proudwave-aa00ada9.uksouth.azurecontainerapps.io
  -> 145.133.70.212  (resolves)

curl -X POST https://cespkocr-fn-dev-glju3v.azurewebsites.net/api/plate-ocr
  -> curl: (6) Could not resolve host   (http_code=000)

curl -X POST https://cespkocr-fn-dev-glju3v.proudwave-aa00ada9.uksouth.azurecontainerapps.io/api/plate-ocr   (no key)
  -> http_code=401   (reachable + healthy; needs the function key)
```

### App Insights
- OCR host component `cespkocr-ai-dev` (appId `efa0532c-d3a9-4b2b-9cb7-13f6d4a510ba`): **zero**
  requests/traces/exceptions over the last 6 days — nothing is arriving (consistent with the DNS
  failure).

## Conclusion
`OCR_FN_URL` uses the `*.azurewebsites.net` convention (correct for the FC1 Python fns, e.g.
`cespkbox-fn-v76a47.azurewebsites.net`) but wrong for `cespkocr-fn-dev-glju3v`, which is
Functions-on-ACA and only answers on its `*.azurecontainerapps.io` ingress FQDN. Setting was wired
2026-06-30; failures began once `PLATE_OCR_ENABLED` went live 2026-07-03 (onset 2026-07-04).

Fix: set `OCR_FN_URL` on cespk-orch-dev to
`https://cespkocr-fn-dev-glju3v.proudwave-aa00ada9.uksouth.azurecontainerapps.io` (from live
`defaultHostName`). Config-only; no redeploy. Then update LIVE_FACTS + mirror + `VERIFY_LIVE=1 node
verify-all.mjs`.

## Tooling notes
- `az monitor app-insights query` defaults to a **1h** timespan — pass `--offset 6d` (or
  start/end) to cover the full window, else results are silently clamped.
- Pass KQL via `--analytics-query "@file.kql"` (inline KQL mangles under the Windows→WSL shell).
