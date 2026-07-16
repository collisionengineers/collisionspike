# Verification — TKT-051: PCH not identified (doc-content name + @pch-ltd.com senders)

## Verdict
**VERIFIED-LIVE** (2026-07-10, ticket-verifier dispatch; W5 data pass supplied the DB artifacts)

## Sweep verdict (transcribed verbatim, 2026-07-10)

- **Arm A — doc-content name → real `work_provider_id` at case-resolve (the operator's
  "Performance Car Hire in the document body" miss):** W5 Q-051-1: **84 live
  `field_level_provenance` rows** `field_name='workProviderId'`,
  `source_label='From instructions — provider identified'`, spanning 2026-07-06 → 2026-07-10,
  resolving 10+ principals (QDOS bulk, QCL, FW, AX, KERR, OAK, TEN, ALS, RJS, SBL) — **including PCH
  itself: `qdos26443 | 2026-07-08 15:05:20Z | f948e969-244e-48ae-b165-d1bd0679a317 | PCH`**. The
  content arm is firing live at volume, and fired live for PCH specifically.
  Primary-signal-not-override-authority semantics also live: Q-051-3 shows **4 disagreement audits**
  ("Instruction content names a different work provider … kept the existing provider"; dc7abde2 ×3,
  aed3fe30 ×1) — content never auto-flips an existing FK. Corroborated offline against this ticket's
  own `Inspection Request - Audit Report.DOC` (detector extracts PCH at confidence 1.0) + the pinned
  mapping tests (`services/data-api/src/features/inbound/internal/parser-fields.test.ts`).
- **Arm B — `@pch-ltd.com` joins PCH's own match domains:** Q-051-4:
  `PCH | known_email_domains = pch-ltd.com | active = t` (D8 proven at the DB layer). Live resolution
  at volume: KQL (orch component, fresh this dispatch) `providerMatch matched pch-ltd.com` =
  **54 events since 07-06, 0 unmatched**; Q-051-2: **53 of 54 PCH-resolved cases since the
  2026-07-02 deploy carry `sender-domain match at create`**; TKT-065 banked: 4/4 sampled A.PCH mints
  each immediately preceded (0–7s) by a pch-ltd.com match.
- **"Two fixes working together" (the acceptance's letter):** Q-051-2 is the single artifact —
  54 PCH cases since the fix = 53 via the domain arm + 1 via the content arm, both signals resolving
  PCH in the same live window.
- **Connexus rider (Image-Source intermediary map, TKT-021):** `connexus.co.uk` → outcome
  `intermediary` 16/16 since 07-06, never direct-matched; the {PCH,SBL} >1-candidate set stays Held
  by design (test-pinned), preserving ADR-0011's roles.

### Pending / gaps (from the verdict)
- **Expected absences (not bugs):** PCH-specific content firings are scarce by design (n=1) — D8
  preempts every direct PCH mail at the domain rung (0 unmatched pch-ltd.com), so content-PCH fires
  only on unseeded senders. Zero `(confirmed by intermediary sender)` corroborated-variant rows and
  zero intermediary-1c-label rows in-window — Connexus's 2-candidate set stays Held unless a document
  names one, and no such document arrived. Pre-2026-07-02 cases stay as-were (classification is not
  retroactive).
- **Observation for staff eyes (not a failure finding):** the one content-resolved PCH case carries a
  QDOS-patterned `case_ref` (`qdos26443`) — exactly the ambiguity class the never-override/Held
  guards exist for; source document unread, no evidence the fill is wrong.

### How to re-verify
- Postgres (WSL Entra-admin, `SET ROLE csadmin`): re-run Q-051-1 (both
  `LIKE 'From instructions — provider identified%'` and the intermediary labels) and Q-051-2 —
  counts should only grow; Q-051-4 for the domain row.
- KQL (orch component `7c7ea68a-d14f-4196-ae58-d83711b7eb2a`, short retention): banked `q1.kql`
  (`providerMatch` by outcome/domain), `--offset 132h`.
- On-demand deterministic probe: re-intake this ticket's `.eml`/`.DOC` from a sender domain absent
  from all `known_email_domains` → expect a new `From instructions — provider identified` row
  resolving PCH.

Verified by: ticket-verifier dispatch, 2026-07-10.
