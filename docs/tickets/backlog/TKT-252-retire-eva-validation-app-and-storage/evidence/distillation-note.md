# Distillation note — TKT-252

**Source:** `03-cloud-estate-cleanup.md` scope item 1. **Plan:** PLAN-009. Live re-verified read-only
2026-07-19 (`PLAN-009.dossier.json`), subscription `e6076573-…`, RG `rg-collisionspike-dev`.

**Live state:** the EVA-validation triple is present and the function app is Running — app `cespkeval-fn-6c6fxd`
(Flex/FC1 plan `cespkeval-plan-6c6fxd`, storage `cespkevalst6c6fxd`). ARG reports `state = Running` (the Flex
`functionapp show` null-state is a known quirk).

**Repository state:** `LIVE_FACTS.json` `evaValidation`: `source: null`,
`repositoryState: "removed after a read-only no-use audit"`, `liveRetirement: "separate production task"`. No
`eva-validation` source exists under `services/functions/` (only `eva-sentry` is present).

**Authority:** TKT-215 (`eva-validation-live-use-audit`, currently `verify`) owns the no-use verdict; this
ticket consumes it and does not re-audit. Deletion is a **live write** — the ticket authorises the work, the
operator must additionally authorise the mutation (AGENTS.md Live-system safety), and it is verified live
afterward.
