---
name: project-reglookup
description: "WinUI 3 standalone vehicle registration lookup tool — core context for what is being built, the APIs used, and key decisions made"
metadata: 
  node_type: memory
  type: project
  originSessionId: d7e2794f-1b74-492c-95e0-a5591e1c23b0
---

# RegLookup — WinUI 3 UK Vehicle Lookup Tool

Single-page, no-nav WinUI 3 desktop app (net8.0-windows10.0.19041.0, WindowsPackageType=None, WindowsAppSDKSelfContained=true). Calls DVLA and DVSA APIs directly — no Azure Function, no AI, no cloud intermediary.

**Location:** `C:\Users\Alex\Documents\GitHub\collisionsuite\active\mileagetool\RegLookup\`  
**Full plan:** `docs/plans/reglookup-plan.md`  
**API research:** `docs/research/dvla-dvsa-apis.md`  
**Derived data research:** `docs/research/derived-data.md`

## APIs

- **DVSA MOT History API** — OAuth2 client credentials (Microsoft Entra), Bearer token + X-API-Key
  - Credentials: DVSA_TENANT_ID, DVSA_CLIENT_ID, DVSA_CLIENT_SECRET, DVSA_API_KEY
  - Token caching with 60s expiry skew (from Python/TS connector pattern)
  - Returns: make, model, colour, fuel, engine, dates, MOT tests[], defects[] per test
- **DVLA VES v1.2.0** — static x-api-key header
  - Returns: tax status, emissions (CO2, euroStatus, RDE), additional identity fields

## Key Architecture Decisions

- Settings stored as plain JSON at `%APPDATA%\RegLookup\settings.json` (NOT PasswordVault — unpackaged apps can't reliably use it)
- `HttpClient` is App-level singleton
- Both APIs called in parallel via `Task.WhenAll`
- DVSA is primary source; DVLA supplements
- BrandResources.xaml copied from collisionrenderer (documents-red #C80A32, charcoal #2C2A27)
- MOT status semantic colors: Valid=#1A7F37, DueSoon=#B45309, Invalid=#DC2626 (deliberately NOT brand-red)
- Recalls: link-out only (HyperlinkButton to DVSA website) — CSV approach ruled out as safety liability

## Derived Data (MileageAnalysis.cs)

Port of `collisionspike/functions/enrichment/analysis.py` (itself a port of TypeScript original):
- Mileage estimation with confidence (HIGH/MEDIUM/LOW/VERY_LOW)
- Anomaly detection: DECREASE, IMPLAUSIBLE_INCREASE (>200 mi/day over >30 days), UNIT_FLIP
- Thresholds are calibrated — must be preserved exactly

Also derived from merged API data:
- ULEZ compliance (euroStatus + fuelType → Petrol≥4 or Diesel≥6 = compliant)
- Road legal status (taxed + MOT valid)
- DVSA×DVLA data cross-checks (make/colour/engine mismatches)
- Annual mileage history (from MOT odometer readings)

**Why:** The Python connector analysis.py is a tool for mileage analysis. The DVSA API also returns `defects[]` per test that the Python connector never reads — capturing these for the UI is a significant enhancement.

## Reference Projects

- `collisionrenderer` — MVVM patterns, BrandResources, DesktopStateService (settings pattern), .csproj template
- `collisionspike/functions/enrichment/analysis.py` — mileage algorithm to port to C#
- `collisionspike/functions/enrichment/dvsa_client.py` — DVSA API client reference
