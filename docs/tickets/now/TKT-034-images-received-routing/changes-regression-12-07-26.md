# Regression changes — TKT-034 — 2026-07-12

## Status
implementation complete on `codex/tkt-034-archive-adoption`; live deployment and test-root proof pending

## Changes made

- Added a Postgres holding ledger for the normalized registration folder, every inbound message and every image byte. Claims, expiry, attempts, failure detail, transfer checkpoints and canonical evidence IDs make replays and interrupted work recoverable.
- Added a message-global, pre-Archive reservation ledger. A replay after folder creation, process loss or completed adoption reuses the same intake identity and cannot create a second registration folder.
- `imagesUnmatched` now filters genuine images, hashes missing manifests, persists the association before upload and uploads every image. It never reports an empty folder as success and throws after checkpointing a failed item so Durable retry remains active.
- Signature filtering is based on the actual image bytes and dimensions rather than Outlook's generic `image001` filename. Image-bearing PDFs are expanded into persisted raster bytes before registration-folder upload.
- Added an exact-one-active-case adoption activity and manual keyed retry. A folderless case adopts by renaming the same folder to the Case/PO. A case with an existing folder moves unique files and removes a held duplicate only after identical canonical bytes are proven.
- Added a singleton Durable recovery monitor. It resumes expired upload/adoption claims, materialises image arrivals deferred during an active transfer, handles instruction-first/image-second ordering and uses persisted retry times so poison rows cannot starve later work.
- The Box facade now exposes scope-locked rename, file move, file delete and empty-folder delete operations. Source and destination ancestry are re-read for mutations; folder deletion is non-recursive and refuses non-empty folders.
- Box list pagination and SHA-1 verification are enforced throughout transfer and conflict recovery. An unverifiable 409 never causes a remote file to be trusted or a local byte to be discarded.
- The stricter shared 409 rule remains recoverable for existing archive-mirror callers: the facade returns 502, the mirror releases the uncommitted claim, and its durable outbox can retry. Regression tests cover both boundaries.
- Zero/multiple active matches are not guessed. Candidate cases and source details are persisted, matching cases are held and staff can compare Case/PO, claimant, provider, saved email preview, filenames and the waiting Archive folder before explicitly assigning the images.
- A staff assignment is authoritative, first-wins and replay-safe. Automation cannot override it if the candidate set changes, and a repeated selection does not create a second archive audit.
- Canonical evidence is created idempotently from the ledger after every transfer checkpoint completes. The empty holding folder is retired only after transfer completion.
- Final evidence, folder identity, source-email linking, audit and readiness recompute commit in one transaction. Lost responses can replay without duplicate evidence or audit rows, and an email already linked to another case cannot be adopted.
- A database guard prevents an inbound email from being relinked or detached while its holding folder has a live adoption lease. The transfer is marked complete before the final transaction links that email, closing the mid-transfer race without blocking the successful path.
- Pending or failed registration-image adoption is now an automatic Not Ready blocker. The case returns to its normal readiness result only after every relevant holding item reaches a terminal state; manual holds are never cleared by this automation.
- Once a registration folder has been adopted, Case/PO changes are rejected until a coordinated Archive rename exists. This prevents the app and Archive from silently disagreeing about the canonical folder name.
- Rename, destination pagination, duplicate-source deletion and empty-folder retirement all have injected checkpoint failures proving that no later mutation runs after a failed step and that retry converges without duplicate evidence or data loss.
- Case merges transfer adopted and unresolved holding identities to a folderless survivor, refuse a merge while adoption is live and reject incompatible archive identities.
- Merge refusals discovered after archive reconciliation now throw through the transaction boundary so Postgres rolls every earlier ownership write back. A waiting registration folder also cannot be transferred to a survivor with a different registration, which would otherwise leave the folder permanently unadoptable.
- The PDF-registration fallback now sends the same attachments through the holding path after a no/multiple case match.

## Verification run locally

- `npm run build -w @cs/domain`
- `npm run build -w @cs/api`
- `npm run build -w @cs/orchestration`
- `npm run build -w collisionspike-mockup`
- `node build-api.cjs` and `node build-orch.cjs` (deployment bundles regenerated successfully)
- targeted domain status tests: 46 passed
- targeted API tests: 68 passed (schema/RLS parity guards, canonical VRM matching, create/reuse, message-global reservation, upload leases, deferred arrivals, exact adoption, staff resolution, source-email races, readiness blocking, Case/PO locking, audit replay, ambiguity, merge races and transfer failure injection)
- targeted orchestration tests: 32 passed (signature filtering, PDF expansion, attention visibility, stable replay tokens, recovery, every transfer checkpoint, deferred arrivals and instruction-first ordering)
- targeted SPA REST tests: 54 passed; production SPA build passed
- targeted Box facade/scope/upload-route tests: 81 passed (pagination, ancestry scope, move/rename/delete, fail-closed conflict identity and retryable facade failure)
- full suites: domain 1,174; API 758; orchestration 457; SPA 515; Box facade 258 — all passed

No live Box write or deployment was performed from this implementation worktree. Apply the TKT-034 delta before deploying the API/orchestration/facade, then use only test root `392761581105` for live proof.
