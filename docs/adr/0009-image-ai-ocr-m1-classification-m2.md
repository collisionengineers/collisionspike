# Image AI: OCR-for-registration in M1; AI Builder classification + Foundry vision in M2

Microsoft Learn (June 2026) confirms **Azure Custom Vision** and **Image Analysis 4.0** (custom
models + people detection) are on the **retirement path (2028-09-25)**, so neither is used for new
work. The image-AI work is phased:

- **M1 — OCR for registration matching only:** read the plate from images (**Tesseract** via the
  parser Function, or **Azure Document Intelligence Read**) to (a) satisfy the registration-visible
  readiness check and (b) match images to the open Case by **VRM** (including the WhatsApp bulk-media
  import — ADR-0007). Overview/damage **role tagging stays manual** in M1.
- **M2 — classification + reflection:** **AI Builder image classification** (native, current) for
  overview-vs-damage; an **Azure OpenAI / Foundry vision model** for **person/reflection** detection
  (and as a flexible secondary check).

Rationale: ship the highest-value, cheapest signal (registration OCR) first; defer model training and
cloud vision to M2; build nothing on deprecated services.
