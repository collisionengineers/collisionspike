# Workflow finding — 2026-07-09

From the UI-wave batch report: (1) duplicate evidence rows (same photo persisted from email + Box mirror) duplicate in the EVA sequence — sha256 exists for a dedup pass; (2) the box-webhook Python client still sends evidenceClass 'image' for every upload (API guard corrects it) — cosmetic tidy-up at source.
