# Verification — TKT-143: Pass the resolved provider/VRM into /extract-images so extraction filenames carry real identity

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26, finalized after the orchestrator W3 data pass.

## Ticket-verifier verdict (transcribed, dispatch of 2026-07-10)

### Final verdict
VERIFIED-LIVE — "acceptance line 1 is proven persisted-live (Q-A:
`577376__PCH_HG24TNO_img_<p>_<n>.jpeg` on A.PCH26034; Q-B: 535 identity_provider_vrm rows; Q-C:
20/20 strict-window cases identity-stemmed, 0 legacy shapes) and line 2 holds live (neutral stems
only where identity was unknown, fixtures banked 16/16), with the Box folder listing showing the
stems carried end-to-end." Caveat: the 2 neutral rows (one case, 2026-07-10 08:33) read as the
omit-when-unknown rule working on an unresolved-at-extraction case.

### Evidence
- **Parser layer (banked from the TKT-090 sweep):** live compute-only probe of the deployed
  /extract-images — provider=QDOS, vrm=AB12CDE → `QDOS_AB12CDE_img_1_1.jpeg …`; bare call →
  neutral `img_1_1.jpeg …` (omit-when-unknown live).
- **Orch layer:** all three extractImages call sites thread providerPrincipal omit-when-unknown
  (intakeOrchestrator.ts:148/298/715); extractImages.ts:103-111 passes provider (upper-cased
  principal) + canonicalized VRM only when non-empty; deployed since 2026-07-09T14:16Z.
- **Key code-read finding (corrects the prior re-verify query):** the Data API's evidence INSERT
  lane hardcodes `source_label = 'auto-intake'` (internal.ts:2664, confirmed in the deployed
  bundle) — `LIKE 'extracted from %'` can never match. Extraction rows are recognised by the
  filename shape instead: **`file_name ~ '__([A-Za-z0-9]+_)*img_[0-9]+_[0-9]+\.'`**.
- **W3 data pass (persisted rows, run 2026-07-10, trap-deleted window):**
  Q-A per-row proof — A.PCH26034 (VRM HG24TNO, principal PCH) rows all
  `577376__PCH_HG24TNO_img_<p>_<n>.jpeg`. Q-B census since the orch deploy —
  **identity_provider_vrm 535 · identity_single_token 93 · neutral 2 · other_legacy 0**.
  Q-C strict window — **all 20 cases identity_rows > 0 with neutral_rows = 0** (A.PCH26034 70/70,
  A.PCH26031 48/48, AX26037 44/44, …).
- **Box end-to-end:** keyed facade listing of A.PCH26036's folder (398564730902) — 12
  `…__PCH_SP23OBX_img_1_N.jpeg` identity-stem files, 0 non-identity img_ files.
- Offline fixtures: test_extract_images.py identity/partial/neutral contract, 16/16 green.

### How to re-verify
KQL (component cespk-orch-dev): `traces | where message has "extractImages"` → caseId + extracted
counts; then the corrected-predicate SQL (Q-A/Q-B/Q-C shapes above) over those case ids; optional
SPA evidence-list spot-check; the facade folder listing for the Box half.
