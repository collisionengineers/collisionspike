---
id: TKT-067
title: Assistant drawer needs a "New chat" button to clear the conversation
status: now
priority: P2
area: ui
tickets-it-relates-to: [TKT-060, TKT-066]
research-link: docs/tickets/now/TKT-067-assistant-new-chat/evidence-manifest.json
plan: PLAN-001
---

# Assistant drawer needs a "New chat" button to clear the conversation

## Problem

There is no way to reset the assistant conversation. Once a chat has gone down a wrong path
(e.g. after the TKT-066 lookup failure convinced the model a case doesn't exist), the handler
has to close and reopen the drawer — and even that only works because history happens to live
client-side; there is no explicit, discoverable "start again" affordance.

## Evidence

- `evidence/operator-note.md` — plan § 2 (2026-07-06 planning session).
- `apps/web/src/features/assistant/AssistantDrawer.tsx` — drawer state is client-side `turns` +
  `input`; the header currently has only a close button. No API involvement in history.

## Proposed change

PROPOSED (not built):

- Add a "New chat" button in the AssistantDrawer header (next to close) that clears `turns` +
  `input`. Disabled while `sending` so an in-flight reply can't interleave with a cleared pane.
- SPA-only change — `POST /api/assistant/chat` is stateless per request; no API change.
- The label follows the UI-language rule (plain user terms; "New chat" is fine — no
  engineering vocabulary).

## Acceptance

- [ ] A visible "New chat" control sits in the drawer header; activating it empties the
      conversation and the input box.
- [ ] The control is disabled while a reply is being generated (`sending`).
- [ ] After clearing, the next question starts a fresh conversation (no residual turns are sent).
- [ ] Keyboard/screen-reader accessible (focusable, labelled).

## Verification requirements (proof standard)

1. **Offline** — SPA build passes (`npm --prefix apps/web run build`); a component-level test
   or typed render check if the suite covers the drawer.
2. **Gate** — `node verify-all.mjs` green; SPA deploy recorded in [changes.md](./changes.md).
3. **Live click-through** — on the deployed SPA: open the assistant, exchange ≥2 turns, press
   "New chat", confirm the pane and input clear, then ask a new question and confirm the reply
   does not reference the cleared turns. Record with a screenshot or DevTools note in
   [verification.md](./verification.md).
4. **A11y spot-check** — tab to the button and activate via keyboard; confirm an accessible
   name is announced (DevTools a11y tree note).

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-assistant-intake-search-fixes.md`
(§ 2); excerpt in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (excerpt)](./evidence/operator-note.md)

## Reopened regression — 2026-07-13

The control is live, but a pending attachment confirmation disables it until the handler presses Cancel.
Waiting for a decision is not active work and must not trap the conversation.

### Acceptance

- New chat remains available while an attachment confirmation, target-choice card or recoverable upload
  error is waiting for the handler; only an actually executing reply/upload may disable it.
- Activating New chat from a pending attachment state clears the turns, draft, selected files, target
  candidates and confirmation card without uploading or changing a case.
- If a network operation is already executing, the control either waits safely or cancels through a
  supported abort path; it never leaves an orphaned write or lets a late response repopulate the cleared
  conversation.
- Keyboard and screen-reader users can understand and activate the control in every pending/error state,
  and focus returns to the empty composer after reset.

### Validation

- Component tests cover idle, pending confirmation, ambiguous target, recoverable failure, reply in flight,
  upload in flight and late-response races; they assert zero upload calls when reset precedes confirmation.
- Signed-in live verification reproduces the supplied pending-card state, starts a new chat without first
  pressing Cancel, and confirms that no evidence or audit row was written for the abandoned files.

### Follow-up evidence

- [Operator New chat regression note](./evidence/followup-2026-07-13/issue1.md)
- [Distillation ruling](./evidence/followup-2026-07-13/operator-note.md)
