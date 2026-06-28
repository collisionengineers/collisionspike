# 99 — Verification & cutover

The go/no-go gate (P6), the cutover itself (P7), and the final repo-clean gate (post-P9). Nothing
irreversible (P8 teardown) happens until P6 is fully green. Every check below names the **concrete
artifact** it runs against so it can be executed, not just asserted.

## P6 — verification checklist (all must pass)

### Data & settings parity (R4)
Successor of the offline `dataverse/verify-parity.mjs` (which today proves, by pure file read, that
`dataverse/choicesets/case-status.json` has 11 options with **unique integer values** that map 1:1 onto
the `CaseStatus` union in `mockup-app/src/contracts/case-status.ts`). Port it to read the **live
Postgres** schema + the same contract.
- [ ] **Choiceset integer-code parity.** For each of the 17 `dataverse/choicesets/*.json`, every
  `option.value` (integer) exists with the **same code** in the Postgres enum/lookup table. EVA depends
  on these exact integers — a relabel is fine, a re-number is a hard fail. (Reuse the
  `dataverse/case-status.parity.test.ts` + `mockup-app/src/contracts/case-status.parity.test.ts` logic,
  re-pointed at Postgres.)
- [ ] **Gate-default parity.** Each of the 28 `dataverse/environment-variables.json` entries has a
  matching Function **app-setting** whose default matches (every `BOX_*`, `EVA_API_ENABLED`,
  `PDF_MAPPER_ENABLED`, `ENRICHMENT_ENABLED`, `AZURE_MAPS_ENABLED`, `COPILOT_ENABLED` resolves to the
  same boolean it did in Dataverse). See [`10`](./10-settings-migration.md).
- [ ] **Status-machine transitions** match `mockup-app/src/contracts/case-status.ts`
  (`new_email → ingested → needs_review → ready_for_eva → eva_submitted`; terminal set unchanged).
- [ ] **FK cascade parity.** FKs + `ON DELETE CASCADE` / `SET NULL` behave as the
  `dataverse/relationships.json` cascades did: delete a Case → its evidence/chaser/note rows cascade;
  the audit-event row **survives with a null case FK** (audit must outlive its case).
- [ ] **Dedup uniqueness.** `UNIQUE(sourcemessageid)` rejects a duplicate insert (the
  `dataverse/schema/inbound-email.json` alternate key → Postgres unique constraint).

### API contract (R3)
- [ ] The Data API satisfies **every** method on the `DataAccess` interface
  (`mockup-app/src/data/types.ts`, interface declared at **line ~373**, **29 async methods** —
  `caseById`, `createCase`, `casesForQueue`, `openVrmTwins`, `setOnHold`, `mergeCandidates`,
  `mergeCases`, `imagesForCase`, `providers`, `inspectionAddressSuggestions`, … through the gate-reads
  to `setTriageState`). Enumerate them from the interface and assert one endpoint per method. The
  **frozen authoritative enumeration of all 29 methods → endpoints** is [`21`](./21-backend-api-build.md)
  §21.1 — the contract test asserts against that list (29, not 40).
- [ ] The existing `mockup-app` **vitest** suite passes against the new `rest-client.ts` (P5) pointed at
  the API running locally (`func start`), unchanged — the seam is honored:
  ```bash
  cd mockup-app && npm test          # vitest run — adapter/contracts/domain suites green
  ```
  This exercises `src/data/adapter.test.ts`, `src/contracts/*.test.ts`, `src/domain/*.test.ts`
  (dedup, classification, provider-match, address-policy) against the live API.
- [ ] **"Honest off / honest empty" defaults preserved:** gate reads resolve **all-false** and list
  reads return **`[]`** on backend failure, exactly as the `DataAccess` interface comments specify (the
  SPA must never hard-fail on a cold/empty backend).

### Frontend + auth
- [ ] `npm run build` in `mockup-app/` succeeds with the Power Platform deps **removed**
  (`@microsoft/power-apps` 1.0.3, `@microsoft/power-apps-vite` 1.0.2) and `power.config.json` deleted;
  the Vite/Power plugin is gone and the build uses the standard React/Vite config.
- [ ] Staff sign in via **Entra (MSAL)**; the API validates the JWT and resolves the correct **app
  role** (Admin vs User) — see [`31`](./31-auth-migration.md).
- [ ] An **Admin-only** action (flip a gate) is **refused for a User token** (403), proving role
  enforcement moved from Dataverse security roles to the API.
- [ ] The SPA on **SWA** renders Dashboard + CaseDetail against live Postgres (read path end-to-end).

### Intake end-to-end (the headline test)
- [ ] Test email → **shared mailbox** → **Graph change-notification** → webhook receiver (validates the
  `clientState` + Graph token) → **queue** → **Durable orchestration** → a **Case in Postgres** at the
  correct status, with evidence **bytes in Blob `cespkevidstdev01`**. See [`22`](./22-orchestration-migration.md).
- [ ] **Re-send the same message** → deduped by `UNIQUE(sourcemessageid)`; **no** duplicate Case (R2
  backstop proven).
- [ ] **Graph renewal proven:** the renewal timer advances the subscription `expirationDateTime` before
  expiry (Outlook `message` subscriptions expire in **under 7 days** without resource data — verified on
  Learn topic *Set up notifications for changes in resource data / subscription lifetime*).
- [ ] **Lifecycle handled:** the lifecycle endpoint correctly processes a simulated
  `reauthorizationRequired` / `subscriptionRemoved` / `missed` notification (re-authorizes / re-creates
  the subscription).
- [ ] **Heartbeat alert (R5):** when intake is artificially stalled (subscription paused), the
  App-Insights/Log-Analytics heartbeat alert fires — intake can never silently die.

### Existing Functions + EVA (unchanged)
- [ ] parser / enrichment / evavalidation answer as before over direct HTTP (function key / managed
  identity) — no behavioural change from removing their connectors.
- [ ] **EVA-readiness parity:** the API's readiness result matches the old `evavalidation` output and
  the `mockup-app/src/contracts/eva-readiness.parity.test.ts` expectations (≥2 EVA images incl. one
  `overview` with visible registration + one `damage_closeup`; see `src/contracts/image-rules.ts`).
- [ ] **EVA export shape unchanged:** the 12-field JSON from `mockup-app/src/contracts/eva-export.ts`
  still validates against `eva-export.test.ts` + `eva-payload.schema.test.ts` (field order +
  preview-photo-first ordering intact).
- [ ] **`BOX_*` still off** — every Box gate resolves false (no behavioural Box change in the migration).

---

## P7 — hard cutover (one change window)
1. Confirm P6 fully green (the evidence pack above).
2. Create/enable the live Graph subscription on the **production** shared mailbox (the new pipeline);
   confirm the first lifecycle/renewal cycle scheduled.
3. **Turn the old Power Automate intake flow OFF** in the same window — single-consumer switch (see
   [`90`](./90-deprovision-power-platform.md) step 1 for the disable method).
4. Watch one or two real intakes land in Postgres; confirm no R5 alert; confirm dedup holds.
5. Soak for the agreed period before P8 (teardown). If anything regresses, **re-enable the old flow**
   (still present until P8) and disable the new subscription — this is the only rollback window.

---

## Post-P9 — repo-clean gate (then delete `migration/`)
No working-tree file may reference a Power Platform mechanism outside `migration/` itself. Use
`git grep` (searches **tracked** files only, so `node_modules/`, `dist/`, and any off-repo archive are
excluded automatically) with a `migration/` pathspec exclusion:
```bash
# from repo root; exits 0 (RESIDUE) if any match, 1 (CLEAN) if none
git grep -nIE 'Dataverse|Power Automate|power-apps|@microsoft/power-apps|pac code|pac admin|cr1bd_|Code App|PowerProvider' \
  -- ':(exclude)migration/**' ':(exclude)*.png' \
  && echo '>>> RESIDUE FOUND — classify each hit per 91 (DELETE/REWRITE/KEEP)' \
  || echo '>>> CLEAN'
```
- [ ] The grep returns **CLEAN** — or the **only** hit is the single migration sentence in **ADR-0019**
  (the one permitted "we used to be Power Platform" trace; see [`91`](./91-documentation-rewrite-delete.md)).
- [ ] `pac admin list` shows the Dev sandbox **gone**; `az resource list -g rg-collisionspike-dev -o
  table` shows the **keep-set intact** ([`90`](./90-deprovision-power-platform.md)).
- [ ] **Delete the `migration/` folder.** Its job is complete; it must not become permanent docs.

> If `git grep` is unavailable, the POSIX fallback (searches the working tree, must manually exclude
> generated/vendored dirs):
> ```bash
> grep -rIlE 'Dataverse|Power Automate|power-apps|cr1bd_|pac code|Code App' . \
>   --exclude-dir=migration --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist \
>   || echo CLEAN
> ```

---

## Rollback summary
| Phase | Reversible? | How |
|---|---|---|
| P1–P6 | Yes | new resources only; old stack untouched |
| P7 cutover | Yes (within soak) | re-enable old flow, disable new subscription |
| P8 teardown | **No** (sandbox delete via `pac admin delete`) | only after soak; `_baseline/` + cold export are the last resort |
| P9 docs delete | Yes (git history) | restore from the off-repo archive / git |
