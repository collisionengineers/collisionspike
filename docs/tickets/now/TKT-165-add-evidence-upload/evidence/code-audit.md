# Code audit — 2026-07-12

- `apps/web/src/features/cases/AddEvidence.tsx:123-128` stores selected `File` objects in local state.
- `apps/web/src/features/cases/AddEvidence.tsx:131-133` implements `attach()` as navigation to the selected case only; it never reads `files` or calls an upload transport.
- The screen's heading/subtitle and action present this as a real attach workflow, so this is a functional production blocker rather than dormant code.

This was a read-only source inspection; no file was uploaded and no case was changed.
