---
name: codeapp-lookup-write-odata-bind
description: "Code App Dataverse WRITES must bind a lookup via `<Nav>@odata.bind`, never the read-only `_<rel>_value` form; the seam bridge forwards records raw to the SDK (no transform)"
metadata: 
  node_type: memory
  type: project
  originSessionId: e3a68ae1-4438-4662-af93-32197902ca09
---

In the Code App data seam (`mockup-app/src/data/`), a **lookup column on a CREATE/UPDATE** must be bound via the navigation property **`<Nav>@odata.bind`** (e.g. `'cr1bd_Caseid@odata.bind': '/cr1bd_cases(<guid>)'`, `'EnvironmentVariableDefinitionId@odata.bind': '/environmentvariabledefinitions(<guid>)'`). The `_<rel>_value` form (e.g. `_cr1bd_caseid_value`) is a **read-only computed property — valid only in `$filter` queries**, and is silently ignored on a write (the POST then 400s on the missing required lookup, or creates an orphan row).

**Why this bites:** `generated-services.ts` `asTableService` forwards the record **raw** to the SDK's `createRecordAsync`/`updateRecordAsync` — there is **no `_value`→`@odata.bind` transform**. The pac-generated models carry BOTH forms (`"cr1bd_Caseid@odata.bind"` for writes, `_cr1bd_caseid_value` for reads). So `tsc` + vitest (with fakes that accept `_value`) stay green over a write that fails live — this is invisible until a real Dataverse write.

**How to apply:** every create/update that sets a lookup uses `@odata.bind`. Fixed 2026-06-23 across the env-var value create, the createCase note, `evaFieldToProvenanceRow`, and the **mergeCases evidence reparent** (the last was a latent pre-existing bug that would have stranded evidence on the source case). `merge.test.ts` now REJECTS a bare `_value` write so the suite guards the live shape. Relates to [[queue-case-model]], [[codeapp-envvar-tables-not-wired]].
