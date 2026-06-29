---
name: az-appsettings-file-gotcha
description: "az functionapp appsettings with KV-ref/conn-string values must go via a JSON @file (ASCII array), not inline — az.cmd mangles ( ) ; on Windows"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e3a68ae1-4438-4662-af93-32197902ca09
---

`az functionapp config appsettings set --settings "K=V"` from the PowerShell tool MANGLES values
containing `(`, `)`, `;` or `=` — the Windows `az.cmd` batch wrapper re-parses them ("X was unexpected
at this time"). Hit this setting Key Vault references (`@Microsoft.KeyVault(SecretUri=...)`) and App
Insights connection strings (`InstrumentationKey=...;IngestionEndpoint=...`).

**Why:** verified 2026-06-23 during the S3/S4 redeploy. The inline form silently failed (settings
stayed unchanged — at least no corruption); `--query "[?name=='X'||name=='Y']"` also breaks the same way.

**How to apply:** write the settings to a JSON file and pass `--settings "@C:\path\file.json"`. The file
must be a **clean ASCII array** `[{"name":"K","value":"V","slotSetting":false}]` (build the string
manually + `Set-Content -Encoding ascii -NoNewline`). A flat dict `{"K":"V"}` AND `ConvertTo-Json -AsArray`
(utf8/BOM) both failed with `'list' object has no attribute 'keys'` / parse errors. Verify by reading
back with `appsettings list -o json | ConvertFrom-Json` and filtering CLIENT-SIDE (not `--query`).
Verify KV refs resolve via the mgmt API `…/config/configreferences/appsettings?api-version=2022-09-01`
(`status=Resolved`). Related: [[live-services-boundary]].
