# Verification — TKT-124: Photo orderer shows .eml files — it must list images only

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
See the Acceptance section of the ticket spec.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Two live cases (the implementer's A.QDOS26035 + independent unstaged A.PCH26016): the EVA photo-order list holds ONLY images (8 and 63 entries respectively) while message.eml / PDFs / .DOC / .mp4 render in the Documents list with kind labels; the 402-row re-kind backup CSV + delta exist; the deployed bundle carries the kind filter. Expected absence: the 0-mislabelled-rows DB re-read is firewall-gated (delta output stands). Pre-existing dup-photo rows -> TKT-133.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
