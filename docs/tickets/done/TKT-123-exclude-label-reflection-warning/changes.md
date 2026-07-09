# Changes — TKT-123: "Exclude" label + dismissible vision reflection warning

## Status
Built + deployed live (2026-07-09, PLAN-003 UI-wave batch), incl. the live DDL delta.

## What was built

**DDL (applied live 2026-07-09, backup-first, transient firewall rule added+removed)** —
`migration/assets/schema/deltas/2026-07-09-tkt123-evidence-reflection.sql` + the canonical
`060_evidence.sql`: `evidence` +`person_reflection` +`reflection_dismissed` (both boolean NOT NULL
DEFAULT false). 8,237 evidence rows before/after (no data change; no backfill — pre-delta rows read
false until the one-shot classifier backfill restamps them, see Remainders).

**Orchestration (classifier stamps the flag — exclusion behaviour UNCHANGED/additive)**:
- `orchestration/src/lib/image-classify.ts`: `classificationToEvidenceFields` now also returns
  `personReflection` (both branches); the auto-exclusion policy is untouched.
- `orchestration/src/functions/activities/classifyPersist.ts` + `extractImages.ts`: stamp
  `personReflection` onto the persisted rows; `orchestration/src/lib/data-api.ts` row types widened.
- `image-classify.test.ts`: new case pinning "reflection is ALSO stamped as the advisory flag".

**API**:
- Internal evidence persist route (`api/src/functions/internal.ts`): accepts + writes
  `person_reflection` on both INSERT branches and in `applyEvidenceMetadata` (enrich-in-place).
- **New route `patchEvidence` — `PATCH /api/evidence/{id}`** (`api/src/functions/evidence.ts`,
  role `CollisionSpike.User`): body `{ reflectionDismissed: boolean }` → durable UPDATE + an
  `attachment_classified` audit row ("Reflection warning dismissed on <file>") → returns the
  updated Evidence row. Advisory-only: never touches excluded/accepted.
- `api/src/lib/mappers.ts` `rowToEvidence`: exposes `personReflection` / `reflectionDismissed`.

**Domain**: `Evidence.personReflection?` / `reflectionDismissed?` (additive).

**SPA (`mockup-app/src/screens/CaseDetail.tsx` + `src/data/rest-client.ts`/`mock-source.ts`)**:
- The exclusion switch label is exactly **"Exclude"** (was "Exclude (person reflection)").
- The exclusion reason is no longer hard-coded: a manual exclude records **"Excluded by reviewer"**,
  unless the image carries the reflection flag (then "Person reflection visible").
- Flagged images (`personReflection && !reflectionDismissed`) show an amber, icon-carrying warning:
  **"A person's reflection may be visible."** with a **Dismiss** action → seam
  `setReflectionDismissed(id, true)` (PATCH; not safe()-wrapped — a failed dismissal toasts, never
  fakes). The flag flips only after the server confirms.

## Deploy + live proof
api + orch republished (87/67 functions re-verified); SPA deployed. Live E2E on case
`844b612e-…` (a seeded `person_reflection=true` jpeg — seeded via csadmin UPDATE since no live
intake has run through the new stamp yet): warning rendered → Dismiss → warning gone → **hard
reload → still gone** (dismissal persisted). "Exclude" label verified on the live cards; the old
wording is absent. Evidence: `evidence/live-reflection-warning.png`.

## Remainders
- Live-pipeline stamping begins with the next email intake (the orch deploy); the ~8.2k EXISTING
  image rows carry `person_reflection=false` — restamping them is the existing one-shot
  classification backfill's job if the operator wants history flagged (suggest a small follow-up
  ticket if desired).
- `reflection_dismissed=false` restore path exists on the API (body `false`) but the SPA offers no
  "un-dismiss" affordance — deliberate (the warning is advisory; the audit row keeps the trail).
