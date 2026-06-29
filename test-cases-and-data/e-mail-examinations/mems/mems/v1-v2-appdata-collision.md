---
name: v1-v2-appdata-collision
description: v1 and v2.0 share the same Documents\CE Document Mapper\providers.json; running v2 migrates it to a schema that breaks v1
metadata: 
  node_type: memory
  type: project
  originSessionId: a68ab3dd-9966-4cea-9a9c-9266ffb22ae6
---

`cedocumentmapper` (v1, `app.py:56` `APP_TITLE="CE Document Mapper"`) and `cedocumentmapper_v2.0`
(`src/cedocumentmapper_v2/ui/paths.py:76`) both resolve `APP_DATA_DIR` to
`Documents\CE Document Mapper\` and read/write the **same** `providers.json` (and `app_settings.json`).

The schemas are incompatible:
- v1 (flat): `{providers:[{detect_phrases:[...], field_rules:{<field>:{method,config}}}]}`
- v2: `{schema_version:2, providers:[{id, detect:{required_phrases,...,minimum_confidence}, field_rules:{<field>:{kind,...}}}]}`

v2 migrates v1→v2 **in place** (`service.py:47`, `config/migration.py`); it is one-way. After v2 has run,
v1 still loads the file without crashing but its normaliser yields **empty `detect_phrases` and empty
field configs for every provider** → v1 detects/extracts nothing. v1's `detect_provider` skips
phrase-less providers (`app.py:1365`), so nothing matches.

The shipped v1 build (`dist\app.exe`) is byte-identical (SHA256) to `Documents\CE Document Mapper\CE
Document Mapper V64.exe`. Note: the v1 `app.spec` does NOT bundle `providers.json` (the documented
`--add-data` build command does), so a clean-install v1 exe seeds only the 1-provider hardcoded
`DEFAULT_CONFIG`, not the full set. `view_mode` in `app_settings.json` is valid for both versions.

**2026-06-23:** restored the v1-schema `providers.json` (26 fully-configured providers, copied from the
repo root `cedocumentmapper\providers.json`) to the live path; backed up the displaced v2 file to
`Documents\CE Document Mapper\providers.v2.bak.20260623-140358.json`. Verified v1 then detects AX/EVA and
extracts fields. The two byte-identical v1 backups are `cedocumentmapper\providers.json` and
`cedocumentmapper\docs\Settings Backup\providers.json` (SHA256 E5ABCCC5…, 44586 bytes).

**Why:** the user works on v1 and v2 separately; this shared path silently corrupts v1's config whenever
v2 is launched, which looks like "v1 stopped detecting anything."

**How to apply:** if v1 "stops working" (no provider detected), check whether
`Documents\CE Document Mapper\providers.json` has gained `schema_version`/`detect`/`kind` keys — if so v2
re-migrated it; restore a v1-schema copy. The durable fix is to give v2.0 its own app-data dir
(`cli.py:381` `--app-data-dir`, or `DocumentMapperService(app_data_dir=...)`) — a v2-only change, leaving
v1 untouched.
