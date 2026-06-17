# EVA Sentry API is full scope, developed against the EVA test environment

The EVA Sentry REST API is **in scope** for the spike, not merely a deferred "later" path. Collision
Engineers have an **EVA test environment**, so the API integration is built and validated there now
rather than waiting for EVA's production API. Configuration: `EVA_BASE_URL` selects the EVA **test**
or **production** base URL; `EVA_API_ENABLED` toggles the REST API vs the drag-drop JSON path. The
**production** cutover stays gated until EVA's production API is confirmed live/stable and a parity
test passes (a case submitted via the API matches the manual drag-drop result). Drag-drop JSON
remains the M1 path and the permanent fallback.
