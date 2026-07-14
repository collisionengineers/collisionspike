# Verification — TKT-067: Assistant drawer needs a "New chat" button to clear the conversation

## Verdict
TESTED (offline)

## Evidence
- SPA build + unit suite green (`npm --prefix mockup-app test`; `node verify-all.mjs` SPA gate).

## Pending / gaps
- **Not deployed.** Live proof is an operator click-through on the deployed SPA (`cespk-spa-dev`): open the
  assistant, hold a conversation, click New chat → history + input clear; the control is disabled mid-send.
  No feature gate — it ships when the SPA is next deployed.

## How to re-verify
Offline: `npm --prefix mockup-app run dev`, open the assistant drawer, exercise New chat. Live: same, on
the deployed SPA after the next SWA deploy.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. The New chat control is live in the drawer header (native button, aria "Start a new chat", keyboard-activated): clearing empties the pane + input; disabled during send (state captured at 11ms/210ms) and when empty; the post-clear POST carries exactly ONE message (wire-proven — zero residual turns). The stale "not deployed" note is superseded. Side finding at probe time: all assistant chats returned the honest-error fallback — the TKT-066 schema incident, already mitigated + fix in flight (unrelated to this client-side control).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

## Reopened verdict — 2026-07-13

FAILED (live regression) — the supplied screenshot and operator reproduction show New chat greyed out
while an attachment decision is pending; pressing Cancel makes it available. The earlier live proof did
not cover this state.

### How to re-verify

In the signed-in deployed assistant, select files and reach the confirmation card. Activate New chat
without pressing Cancel, verify the drawer resets, then confirm through network/DB/audit inspection that
no upload or case change occurred. Repeat by keyboard and with a recoverable upload error.
