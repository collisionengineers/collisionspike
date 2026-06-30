---
id: TKT-002
title: Auto-extract vehicle images from PDFs + flag unsuitable
status: done
priority: P1
area: evidence
tickets-it-relates-to: [TKT-001, TKT-016]
research-link: docs/plans/work-todo-spike/pdf-image-extraction/research/pdf-image-extraction.md
---

# Auto-extract vehicle images from PDFs + flag unsuitable

## Problem
The pipeline must auto-extract any vehicle images embedded in PDF files. It must also identify
**unsuitable** images — the sample e-mail PDF contains images where **no registration is viewable**, and
those should be flagged by the pipeline rather than treated as usable EVA evidence.

## Evidence
Image rules require ≥2 EVA images including one `overview` (registration visible) + one `damage_closeup`
(mirrors `collisioncc` `image-rules.ts`). Extraction feeds those rules; a no-registration-visible image
fails the overview requirement. See the research pack and the `IMAGES - CVD.pdf` sample.

## Proposed change
Extract embedded images from instruction/evidence PDFs into evidence rows, and run the suitability check
(registration-visible / overview-vs-closeup) so unsuitable images are surfaced, not silently accepted.

## Acceptance
The sample PDF's embedded images are extracted as evidence; the no-registration images are flagged
unsuitable; a case with only unsuitable images does not reach `ready_for_eva` on image grounds.

## Research
- Operator stub: [pdf-image-extraction.md](../../plans/work-todo-spike/pdf-image-extraction/pdf-image-extraction.md)
- Research pack: [research/pdf-image-extraction.md](../../plans/work-todo-spike/pdf-image-extraction/research/pdf-image-extraction.md)
- Sample data: `IMAGES - CVD.pdf`, `New Inspection Instruction.eml` in [pdf-image-extraction/](../../plans/work-todo-spike/pdf-image-extraction/).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
