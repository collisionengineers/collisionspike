# Box webhook receiver — full step order

The `box-webhook` Azure Function handler (owned by **azure-integration-engineer**). Order is
load-bearing — a wrong order opens a replay or forgery hole, or strands/double-processes a case.

1. **Replay reject.** Read `BOX-DELIVERY-TIMESTAMP`; if it is older than **10 minutes** (or in the
   future beyond a small skew), reject `400` before any further work. Bounds the signature-replay window.
2. **HMAC verify (dual-key, timing-safe).** Compute `HMAC-SHA256(body ++ BOX-DELIVERY-TIMESTAMP)` with
   **both** the primary and secondary signature keys (Key Vault). Accept if **either** matches
   `BOX-SIGNATURE-PRIMARY` / `BOX-SIGNATURE-SECONDARY` (dual-key supports zero-downtime rotation). Use a
   **constant-time** compare. No match → `403`.
3. **Respond 2xx PROMPTLY**, then do the work. Box is best-effort and retries (~12×/2h) on a non-2xx or
   a slow response — acknowledge fast, process async, so a slow Dataverse write never triggers a retry
   storm. (The exact "2xx within 30s" ceiling is UNVERIFIED — confirm at build; respond promptly
   regardless.)
4. **Dedup on `BOX-DELIVERY-ID`.** Box is at-least-once. Keep a short-TTL seen-set (or a Dataverse
   key); a repeated delivery id is a no-op. The append-only audit row is **not** a dedup key.
5. **Disambiguate `FILE.UPLOADED` vs `FILE.MOVED`.** The folder-scoped trigger **also fires on move-in**.
   Inspect the event `source`/trigger so a file *moved* into the folder is not re-ingested as a fresh
   upload (or is handled per the drop-box merge rules in Wave 3).
6. **Resolve the case.** Box folder id (`source.parent.id` / `source.id`) → `cr1bd_boxfolderid` →
   the Case. State this lookup explicitly; an unresolved folder → Held / triage, never a guess.
7. **Write Evidence + re-evaluate.** Create the `cr1bd_evidence` row (storagePath stays **Blob**; record
   the Box file id) + audit `box_upload_received`; re-invoke the **idempotent** `CS Status Evaluate` so
   the case advances (Not Ready → Review) without a competing local status write.

**Endpoint requirements:** public HTTPS:443, reputable-CA cert (Box rejects self-signed). Front with the
Function host key as a second gate; the signature keys + `client_secret` are Key Vault refs.

**Fallback (when a delivery is dropped):** the timed `ListFolder` / Metadata-Query reconciliation sweep
re-discovers folder contents that have no Evidence row and replays step 7. A missed webhook must never
strand a case.
