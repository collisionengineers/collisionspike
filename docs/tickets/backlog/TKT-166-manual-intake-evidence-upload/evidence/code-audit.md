# Code audit — 2026-07-12

- `mockup-app/src/screens/ManualIntake.tsx:648-684` creates the case and uploads `evidenceFiles` only when `mode === 'images'`.
- `mockup-app/src/screens/ManualIntake.tsx:692-700` handles the document/manual path by displaying “evidence file(s) linked” and navigating, but never uploads `instructionFile` or `evidenceFiles`.
- The retained source bytes are therefore absent even though the UI reports success.

This was a read-only source inspection; no case or evidence was created.
