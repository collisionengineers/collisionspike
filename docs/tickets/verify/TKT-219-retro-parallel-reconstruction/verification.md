# Verification — TKT-219

Verdict: **VERIFIED-LIVE (partial)** — every offline acceptance line proven by tests; deploy,
gate activation, and the parallel ladder + widened triggers proven live 2026-07-16. The Box arm's
end-to-end create is BLOCKED on a Box-side operator grant (below), so the "rungsTried contains
box_archive" line is outstanding.

## Offline evidence (2026-07-16)

- Domain 593 ✓ / orchestration 510 ✓ / data-api 998 ✓ (all suites green post-change).
- Parallel fan-out + matrix arms + refused-fallback + combined arm: generator tests in
  `retro-case-provider-recovery.test.ts` (Task.all harness; single retroOutlookLocate proven on
  the refused fallback). Matrix + gate-off asymmetries: `retro-case.test.ts`
  (`planRetroReconstruction`). Junk guard: all 13 TKT-140 keys reject, genuine corpus keys pass.
  'other' locate-only + claimant shape: domain tests. Paging truncation: `graph.test.ts`.
  G2 params + adopt-PO both modes + intermediary forwarding: route/generator tests.

## Live evidence (2026-07-16, banked same-day)

- **Deploy:** `npm run package:deploy` artifacts verified per runbook; `func azure functionapp
  publish` cespk-api-dev + cespk-orch-dev; function counts 144/101 (= registry, nothing dropped);
  both apps Running (az resource show); no-auth probe /api/activity → 401.
- **Gates:** cespk-orch-dev readback 15:2xZ — RETRO_CASE_ENABLED=true,
  RETRO_OUTLOOK_SEARCH_ENABLED=true, RETRO_BOX_ARCHIVE_ROOT_IDS=4077648161 (set this session,
  operator-authorized). RETRO_ADOPT_ARCHIVE_PO_ENABLED unset everywhere = dev-mint mode.
- **Widened trigger live:** App Insights 15:34:18Z
  `{"evt":"retroDecision","attempt":false,"lane":"reply","reasons":["other_locate_eligible","no_usable_key"]}`
  — an 'other' email entered eligibility post-deploy and refused only for lack of keys (pre-deploy
  events at 15:07/15:31 still show `category_not_eligible:other`).
- **Parallel ladder + salvage live (smoke drain):** withheld TKT-140 cancellation row
  `<LOBP302MB2151F6AAD9591BCE75C3EAB6E0F12@…>` (desk@, keys 46458/1 + KU05NJZ) via
  `POST /api/retro-case` → durable instance Completed `{outcome:"no_source"}` with
  15:38:21Z `{"evt":"retroPlan","arm":"none","reasons":["box:skipped","outlook:not_found"]}` and
  15:38:22Z `retroRecordFailure … rungsTried:["resolve_existing","outlook_search"]`; the fan-out
  logged `[retro] locate fan-out partial failure (best-effort, salvaged)` — a genuinely faulted
  Box rung did NOT sink the run (the pre-TKT-219 sequential ladder had never exercised this).
  Outlook deep-paged sweep genuinely found nothing for these keys (consistent with the TKT-140
  probe's "unlocatable" measurement).

## The one blocking gap — operator action

`retroBoxLocate` now really calls the facade: `fn POST box/search → 502 {"error":"Box request
failed.","status":404}` — Box returns 404 for archive root 4077648161 because the Box service
account holds NO Viewer grant on it (the TKT-058 activation step D11 that was never completed;
the config side is now done). **Operator: grant the Box service account Viewer on the archive
root folder 4077648161**, then re-run one drain row and confirm `rungsTried` contains
`box_archive` (and, for a folder-with-nothing-parseable case, a `combined_reconstruction` create).
Until then every retro attempt logs one salvaged Box-rung failure (visible, non-blocking).

## Honest gaps / re-verify

- Box arm + combined arm live create: pending the grant above.
- The smoke row's `unable_to_locate` attention stamp assumed from `retroRecordFailure` running —
  confirm the chip on the inbox row (or the inbound_email.attention_reason column) on next login.
- `trigger_not_found` stamping: code-path + test only; fires on the next genuinely vanished
  drain trigger.
- Dev-mint end-to-end (minted PO + case_ref carry): route-tested; first live proof arrives with
  the first successful reconstruction after the grant.

## How to re-verify

Same-day KQL (window shrinks intra-day): traces where message startswith "{" and contains
"retroPlan" / "retroRecordFailure". Drain lever: `POST /api/retro-case` with a fresh
internetMessageId+mailbox from the TKT-140 backlog rows; instances dedupe on
`retro-<sanitized-id>` so pick a never-run row.

## 2026-07-16 ~20:00–22:55Z — Box rung lit end-to-end; FIRST FULL CONVERSION (FW26029)

The blocking gap closed in three operator/config steps, each live-proven: (1) Box service-account
Viewer grant created on 4077648161 (collab 74177634786, accepted); (2) archive root repointed to
the correct PO-shaped tree `Workflow/Reports/Reports` = 3221031282 (operator decision) — on BOTH
apps AND the facade's `BOX_READONLY_ROOT_IDS` (the settings are a matched pair: a facade mismatch
produced `box:skipped` salvages until aligned); (3) facade exact-phrase quoting (commit 1d3a9c2b)
killed the 47-folder `WF*` prefix-noise. Then the WF69NDX matter converted end-to-end at 22:54Z:
force-drain re-labelled the PAVPR02 abstained instruction to `receiving_work` via live
classifyInbound (`not_eligible category_not_eligible:receiving_work` on its own row — the drain
lever's upsert IS the remediation mechanism), and the query-row drain created case
`62778371-3e8b-4a8a-9138-f131ec652a3a` / casePo `FW26029` (`retroCreatePersist outcome:"created"`,
source outlook, providerRecovery completed; Box folder 400654960481 created + 2 evidence files
mirrored; second query row rung-1 `linked` to the same case). Dev-mint end-to-end line proven.

## 2026-07-17 — parallel ladder at sweep scale

Commit 58d7ca09 deployed (all four components); complete backlog re-sweep of 286 un-cased
non-human rows driven through the drain lever sequentially — checkpoints showed ~25% of rows
linking or minting with zero hard errors and every refusal an honest terminal state
(`not_eligible` / `trigger_not_found` / `no_source`). Full ledger + outcome histogram: the sweep
record banked with TKT-226's evidence and the sweep report (see PR #102).

## 2026-07-16 ~18:28–18:31Z — deep-sweep reachability proven on the failed-row rerun

Post TKT-220/222 deploy (api 145 fns / orch 102 fns, both Running), the 7-row force rerun shows
the paging fix working: **6 of 7 rows now locate Outlook candidates** (`retroPlan
arm:outlook_only, outlook:found`) where the TKT-140 probe had measured them unlocatable. None
converted — for principled reasons recorded per row: `outlook_uncorroborated` (PE19UDH ×2,
DF25LZE, AE63SON — corroboration correctly refused thread noise), `outlook_refused_category`
(WF69NDX rows — the located original is itself blocked-family), `outlook:not_found` (46458/1).
`box:skipped` on every run — the service-account Viewer grant on archive root 4077648161 is
STILL the single outstanding enabler (collaborator list read via the new guard allowance shows
staff editors only, no automation user). After the grant: rerun the same seven with force —
the Box/combined arms get their first live shot and several may convert.
