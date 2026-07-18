---
name: powerplatform-connector-base64-double-encode
description: "CE Parser connector gateway re-encodes the base64 document param and the behaviour DRIFTS with connector state. Flow passes the RAW base64 string (NEVER base64ToBinary — it 400s the plain-string connector; NEVER format:byte). The tolerant parser decode is what's load-bearing."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

The Power Platform custom connector fronting the parser Function (`new_collision-20engineers-20parser`, connector id `ccdec4fd-f76a-f111-ab0c-002248c739a7`; backend `cespike-parser-dev-x7xt3d5ovhi7y` `/api/parse`) **re-encodes the base64 `document` value**, and **the exact behaviour DRIFTS with the connector's gateway state and does not propagate reliably**. A **direct** `POST /api/parse` of the same base64 always works; only the flow→connector→Function path is affected. So the receiving end must self-heal — **do not trust any flow-side encoding choice; the TOLERANT parser decode (rule 3) is the load-bearing fix.**

**Rules (verified live 2026-06-20 against the CURRENT plain-string connector):**
1. **Connector `ParseRequest.document` MUST stay plain `{type: string}`.** NEVER add `format: byte` / `x-ms-media-kind: File` — that makes the gateway double-encode *guaranteed* and broke intake with a burst of CS Parse **422**s (an agent re-added it 2026-06-19).
2. **Flow `CS Parse` `body/document` = the RAW base64 string `@triggerBody()?['instructionBytesB64']`.** **Do NOT use `@base64ToBinary(...)`.** ⚠️ *This is the OPPOSITE of what an earlier version of this memory said.* With the current plain-string connector, `base64ToBinary` feeds the gateway **binary** in a string param and the gateway returns **HTTP 400** (rejected before the parser). The raw string works: the gateway encodes/double-encodes it and the tolerant parser (rule 3) peels it. (base64ToBinary may have *looked* right under a transient `format:byte` connector state — that state is gone; raw string is what works now.)
3. **Parser `function_app._decode_document` is TOLERANT** — decode once; if the result isn't a known doc magic (`%PDF`/`PK\x03\x04`/`\xd0\xcf\x11\xe0`/`{\rtf`) but IS strict base64, decode once more and accept only if THAT yields a magic; log `recovered double-base64-encoded document` on every recovery. **This handles whatever the gateway does — keep it; never make it strict.**

**Evidence (2026-06-20, live digital@ tests):** `test1` (18:24) + `test3` (21:57) ran the **raw-string** flow → parser `200`, Case **fully populated**. A `base64ToBinary` live PATCH then made `test34` (23:17) → **HTTP 400** (audit: `parser failed: 400 (no details)`) → routed to Exceptions. `test34`'s exact blob (`%PDF-1.7`, 440 KB) posted **directly** to `/api/parse` (single base64) → **200**, full extraction (vrm `FH09BVJ`, provider `KBS`, claimant `Mr Ziad Hussain`). Conclusion: parser + doc healthy; `base64ToBinary` was the regression. Reverted live + repo to the raw string.

**Diagnose fast:** flow extraction empty + audit `Flow_Parse` shows `parser failed: 400` (gateway reject) or a `422` while a **direct** `POST /api/parse` of the same bytes returns `200` → it's the gateway/encoding, **not** the parser engine. Don't touch the parser; check rules 1–3 (plain string · raw base64, no base64ToBinary · tolerant decode).

Related: [[codeapp-csp-use-connectors]] · [[codeapp-apikey-connector-connection]] · [[flow-webhook-trigger-provisioning]].
