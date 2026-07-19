# Verification — TKT-257: Refresh LIVE_FACTS and the live-environment doc

## Verdict

TESTED (offline). Verified 2026-07-19 on branch `plan009/estate-nonmutating`. No live mutation.

## Evidence

- **A1 — offer corrected.** `LIVE_FACTS.json` `subscriptionTier` = `Pay-As-You-Go`;
  `docs/operations/live-environment.md`'s current-state constraint line reads pay-as-you-go (the stale
  free-trial line is gone).
- **A2 — counts / retirement states from a dated read-only inventory.** `orchestration.functionCount`
  corrected `101` → `105`; the API `144` is unchanged (confirmed already-correct — it is
  `cloud-inventory-2026-07-17.md` that over-counts the API, not the registry). No retirement is recorded
  as performed: tickets 252/253/254 are operator-gated live-writes deferred, so EVA-validation is recorded
  as still deployed (retirement operator-gated). The resource inventory basis is a fresh 2026-07-19
  read-only ARM read; the offer/count corrections are carried forward from the banked dossier and labelled
  as such in `verificationMode` (no value inferred from source).
- **A3 — lands last.** This is the last of the implemented non-mutating members (255 → 256 → 257); the
  live-write members (252–254) are deferred.
- **A4 — no leakage.** `npm run check:docs` passes: the volatile numbers (offer, function counts, resource
  states) appear only in `LIVE_FACTS.json` and `live-environment.md`; the assessment and other prose carry
  none.
- **A5 — dated evidence.** `lastVerified` = `2026-07-19T22:40:05Z`; `verificationMode` records the
  read-only ARM inventory and the carried-forward dossier basis; `LIVE_FACTS.json` parses as valid JSON.

## Pending / gaps

- The offer type and the exact orchestration function count could not be re-minted through the available
  read-only tooling (Resource Graph exposes resources, not subscription offer metadata or function
  sub-resource counts); they carry forward the banked dossier evidence rather than a fresh direct read. A
  session with `az account show` / a function-list read (or the operator) can promote these to a direct
  2026-07-19 reading.

## How to re-verify

Diff `LIVE_FACTS.json` and `live-environment.md` against a same-day read-only inventory; confirm the offer
is pay-as-you-go, orchestration is 105 and the API is 144, and EVA-validation is recorded as still
deployed / retirement operator-gated; run `npm run check:docs` and confirm no leakage; confirm this change
set lands after (not before) the estate dispositions.
