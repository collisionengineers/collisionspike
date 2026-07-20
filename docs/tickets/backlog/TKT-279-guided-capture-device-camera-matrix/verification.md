# Verification — TKT-279: Guided capture real-device camera matrix

## Verdict
NOT YET IMPLEMENTED

## Evidence
None — no physical device has run the guided-capture flow. Unit/e2e coverage exists against
jsdom-mocked media APIs only (`apps/capture-web`'s vitest + Playwright suites).

## Pending / gaps
- Real iPhone Safari / Android Chrome device matrix.
- In-app-browser link-opening handoff (SMS/email/WhatsApp).
- Permission grant/deny/revoke and recovery.

## How to re-verify
Execute the device matrix and record pass/fail evidence per device/scenario under this ticket's
`evidence/`.
