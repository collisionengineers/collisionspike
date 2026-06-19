# Phase 5 — OCR & Scale

**Goal:** OCR for scanned/image PDFs + plate OCR (M1 half); image-classification AI (M2+); valuation +
Copilot (M2/M3+).

**Status:** OCR **image built + pushed to ACR**, ACA host deploy **pending**; image-AI and
valuation/Copilot are **plan-only**. See [../../../ROADMAP.md](../../../ROADMAP.md) Phase 5.

## Implementation checklist (by feature)

**5a · OCR for scanned PDFs ("B-full") + plate OCR** — [ocr-strategy.md](./ocr-strategy.md)
1. [x] Scope decided — FC1 can't run Tesseract → Azure Container Apps host
2. [x] OCR host built (`ocr/`): Dockerfile + ACA Bicep + plate/pdf adapters (two routes, one container)
3. [x] Image `ce-ocr:latest` built + pushed to ACR (`cespkocracraeee76`)
4. [ ] **ACA host deploy** — failed 3× (revision provision expired; likely AcrPull RBAC race / health-probe). Next: user-assigned MI for AcrPull, or revision-log diving. _Soft blocker_ → [../../gated.md](../../gated.md). Also: add the two B2 fields to `ocr/ocr_pdf_adapter.py` EVA map (soft)

**5b · Image classification AI (ADR-0009, M2+)** — [image-classification-ai.md](./image-classification-ai.md)
5. [ ] overview-vs-`damage_closeup` classification (Foundry vision preferred over AI Builder)
6. [ ] person / reflection detection (Custom Vision explicitly **not** used — retires 2028)
7. [ ] Image-ordering UI (drag to set the 2 preview images); [ ] WhatsApp media bulk import (ADR-0007)

**5c · Valuation & Copilot (M2/M3+)** — [valuation-and-copilot.md](./valuation-and-copilot.md)
8. [ ] Valuation (`valuationbot`, gated `VALUATION_ENABLED`) — staff-triggered; evidence PDF attached
9. [ ] Copilot Studio agent (gated `COPILOT_ENABLED`) — staff assistant over Dataverse

## Plans in this phase

- [ocr-strategy.md](./ocr-strategy.md) (5a) · [image-classification-ai.md](./image-classification-ai.md) (5b) · [valuation-and-copilot.md](./valuation-and-copilot.md) (5c)

## Needs the operator

The OCR ACA deploy is a soft blocker (AI-doable once the AcrPull approach is chosen); everything else
here is later-phase. See [../../gated.md](../../gated.md).
