# Code Audit & Cleanup Plan — collisionspike

**Scope audited:** `mockup-app/src/**` (data seam, parser client, mock data, components, screens, generated services), `mockup-app/package.json`, `functions/**` (parser + enrichment), `flows/definitions/**`, `dataverse/.build/**`, plus build/test gates (`verify-all.mjs`, `flows/validate-flows.mjs`, `dataverse/verify-parity.mjs`).
**Method:** read-only (Grep/Glob/Read + Microsoft Learn MCP + Context7 for the canonical Code App bootstrap). No code/flows/Dataverse changed. No build/deploy/git run.
**Date:** 2026-06-18. **Author:** audit subagent.

> Verdict: the codebase is **far better than "poor"** — it is well-commented, layered behind a clean data seam, has a real offline test gate, and the Azure Functions handle secrets correctly (Key Vault refs, redacted `repr`, fail-soft). The real problems are a **small number of concentrated, high-severity items**: (1) a hardcoded Azure Function key committed in source, (2) a raw `fetch()`-to-Function path that is dead on the deployed app (CSP `connect-src 'none'`), (3) ~1.1 k lines of fabricated **mock case data** still bundled into the shipped app, (4) a likely-missing Code App SDK bootstrap (`PowerProvider`/`initialize`) that is the prime suspect for the unresolved `React.createElement … undefined` console error, and (5) a documented self-contradiction about whether the app is mock-backed or Dataverse-backed.

---

## How to read this

Each finding is `file:line -> issue -> fix -> risk`. Priorities:

- **CRITICAL** — security, a live-broken path, or a rule violation that ships to users. Do before the next `pac code push`.
- **SHOULD** — correctness/maintainability that will bite soon (dead code that misleads, swallowed errors, doc drift).
- **NICE** — hygiene, bundle size, consistency.

A **Verification** section at the end gives exact commands and live checks. **Uncertainties** are called out inline with `[VERIFY LIVE]`.

---

## CRITICAL

### C1. Hardcoded Azure Function key committed in source (and in a doc, and baked into the bundle)
- **Where:**
  - `mockup-app/src/data/parser-config.ts:35` — `functionKey: 'A31IJ9kySfjhR-9bizHWvjWoXk7uDvEuLfDcd1gkJnWxAzFuzYZHaA=='`
  - `docs/activation/email-intake-activation.md` — same literal (confirmed by repo-wide grep: the key appears in exactly these two files).
  - Transitively baked into `mockup-app/dist/assets/index-*.js` on every `vite build` (dist is gitignored, but every deployed/shared build embeds it client-side).
- **Issue:** A FUNCTION-level key for `cespike-parser-dev-x7xt3d5ovhi7y` is a **bearer credential**. Anyone with the static site bundle (or repo read access) can call `POST /api/parse` directly. The in-file comment rationalises it as a "non-sensitive dev key for a throwaway sandbox", but: (a) it is a real working credential against a real deployed Function; (b) it normalises secret-in-source; (c) it would be copied forward into prod if the file is the template. The ground-truth note in the task explicitly says to flag this **even though** it is labelled non-sensitive, and to move it into the connection.
- **Fix (layered):**
  1. **Stop shipping the key from the client at all.** The deployed Code App cannot use this path anyway (see C2) — the production path is the **CE Parser custom connector** (`cr1bd_ceparser`, apiId suffix `new_collision-20engineers-20parser`) via the `@microsoft/power-apps` SDK, where the key lives in the **connection**, not the app. Wire the connector (`pac code add-data-source -a <ceparser apiId> -cr cr1bd_ceparser -s <solutionId>`), then call the generated service instead of `fetchParserTransport`. This is already tracked as task #27.
  2. **Until the connector lands:** remove the literal default. Make `functionKey` default to `''` and require `configureParser({ functionKey })` to inject it (e.g. from a Dataverse environment variable surfaced at runtime, or a local-dev `.env` that is gitignored). The app must not carry a working key as a source constant.
  3. **Rotate the key** in Azure after it is removed from source, because it is already in git history: `az functionapp keys list/set -g rg-collisionspike-dev -n cespike-parser-dev-x7xt3d5ovhi7y` (or regenerate the specific function key via the portal / `az rest`). Treat the current value as burned. `[VERIFY LIVE]` — confirm the key is still the active one before rotating (read-only `az functionapp function keys list`).
  4. Scrub the literal from `docs/activation/email-intake-activation.md` (replace with `<set at activation>` / a Key Vault reference note).
- **Risk if untouched:** Credential leak; unauthorised parser invocation / quota abuse; precedent that lands a secret in the prod build. **Low effort, high impact.**

### C2. Raw `fetch()` to the Function + embedded key — dead on the deployed app (CSP), misleading as "the path"
- **Where:** `mockup-app/src/data/parser-client.ts:222-240` (`fetchParserTransport` does `fetch(parserUrl(), { headers: { 'x-functions-key': cfg.functionKey } })`); reached from `ManualIntake.tsx:276` (`parseDocument(...)`).
- **Issue:** The Code App player enforces **CSP `connect-src 'none'`** (ground truth + `parser-config.ts:8-11` admits it). A raw cross-origin `fetch` to `*.azurewebsites.net` is **blocked in the deployed app** and only works on `localhost`/unit tests. So "Manual intake" is **non-functional once pushed** — the primary demo path silently fails in production. This is the canonical Code App anti-pattern: all external calls must go through a Power Platform connector via the SDK, never a raw `fetch`.
- **Fix:** Same as C1.1 — route through the **CE Parser custom connector** generated service (same-origin, key in the connection). Keep `ParserTransport` as the injection seam (tests still inject a fake), but the **default** transport must call the generated connector service, not `fetch`. The adapter (`adaptParserResponse`, `parserSourceToType`, key bridges) is good and stays. After the connector default is in place, delete/retire `fetchParserTransport` (or keep it `export`ed only for local-dev behind an explicit opt-in, clearly commented "localhost only").
- **Risk if untouched:** The headline manual-intake feature is broken in the deployed app; demos fail; the team debugs a "works locally" ghost. Tightly coupled to C1 — fix together. `[VERIFY LIVE]` — after wiring, confirm in the deployed app DevTools that no request goes to `azurewebsites.net` and the connector call succeeds.

### C3. ~1,100 lines of fabricated MOCK CASE DATA still bundled into the shipped app
- **Where:** `mockup-app/src/mock/cases.ts` (757 lines, ~10 fabricated `Case` objects with fake claimants e.g. `Mr A. Driver`, `a.driver@example.com`, `07700 900123`), `src/mock/activity.ts` (73), `src/mock/evidence.ts` (15), `src/mock/providers.ts` (49). Wired via `src/data/mock-source.ts`, which is the **default** value of the seam selector (`src/data/index.ts:153 let active: DataAccess = mockDataAccess`).
- **Issue:** Project rule (CLAUDE.md + task): **no mock case data**. At **runtime** the rule is technically satisfied because `main.tsx:17` calls `configureDataAccess(generatedServices)`, flipping the seam to Dataverse before first render — and no screen imports the mock case data directly (verified: zero `from '../mock/cases'` in `src/screens` or `src/components`). **But** the fabricated data is still **compiled into `dist`** (dead weight ~30 KB of source) and, more importantly, it is the **fallback that renders if the Dataverse injection ever throws or is reverted** — a foot-gun that could surface fake claimant data in a live UI. It also muddies the "is this app mock or live?" question (see C4/S1).
- **Fix:**
  1. **Split `src/mock/` into `src/domain/` (keep) and delete the fabricated data.** The directory currently fuses three concerns:
     - **Pure types** — `mock/types.ts` (285 lines: `Case`, `Evidence`, `Provider`, `EvaFields`, status unions). **Keep** — it is the domain model, imported everywhere. Move to `src/domain/model.ts` (or `src/data/model.ts`) and update imports.
     - **Pure helpers** — `mock/queues.ts` (307; `QUEUES`, `statusToQueue`, windowing) and `mock/intake.ts` (176; `dueInfo`, `suggestCasePo`, `reasonVerb`). **Keep** — pure, re-used by both sources. Move alongside the types.
     - **Fabricated case data** — `mock/cases.ts`, `mock/activity.ts`, `mock/evidence.ts`, `mock/providers.ts`. **Delete** (or move under `src/__fixtures__/` excluded from the build and used only by tests, if any test depends on them — check first: `vitest` runs `src/**/*.test.ts`; confirm none import the data arrays).
  2. **Replace `mock-source.ts` with an explicit empty/throwing default.** Make the seam's default `DataAccess` either (a) a tiny "unconfigured" source whose methods reject with `new Error('Data source not configured — call configureDataAccess() in main.tsx')`, or (b) keep a minimal in-memory empty source (returns `[]`/`undefined`) for storybook/tests, but with **no fabricated rows**. Either way, remove `cases.ts`-backed responses from anything that can render in the deployed app.
  3. Rename the directory `mock/` → `domain/` so the name stops asserting "mock".
- **Risk if untouched:** Rule violation in spirit; fake PII-shaped data one injection-failure away from a live screen; dead bundle weight; ongoing confusion about the app's data posture. **Medium effort** (mechanical import churn across ~10 files), high clarity payoff.

### C4. Self-contradiction: code/docs say "mock-backed by default, grep-gate green"; runtime is Dataverse-backed
- **Where:** `src/data/index.ts:20` + `:153` (comments: "the seam keeps the offline build mock-backed so the grep gate passes", default `= mockDataAccess`) vs `src/main.tsx:17` (`configureDataAccess(generatedServices)` — switches to Dataverse), and `generated-services.ts` imports the real `@microsoft/power-apps`-backed services. `vite.config.ts:9` repeats the "mock-backed offline, Dataverse-backed once configured" framing.
- **Issue:** The whole "no `@microsoft/power-apps` import in `src`" grep gate the comments lean on is **already false**: `src/data/generated-services.ts` and the seven `src/generated/services/*` files import `@microsoft/power-apps`, and `main.tsx` imports `generated-services`. So the offline boundary the comments describe does not exist for the real entry point — only for the (now somewhat academic) `dataverse-source.ts` module-in-isolation. This is the kind of stale comment that makes a "poor" reputation: the mental model in the comments no longer matches the wiring.
- **Fix:** Decide and document the **single** posture: *"The app is Dataverse-backed. `main.tsx` injects the generated services at startup. The seam exists so screens never import a pac service directly and so tests can inject a fake."* Then:
  - Update the comment blocks in `index.ts`, `types.ts`, `dataverse-source.ts`, `generated-services.ts`, `vite.config.ts` to stop claiming a mock-backed default / SDK-free `src`.
  - If a "grep gate" for SDK imports still runs anywhere, **scope it** to the seam modules that are genuinely meant to stay SDK-free (`dataverse-source.ts`, `parser-client.ts`, `adapter.ts`) rather than all of `src`. `[VERIFY]` — search the repo for the grep-gate script that enforces this (not found under `verify-all.mjs`; it may be a hook or a doc-only claim — confirm and either fix or retire it).
- **Risk if untouched:** Misleading docs erode trust and cause wrong edits (someone "restores the offline default" and breaks live data, or vice-versa). **Low effort.**

### C5. Missing Code App SDK bootstrap (`PowerProvider` / `initialize`) — prime suspect for the `React.createElement … undefined` error AND a live-data correctness risk
- **Where:** `mockup-app/src/main.tsx` renders `<FluentProvider><App/></FluentProvider>` directly. There is **no `PowerProvider`** and **no `await initialize()`** from `@microsoft/power-apps`. `index.html:10` loads `/src/main.tsx`. Meanwhile every generated service constructs its client at **static-field load time** (`Cr1bd_casesService.ts:17 private static readonly client = getClient(dataSourcesInfo)`), which runs as soon as `generated-services.ts` is imported by `main.tsx`.
- **Issue:** The canonical Power Apps Code App scaffold (Microsoft `PowerAppsCodeApps` template, confirmed via Context7) has a **`PowerProvider.tsx`** described as *"the central configuration point for the Power Apps SDK"*, and the official HelloWorld troubleshooting says: *"If you encounter … a persistent 'fetching your app' loading screen or an 'App timed out' error … verify that there are no problems within the `PowerProvider.tsx` file."* This app has none. Consequences:
  - **Strong candidate for the unresolved `React.createElement: type is invalid … undefined` console error** noted in `CURRENT_STATUS.md:24` and task #29 ("chase React undefined error" — marked done but the symptom persists). The error means a component rendered to JSX was `undefined`. After verifying that **all lucide-react icon names used DO resolve in the installed 0.456.0** (checked every icon across `StatusBadge`, `AppShell`, `Dashboard`, `CaseList`, `CaseDetail`, `Admin`, `EvaSubmitDialog`, `ChaserPanel`, `ProvenanceBadge`, `ImageOrderList`, `AsyncStates`, `PipelineStrip`, `JsonView`, `DedupDecisionDialog`, `ManualIntake`, `ReadinessChecklist` — none missing) and that all Fluent v9 imports resolve at compile time (tsc passes), the remaining likely sources of a *runtime-only* undefined component are (a) the **absent `PowerProvider`/SDK init** leaving an expected host wrapper undefined, or (b) a barrel/circular-import ordering issue in `src/components/index.ts` / `src/data/index.ts`. The Provider gap is the highest-probability, easiest-to-test cause.
  - **Live-data correctness:** without an explicit `initialize()`/provider, the SDK client may not be ready when the first `getAll()` fires, producing the "fetching your app" hang or silent empty data on the deployed player. `[VERIFY LIVE]` — this is the single biggest open question (see Uncertainties).
- **Fix:**
  1. Add `src/PowerProvider.tsx` exactly as the Microsoft Vite template emits it (it imports from `@microsoft/power-apps`, calls the SDK initializer in a `useEffect`, gates rendering on a ready state, and renders `children`). The cleanest way to get the *correct* current shape is to scaffold a throwaway template (`npx degit github:microsoft/PowerAppsCodeApps/templates/vite _ref`) and copy its `PowerProvider.tsx` + `main.tsx` bootstrap, then re-apply the CE `FluentProvider`/`Toaster`/router on top.
  2. Wrap `<App/>` (and ideally the data-source injection) so `configureDataAccess(generatedServices)` runs **after** the SDK reports ready, not at module top-level.
  3. Re-test the console: the `React.createElement … undefined` error should disappear. If it does not, fall back to bisecting the barrels (temporarily import screens directly in `routes.tsx` to find the `undefined` export).
- **Risk if untouched:** The app may hang on "fetching your app" or render empty/late data on the live player; the console error persists; the team keeps chasing a ghost. `[VERIFY LIVE]` **required** — confirm the deployed app actually initializes and loads Dataverse data before declaring this fixed. **This is the top open question.**

---

## SHOULD

### S1. Dead dedup write — decision is `console.info`-only, never persisted
- **Where:** `src/screens/DedupDecisionDialog.tsx:173-180` (`logIntent` → `// MOCK: no backend write` + `console.info('[dedup] decision (mock, not persisted)', …)`), toasts "Link accepted (mock)".
- **Issue:** The `/case/:caseId/dedup` route renders a real decision UI whose Accept/Keep-separate actions **do nothing** — no Dataverse write, no status change to `linked_to_instruction`. It only logs and toasts "(mock)". On the live app this is a dead action masquerading as functional, and the user-visible "(mock)" string leaks prototype language into production.
- **Fix:** Either (a) implement the write through the seam (`data.updateCase`/a new `linkCases` method → set `cr1bd_status` to `linked_to_instruction` / write the dedup decision audit event), or (b) if dedup-decision persistence is genuinely out of M1 scope, **disable the route/buttons** and label them honestly ("Coming soon" / hide), and remove the `(mock)` toast copy. Do not ship a live button that silently no-ops.
- **Risk:** Staff believe a dedup decision was recorded when it was not → data-integrity/process failure. Medium.

### S2. Swallowed-error sites — audit each for silent data loss
- **Where (catch-with-empty / `.catch(() => …)`):**
  - `src/data/dataverse-source.ts:198-202` — per-field provenance `create` failures are swallowed in a loop (`catch {}`), by design ("provenance is supplementary"). **Acceptable**, but currently **invisible**: a systemic failure (e.g. wrong column) would silently drop *all* provenance with no signal.
  - `src/data/adapter.ts:351` — `JSON.parse` of provider domains falls through to newline parse on `catch {}`. **Fine** (intentional format fallback).
  - `src/components/ChaserPanel.tsx:143` & `src/components/JsonView.tsx:56` — clipboard `catch` shows an error toast. **Fine.**
  - `src/data/parser-client.ts:234` — `res.text().catch(() => '')` on an already-failed HTTP path. **Fine.**
- **Issue:** Only the provenance-loop swallow (dataverse-source) is a real risk — a swallowed *systemic* failure looks like success.
- **Fix:** In the provenance loop, count failures and surface a single aggregate signal when `>0` (e.g. include `{ provenanceWritten: n, provenanceFailed: m }` in `CreateCaseResult`, or `console.warn` once with the count). Keep per-row tolerance; just stop being fully silent on a mass failure.
- **Risk:** Low-medium; provenance is supplementary, but silent total loss is the kind of thing that erodes trust later.

### S3. `any`-typed seam edges and the Proxy forwarder
- **Where:**
  - `src/data/index.ts:179-184` — `data` is a `Proxy({} as DataAccess, { get(...) (active as unknown as Record<string, unknown>)[prop] })`. Works, but defeats type-checking on the `data` handle and is non-obvious.
  - `src/data/generated-services.ts:52-72` — `GeneratedServiceClass` methods typed with `never` params + a `as unknown as` bridge cast.
  - `src/data/parser-client.ts:198` — `out as unknown as EvaFields` (then narrowed). `src/contracts/eva-export.test.ts:83` — test-only `as unknown as`.
- **Issue:** These are **contained, commented, and largely justified** (structural bridge to pac-generated classes; enum-narrowing). Not bugs. But the `data` Proxy is the one that loses real safety: a typo'd member on `data.foo()` won't be caught.
- **Fix (NICE-leaning):** Replace the Proxy with a thin typed delegator object (one arrow per `DataAccess` member calling `getDataAccess().<member>(...)`) — ~25 lines, fully typed, no `as unknown as`, same swap semantics. Leave the generated-services bridge cast as-is (it is the correct seam boundary) but keep it confined to that one file (already is).
- **Risk:** Low. Maintainability only.

### S4. `void`-to-silence-unused patterns hint at vestigial imports/vars
- **Where:** `src/data/dataverse-source.ts:356 void QUEUES;` (import kept alive "for readers"); `src/screens/ManualIntake.tsx:338 void parsed;` (`parsed` state is set but only `void`-ed); `src/generated/services/Cr1bd_evidencesService.ts:85 void id; void columnName; …` (unused params on a stub that throws).
- **Issue:** `void X` to defeat `noUnusedLocals/Parameters` is a smell that the binding is vestigial. `dataverse-source.ts` imports `QUEUES` only to `void` it — either use it (the windowing helpers already call `queueByName`, so `QUEUES` itself may be genuinely unused) or drop the import. `ManualIntake`'s `parsed` state is stored and never read (the screen uses `fields`/`vrm`/`casePo` instead) — dead state.
- **Fix:** Remove the unused `QUEUES` import from `dataverse-source.ts` (and the `void`); remove the `parsed`/`setParsed` state from `ManualIntake` (keep `setFields` etc.). The evidence-service `void`s are fine (deliberate stub).
- **Risk:** Low. Dead state/imports; trivial cleanup.

### S5. Generated `upload()` stub throws — confirm no caller, then leave or delete
- **Where:** `src/generated/services/Cr1bd_evidencesService.ts:84-91` — `upload(...)` rejects with "not supported by @microsoft/power-apps 1.0.3".
- **Issue:** A generated file was **hand-edited** ("KNOWN-ISSUE FIX") to make a non-compiling `uploadFileToRecord` body throw. Editing autogenerated files is fragile (next `pac code add-data-source` regenerate overwrites it and may re-break the build). M1 binds Evidence read-only, so the method is unused.
- **Fix:** Confirm zero callers (grep: only the definition exists — verified, no `.upload(` calls in `src`). Document in the data README that Evidence is read-only and that a regenerate will reintroduce the broken `upload` body (so the fix must be re-applied or the method deleted post-generate). Optionally delete the method entirely rather than throw. Track the SDK file-upload gap as the real blocker for image upload.
- **Risk:** Low now; **medium at next regenerate** (silent build break). Worth a README note.

### S6. Doc drift — `package.json` description and `vite.config.ts` still say "mock data only" / prototype
- **Where:** `mockup-app/package.json:6` (`"… (standalone Vite + React 18 + Fluent UI v9, mock data only)."`), `vite.config.ts:9-11` comment.
- **Issue:** The app is a deployed, Dataverse-wired Code App (`power.config.json` has `appId`, env id, 7 Dataverse data sources). "mock data only" is stale and reinforces C4's contradiction.
- **Fix:** Update the `description` to reflect the live posture (e.g. "Collision Engineers case-intake Code App — React 18 + Fluent UI v9 + Vite, Dataverse-backed via the @microsoft/power-apps SDK"). Align the vite comment.
- **Risk:** Low. Clarity.

---

## NICE

### N1. Bundle size / unused-ish deps
- **Where:** `mockup-app/package.json`. Single `dist/assets/index-*.js` is **1.05 MB** (unsplit).
- **Findings:**
  - `lucide-react ^0.456.0` — used widely (fine), but the app pulls icons by name; ensure tree-shaking is effective (Vite + ESM named imports → it should be). No action beyond confirming the per-icon import style (already used).
  - `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — used by `ImageOrderList` (drag-reorder of EVA photos). **In use** (verified `buildEvaImageOrder`/sortable in `ImageOrderList.tsx`). Keep.
  - `ajv` + `ajv-formats` (devDeps) — used only by `src/contracts/eva-payload.schema.test.ts`. **Correctly devDeps.** Keep.
  - No obviously-unused runtime dep found. (`react-router-dom`, `@fluentui/react-components`, `@microsoft/power-apps` all used.)
- **Fix:** Optional: add manual chunking / `build.rollupOptions.output.manualChunks` to split Fluent + vendor from app code so the player caches vendor across deploys. Low priority for a spike.
- **Risk:** Negligible. Perf only.

### N2. `useAsync` deps lint-suppression is correct but load-bearing — add a guard test
- **Where:** `src/data/hooks.ts:43-74` (`// eslint-disable-next-line react-hooks/exhaustive-deps`, `run` deliberately excluded from deps; `cancelled` guard).
- **Issue:** The pattern is sound and well-explained, but it is the kind of subtle hook that breaks under refactor (someone "fixes" the lint and reintroduces a fetch loop on every render / on the mock↔Dataverse swap).
- **Fix:** Add a small vitest for `useAsync` (or the public hooks) asserting that swapping the source via `configureDataAccess` does **not** re-trigger, and that input change does. (Requires a jsdom test env; current `vitest` is `node`-only — would need a second project or `@testing-library/react` — hence NICE, not SHOULD.)
- **Risk:** Low. Regression insurance.

### N3. Minor consistency / cosmetics
- `src/screens/CaseList.tsx:172` matched the `TODO|HACK` grep only incidentally (it is `spacingVerticalXXXL` in a style — **not** a real TODO). No action. (Recorded so a future grep does not re-flag it.)
- The "(mock)" user-facing strings in `DedupDecisionDialog` (see S1) are the only prototype-language leak into UI copy found. Fix with S1.
- `ManualIntake.tsx` accepts `.doc`/`.msg` (`ACCEPT` line 162) — confirm the FC1 parser actually supports legacy `.doc`/`.msg` server-side (the readers exist: `readers/doc.py`, `readers/email.py`), else trim the accept list to avoid user-facing parse failures. `[VERIFY]` against `functions/parser/cedocumentmapper_v2/readers`.

---

## What is GOOD (do not "fix")

To prevent over-cleaning, these were checked and are sound:

- **Azure Functions secret hygiene** — `functions/enrichment/dvla_client.py` / `dvsa_client.py` read keys from `os.environ` (Key Vault refs), `repr` is `<redacted>`, tests assert secrets never appear in logs/responses (`test_enrich.py:251-280`), fake secrets carry `# noqa: S105`. `function_app.py` gates on `ENRICHMENT_ENABLED` at the edge and is fail-soft (always 200). No hardcoded secrets in `functions/**`.
- **Parser Function** — `AuthLevel.FUNCTION` (key required), structured 400/502 envelope, schema-validates but returns 200 with issues so incomplete extractions route to review. Clean.
- **Intake flow** (`flows/definitions/intake.definition.json`) — mailbox is a **parameter** (never hardcoded), `MinIntakeDate` backlog guard, Message-ID dedup (ADR-0010) with `concurrency=1`, graceful provider gating (`runAfter: [Succeeded, Failed]`, unassigned fallback). The `hasAttachments=true` is flagged in-comment as temporary. (Note: task #26 "Fix intake Resolve_provider exact-match" is a known follow-up — the `contains(cr1bd_knownemaildomains, …)` filter is a substring match, not exact; that is a flow-correctness item tracked separately, not a code-audit cleanup.)
- **Seed scripts** (`dataverse/.build/15-seed-emaildomains.ps1` etc.) — dry-run by default, additive/idempotent, ambiguity guard, no invented data, no inbox/Box/EVA contact.
- **Test gate** (`verify-all.mjs`) — aggregates Code App build+vitest, Dataverse parity, flow linter, and (when venvs exist) Function pytest; pure offline.

---

## VERIFICATION

> Build/test gates are **noted, not run** here (per task). The commands below are what a follow-up should execute after applying fixes. Nothing in this plan was deployed.

### Static / offline (no login)
1. **Full offline gate:** `node verify-all.mjs` (from repo root) — must end `OK`. Specifically re-run after C3 (mock split) and C5 (PowerProvider) to confirm `tsc -b && vite build` + `vitest` still pass.
2. **Type-check + build alone:** `cd mockup-app && npm run build` (runs `tsc -b && vite build`). After C3/C4/C5 this catches broken imports from moving `mock/` → `domain/`.
3. **Unit tests:** `cd mockup-app && npm run test` (vitest, `src/**/*.test.ts`). Confirm `parser-client.test.ts`, `adapter.test.ts`, the contract tests still green after retiring `fetchParserTransport` as the default.
4. **Flow linter:** `node flows/validate-flows.mjs` — confirm no regressions (it checks state=off, connection refs, secrets, dedup parity).
5. **Secret scan after C1:** grep the source and the built bundle for the old key — both must be clean:
   - `rg -n "A31IJ9kySfjhR" mockup-app/src docs` → **no hits**.
   - `rg -n "x-functions-key" mockup-app/src` → only inside an explicitly local-dev-gated path (or none).
   - after `npm run build`: `rg -n "A31IJ9kySfjhR" mockup-app/dist` → **no hits**.
6. **Mock-data removal (C3):** `rg -n "from '../mock/cases'|mockCases|caseById\(" mockup-app/src/screens mockup-app/src/components` → **no hits** (already true; re-confirm after the split); and confirm `src/mock/cases.ts` (or its successor fixture) is not reachable from `mock-source`'s production default.
7. **Undefined-component bisect (C5), offline:** `cd mockup-app && npm run dev`, open `http://localhost:5173`, watch the console. If `React.createElement … undefined` persists after adding `PowerProvider`, temporarily replace the `src/components/index.ts` / `src/data/index.ts` barrels with direct imports in `routes.tsx` to localise the `undefined` export.

### Live (read-only first; writes only with the operator)
8. **Parser key state (C1.3)** `[VERIFY LIVE, read-only]`:
   - `az functionapp function keys list -g rg-collisionspike-dev -n cespike-parser-dev-x7xt3d5ovhi7y --function-name parse` (confirm the committed key is the active default before rotating). Then rotate via portal / `az` and re-test the connector path.
9. **CE Parser connector wiring (C1.1/C2)** `[VERIFY LIVE]`:
   - `pac connection list` → confirm `cr1bd_ceparser` connection id + apiId.
   - `pac code add-data-source -a <ceparser apiId> -cr cr1bd_ceparser -s <solutionId>` (or `-c <connectionId>`), then call the generated parser service from `parser-client.ts`'s default transport.
   - Deploy: `cd mockup-app && npm run build && pac code push`. In the deployed app, run Manual Intake on a sample PDF; in DevTools confirm **no** request to `*.azurewebsites.net` and a successful same-origin connector call.
10. **SDK init / data load (C5)** `[VERIFY LIVE — TOP OPEN QUESTION]`:
    - After adding `PowerProvider` + `pac code push`, open the deployed app. Confirm it does **not** hang on "fetching your app", the dashboard/queues render **real Dataverse rows** (or an honest empty state if tables are unseeded), and the `React.createElement … undefined` console error is gone. If the app still hangs, the Provider shape is wrong — re-copy from a freshly-scaffolded `templates/vite` `PowerProvider.tsx`.

---

## UNCERTAINTIES — flag & how to verify

- **[TOP] Root cause of `React.createElement … undefined`.** Best hypothesis: missing `PowerProvider`/SDK init (C5). All lucide icons used were verified present in 0.456.0 and tsc passes, ruling out the obvious named-import causes; a runtime-only undefined points at the host wrapper or a barrel/circular-import ordering issue. **Verify** by adding `PowerProvider` first (cheapest, highest-probability), then bisecting barrels if it persists (step 7). Until reproduced in the deployed player, treat as unconfirmed.
- **Whether a "no `@microsoft/power-apps` in `src`" grep gate is actually enforced anywhere** (C4). It is referenced in comments but not present in `verify-all.mjs`. **Verify** by searching for a hook/script that runs such a grep (`.claude/` hooks, CI, `AGENTS.md`); if none, the comments are aspirational and should be corrected; if one exists, scope it to the seam modules only (it would currently be failing or be mis-scoped, since `generated-services.ts`/`src/generated/**` import the SDK).
- **`pac code add-data-source` regenerate risk** (S5). The hand-edited `Cr1bd_evidencesService.upload` will be overwritten on regenerate and may re-break the build. **Verify** by reading current `pac`/SDK release notes for a file-upload API before any regenerate; document the re-apply step.
- **Parser `.doc`/`.msg` support on FC1** (N3). The readers exist in source but FC1 Flex Consumption **cannot run custom binaries** (ground truth) — legacy `.doc` may rely on something unavailable. **Verify** by testing a `.doc`/`.msg` through the deployed parser; trim `ACCEPT` if it fails.
- **Does any test depend on the fabricated `cases.ts` arrays?** (C3). Grep showed screens/components do not; confirm `src/**/*.test.ts` do not import the data arrays before deleting (they appear to test pure functions, not the mock rows). **Verify** with `rg -n "mock/cases|mockCases|cases\b" mockup-app/src/**/*.test.ts`.

---

## Suggested execution order (smallest blast radius first)

1. **C1.2 + C1.4** (remove key literal from `parser-config.ts` + the doc) — pure deletion, unblocks the secret-scan gate. Then **C1.3** rotate (operator).
2. **C4 + S6** (fix the mock-vs-Dataverse comments/description) — doc-only, removes the contradiction before touching wiring.
3. **C5** (add `PowerProvider`/`initialize`) — most likely fixes the console error and de-risks live data; test offline then live.
4. **C2 + C1.1** (route parser through the CE connector; retire the default `fetch`) — the real functional fix for Manual Intake; needs the connector (task #27).
5. **C3** (split `mock/` → `domain/`, delete fabricated case data, neuter the default source) — mechanical churn; do after C4/C5 so the seam story is settled.
6. **S1, S2, S4, S5** (dead dedup write, provenance-failure signal, vestigial `void`s, evidence-stub note).
7. **S3, N1, N2, N3** (typed delegator, chunking, hook test, cosmetics) as time allows.

Re-run `node verify-all.mjs` after each of steps 3–6.
