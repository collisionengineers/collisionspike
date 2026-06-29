# EVA Sentry API is full scope, developed against the EVA test environment

**Status:** Accepted (2026-06-17).

The EVA Sentry REST API is **in scope** for the spike, not merely a deferred "later" path. Collision
Engineers have an **EVA test environment**, so the API integration is built and validated there now
rather than waiting for EVA's production API. The base URL is the **same** for test and production —
the **credentials** decide: test `Client_Id`/`Client_Secret` route to a different (test) server.
`EVA_API_ENABLED` toggles the REST API vs the drag-drop JSON path. The
**production** cutover stays gated until EVA's production API is confirmed live/stable and a parity
test passes (a case submitted via the API matches the manual drag-drop result). Drag-drop JSON
remains the M1 path and the permanent fallback.

## Update (2026-06-24) — the real reason REST stays gated is a vendor limit, not "no test env"

The EVA **test environment exists** (credentials in Infisical), so this ADR's premise — build and
validate the API against test now — holds. The reason **JSON drag-drop is the active EVA path** is
therefore **not** merely an "M1 fallback": it is a **vendor limitation**. Minotaur Software's Sentry
API currently supports **only ONE principal code for API submissions** — it cannot route different
work-provider codes, so a REST cutover would force **every** case under a single work provider.
Minotaur is patching this; **no ETA**. EVA REST stays gated pending **that vendor patch + a parity
test**. (Enrichment — DVSA/DVLA, at intake, pre-EVA — is **separate** from EVA and is **live in Dev**;
it does not depend on this gate.)
