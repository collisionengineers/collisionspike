# PLAN-005 archival-tip semantic audit

Audit baseline: `origin/main` at `927fd1872432c39ba8ffe3fc7eca565bd078d7e3` after `git fetch
--all --prune` on 2026-07-13. The 69 maximal unreachable tips were first anchored as
`refs/archive/plan-005/20260713/tip-NNN` and included in the independently verified recovery bundle.

The audit used stable patch IDs, `git cherry`, range-diffs, merge-base tree comparisons, first-parent
stash diffs, and exact blob comparisons. A ticket or subject-name match alone was not accepted as
evidence. “Protected” means the behavior is represented by an open PR or explicitly retained current
ticket source and therefore remains recoverable while that integration is resolved. Generated deployment
bundles are not source of truth and must be regenerated from reviewed TypeScript.

## Tips 001–023

| Tip | SHA | Semantic disposition | Evidence |
|---|---|---|---|
| 001 | `00e7ca6ea8238d82eb98aeab0649de9edbe15818` | Patch-equivalent to merged PR #84 | Patch ID equals `d39e984`; resulting TKT-024 documentation blob equals `origin/main`. |
| 002 | `01c37ad550be5c027a46d51e3b874d2a44fde17c` | Protected TKT-150 claimant lineage | Exact match to retained claimant-proof commit `e145427a`; no separate port. |
| 003 | `03ac2d81c86881ae63d879a96d20ac9a176b5746` | Patch-equivalent/later superseded by merged PR #86 | Exact match to `7de9af80`; 29 of 30 blobs still equal main and the remaining blob has later main changes. |
| 004 | `093fd8a7dad8112e3196999d40ceca7d8e03e1b2` | Temporary stash fully superseded by main | Archive read/search/download, redirect/cap validation, folder resolution, and `.eml` expansion all exist through `7983e3f` plus `9fee9f6`; main has dedicated expansion tests. |
| 005 | `11d8e37c64a9bd7fd71031f764b65558dfb49ed7` | Later documentation supersedes it | Main `1765e88` differs only by the later SPA count; `d1d84ec` adds later readiness proof. |
| 006 | `122e0b87267fad6c1664ce53fde847b3e40bd76c` | Protected by PR #83; no separate port | Newer guided-capture equivalent `77603725` corrects audit IDs and carries later integration fixes. |
| 007 | `1552eb609c4a2900d767a6458c34801cc6e6b012` | Duplicate/later superseded by merged TKT-152 | Duplicate of tip 067; source equals later `a2610347`, and PR #78 carried the complete feature. |
| 008 | `17679b276fa56d2f5ef540f2d45ab9cf06c5bb67` | Protected TKT-150 claimant lineage | Later `779261e6` preserves the lifecycle move while reconciling newer board changes. |
| 009 | `17ff7654c2f33e4f985b64c877078234d15b73b4` | Duplicate/later superseded by merged TKT-156 | Same patch as tip 021; main `7a2d2eeb` differs only by formatter expansion and landed through PRs #77/#79. |
| 010 | `1b224858774e38efd96a0f2d071c8511e3bc7cc3` | Patch-equivalent to merged PR #61 | Exact match to `b7097fd3`; main has later Manual Intake integration. |
| 011 | `2030ecc5a197dbf8777178589bf38c8c739818a2` | Patch-equivalent to merged PR #86 | Exact match to reviewed commit `78bc6e25`. |
| 012 | `2334d4ff61bccbb3e0775258c139db56dee0dfcb` | Patch-equivalent to `origin/main` | Exact stable patch exists as `f8f15573`. |
| 013 | `256a97541b89f888f89004e9855cac45640d786e` | Later TKT-152 documentation supersedes it | Final `7864436` changes only base/test counts and was merged through PR #78. |
| 014 | `25ff03534166766d373b16c52895936833ede153` | Patch-equivalent to `origin/main` | Exact stable patch exists as `36dbe145`. |
| 015 | `26b6edb941cec0332d0707d9c3df929be8f61983` | Later TKT-156 proof supersedes it | Main `5a57d3c` includes the same proof plus the later repository-wide verification result. |
| 016 | `2abb10eaca68002687d02249ca76916c7bbdf198` | Protected TKT-150 claimant lineage | Later `ed38740f` retains the core proof with later fixture/document corrections. |
| 017 | `2b93a2532b8c4a7f572cf32b021cf243ffe1e519` | Protected by TKT-154 local safety source; must feed PR #73 | Exact match to `946946d6`, one of the commits absent from the current PR head. |
| 018 | `2b941de8ad4adb75350ff0941db9389dde46771d` | Later superseded by merged TKT-153 | Main `42cc5dab` integrates the behavior and `ce91634a` adds snapshot correction; PRs #72/#74 carried the completed work. |
| 019 | `3425accf8f61bef322dcd113b7e880f56b4ccd4e` | Patch-equivalent to merged TKT-152 | Exact match to `d4333bcb`; two blobs still equal main and one has later changes. |
| 020 | `3755cb190d7d102dc14b2b0136f40b344a669ae3` | Patch-equivalent to `origin/main` | Exact stable patch exists as `ce91634a`. |
| 021 | `3ff437f4c3e2ce439e2fb74f8aa9ba42120256cc` | Duplicate/later superseded by merged TKT-156 | Patch ID equals tip 009; both are superseded by main `7a2d2eeb`. |
| 022 | `44cda1b665f6fdd702509e56dc971d43a981ec82` | Later TKT-152 documentation supersedes it | Earlier-base duplicate of tip 013; final `7864436` was merged through PR #78. |
| 023 | `451d7bad9cc592f38c88a599dd4f94d9f7d48235` | Patch-equivalent to `origin/main` | Exact stable patch exists as `feec8f79`. |

## Tips 024–046

| Tip | SHA | Semantic disposition | Evidence |
|---|---|---|---|
| 024 | `4c0460b1ecbbe8103587f7e1f675577516c3ebec` | Protected by PR #83; no separate port | Guided-capture stack. Six of nine commits are exact and three are evolved in `6998cc45`; the current head also adds CI determinism and retention locking. |
| 025 | `4cc955a397eefced6edecc99b7f082b91776191f` | Protected by PR #73 and the TKT-154 safety head; no separate port | Initial constrained ingestion maps to the first safety-head commit; `f59ae487` contains fourteen later hardening/review commits. |
| 026 | `5d6398012443cab75cb3faf6c7c38d9d03b6efb7` | Patch-equivalent to `origin/main` | Both queue-language/email-preview commits report `-` under `git cherry origin/main`. |
| 027 | `60ade68219d71776a466fc334d58fec98dd74ce3` | Later superseded on merged TKT-129 work | First two commits match; merged `e0f3c84` evolves reset handling and adds saved-choice/no-op and selected-address fixes. |
| 028 | `618914d0a5caeca9353348866bacf49f4ac5c322` | Patch-equivalent to `origin/main` | Both claimant/DOC recovery commits report `-` under `git cherry origin/main`. |
| 029 | `6358b023c880a13de75b444d67ae4c313c61e0bb` | Later superseded by merged TKT-167 | First-parent stash delta has seven files; four equal merged `bcd4aa2`, while the other three have additional coverage and channel-aware visibility fixes. |
| 030 | `6689cee0f85bd155bd98412fa044fd0341a5dc70` | Protected by PR #89; no separate port | Initial TKT-034 adoption implementation is duplicated by tip 042 and evolved by the current seven-commit PR head `7daf9c1f`. |
| 031 | `6942381870c797b1ed97f8d929c8943db886ec3a` | Patch-equivalent, then later superseded | Exact first commit of the merged TKT-129 series; later fixes cover the remaining behavior. |
| 032 | `75a1c1b52aea3cf5775ab51aa03fc6d19b152efb` | Later superseded by merged TKT-009 | Initial commit is evolved in merged `1ce920f`, followed by exact-identity, cutover, and evidence fixes. |
| 033 | `784d9e65e87e42b3f5d355674d14c7acef469c7c` | Patch-equivalent to merged TKT-024 | Range-diff is exact against commit `ac1e0f7`; the merged branch only adds verification-count documentation. |
| 034 | `7873073335efc56132b99d5670fa5cf1fc95e017` | Patch-equivalent/duplicate | Source commit is on main; documentation patch equals tip 041 and its blob equals `origin/main`. |
| 035 | `7a5b5cf330547cab1de159a4cd8a0b9aa64460f3` | Protected TKT-150 closeout lineage; no separate port | Parser change maps exactly to the retained claimant branch; `a2b3464` adds five hardening commits and updated proof. |
| 036 | `81af799343820cc827d9637e045274c1e3d7ae80` | Later superseded by merged TKT-152 | Initial canonical vehicle-data commit is evolved by merged `5af711c` plus seventeen hardening, runtime, review, deployment, and test commits. |
| 037 | `81f5466f6dc54a56195b5ecbd35aaf92559c3714` | Protected by PR #89; generated bundles discardable | Hardening maps exactly; implementation is evolved; current PR adds five fixes/docs and refreshed generated bundles. |
| 038 | `84004965b8da901e2c67f4095cb296a0bdf7a028` | Patch-equivalent to `origin/main` | All three authenticated-enquiry/queue commits report `-` under `git cherry origin/main`. |
| 039 | `8aec9bff7304af516e9a4221bfc85311a22c4223` | Patch-equivalent/later superseded by merged TKT-152 | All sixteen source commits map exactly; merged head adds reviewed bundle refresh and deterministic UI coverage. Generated bundles are discardable. |
| 040 | `90eefd237330abd60bb96b03d04dc73fb0993ae4` | Protected by PR #73 and TKT-154 safety head; no separate port | Eight of twelve commits match exactly, four are evolved, and `f59ae487` adds completion reconciliation, principal isolation, and notes. |
| 041 | `9292bb0453c6336916d3ea05ef56bfebc0d0b9a2` | Patch-equivalent/duplicate | Same stable patch ID as tip 034; documentation blob equals `origin/main`. |
| 042 | `97afdce8216ca5d7e334f188352344f954e04d98` | Protected duplicate under PR #89 | Same stable patch ID as tip 030; the current PR contains later recovery, atomicity, and review hardening. |
| 043 | `9946c57289bef544bbb9775c19cd9c40c9279fcf` | Protected by PR #87 and TKT-160 safety head; no separate port | Replay-recovery commit matches exactly; implementation is evolved; `2681fd25` adds five atomicity, scope, tombstone, and UI fixes. |
| 044 | `a315eaace0db8d28e2bfe5957b109729263bbca7` | Patch-equivalent to `origin/main` | Authenticated-enquiry implementation reports `-` under `git cherry origin/main`. |
| 045 | `a398e1f7098cbd79f8da89f01ded677db7a8d346` | Patch-equivalent to `origin/main` | Typed archive defer-reason commit reports `-` under `git cherry origin/main`. |
| 046 | `a5b17c24a1ec7f588e1f211eea1d6080dd3a6b28` | Later superseded by merged TKT-165 | First-parent stash delta is two ticket evidence files; both blobs exactly equal the files now on `origin/main`. |

## Tips 047–069

| Tip | SHA | Semantic disposition | Evidence |
|---|---|---|---|
| 047 | `a663e4c0df36a71c4f18010d537984b024f76520` | Later superseded by main | Reciprocal-review behavior is semantically equal apart from terminal blank lines to later `9aae3c66`; main carries the PR #60 result `7421d4be`. |
| 048 | `a84a30cdee6866f0cf20a86a747a58a44cd5a8c2` | Patch-equivalent to merged TKT-152 | Exact range-diff match to `7aca9983`, later squash-merged by PR #78 as `695b8585`. |
| 049 | `a8d12c6d83056f9a6c766417af721d881cb08d45` | Protected by PR #83; no separate port | Exact match to guided-capture commit `20f8f249`. |
| 050 | `af855519551b7cf20572b20d09d1e2a08af9c13b` | Patch-equivalent to `origin/main` | Exact match to `d5db3eb0`; `git cherry` reports `-`. |
| 051 | `bdeaaadac65b11212074048850e31c733fb93dcf` | Patch-equivalent to merged TKT-156 | Exact match to `327d0d62`, later represented in main by PR #79. |
| 052 | `c3a510651654835f68f36a19e754961c537f284a` | Patch-equivalent to `origin/main` | Exact match to `0794b570`; `git cherry` reports `-`. |
| 053 | `ccf92a1cd97c81fbd443a18ea398bcf5883d851e` | Later superseded by TKT-150 work | `ed38740f` updates the integration SHA and adds three fixture corrections; later TKT-150 work reached main through PRs #68/#71. |
| 054 | `d01764f6a4884ed058400df61a0ac88c52acd41f` | Patch-equivalent to merged TKT-129 | Exact match to `99c36077`, later squash-merged by PR #85 as `9bbab2e7`. |
| 055 | `d10645b52b21f41240e5b00159383239ff4dcf16` | Later superseded by merged TKT-170 | Later `4ad7117b` adds reply-link eligibility and prevents website forms attaching to cases; main carries PR #80 `eaa31fbe`. |
| 056 | `d10e0fab78ea1adaee816d0944300b411fd68bee` | Later superseded ledger-only variant | No source/test behavior. `c70a441f` differs only in surrounding ticket context; main PR #62 carries the actual repair. |
| 057 | `d38a954242e4297d62ec40adea20d39e79ad7528` | Later superseded ledger-only variant | No source/test behavior. `935db264` differs only in concurrent ledger context; main PR #67 carries the repair. |
| 058 | `d526b7273ce771fe90c8af85225211247487c643` | Protected/superseded by PR #83 | Original ticket ledger was overtaken by `1b0ded60` and later branch history; current numbering reserves TKT-168 for status language. |
| 059 | `d81568053e4824adc52e96deebe91d2f67c6febc` | Protected TKT-150 remediation lineage | Exact match to retained live-remediation commit `ed63af70`. |
| 060 | `daf9f6351179adedbc9f7331786a98005d3da148` | Protected by PR #89 | Exact match to atomic-merge commit `6bafa8b2`. |
| 061 | `dd688e8db92d23d16645bce3817c8da949d8dcf2` | Generated-only discard | Changes only regenerated API/orchestration bundles; also exact to retained `06c9584e`, whose reviewed source was represented in PR #78. |
| 062 | `deb34d84afedeb6fa793496c8b02650c8a72527e` | Generated temporary WIP discard | First parent is already on main; stash adds only generated API/orchestration bundle deltas. |
| 063 | `e0bd8884a6edfa3a1fd525507715f69a0a17bd52` | Protected by PR #87/TKT-160 | Exact match to `67bea8d8`; protected source contains later hardening. |
| 064 | `e574adfdd0d127dcfb24bf2022404d95315f9621` | Source patch-equivalent to `origin/main`; ledger churn superseded | Six source paths have patch IDs equal to main `4eab7cb2`; all remaining differences are stale ticket-location moves. |
| 065 | `e984878d0c88d8d5c23a45c6526198ccc196f41e` | Patch-equivalent to `origin/main` | Exact match to `7757229b`; `git cherry` reports `-`. |
| 066 | `ea53aa72e0705dfaa5962f75abd2a808f4eb3437` | Protected by PR #89 | Exact match to archive-adoption review commit `f476211c`. |
| 067 | `f178e81b6f79a34bc105265e8983318a5f477fdc` | Source patch-equivalent to merged TKT-152 | Source patch IDs equal `a2610347`; differences are test-count prose. Later squash-merged by PR #78. |
| 068 | `f2464f58610a134b1349fbece994ff532936c4aa` | Later superseded programme distillation | No app source/test behavior. Later `c98a7a8a` preserves additional ticket evidence and main carries PR #60. |
| 069 | `f2720fad762dae9b531e320acdf900ca7866c754` | Protected by PR #73/TKT-154 | Exact match to local safety commit `98ff25b3`; current remote PR head is rebased. |

## Result

All 69 tips have an evidence-backed disposition:

- none contains genuinely unique source or test behavior;
- none requires a new clean-port ticket;
- protected behavior remains represented by PR #73, #83, #87, #89, or a retained TKT-150 source;
- all other behavior is exact, later superseded, duplicate, stale ledger-only, or generated output.

The temporary `refs/archive/plan-005/20260713/tip-*` anchors remain in the external recovery bundle and may
be removed locally during final reconciliation; they must not be merged wholesale.
