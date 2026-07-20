# ADR-0027 — Features ship dark behind default-off deployment gates

**Status:** Accepted 2026-07-20 per operator approval ([TKT-246](../tickets/done/TKT-246-platform-adr-backfill/TKT-246-platform-adr-backfill.md)).

## Decision

CollisionSpike runs as one deployed environment that both hosts development and serves live staff
work. There is no separate staging or production tier. The environment's concrete name, whether a
production cutover has been performed, and the current live-mail state are dated live facts, not
durable decisions — the registry is the authority ([LIVE_FACTS.json](../../LIVE_FACTS.json),
`safetyGates.liveCutoverPerformed`), and this ADR deliberately does not restate them.

Because there is nowhere else to stage behaviour, capabilities ship *into* that environment and are
switched by deployment gates rather than by promoting a build between tiers:

- One shared, server-only reader — [`packages/domain/src/gates.ts`](../../packages/domain/src/gates.ts)
  — resolves gates from app settings (`process.env`) for the two TypeScript services. Each accessor
  returns `false`/empty on a missing variable: **gates are default-off**. The Data API re-exports the
  same reader ([`settings/gates.ts`](../../services/data-api/src/features/settings/gates.ts));
  orchestration imports it directly. One TypeScript implementation, no duplication across those two.
  The Python Function apps do NOT share this reader: `box-webhook`, `eva-sentry`, `vehicle-enrichment`,
  and `location-assist` each parse their own `*_ENABLED` setting at the edge (`os.environ` / `_truthy`)
  as deliberate defence in depth — so an activated gate must be configured on every app that enforces
  it, not just one.
- The reader is never re-exported to the browser barrel. The SPA learns gate state over HTTP through
  `/api/gates/*` ([`gate-routes.ts`](../../services/data-api/src/features/settings/gate-routes.ts)),
  whose handlers default a gate-read error to all-off inside their own try. Authentication runs
  OUTSIDE that try (`withRole` → `authenticate`), so a genuinely unexpected auth failure — e.g. a
  non-JOSE JWKS error — still maps to 500 via `staff-auth.ts::toErrorResponse`. The SPA's `safe(...)`
  wrappers ([`rest-client.ts`](../../apps/web/src/data/rest-client.ts)) then resolve that failure to
  the all-off baseline, so the CLIENT fails closed even when a gate route 5xxs.
- A gate is a config value, not a branch to deploy: the "live flip" sets the app-setting; clearing it
  restores the prior behaviour with no redeploy, and many gates self-reconcile in both directions.
- A not-yet-approved capability therefore ships **dark** — deployed but off — and is byte-for-byte
  inert: its route honestly 404/503-gates, the SPA hides its control, and its timers and movers do
  nothing before any effecting work. The DERIVED gates that AND their dependency into the accessor
  (`locationAssistEnabled`, `aiChatEnabled`, `imageAnalysisEnabled`, `outlookMoveEnabled`,
  `aiAssistConfigured` in [`gates.ts`](../../packages/domain/src/gates.ts)) stay an honest no-op when
  their dependency (model endpoint, queue, template) is unconfigured. A plain boolean gate that does
  NOT check its endpoint is not automatically a no-op: the EVA+Box finalize starter launches its
  Durable orchestration on `evaApi() && boxApi()` alone, and if the service URL is absent
  `functions-client.ts::callFunction` throws on the missing `*_FN_URL`, so the Durable retry policy
  fails the instance rather than no-opping. Dependency-unconfigured is an honest no-op only where the
  gate (or its activity) actually checks the dependency.
- Some flips are operator-blocked behind named prerequisites (DPIA, production AI sign-off, a dedicated
  Entra app-registration, Exchange re-consent, designated-test proof), tracked in
  [operator-actions.md](../operations/operator-actions.md); the live values live in `LIVE_FACTS.json`
  (`safetyGates`, `deliberatelyUnavailable`) and are summarized in
  [live-environment.md](../operations/live-environment.md).

## Rationale

With a single live environment there is no safe place to stage a risky change, so the gate *is* the
staging mechanism: ship the code dark, prove it inert, then flip a config value that can be pulled back
instantly. Default-off means an incomplete or unreviewed feature is inert by construction, and the
honest-no-op contract makes a dark feature indistinguishable from its absence — merging it cannot
regress live behaviour.

## Consequences

Every feature-bearing change ships with its own gate and a proven off-state; a new route gates *before*
doing work, never after. Gates are per-capability kill switches — read-only MCP and image-ingest, or
the four guided-capture switches, flip independently — so one lane can be pulled without touching
another. `LIVE_FACTS.json`, not source presence, is the authority on which capabilities are live.
Retiring a gate is itself a change the default-off, honest-off contract must survive until the gate is
removed together with its feature.
