# Changes — TKT-301

## 2026-07-21 — ticket minted (PLAN-015 Slice D)

Ticket created from PLAN-015.

## 2026-07-21 — implementation (documents today's truth; cutover values are Phase 7 paperwork)

- `docs/operations/feature-gates.md` — new "Alpha testing (PLAN-015)" section:
  `EVA_SHADOW_AUTOSUBMIT_ENABLED` and `INTAKE_POLL_ENABLED` (+ its separate
  `INTAKE_POLL_MAILBOXES`) in plain language, both recorded at their ship-dark live state;
  the poller row states plainly it is never to be set live.
- `infrastructure/config-capture/api.bicep` — captures `EVA_SHADOW_AUTOSUBMIT_ENABLED`
  (param default `false` = today's absent/off state) in the settings map and the reviewable
  name list.
- `infrastructure/config-capture/orch.bicep` — captures `EVA_API_ENABLED` (param default
  `false` = today's absent/off state); comment records that the Phase-6 cutover also adds the
  `evasentry-fn-key` secret + `EVASENTRY_FN_KEY` setting (deliberately not captured until they
  exist live) and that the TKT-299 poller variables are local-only by design and never captured.
- `GRAPH_INTAKE_MAILBOXES` in orch.bicep deliberately stays at its current live three-mailbox
  value — the single-mailbox re-scope is a cutover-time edit recorded by the runbook
  (`docs/operations/alpha-testing.md` Phase 2/7).
- No LIVE_FACTS change in this slice: nothing live has changed yet.
