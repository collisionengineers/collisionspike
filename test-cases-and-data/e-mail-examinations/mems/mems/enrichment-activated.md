---
name: enrichment-activated
description: 2026-06-20 DVLA/DVSA enrichment turned ON (ENRICHMENT_ENABLED=true) — whole chain was already built+wired; mileage is an MOT-history estimate so near-new vehicles get none.
metadata: 
  node_type: memory
  type: project
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

On **2026-06-20** DVLA/DVSA enrichment was activated in Dev. The reported "enrichment didn't
work / vehicle details + mileage missing" had ONE root cause: the Dataverse gate
`cr1bd_ENRICHMENT_ENABLED` resolved to **false** (no value row existed; default is false), so
`CS Enrich` always took its skip branch. **Fixed by creating an `environmentvariablevalue` = `true`
in the CollisionSpike solution** (flow reads the gate live each run via ListRecords, so no restart
needed). Flipping the gate is an activation Claude now performs — see [[live-services-boundary]].

The rest of the chain was already correct and is NOT the fault (verified, do not re-investigate):
- `CS Enrich` (4e0f301f) is ON and reads VRM from the case (`@outputs('Get_case')?['body/cr1bd_vrm']`,
  NOT triggerBody — the repo `enrich.definition.json` is stale on this).
- `CS Intake` calls `Run_enrich` UNCONDITIONALLY after parse (gate is checked inside enrich), passing
  only `caseId`. Order: classify→parse→enrich→status_evaluate.
- Function `cespkenrich-fn-gi62sd` (RG `rg-collisionspike-dev`) is Running; route
  `POST /api/dvsa-mot/enrich`; edge `ENRICHMENT_ENABLED` app setting already true; DVSA/DVLA creds
  present as PLAIN app settings (not the Key Vault refs the bicep intends — hygiene deviation, not a
  blocker). DVSA is primary (gives vehicle_model+make+mileage); DVLA is a make-only fallback.
- Custom connector + connection `ce0d69449a88437699c27dcaad721c56` (`cr1bd_dvsaenrich`) is Connected
  to the function host. (The live-environment.md "cr1bd_dvsaenrich = Unbound" row is STALE.)

Verified live by calling the function directly (x-functions-key): **BC23JZE → "REXTON"/SSANGYONG**,
**L333FGN → "220I M SPORT AUTO"/BMW**. Enrichment writes ONLY into empty fields:
`vehicle_model`→`cr1bd_evavehiclemodel` if empty; mileage→`cr1bd_evamileage` only when the document
had none (`document_has_mileage=false`, ADR-0006 document-authoritative).

**Mileage caveat (non-obvious, recurs as a question):** the DVSA mileage is an ESTIMATE derived
purely from MOT odometer history (`functions/enrichment/analysis.py` `current_mileage_estimate`).
A vehicle with no readable MOT odometer reading (near-new cars, e.g. a 2023 plate) returns
`estimate_available=false` → warning "DVSA could not produce a mileage estimate" and NO mileage.
Correct by design. Mileage populates for vehicles WITH MOT history, or from the document when stated.

**Revert:** set the `cr1bd_ENRICHMENT_ENABLED` value back to 'false' (or delete the value row).
**Residual risk:** the connection's stored function key is only proven by a real flow run — confirm
with a live test email.
