---
name: loc-export-artifact-no-address-matcher
description: Loc is an EVA-export artifact (not an intake input); inspection address = offline-derived full-address suggestions + manual confirm; there is NO runtime address matcher (ripped out 2026-06-23)
metadata: 
  node_type: memory
  type: project
  originSessionId: e3a68ae1-4438-4662-af93-32197902ca09
---

`Loc` (the postcode / part-postcode in EVA's `everyrepairloc.xlsx` export) is an **EVA-export artifact, not an intake input** — there is no `cr1bd_loc` Case column and no parser district-extraction step. EVA holds the full inspection address but won't export it; the full address is usually **not in the documents** and is **worked out manually** by staff (default "Image Based Assessment" + a reason).

The inspection-address corpus was derived **offline**: Box/EVA case history mined per provider → `…/codexwork/inspection_locations_and_provider_principal.csv` → `dataverse/.build/16-seed-suggested-addresses.ps1` loads **only** the ~698 rows that carry a real `full_address` into `cr1bd_inspectionaddress` as provider-scoped suggestions (`decisionMode=Unknown`, `sourceLabel='suggested:*'`) → staff **pick/edit** in the Code App Address tab. This is the **static totality now** (improvable later, offline). **Partials / bare postcodes are a future-investigation backlog — NEVER loaded, NEVER suggested live.**

There is **NO runtime address-matching service.** A redundant matcher (an Azure Function `cespkaddr-*`, an `address-resolve` flow, a `cr1bd_addressmatch` connector, the ROADMAP-4a plan) was built on a misread of `Loc` and was **removed root-and-stem 2026-06-23** — code + flow + connector deleted, the three live Azure resources decommissioned, every tracked doc scrubbed. Canonical: **ADR-0013** (`docs/adr/0013-loc-export-artifact-no-runtime-address-matching.md`) + `docs/architecture/inspection-address-corpus.md`.

**Why:** the spike is in development, not legacy — a wrong thing is ripped out, not archived; and the user is explicit that the live system never suggests a partial / postcode-only inspection address.

**How to apply:** treat *offline suggestions + manual confirm* as the ONE inspection-address model. Never propose a runtime `Loc`-resolver, a `cr1bd_loc` column, or loading partials live; improve the corpus only by more **offline** case-history mining + re-seeding. Relates to [[provider-corpus-analysis]], [[inspection-image-based-detection]], [[queue-case-model]], [[live-services-boundary]].
