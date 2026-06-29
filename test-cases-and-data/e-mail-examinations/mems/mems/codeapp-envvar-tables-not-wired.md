---
name: codeapp-envvar-tables-not-wired
description: "The Code App's env-var read/write is NOT functional live — the environmentvariable* data sources aren't bridged; pac generates the GENERIC Dataverse connector (not typed services) for system tables, so it needs a custom adapter"
metadata: 
  node_type: memory
  type: project
  originSessionId: e3a68ae1-4438-4662-af93-32197902ca09
---

The Code App reads BOX_* gates (and, as of 2026-06-23, the hold-by-default toggle) from the Dataverse `environmentvariabledefinition` + `environmentvariablevalue` tables. **But those data sources are NOT wired into the seam** (`generated-services.ts` bundles only the 8 `Cr1bd_*` tables; the env-var services are declared OPTIONAL in `GeneratedServices` and are `undefined` at runtime). So **`getBoxGates()` returns all-false and `getHoldNewCasesDefault()` returns false live**, and `setHoldNewCasesDefault()` throws "not wired" → the Admin toggle shows an honest error. The features degrade gracefully but are **not functional** until wired.

**The catch (why it's not a 5-minute step):** `pac code add-data-source -a shared_commondataserviceforapps -t environmentvariabledefinition` does **not** generate a typed per-table service (like `Cr1bd_casesService` with `getAll/get/create/update`). For these SYSTEM tables it generates the **generic `MicrosoftDataverseService`** — `ListRecords(entityName, $filter…)` / `CreateRecord(prefer, accept, entityName, item)` / `UpdateRecord(...)` with an untyped `item`. So wiring needs a **hand-written adapter** that wraps those generic ops into the seam's `GeneratedTableService<TRecord>` shape (getAll→ListRecords, create→CreateRecord, update→UpdateRecord, mapping `EntityItemList.value`→`{data:[…]}`). Verified + reverted the pac add 2026-06-23 (didn't want the generic connector polluting the project or risking the live deploy).

**Deferred follow-up (shared by Box gates + hold-by-default):** build the generic-connector adapter, wire `environmentVariableDefinitions`/`environmentVariableValues` into `generatedServices`, apply `cr1bd_HOLD_NEW_CASES_BY_DEFAULT` to Dev, then the toggle + Box gates read/write live. The write shape is already correct ([[codeapp-lookup-write-odata-bind]]). Bundle this with the Box go-live. Relates to [[box-pivot-phase7-committed]].
