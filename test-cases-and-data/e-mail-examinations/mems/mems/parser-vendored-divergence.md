---
name: parser-vendored-divergence
description: The deployed parser Function VENDORS cedocumentmapper_v2 at functions/parser/cedocumentmapper_v2/ and has DIVERGED from the sibling repo (vendored=B2 contact extraction; sibling=image-based fix). Edit the right copy; reconcile.
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

The deployed parser Azure Function **`cespike-parser-dev-x7xt3d5ovhi7y`** does NOT pip-install the
parser library — it **VENDORS** a copy at
`C:\Users\Alex\Documents\GitHub\collisionspike\functions\parser\cedocumentmapper_v2\`
(requirements.txt deliberately omits it; `functions/parser/parser_adapter.py` is the seam:
`from cedocumentmapper_v2.application import DocumentMapperService`). The SIBLING source repo is
`C:\Users\Alex\Documents\GitHub\cedocumentmapper_v2.0\src\cedocumentmapper_v2\`.

As of **2026-06-21** the two have **DIVERGED on two independent axes**: the VENDORED copy is AHEAD
with ROADMAP-B2 contact extraction (CLAIMANT_TELEPHONE/EMAIL, normalize_telephone/email,
TELEPHONE_RE/EMAIL_RE) that the sibling LACKS; the SIBLING had the image-based inspection fix that was
then surgically ported into the vendored copy. **Implication:** a parser code change must go into the
RIGHT copy — the sibling for dev/tests, the **vendored copy is what actually deploys** — and a
wholesale file copy in EITHER direction REGRESSES the other axis. The 2026-06-21 image-based fix was
ported as 4 hunks only. **TODO (document-parser-engineer): reconcile the two copies (merge both
axes)** so they stop drifting.

Deploy = `func azure functionapp publish cespike-parser-dev-x7xt3d5ovhi7y --python --build remote`
(Oryx remote build installs licensed PyMuPDF; `.funcignore` ships `cedocumentmapper_v2/` + `contracts/`,
excludes `.venv/tests/infra`). Gate `PDF_MAPPER_ENABLED` is enforced UPSTREAM (CS Parse flow), not in
the Function. Cross-ref [[inspection-image-based-detection]], [[pymupdf-licensed]],
[[powerplatform-connector-base64-double-encode]].
