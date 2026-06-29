# Proposed usability additions (operator to vet)

_Authored 2026-06-29 during the work-todo-spike implementation pass. These are features I judge
**genuinely important for day-to-day usability** of the case-intake/triage workflow that are **not**
in the current ticket set — surfaced because they kept coming up while wiring the real screens. They
are **proposals, not implemented** — vet, reprioritise, or bin. Each notes where it would attach and a
rough effort. If you want any of these, they should become `docs/tickets/` entries (status `backlog`)._

Context: the app is used by intake staff who process a high volume of inbound mail (~1–3k/mo across
info@/engineers@/desk@) into tracked cases, then review → enrich → export to EVA + archive to Box. The
gaps below are the friction points a daily operator would feel.

## 1. Global quick-find (search box in the app shell) — HIGH
There is navigation but **no way to jump straight to a case/email by VRM, Case/PO, provider, or claimant
name**. For staff who get "what's happening with AP70 WAA?" calls, this is the single biggest missing
affordance. A command-palette-style box (Ctrl/Cmd-K) in `AppShell.tsx` querying a new
`GET /api/search?q=` (cases + inbound, ranked) would pay for itself immediately. _Effort: M (1 API route + a shell component)._

## 2. Bulk triage actions in the inbox — HIGH
The inbox now has per-row dismiss/action/reclassify, but **no multi-select**. At this mail volume,
clearing/routing one row at a time is slow. Add checkbox multi-select + a bulk bar (Dismiss N / Mark
actioned N / Reclassify N). Attaches to `Inbox.tsx` + a small `POST /api/inbound/bulk-triage`. _Effort: M._

## 3. Keyboard-driven triage — MEDIUM
An inbox-heavy workflow lives on the keyboard: `j/k` move selection, `e` mark actioned, `d` dismiss,
`Enter` open. Low cost, large daily speed-up for power users. Attaches to `Inbox.tsx`. _Effort: S._

## 4. Undo for dismiss / remove — MEDIUM
Dismiss and (soft) remove are now reversible server-side, so an **"Undo" toast** (5–10s) after either is
cheap insurance against misclicks — especially for the Superuser remove-case. Attaches to the existing
toaster + the triage/remove mutations. _Effort: S._

## 5. Intake-health / active alerting — HIGH (given history)
The dashboard shows aging exceptions, but nothing **proactively** flags: intake has gone quiet (no new
cases in N hours despite live Graph subscriptions), a Graph subscription is near expiry, a case has sat
in "awaiting images" past SLA, or a chaser is overdue. Given the graph-renew time-bomb that already bit
once, a small **"Intake health" strip** (last-intake timestamp + next subscription expiry, both off
LIVE_FACTS/registry-style reads) would catch a silent lapse early. _Effort: M (read endpoints + a strip)._

## 6. EVA submission follow-through — MEDIUM
The status machine ends at `eva_submitted`, but there's no **"awaiting EVA confirmation"** tracking after
the drag-drop export — staff can't easily see which submitted cases are still unconfirmed. A light
post-submit sub-state + a small queue would close the loop. _Effort: S–M._

## 7. Per-case unified timeline — MEDIUM
Evidence, linked emails, status changes, chasers, and audit events are shown in separate tabs. A single
**chronological case timeline** (the one view a colleague needs at handover) would reduce tab-hopping.
The data already exists (audit_event + evidence + inbound_email + chasers) — it's a presentation layer on
`CaseDetail.tsx`. _Effort: M._

## 8. Provider policy at-a-glance during triage/review — MEDIUM
When triaging or reviewing, staff often need the provider's **image-source policy, inspection-location
policy, and automation mode** — currently only visible by navigating to Admin. Surfacing a compact
provider-policy popover on the case/inbox row (from the corpus already loaded) would prevent
context-switching. _Effort: S._

## 9. Responsive / tablet layout — MEDIUM (depends on how staff work)
The dense Fluent `DataGrid` screens assume desktop. If any triage/review happens on a tablet (field or
workshop), a responsive mode is needed. There is prior `mobile-ux` research in the repo, so this is on the
radar but unbuilt. _Effort: M–L; only worth it if tablet use is real — please confirm._

## 10. Duplicate-review surface — MEDIUM
Dedup (ADR-0010) sets `duplicate_risk` / routes to Held, but there's no **side-by-side compare + confirm
merge** affordance — the merge dialog exists but the *discovery* of "these two are probably the same" is
manual. A "Potential duplicates" review surface would make the safety net usable. _Effort: M._

---

### My top 3 if you only do a few
1. **Global quick-find (#1)** — biggest everyday time-saver.
2. **Bulk triage (#2)** — matches the real mail volume.
3. **Intake-health alerting (#5)** — directly de-risks the silent-lapse failure mode you've already hit once.
