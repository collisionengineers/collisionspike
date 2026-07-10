---
name: valuationbot-chromium-autoinstall-electron-fix
description: "Why valuationbot's capture_advert_pages \"self-install Chromium\" fails in Claude Desktop and the one-flag fix"
metadata: 
  node_type: memory
  type: project
  originSessionId: 692afc4f-251c-4d6a-8993-9e691e167550
---

The valuationbot-mcp connector (display name "Collision Engineers — Vehicle Valuation Evidence", v3.0.3) is meant to auto-install Chromium on first `capture_advert_pages` and ship to a non-technical team with zero Playwright setup. It silently failed (~1.75s, no cache dir, no stderr).

**Root cause:** `installChromiumOnce()` in `autotrader-capture.ts` does `spawn(process.execPath, [cli.js, "install", "chromium"])`. Under Claude Desktop the server runs in an Electron **UtilityProcess** (`appConfig.isUsingBuiltInNodeForMcp is true`), so `process.execPath` is the **Claude/Electron binary, not node**. Without `ELECTRON_RUN_AS_NODE=1` in the spawn env, it launches Claude-as-an-app and exits instantly — the installer never runs.

**Fix 1:** spawn env must be `{ ...process.env, ELECTRON_RUN_AS_NODE: "1" }`. (Egress is fine; a DIRECT `node node_modules/playwright/cli.js install chromium` downloads chromium-1228, exit 0.)

**Second root cause — surfaced AFTER fix 1 (caught by the new `chromium-install.log`):** the code located the CLI with `require.resolve("playwright/cli.js")` (then `playwright-core/cli.js`), but modern Playwright's `package.json` `exports` map does NOT expose `./cli.js` → both throw `ERR_PACKAGE_PATH_NOT_EXPORTED`. So the install spawn NEVER ran and it fell through to the system-chrome fallback (works on a machine WITH Chrome, fails for a team without — exactly the ship target). **Fix 2 (`browser.ts`):** loop `["playwright","playwright-core"]`, `require.resolve(`${pkg}/package.json`)` (package.json IS exported) → `join(dirname(pkgJson), "cli.js")` + `existsSync` check. Bumped to v3.0.5. The earlier `--dry-run` "CLI fine" check was misleading because it ran cli.js by its DIRECT path, not via require.resolve.

Manifest forces `PLAYWRIGHT_BROWSERS_PATH=${HOME}/.cache/valuationbot/ms-playwright` (separate from the default `AppData/Local/ms-playwright` which still has older chromium-1148/1223 — wrong version for bundled Playwright v1228, so the default cache can't be reused).

**Ship-to-team hardening also recommended:** pre-warm `ensureChromiumAvailable()` at startup; pipe (not inherit) the install child's stdout so it doesn't corrupt the stdio MCP stream, log it + include tail in the error; auto-fallback to system `channel: chrome/msedge` when download fails on locked-down networks.

Source IS on this machine at `active/connectors/valuation-adverts-connector/server-ts` (the `connectors/` dir is gitignored in collisionsuite, so the ripgrep-based Grep tool skips it — use bash `find`/`grep`). FIX APPLIED IN SOURCE (2026-06-27): extracted provisioning out of `autotrader-capture.ts` into new site-agnostic `src/browser.ts` (the ELECTRON_RUN_AS_NODE fix + pre-warm + install logging to `$PLAYWRIGHT_BROWSERS_PATH/chromium-install.log` + auto-fallback to system chrome/msedge) and `CaptureError` into `src/capture-errors.ts`; `autotrader-capture.ts` re-exports both for back-compat; `prewarmChromium()` wired into `src/stdio.ts` after connect. `npm run typecheck` clean; `npx vitest run` = 315 pass / 6 fail (the 6 are a PRE-EXISTING missing fixture `tests/fixtures/autotrader/detail_tesla_hydration.html`, unrelated). Both fixes shipped as **`valuationbot-mcp-3.0.5.mcpb`** (rebuilt: fresh esbuild of fixed source + staged runtime node_modules from the installed extension + `@anthropic-ai/mcpb pack`). v3.0.4 was installed (with fix 1 only) and prewarm hit the cli.js exports bug → fell back to system chrome. This machine's cache is now provisioned (`~/.cache/valuationbot/ms-playwright/chromium-1228`) via a direct CLI run, so capture uses real Chromium here regardless. Build command pattern: bump `server-ts/{manifest.json,package.json}` version, `npm run build:stdio`, copy `node_modules`+`manifest`+slim `package.json` into a stage dir, `npx -y @anthropic-ai/mcpb pack`. NOTE: connector working tree had unrelated pre-existing uncommitted changes (health.ts, register-tools.ts, render-proxy.ts, server.ts, manifest.json, deleted tests) before this session. Related: [[project-collisionsuite-structure]], [[project-renderer-convergence]].
