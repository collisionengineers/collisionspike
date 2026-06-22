# Box webhook receiver — full step order

The `box-webhook` Azure Function handler (owned by **azure-integration-engineer**). Order is
load-bearing — a wrong order opens a replay or forgery hole, or strands/double-processes a case.

1. **Replay reject.** Read `BOX-DELIVERY-TIMESTAMP`; if it is older than **10 minutes** (or in the
   future beyond a small skew), reject `400` before any further work. Bounds the signature-replay window.
2. **HMAC verify (dual-key, timing-safe).** Compute `HMAC-SHA256(body ++ BOX-DELIVERY-TIMESTAMP)` with
   **both** the primary and secondary signature keys (Key Vault). Accept if **either** matches
   `BOX-SIGNATURE-PRIMARY` / `BOX-SIGNATURE-SECONDARY` (dual-key supports zero-downtime rotation). Use a
   **constant-time** compare. No match → `403`.
3. **Parse + in-process dedup fast-path.** Parse the body only **after** verifying it. A best-effort,
   same-worker `BOX-DELIVERY-ID` seen-set catches a rapid duplicate delivery on a warm worker and
   short-circuits to `200`. This is **not** the durable dedup (step 7) — Box may assign a retry a *new*
   delivery id, so correctness never depends on this id being stable.
4. **PROCESS on the request path.** The receiver does the Dataverse fan-out (steps 5–7)
   **synchronously, inline** and decides the status code by outcome — it is **not** a "respond 202/2xx
   promptly then background-thread the work" model. Box does **not** retry after a 2xx, so a
   fire-and-forget ack would silently drop an upload on a transient fault.
5. **Disambiguate `FILE.UPLOADED` vs `FILE.MOVED`.** The folder-scoped trigger **also fires on move-in**.
   A file *moved* into the folder is not re-ingested as a fresh upload (or is handled per the drop-box
   merge rules in Wave 3) — a settled, nothing-to-do outcome.
6. **Resolve the case.** Box folder id (`source.parent.id` / `source.id`) → `cr1bd_boxfolderid` →
   the Case. State this lookup explicitly; an unresolved folder → Held / triage, never a guess.
7. **Durable dedup + write Evidence + re-evaluate.** The **durable** dedup is the Evidence-existence
   check on the namespaced **`box:file:<id>` tag in `cr1bd_sourcemessageid`** (NOT `cr1bd_boxfileid` —
   that dedicated column exists and the webhook now also writes it, but only as a correlation/UI mirror,
   never the dedup key). If no Evidence row carries the tag, create the `cr1bd_evidence` row (storagePath
   stays **Blob**; write `cr1bd_boxfileid` + `cr1bd_acceptedforeva=true` + the `box:file:<id>` tag) and
   write one audit row in the canonical `cr1bd_name`/`cr1bd_occurredat`/`cr1bd_action`/`cr1bd_after`
   shape (there is **no** `cr1bd_detail` column). Then re-invoke the **idempotent** `CS Status Evaluate`
   on **both** the fresh-write and dedup paths (a prior delivery may have written Evidence yet failed the
   re-evaluate), so the case advances (Not Ready → Review) without a competing local status write.

**Respond by outcome.** Return **`200`** when the delivery is SETTLED (processed, durably deduped, a
non-upload move, or a deliberate triage skip). Return a **non-2xx (`503`)** on a TRANSIENT dependency
failure (e.g. a Dataverse 429/5xx, or the status-evaluate re-invoke failed) so **Box RETRIES** the
delivery — Box's own retry is the **primary** recovery, since it does not retry after a 2xx. On the
transient path also un-mark the in-process delivery id so the same-id retry is not blocked by the
fast-path. The durable Evidence-existence dedup keeps any retry's write once-only.

**Endpoint requirements:** public HTTPS:443, reputable-CA cert (Box rejects self-signed). Front with the
Function host key as a second gate; the signature keys + `client_secret` are Key Vault refs.

**Deferred backstop (NOT built).** A timed `ListFolder` / Metadata-Query reconciliation sweep —
re-discovering folder contents with no Evidence row and replaying step 7 — is **documented but not yet
implemented**; it is a deferred secondary backstop for the rare case where Box exhausts its own retries.
Do not claim it is wired or in place. Box's retry on the non-2xx response is the primary recovery today.
