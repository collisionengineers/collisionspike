# Phase 5 — OCR & Scale

**Goal:** OCR for scanned/image PDFs + plate OCR (M1 half); image-classification AI (**M2**); valuation +
Copilot + WhatsApp import (**M3**).

> **Milestones in this phase** ([milestone-model](../milestone-model.md)): **5a** plate-OCR-for-registration
> = **M1**; **5b** image classification/reflection = **M2**; **5b** WhatsApp bulk-import + **5c** valuation +
> **5c** Copilot Studio = **M3**.

**Status:** OCR host **deployed 2026-06-19** (`cespkocr-fn-dev-glju3v`, Functions-on-ACA, scale-to-zero); image-AI and
valuation/Copilot are **plan-only**. See [../../../ROADMAP.md](../../../ROADMAP.md) Phase 5.

## Implementation checklist (by feature)

**5a · OCR for scanned PDFs ("B-full") + plate OCR** — [ocr-strategy.md](./ocr-strategy.md)
1. [x] Scope decided — FC1 can't run Tesseract → Azure Container Apps host
2. [x] OCR host built (`ocr/`): Dockerfile + ACA Bicep + plate/pdf adapters (two routes, one container)
3. [x] Image `ce-ocr:latest` built + pushed to ACR (`cespkocracraeee76`)
4. [x] **ACA host deploy** — **DONE 2026-06-19** (PR #7): a pre-granted user-assigned identity for AcrPull (separate ARM deploy) fixed the revision-provision race; `cespkocr-fn-dev-glju3v` is Running (scale-to-zero 0..5). The two B2 fields (`claimant_telephone`/`claimant_email`) are **already present + parity-guarded** in `ocr/ocr_pdf_adapter.py`'s EVA map. **Gated OCR-fallback branch wired into `parse.definition.json`** (sweep wave; gate `cr1bd_OCR_SCANNED_PDF_ENABLED`, `coalesce(OCR, parser)`). Remaining (soft → [../../gated.md](../../gated.md)): import/bind the OCR connector + flip the gate; calibrate on real scans.

**5b · Image classification AI (ADR-0009, M2+)** — [image-classification-ai.md](./image-classification-ai.md)
5. [ ] overview-vs-`damage_closeup` classification (Foundry vision preferred over AI Builder)
6. [ ] person / reflection detection (Custom Vision explicitly **not** used — retires 2028)
7. [x] **Image-ordering UI** (`ImageOrderList.tsx` + test, wired into CaseDetail — drag to set the 2 preview images); [ ] WhatsApp media bulk import (ADR-0007)

**5c · Valuation & Copilot (M2/M3+)** — [valuation-and-copilot.md](./valuation-and-copilot.md)
8. [ ] Valuation (`valuationbot`, gated `VALUATION_ENABLED`) — staff-triggered; evidence PDF attached
9. [ ] Copilot Studio agent (gated `COPILOT_ENABLED`) — staff assistant over Dataverse

## Plans in this phase

- [ocr-strategy.md](./ocr-strategy.md) (5a) · [image-classification-ai.md](./image-classification-ai.md) (5b) · [valuation-and-copilot.md](./valuation-and-copilot.md) (5c)

## Needs the operator

The OCR ACA deploy is a soft blocker (AI-doable once the AcrPull approach is chosen); everything else
here is later-phase. See [../../gated.md](../../gated.md).
