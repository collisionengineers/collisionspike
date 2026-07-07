---
id: TKT-060
title: AI chat helper — read-only Q&A assistant drawer
status: done
priority: P2
area: ui
tickets-it-relates-to: [TKT-015]
research-link: docs/plans/go-live/README.md
plan: PLAN-001
---

# AI chat helper — read-only Q&A assistant drawer

## Problem

Staff have no conversational way to ask the system questions ("what's the status of CCPY26050?",
"how many cases are waiting for review?", "which inbound email mentions VRM AB12 CDE?"). Everything
today is navigated by hand through the dashboard and case pages. TKT-015's AI work is a
**suggestion / observation layer** — it writes `ai_suggestion` rows for a human to accept or reject
on triage rows and cases; it is **not** a chat surface and does not answer free-form questions. What
is wanted is a chat-style helper (think Claude-in-Chrome: a drawer you open, type into, and read
back) that answers grounded, **read-only** questions about the live case/queue/inbox state. This is
an MVP — Q&A only, no mutations.

## Change

A gated, read-only Q&A assistant, distinct from the TKT-015 suggestion layer.

- **Backend.** New Data API route `POST /api/assistant/chat` on `cespk-api-dev`, streamed to the
  SPA via a **fetch-reader** (a `ReadableStream` read loop over the response body) — **not**
  `EventSource`, which cannot carry the MSAL `Authorization: Bearer` header. The SPA CSP already
  allows the API origin (`mockup-app/staticwebapp.config.json` — `connect-src` includes
  `https://cespk-api-dev.azurewebsites.net`), so no CSP edit is needed.
- **Model.** Calls the existing AOAI **`gpt-5`** deployment on **`digital-3339-resource`**
  ( `AI_MODEL_ENDPOINT` / `AI_MODEL_DEPLOYMENT` ) **keyless** via managed identity — this requires a
  **new `cespk-api-dev` managed-identity `Cognitive Services OpenAI User` grant** on the Foundry
  account (only `cespk-orch-dev` holds that grant today; see
  [live-environment.md](../../../architecture/live-environment.md)).
- **Tools (read-only only).** Case lookup by Case/PO, VRM, or claimant; case summary; queue counts;
  inbound-email search. No write tool is exposed and the system prompt **refuses mutations**
  ("I can look things up but can't change anything").
- **Grounding.** A curated system prompt seeded from the [CONTEXT.md](../../../../CONTEXT.md) glossary
  and the status-machine (`new_email → ingested → needs_review → ready_for_eva → eva_submitted`) so
  answers use the house terminology.
- **Guardrails.** Gated **`AI_CHAT_ENABLED`** (default off, both the read path and the route);
  every tool query runs **RLS-scoped** to the staff caller (via the existing `app.role=staff` DB
  seam); each exchange is **audited** (prompt + tool calls + answer); and the route is
  **rate-limited** per principal.
- **SPA.** A **global drawer** opened from the AppShell header (`mockup-app/src/components/AppShell.tsx`
  `<header className={styles.topbar}>`), triggered by a **Sparkles** glyph (lucide-react, matching
  `AiAssistPanel.tsx`), built from **Fluent v9** primitives (`@fluentui/react-components`). The
  drawer streams tokens as they arrive and renders the model's answer.

## Acceptance

- [ ] `POST /api/assistant/chat` exists on `cespk-api-dev`, validates the Entra JWT + a staff app-role,
      and streams its response (chunked body the SPA reads via a fetch-reader, not `EventSource`).
- [ ] `cespk-api-dev`'s managed identity is granted **Cognitive Services OpenAI User** on
      `digital-3339-resource`, and the route reaches `gpt-5` **keyless** (no key in app-settings).
- [ ] Only the four read-only tools (case-by-PO/VRM/claimant, case summary, queue counts, inbound
      search) are wired; a mutation request is refused with a plain-English "read-only" reply.
- [ ] Tool queries run RLS-scoped to the caller (no cross-tenant/foreign rows leak into an answer).
- [ ] Every exchange writes an audit row; the route is rate-limited per principal.
- [ ] `AI_CHAT_ENABLED` defaults **off** — with it unset the route fail-closes and the drawer trigger
      is hidden/inert; the drawer only functions when the gate is on (both apps' registered value in
      [`LIVE_FACTS.json`](../../../../LIVE_FACTS.json) / the registry, per
      [MAINTENANCE.md](../../../MAINTENANCE.md)).
- [ ] The Sparkles drawer opens from the AppShell header, uses Fluent v9 primitives, and renders the
      streamed answer.
- [ ] System prompt is grounded in the CONTEXT.md glossary + status-machine (spot-check: it names the
      canonical statuses and Case/PO shape correctly).
