# TKT-232 — verification

## Pre-deploy (offline, 2026-07-17 on the branch)

- data-api `npm test`: **103 files / 1071 tests passed** (includes the new pins:
  first-link-wins COALESCE order + RETURNING, lost-race-not-linked, null-upsert-skipped,
  mailbox predicates on all three lookups, classification-preserved-on-existing-row,
  route-side cap with `skippedByCap` (33-row: 25 linked / 3 alreadyLinked uncapped / 5
  skipped), acknowledged-mint + never-mints-unacknowledged, honest note wording,
  `discoveredArchivePo` audit field, nested-CASE jsonb shape, anchor-exclusion
  discriminators). `tsc -b --force` clean.
- orchestration `npm test`: **48 files / 573 tests passed** (26 new: senderProviderAgrees
  matrix, weak-key gating incl. unknown-trigger fail-closed, external-ref mismatch/unknown,
  weakUncorroborated + truncation callback, identity-failure salvage, uncapped forwarding,
  fetch-faulted → combined / Held minimal anchor with Box identity, refused-original keeps
  Box identity, force-restart scoping ×7). `tsc -b --force` clean.
- packages/domain: **31 files / 594 tests passed** (planRetroReconstruction 'minimal' routing
  relied on by F15 is pinned by the existing matrix).
- apps/web `npm test`: **56 files / 547 tests passed** (incl. the new `caseId` facet URL pin).
- Hook: `node --test .claude/hooks/box-scope-lib.test.mjs` → **21 pass / 0 fail**; module
  load check ok.

## Live (2026-07-17, deploy of `d6ee70de`)

Deployed per docs/operations/deployment.md: `npm run package:deploy` artifacts verified
(data-api: @azure/functions + @img/sharp-linux-x64 + sharp-libvips-linux-x64; orchestration:
@azure/functions + durable-functions; import.meta.url banner present in both main.cjs), then
`func azure functionapp publish` from `.artifacts/deploy/` → cespk-api-dev + cespk-orch-dev
(functions listed post-deploy), parser remote Oryx build → healthy host, SPA via swa →
proud-sky production.

1. **F17 VERIFIED both sides**: force re-drive of the prior `linked` instance
   `retro-LO7P302MB2121…` → HTTP 200 `{deduped: true, runtimeStatus: "Completed",
   outcome: "linked"}` — refused, no new instance; force re-drive of a prior
   `trigger_not_found` row (`retro-AXSVCS01…`) → HTTP 202 with statusQueryGetUri — restarted.
2. **F23 implicit**: case queues and the case detail page loaded clean post-deploy (Chrome,
   U1 checks) — no 22P02 on the lateral activity read.

## Remaining probes (bank when exercised)
3. F1/F2 (dev mint): a fresh dev reconstruction mints a Case/PO via the normal allocator,
   rests Held `provider_archive_pending`, and its `retro_case_created` audit `after` carries
   `discoveredArchivePo` + `boxFolderId`.
4. F12: re-run retro on a case with >25 corroborated related candidates → second run's
   link-related response shows new linkedIds (advancement past the first 25) and honest
   `skippedByCap`.
5. F8–F10 negative: no NEW weak-key reconstruction whose original's sender resolves to a
   different provider than the trigger (KQL over `retroOutlookLocate` /
   `weak_key_uncorroborated` log lines).
