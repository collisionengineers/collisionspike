# Fragment 4 — `case-resolve` survivor-folder ensure (Box delta)

**Wave 1 · plan 04 §9.** This fragment is **only the Box delta** to `case-resolve` (merge-by-
registration). The merge logic (single complementary pair → merge; >1 → Held/`duplicate_risk`; zero →
no-op; the inviolable VRM/linked/inactive guards) is owned by the existing `case-resolve` flow — do not
restate it.

- **On a merged single pair:** ensure the **survivor** case (the Case/PO holder) has a Box folder via an
  **idempotent** call to `box-folder-create` (`empty(cr1bd_boxfolderid)` guard inside the child makes a
  re-ensure a no-op). The survivor stays active (`statecode=0`).
- **No Box byte move/link here.** The image case's evidence is re-pointed in Dataverse (existing logic);
  `status-evaluate` re-runs; **finalize** later uploads the photo bytes into the survivor's folder. This
  fragment does not move files in Box.
- `case-resolve` is a **Request-triggered child** (no Office-365 webhook) → safe to
  deactivate→edit→reactivate.
- Audit the ensure (`box_folder_created` if newly created; otherwise the merge audit already covers it).

> Reminder: the LIVE intake invokes `case-resolve` (verified) but the repo `intake.definition.json`
> trails — reconcile the repo intake def before any solution re-import (see memory
> `intake-repo-trails-live`).
