---
name: valuationbot-detached-launch-this-loss
description: "The REAL valuation capture failure was a detached playwright-extra launch (this-loss), not browser_source; fixed by .bind(chromium) in autotrader-capture.ts"
metadata: 
  node_type: memory
  type: project
  originSessionId: 54b1da9d-dc27-43cc-b8c4-8946a8d48085
---

The valuation connector's `capture_advert_pages` failed under Claude Desktop with
`Cannot read properties of undefined (reading 'launcher')`. Root cause: `autotrader-capture.ts`
extracted the launch method bare — `const launch = (chromium as …).launch; await launch(opts)` —
which **detaches `this`**. playwright-extra's `launch` reads `this.launcher`, so a detached call
throws that TypeError **before any browser is resolved** (independent of browser_source or whether
the bundled shell exists). Fix: `.bind(chromium)` on the extracted method (kept for the
`typeof launch` typing). Verified end-to-end: bound + real rev-1228 shell → LAUNCH OK v149; the
bare/detached form throws the exact user error.

**Why it took 3 rounds:** every reproduction must exercise the EXACT code path. My first repros
called `chromium.launch(...)` *attached*, so they never hit the detached bug — I shipped a fix for
a different, *latent* issue (the `${user_config.browser_source}` token, see
[[mcpb-unset-userconfig-literal-token]]) that was real but NOT this failure. The connector's own
code comment even mis-blamed the "launcher" TypeError on a missing browser. The diagnostic suffix I
added (`underlying error: …` in the launch catch) is what finally surfaced the true error.

**How to apply:** (1) never extract a playwright/playwright-extra method to a bare local before
calling — call attached or `.bind()`. (2) When debugging, reproduce the *verbatim* call shape, not a
paraphrase. (3) `.mcpb` re-installs need a **version bump** (3.1.0→3.1.1) or Claude Desktop treats
it as already-installed and won't re-extract — that masked the deploy. (4) The connector already
self-heals to system Chrome/Edge when the shell is missing (`ensureChromiumAvailable` →
`runtimeBrowserSourceOverride`), but only once the launch is actually reached.
