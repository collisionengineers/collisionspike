---
name: enrichment-mileage-caveat
description: DVLA/DVSA enrichment is live on Azure (gated by ENRICHMENT_ENABLED); DVSA mileage is an MOT-odometer ESTIMATE, so near-new vehicles get none — by design. Recurs as a question.
metadata:
  type: project
---

DVLA/DVSA vehicle enrichment is **live on the Azure stack**: the enrichment activity
(`orchestration/src/functions/activities/enrich.ts`) calls the retained enrichment Function, which hits
**DVSA + DVLA directly** via Entra `client_credentials` + `X-API-Key` (no Google Cloud gateway in the
path). It is gated by the **`ENRICHMENT_ENABLED`** function app-setting, checked inside the activity.
DVSA is **primary** (gives make/model + mileage); DVLA is a **make-only fallback**. Live-verified
(e.g. `BC23JZE` → SsangYong Rexton).

**Mileage caveat (non-obvious — recurs as a question):** the DVSA mileage is an **ESTIMATE derived
purely from MOT odometer history**. A vehicle with no readable MOT odometer reading (near-new cars,
e.g. a current-plate vehicle with no MOT yet) returns *no estimate* → a "could not produce a mileage
estimate" warning and **NO mileage written**. This is **correct by design**, not a bug. Mileage
populates for vehicles WITH MOT history, or directly from the document when the document states it.

**Why:** the question "why is mileage / vehicle detail missing?" almost always traces to (a) the gate
being off, or (b) a near-new vehicle with no MOT odometer history — not to a broken enrichment chain.

**How to apply:** enrichment is **document-authoritative** (ADR-0006) — it writes **only into empty
fields** (model if empty; mileage only when the document had none). Don't "fix" a missing near-new
mileage; explain it. Don't re-investigate the chain before checking the gate + MOT-history
availability. Relates to [[inspection-type-vs-location-ruling]], [[activation-boundary]].
