# Fragment 3 — `finalize-eva-box` (the Box AUGMENT delta only)

**Wave 1 · plan 04.** This fragment is **only the Box delta** to the existing finalize flow. The EVA
12-field payload, the 2-previews-then-all photo order, the byte upload, and the `box_synced`-LAST latch
belong to **`power-automate-flow` Pattern 6** + **eva-sentry-api** — do not restate them here.

- **The folder PRE-EXISTS.** `box-folder-create` made the UPPERCASE Case/PO folder at parse-confirm, so
  finalize **augments** it — it does **NOT** create a folder. (The old fictional `CreateFolder` inside
  finalize was already removed; this is not a "delete it" step.)
- **Migrate the root id:** replace the hard-coded `BoxArchiveRootId` flow parameter with a read of
  env-var `cr1bd_BOX_FOLDER_ROOT_ID` (dataverse owns the name).
- **Bytes stay first-party (the S2 fix):** `GetFileContentByPath_V2` (real bytes) → first-party
  `shared_box` `CreateFile` (`folderPath`-based). The **custom `shared_box_rest` connector ops never
  appear in this byte path** — only the folder was created via the custom connector.
- **Latch unchanged:** finalize stamps `cr1bd_status = box_synced (100000009)` **LAST** as the
  idempotency latch; `status-evaluate` does **not** add a competing `box_synced` transition.
- **Gate:** the EVA call stays behind `EVA_API_ENABLED` (still OFF — no creds).
