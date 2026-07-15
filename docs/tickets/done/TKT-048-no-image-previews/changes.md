# TKT-048 — changes

This file records the implementation already described in the ticket's closure note; it does not
represent a new deployment.

- Added the authenticated `GET /api/evidence/{id}/content` byte route.
- Served local-blob evidence first and used the Archive facade for evidence without a local storage
  path.
- Updated the web evidence card to fetch with the staff bearer token and render a revocable `blob:`
  URL, retaining the placeholder when bytes are unavailable.
- Kept the existing evidence actions and overlays over the inline preview.

The original operator screenshot is catalogued by SHA-256 in
[evidence-manifest.json](./evidence-manifest.json).
