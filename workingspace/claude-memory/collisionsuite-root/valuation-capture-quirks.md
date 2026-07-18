---
name: valuation-capture-quirks
description: "Live-verified quirks of the valuation pipeline — Autotrader gateway required filter, per-site cookie CMPs, and the renderer stdout contamination"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 54b1da9d-dc27-43cc-b8c4-8946a8d48085
---

Live-verified 2026-06-29 (system Chrome + direct gateway probes) while debugging the valuation suite;
extended 2026-07-02 (BD69HPO Prius run).

**Autotrader search gateway** (`sources/autotrader-gateway.ts`): the public `/at-gateway` GraphQL
now REQUIRES a `price_search_type` filter (enum `PriceSearchType`, lowercase `"total"` or
`"monthly"`; uppercase/other throw a conversion error). Omitting it → HTTP 200 with GraphQL
`BAD_REQUEST` "Some input filters were invalid: price_search_type …", `data.searchResults:null`.
The connector already injects `{filter:"price_search_type",selected:["total"]}` in `baseFilters()`
(covers both the facets `resolveMake`/`resolveModel` calls AND the listings `search()`). Response
is still a 1-element array → `JSON.parse(raw)[0].data.searchResults` is correct. To diagnose
future breakage, replicate the POST (headers incl. `x-sauron-app-name`) and print the raw body.

**Autotrader fuel_type "Hybrid" umbrella no longer matches listings** (live 2026-07-02): the
facets endpoint still ADVERTISES value `"Hybrid"`, but the listings query with
`fuel_type:["Hybrid"]` returns 0 raw cards — the SPA expands the umbrella client-side. Fixed in
`fuelFilterSelection()` (gateway): "Hybrid" → `["Hybrid","Petrol Hybrid","Diesel Hybrid"]`
(plug-ins stay separate). This was the "autotrader adverts not showing at all" in the BD69HPO run.
Facet drift of this shape (still-advertised value silently matching nothing) is a class, not a
one-off — bisect with a live listings probe, not the facets endpoint.

**cars.rac.co.uk gates on Accept-Language** (live 2026-07-02): every request WITHOUT an
`Accept-Language` header gets a blanket HTTP 500 ("Internal Server Error", 21 bytes) — UA,
Sec-Fetch, sec-ch-ua, TLS fingerprint all irrelevant. Fixed by adding
`Accept-Language: en-GB,en;q=0.9` to heycar-source HEADERS (RSC payload then returns fine).

**Claude Desktop abandons tool calls at ~4 minutes** and never reads a later response (chat shows
"No response received … after waiting 4 minutes"). A 5-URL capture_advert_pages that entered the
worst-offender recompression ladder could grind past that (each retry = full re-capture ≤60s;
up to ~25 retries) → the whole batch was lost. Fixed with `CAPTURE_BATCH_DEADLINE_SECONDS` (170s,
`VALUATIONBOT_CAPTURE_BATCH_DEADLINE`): finished captures return, unfinished ones move to
`remaining_urls`; under deadline pressure oversized captures re-queue instead of re-capturing.

**Autotrader cookie dismissal was a silent no-op — Playwright `.first` porting bug** (live
2026-07-02, second BD69HPO run on 3.2.0): every Autotrader capture failed with "Cookie banner:
… was captured in the PDF" while other sites captured fine. NOT a CMP change — cmpv2.autotrader.co.uk
Sourcepoint iframe still shows a visible "Reject All" (note: "Essential Cookies Only" is gone,
"Accept All" replaced it; "Reject All" pattern still matches). Root cause: Playwright **Python**
exposes `locator.first` as a PROPERTY; Playwright **Node** makes it a METHOD `first()`. The 1:1
port accessed `.first` (the bare method object), `.isVisible` on it threw TypeError, the
try/catches swallowed it → `frameHasVisibleCookieBanner` always false → banner never dismissed,
never detected pre-capture, PDF'd with the overlay, then killed by the strict post-capture text
assertion. Fixed to `.first()` (three sites in autotrader-capture.ts); live capture then succeeds
in ~9s/139KB with a clean advert page. Same failure family as
[[valuationbot-detached-launch-this-loss]] — JS/Python API drift in "faithful" ports fails
SILENTLY behind defensive try/catches; when a port touches Playwright surfaces, verify each
property-vs-method against the NODE docs, and treat "checker always returns false" as a code
smell before blaming the website.

**RAC capture returns the WRONG page as `status:"success"`; every non-Autotrader capture had NO
landing assertion** (live 2026-07-02, 16DL/Claim-576299 BMW X3 run, connector 3.3.0). `cars.rac.co.uk/autos/advert/{id}`
SERVER-redirects a cold/headless visit to its search index (`/autos` ≈ 74k-car listing; earlier
seen as `/uk/autos` via `NEXT_REDIRECT;replace;…;307`). The redirect is a **client-side Next.js
`router.replace` that fires during hydration/scroll — AFTER `waitUntil:"networkidle"`** — so a URL
check right after `goto` still sees `/autos/advert/` and passes; the page then navigates away and the
SEARCH page gets PDF'd. The generic (non-Autotrader) capture path had only a host-only SSRF re-check
(`/autos` shares `cars.rac.co.uk`), so it returned the search page as success. Fixes (all in
autotrader-capture.ts + capture-policy.ts + registry.ts): per-source `advertUrlPattern`
(rac `/autos/advert/`, motors `/car-`, exchangeandmart `/ad/`, arnoldclark `/used-cars/`; autotrader
+ pistonheads left UNSET) checked by `advertLandingViolation()` and thrown as `CaptureError("wrong-page")`
→ `status:"error"`. CRITICAL: assert the landing **LATE, right before render** (after consent+scroll),
not just after goto, or the SPA client-redirect is missed. RAC consent warm-up (`requiresConsentWarmup`
+ `warmupUrl`) does NOT defeat it — RAC never serves the advert HTML to a headless/cold client (bot
gate, not just consent), so RAC captures now fail loudly (correct) and the skill should drop/substitute
non-RAC comparables. Live-verified: RAC → clean `wrong-page` error; Autotrader (no pattern) → clean
advert PDF in the same batch. Also this run: worst-offender ladder RE-NAVIGATED per rung (churn/runaway
+ 4-min host cancels because the 170s batch deadline only stopped CLAIMING new URLs, not in-flight
goto/pdf) → fixed by recompressing retained raw bytes (`onRawCapture` + `compressPdfImages`) instead of
re-capturing, and clamping each capture to `min(per-URL, batchRemaining)`. General lesson: a same-host
redirect to a non-advert page defeats host-only allowlists — assert the advert PATH, and do it at the
LAST moment before capture because SPA redirects fire post-networkidle. See
[[valuation-suite-integration-map]].

**render_valuation_outputs payload-as-string** (live 2026-07-02): Claude Desktop passed the
`payload` argument as a JSON-ENCODED STRING; renderer preflight answered
`{"artifacts":[],"validation":{"ok":false,"errors":["payload must be an object"]}}` in ~96ms with
IsError=False, the model then fell back to the skill's offline WeasyPrint render → 1-page report,
no evidence pack, no captures in the output. Fixed in `ValuationOutputsRenderer.UnwrapJsonString`
(tolerant unwrap of string-encoded payload/captures). Renderer manifest bumped to 0.2.2.

**Per-site cookie CMPs** (capture is `autotrader-capture.ts`):
- Autotrader → Sourcepoint in iframe `cmpv2.autotrader.co.uk` (buttons "Essential Cookies Only" /
  "Accept All"). Own handler `dismissAutotraderCookieBanner` + a STRICT post-capture assertion that
  FAILS the capture if the banner survives — so a broken dismissal = zero Autotrader screenshots.
- Arnold Clark → Civic Cookie Control, MAIN frame, `#ccc-notify-accept` ("Accept additional cookies").
- Exchange & Mart → Sourcepoint in iframe `a02342.exchangeandmart.co.uk`, cleared via
  `button.sp_choice_type_11`.
The old `dismissGenericCookieBanner` was one-pass, MAIN-frame-only, thin selectors → missed Civic
and all iframe CMPs. Fixed to frame-aware + polling running an in-frame accept script across every
frame (CMP selectors + accept-verb text). The "first advert no price" was the same banner blocking
the page before consent. See [[valuationbot-detached-launch-this-loss]], [[valuation-suite-integration-map]].

**Renderer stdout contamination** (`collisionrenderer/src/CollisionRenderer.Mcp`): the 0.1.1 .mcpb
shipped a manifest that pointed `PLAYWRIGHT_BROWSERS_PATH` at `~/.cache/...` with NO
`COLLISIONRENDERER_SKIP_BROWSER_INSTALL`, so it ran `install_browser` at runtime;
`Microsoft.Playwright.Program.Main(["install",…])`'s node child inherits stdout and streams a
progress bar (`|■■■`, "Chromium Headless…") onto the stdio JSON-RPC channel → host logs
"Unexpected token '|'/'C' … is not valid JSON" (non-fatal; render still completed). Source is
already 0.2.x = bundles the shell + sets SKIP=1 (no runtime download); `BrowserBootstrap.Install()`
now also redirects the OS stdout handle to stderr (SetStdHandle) during install as defense.
**General rule: any .mcpb stdio server must keep ALL non-JSON-RPC output (incl. child processes)
off stdout.**


**2026-07-03 (Jake logs, shipped in valuationbot 3.5.0):** (1) E&M captures failed for the same class as RAC — strict `advertUrlPattern:"/ad/"` + cross-origin Sourcepoint CMP but NO consent warm-up; fixed with `requiresConsentWarmup`+`warmupUrl` on the exchangeandmart spec. (2) `gotoWithRetry` now downgrades `networkidle`→`domcontentloaded`+2.5s settle on a goto timeout (tracker-heavy pages never go idle — also helps PistonHeads). (3) H1 debt resolved: ONE shared Chromium per capture batch (`createCaptureBrowserPool`; fresh context per URL; pdf-timeout closes the CONTEXT + marks unhealthy; ≤3 relaunches then `browser-unstable`). (4) standard search fan-out bounded at 20s (`VALUATIONBOT_SEARCH_TOTAL_TIMEOUT`, 0=legacy unbounded). (5) capture delivery is now file-mode by default on stdio — see [[valuation-evidence-file-handoff]].
