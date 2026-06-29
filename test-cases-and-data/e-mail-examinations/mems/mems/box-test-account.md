---
name: box-test-account
description: Pointer to the operator-provided THROWAWAY Box test-account creds (stored out-of-repo) + the key finding that it is a FREE account so CCG and Business+ features cannot be tested on it.
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

Operator provided a **throwaway Box test account** 2026-06-21 and said "store this." The creds (client_id,
client_secret, developer_token, service-user id) are stored **outside the git repo** at
`C:\Users\Alex\.collisionspike-secrets\box-test.json` — **never commit them, never echo the values**.
(KV is the proper home, but KV write was RBAC-blocked for the CLI user on 2026-06-21 — ForbiddenByRbac on
`cespkenrichkvgi62sd`, self role-grant also blocked; move them to the box-webhook Function KV when Wave 0
builds it, or the operator grants Key Vault Secrets Officer.)

**This explicit hand-off OVERRIDES the "Claude never holds a Box credential" guard FOR THIS TEST ACCOUNT
ONLY** — production Box secrets remain operator-only ([[box-integration-pivot-findings]],
[[live-services-boundary]]).

**Key finding (verified live 2026-06-21):** it is a **free / individual Box developer account**
(`enterprise_id` empty, service user "Alexander Mercer" `51170278822`). Therefore:
- ✅ the **developer token** works as a Bearer for basic REST (folders/files/shared-links) — but is
  **ephemeral (~60 min)**; regenerate in the Box dev console.
- ❌ **CCG** (`grant_type=client_credentials`) returns `unauthorized_client` ("box_subject_type
  unauthorized for this client_id") — the **production CCG-token-in-Function auth cannot be validated on
  this account**.
- ❌ **File Requests** (Business) and **metadata** (Business Plus) are **not available**.

So this account validates **REST + connector/Function MECHANICS via the dev token only**, not CCG auth or
the Business+ features (those need a Business+ enterprise tenant with the Platform app admin-authorized).

**Update 2026-06-22:** operator also dropped **`boxconfig.json` into the repo ROOT** (client_id +
client_secret + `enterpriseID:"0"`; JWT fields empty). It carries the **client_secret** → **NEVER commit it**
(it would fail the `wtwtk` secret-leak gate); exclude it from every `git add`. The dev token **rotates** (the
first expired; current value lives in the out-of-repo `box-test.json`). The **free-account demo WORKS** via
the dev token end-to-end: created Box folder **SBL26001**, uploaded the `.eml` + instructions (pulled from
Azure Blob `cespkevidstdev01/evidence`), minted folder + file shared-links, and stamped Dataverse — case
`cr1bd_boxfolderid`/`cr1bd_boxfolderurl` + evidence `cr1bd_boxfileid`/`cr1bd_boxfileurl` (new columns) — so
the Code App Evidence tab surfaces the archive (folder link + per-file "Open in Box"). Pattern for re-running:
download blob → `POST /2.0/folders` → `POST upload.box.com/api/2.0/files/content` → `PUT …?fields=shared_link`
→ PATCH Dataverse. See [[box-pivot-phase7-committed]].
