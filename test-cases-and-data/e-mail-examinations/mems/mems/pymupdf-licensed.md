---
name: pymupdf-licensed
description: PyMuPDF licensing is resolved — do not raise the AGPL risk for cedocumentmapper again
metadata: 
  node_type: memory
  type: project
  originSessionId: 4707fe43-e9cf-4185-8139-0dae82254bb9
---

The team **has a PyMuPDF licence**, so the AGPL concern for `cedocumentmapper_v2.0` is resolved.
Do **not** flag PyMuPDF AGPL as a risk, propose swapping it (e.g. to pypdfium2/pdfplumber), or ask
about it again. The parser stays on PyMuPDF.

**Why:** The user confirmed (2026-06-17) they hold a PyMuPDF licence; the docs' "PyMuPDF AGPL risk"
note predates that and is now stale.

**How to apply:** In the [[document-parser-engineer]] agent and any parser/Azure-Function work, treat
PyMuPDF as an approved dependency. Parser completion scope = regression corpus, packaging, CI/CD, and
HTTP wrapping — not licence remediation.
