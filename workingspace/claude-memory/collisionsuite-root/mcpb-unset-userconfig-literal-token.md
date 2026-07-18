---
name: mcpb-unset-userconfig-literal-token
description: "Claude Desktop passes the LITERAL ${user_config.X} token (not the manifest default) when an optional user_config field is never set — a .mcpb connector gotcha"
metadata: 
  node_type: memory
  type: project
  originSessionId: 54b1da9d-dc27-43cc-b8c4-8946a8d48085
---

In a Claude Desktop `.mcpb`/MCPB connector, if a `user_config` field is `required: false` with a `default`, and the user never opens/saves the connector's Configure screen, Claude Desktop does **NOT** substitute the manifest `default` into the `${user_config.X}` env template at spawn time — it passes the **literal string `${user_config.X}`** to the server process. (The `default` only pre-fills the config UI.) Substitution also only happens at connector spawn, so changing the config requires a FULL Claude Desktop restart, not just reopening the window.

This bit the valuation connector (`valuation-adverts-connector/server-ts`): `VALUATIONBOT_BROWSER_SOURCE=${user_config.browser_source}` arrived literal, and `resolveBrowserSource()` (in `src/browser.ts`) treated any non-empty/non-keyword value as an executable path → Playwright tried to launch a browser at `"${user_config.browser_source}"` → "executable doesn't exist", which the launch-site catch mis-reported as "the .mcpb bundle may be incomplete (reinstall)". The bundled headless shell was fine the whole time.

**Why:** the misleading wrapped error + connector stderr not being captured in any Claude log made it look like a bundle/Chromium problem. Reproduced by setting the env to the literal token; unset/"download" both launch the bundled shell fine.

**How to apply:** for any `.mcpb` env wired to an optional `${user_config.X}`, the server MUST treat an unsubstituted `${...}` token (and empty) as the default. Fix applied: `resolveBrowserSource` now returns `{kind:"download"}` when `raw.includes("${")`, and only treats a value as an executable path when `existsSync(raw)`.

**CORRECTION (important):** this `${...}`-token issue was a REAL but LATENT bug — it was NOT what caused the observed capture failure. The actual `capture_advert_pages` failure was a detached-`this` bug in the launch call (`Cannot read properties of undefined (reading 'launcher')`) — see [[valuationbot-detached-launch-this-loss]]. The token only bites the *attached* launch path, which the detached call never reached. Don't conflate the two. Related: [[valuationbot-chromium-autoinstall-electron-fix]], [[valuation-suite-integration-map]].
