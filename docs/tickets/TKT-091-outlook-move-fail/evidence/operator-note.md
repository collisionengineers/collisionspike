# Operator drop-note — `to-distill/outlook-move/` (2026-07-06)

The original dropped file was empty (preserved as
[outlook-move-fail-original-empty.md](./outlook-move-fail-original-empty.md)). The operator
supplied the real note later the same day (raw file:
[outlook-move-fail.md](./outlook-move-fail.md)):

> Pressed the button to move to a folder. From dev tools on chrome:
>
> ```
> cespk-api-dev.azurewebsites.net/api/inbound/a137d98f-bda5-4e09-bdac-c306a2fd3f7a/outlook-move:1
>   Failed to load resource: the server responded with a status of 503 (Service Unavailable)
> index-Bo5TPbDF.js:25 [Violation] 'message' handler took 943ms
> ```

Key facts: the failing call is `POST /api/inbound/{id}/outlook-move` on the **Data API app**
(`cespk-api-dev`), inbound-email id `a137d98f-bda5-4e09-bdac-c306a2fd3f7a`, and the observed
status is **503 Service Unavailable** — NOT the 403 the pending Exchange `Mail.ReadWrite` grant
([docs/gated.md B4](../../../gated.md)) would produce at the Graph layer. Root cause must be
established from App Insights, not assumed.
