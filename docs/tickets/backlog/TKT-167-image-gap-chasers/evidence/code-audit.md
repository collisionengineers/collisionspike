# Code audit — 2026-07-12

- `mockup-app/src/components/ChaserPanel.tsx:64-67` makes image templates depend on a broad image-less case type.
- `mockup-app/src/components/ChaserPanel.tsx:141-147` calculates `hasImages` from any evidence row whose kind is `image`, without checking exclusion, accepted role, visibility or completeness.
- `mockup-app/src/components/ChaserPanel.tsx:165-176,279-287` filters the image request/upload-link options through that predicate and can report that there is nothing to chase.
- Existing component coverage addresses the targeted overview draft but not general canonical image-gap eligibility.

This was a read-only source inspection; no chaser was created or sent.
