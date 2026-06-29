# Environment bootstrap — Linux/WSL2 (handoff)

**Date:** 2026-06-28 · **Owner:** env-bootstrap (task #3 / board id "1") · **Host:** fresh Linux/WSL2 clone of
a repo previously developed on Windows.

**Bottom line:** `node verify-all.mjs` is **GREEN** — **10 passed, 0 failed, 3 skipped** (exit 0). The 3
skips are intentionally-retired Power-Platform gates, not failures (details below). The live TypeScript
stack (`@cs/domain` + `api/` + `orchestration/`) also builds clean and the JS tests pass.

---

## 1. Tool versions (verified present)

| Tool | Version | Notes |
|---|---|---|
| Node | v24.14.0 | via nvm (`~/.nvm/versions/node/v24.14.0`) |
| npm | 11.12.1 | global prefix is the nvm dir — **user-writable, no sudo needed** |
| pnpm | 10.33.4 | available but **not used** (repo is an npm-workspaces monorepo; pnpm doesn't read `workspaces`) |
| Python | 3.12.3 | system `python3`; venvs created from it |
| func (Azure Functions Core Tools) | **4.12.1** | installed this session — see §2 |
| tesseract | **5.3.4** | installed this session (OCR binary) — see §5 |
| git user | Codex | branch `main` |

## 2. Azure Functions Core Tools

Installed **without sudo** — the nvm npm global prefix is already user-writable, so no `npm config set
prefix` / PATH change was needed:

```
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

`func --version` → `4.12.1`, resolves to `~/.nvm/versions/node/v24.14.0/bin/func` (already on PATH via nvm).
**No operator action required.**

## 3. npm install (TypeScript / JS)

The repo is an **npm-workspaces monorepo** (root `package.json` → `workspaces: ["packages/*",
"mockup-app", "api", "orchestration"]`). A single `npm install` at the repo root installs and hoists all
four workspaces:

| Workspace | Result |
|---|---|
| `packages/domain` (`@cs/domain`) | installed (hoisted) |
| `mockup-app` (SPA) | installed (hoisted) |
| `api` (`@cs/api`, Data API) | installed (hoisted) |
| `orchestration` (`@cs/orchestration`) | installed (hoisted) |

Root `npm install`: **298 packages added, 0 errors** (4 audit advisories — 3 moderate, 1 high — pre-existing,
not addressed; `npm audit fix --force` deferred to avoid breaking-change churn).

### Linux-specific fix — rollup native binary (npm bug #4828)
`mockup-app` build initially failed with `Cannot find module @rollup/rollup-linux-x64-gnu`. The Windows-authored
`package-lock.json` lists the Linux binary as an *optional* dep, but npm's optional-deps bug installed **no**
`@rollup/*` platform package. Fixed **without mutating the committed lockfile**:

```
npm install --no-save @rollup/rollup-linux-x64-gnu@4.62.0   # version matched from package-lock.json
```

> **Operator note:** because this used `--no-save`, the binary lives only in local `node_modules`. A clean
> `rm -rf node_modules && npm install` may need it re-added, **or** regenerate the lockfile on Linux with
> `rm -rf node_modules package-lock.json && npm install` (the npm-recommended permanent fix; changes the
> committed lockfile, so left for the operator to decide).

## 4. Python venvs (Azure Functions suites)

Created a per-suite `.venv` (Python 3.12.3) and `pip install -r requirements.txt -r requirements-dev.txt`
for **all 7** suites. `.venv/` is gitignored (local only). All succeeded:

| Suite | Path | venv |
|---|---|---|
| parser | `functions/parser` | OK |
| enrichment | `functions/enrichment` | OK |
| evasentry | `functions/evasentry` | OK |
| evavalidation | `functions/evavalidation` | OK |
| location-suggest | `functions/location-suggest` | OK |
| box-webhook | `functions/box-webhook` | OK |
| ocr | `ocr` (repo root, not under `functions/`) | OK |

Re-create any suite with:
```
cd <suite> && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
```

## 5. Linux-specific fix — tesseract (OCR) for the parser suite

The parser suite's `test_engine_smoke.py::test_engine_end_to_end[acsp_scan_01]` failed:
`provider mismatch — expected 'acsp', got 'unknown_temp'`. Root cause: `ACSP SCAN 01.pdf` is a **scanned PDF
with zero text layer** (0 chars via PyMuPDF), so provider detection needs OCR. `requirements.txt` ships
`pytesseract` — a **pure-Python wrapper that is a no-op without the `tesseract` system binary** — which was
absent. This is an environment gap (the Windows dev had tesseract), **not** an engine bug, so the vendored
engine was **not touched**.

Fixed by installing the binary (passwordless sudo was available on this host):
```
sudo apt-get install -y tesseract-ocr     # → tesseract 5.3.4
```
After install the parser suite passes for real: **110 passed, 16 skipped**.

> If an operator host lacks passwordless sudo, install `tesseract-ocr` via your package manager; without it
> the single scanned fixture (`acsp_scan_01`) is the only casualty and the rest of the suite still passes.

## 6. Repo fix — stale test path (evasentry)

`functions/evasentry/tests/test_eva_cross_transport_parity.py` hard-coded
`mockup-app/src/contracts/eva-export.ts`, but that contract **moved to
`packages/domain/src/contracts/eva-export.ts`** during the Power-Platform→Azure migration (commit `d3ae145`;
the SPA now imports it from the `@cs/domain` package). Updated the one path constant `EVA_EXPORT_TS` to the
live location — same parity assertion, now points at the file that exists. Suite: **47 passed**. (Not a Linux
issue — it would fail on Windows too; a genuine refactor-staleness bug.)

## 7. `verify-all.mjs` — gate-by-gate result

`verify-all.mjs` is the **Power-Platform-era offline gate**; the 2026-06-27 migration purge (commit `5eac80e`)
deleted three of its targets but left the script referencing them. Final run after fixes:

| Gate | Status | Notes |
|---|---|---|
| Code App — tsc + vite build | **PASS** | after the rollup-binary fix (§3) |
| Code App — vitest | **PASS** | 51 tests |
| Dataverse — schema parity | **SKIP** | target `dataverse/verify-parity.mjs` **deleted** in purge `5eac80e`; Dataverse decommissioned, live SoR is Postgres `cespk-pg-dev` |
| Flows — definition linter | **SKIP** | target `flows/validate-flows.mjs` (+ all `flows/`) **deleted** in purge `5eac80e`; flow logic re-implemented in `api/` + `orchestration/` |
| Function parser — pytest | **PASS** | 110 passed, 16 skipped (after tesseract, §5) |
| Function enrichment — pytest | **PASS** | |
| Function evasentry — pytest | **PASS** | after the path fix (§6) |
| Function evavalidation — pytest | **PASS** | |
| Function location-suggest — pytest | **PASS** | |
| Function box-webhook — pytest | **PASS** | |
| Function ocr — pytest | **PASS** | |
| Code App — no uploadFileToRecord in generated services | **PASS** | scans 0 files (`src/generated/` removed with the connector era) — harmless |
| Code App — no raw external calls outside connector seam | **SKIP** | **superseded by the live REST+MSAL architecture** — the Power-Platform connector seam was decommissioned; the SPA now `fetch()`es the Data API directly (AGENTS.md runtime-truth #1, banded HISTORICAL). The live boundary is CORS + MSAL on `cespk-api-dev`, not a static fetch-ban |

**Result: `OK — 10 passed, 0 failed, 3 skipped` (exit 0).**

### Why those 3 are SKIP, not "weakened to fake green"
All three test a **deliberately-decommissioned platform** (Power Platform, deprovisioned 2026-06-27 per
CLAUDE.md/AGENTS.md). Two have **targets physically deleted from the repo**; the third **flags the live,
correct REST+MSAL transport as if it were a violation**. They were converted to honest `skip()` calls with
reasons that cite the exact purge commit / architecture doc, kept **visible in the summary** (not silently
removed). The genuine build/test gates (SPA build, SPA vitest, all 7 Python suites, the generated-service
guard) remain enforced. Edits: `verify-all.mjs` (the 3 gates + header/footer notes), and the evasentry test
path (§6) — both committed-tracked; no `.venv`/`node_modules` are tracked.

## 8. Known gaps / recommendations for the operator

1. **`verify-all.mjs` does not yet cover the live `api/` + `orchestration/` TypeScript** (Data API +
   orchestration Function Apps). They **do** build clean here (`npm run build` at root → tsc -b, exit 0), but
   adding their build/test to `verify-all.mjs` would make the offline gate actually represent the live Azure
   stack. Left as a recommendation (scope beyond env-bootstrap).
2. **rollup lockfile** — see §3 operator note (the `--no-save` binary, or regenerate the lockfile on Linux).
3. **npm audit** — 4 pre-existing advisories (3 moderate, 1 high) left unaddressed to avoid breaking changes.
4. **pwsh not installed** — no `verify-all.mjs` gate requires it (the deleted Dataverse/flow `.ps1` build
   scripts that did are gone), so this is **not** currently blocking. Flagged only in case other tooling
   assumes pwsh.
5. Nothing was deployed; no Azure contact; nothing committed (per the brief).
</content>
</invoke>
