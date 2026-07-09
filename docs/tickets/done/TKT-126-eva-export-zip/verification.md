# Verification — TKT-126: Export for EVA downloads a .zip of the JSON plus all the images

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance section of the ticket spec.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. The verifier exported TWO cases itself: EVA-A.QDOS26035.zip (9 entries: 12-field JSON + 8 photos, byte-identical to the implementer's clean re-export) and unstaged EVA-A.PCH26016.zip (64 entries: JSON + 63 photos, ZERO non-image members despite .eml/.pdf/.DOC evidence). JSONs parse with exactly the 12 snake_case keys in EVA_FIELD_ORDER; numbering gapless NNN-, order matches the on-screen orderer 1:1, previews first then repeated; only accepted images shipped (8 rows -> 6 accepted travelled). Expected absence: no live excluded-image case existed (path pinned offline). Cosmetic: the button tooltip says "upload order" — wording nit only.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
