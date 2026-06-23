# Documentation flags — stale-but-protected claims (not auto-edited)

_Generated 2026-06-22 by the docs-reconcile audit. These are claims the audit found stale or worth attention but did NOT rewrite, because the doc is a frozen review, an ADR decision record, point-in-time research, or a raw/ artifact (per CLAUDE.md precedence). Each is listed with the correct current truth for the reader._

## AGENTS.md

- **[minor]** Recommended guardrail hooks (see `.claude/settings.json`) — lines 121-124
  - Verified against the live .claude/settings.json: it wires codeapp-flow-guard.mjs (Bash + Edit|Write), box-scope-guard.mjs (Bash, PreToolUse), and box-scope-postcreate.mjs (Bash, PostToolUse); none of the two described reminders are present. Hook files exist in working tree (.claude/hooks/). Kept as flag since the section is aspirational 'Recommended' prose and the rewrite needs author judgment to re-bullet; oldText matches verbatim+unique.
  - Suggested: Update this list to match the hooks actually wired in .claude/settings.json: PreToolUse `codeapp-flow-guard.mjs` (on Bash and on Edit|Write) and the Phase-7 Box scope guard (PreToolUse `box-scope-guard.mjs` on Bash + PostToolUse `box-scope-postcreate.mjs` on Bash, hard-scoped to test folder 392761581105). The originally-described pac-code-push/build and mockup-app fetch reminders are not what the file currently enforces.

## CURRENT_STATUS.md

- **[minor]** Phase-7 entry (lines 121-123) omits the Box scope-guard + tools/box harness + REMAINING-STEPS.md
  - Flag (not edit). oldText matches lines 121-123 verbatim; scope guard + tools/box harness + REMAINING-STEPS.md all exist per brief + repo inventory; appropriately surfaced as an addition to the single-source-of-truth status doc.
  - Suggested: Suggest adding a short paragraph: a 4-layer Box **scope guard** now hard-scopes every Box op to test folder `392761581105` (`tools/box-scope.json`, `liveReady:false`) — a Claude Code PreToolUse hook, the Function `BOX_ALLOWED_ROOT_ID` assert, a `tools/box/` wrapper convention, and the flow linter's `BOX_ID_LITERAL_RE`; the `tools/box/` harness (phaseA-probe, phaseB-livetest, test-scope-guard 20/20) and owner-tagged **docs/plans/phase-7-box-integration/REMAINING-STEPS.md** capture the remaining steps. (All uncommitted in the working tree at time of writing.)

## PLAN.md

- **[minor]** Repository constellation table — `collisionspike` (**this repo**) row: "Near-empty: `adminoverview.md`, `CLAUDE.md`, `.claude/settings.json`"
  - oldText verbatim+unique (line 34); correctly FLAG not edit — table header is 'what exists, confirmed by exploration' and the doc is the original narrative plan; repo now has mockup-app/, functions/ (6 dirs), flows/ (15 defs), dataverse/, docs/. Leave historical prose intact.
  - Suggested: Consider annotating the row (or the table header) to mark it a plan-authoring-time snapshot, e.g. add "(at plan inception — now fully built; see CURRENT_STATUS.md)" so a reader does not mistake "Near-empty" for the current state. Leaving the historical text intact but adding the as-of marker preserves the narrative while removing the misleading implication.

## ROADMAP.md

- **[minor]** B0 final operator step (line 251): "The hard unlock (needs a Business tenant — base Business suffices; Business Plus is only for the deferred metadata tier)."
  - Accurate advisory: brief LIVE-PROBE confirms cespkboxkvv76a47 empty, BOX_CLIENT_ID='', KV refs unresolvable. Kept as action=flag (no destructive edit to correct prose); the existing sentence is not itself wrong.
  - Suggested: Consider noting here (as live-environment.md does) that the deployed Function host is INERT until the empty Key Vault `cespkboxkvv76a47` is populated (box-client-secret + the two webhook signature keys) and BOX_CLIENT_ID is set — i.e. deployed-but-secret-free, consistent with the gates being OFF. Optional clarity edit; not strictly an inaccuracy in the existing prose.

## box-integration-pivot/01-box-capabilities-verified.md

- **[major]** §6 connector table parenthetical (lines 179-181): "(This is also exactly the bug in our committed `finalize-eva-box` flow ...)"
  - Verified: oldText matches verbatim+unique at lines 179-181 (special U+2011 hyphens in 'non‑existent' and the link text preserved). finalize-eva-box.definition.json contains NO CreateFolder operationId/action — only comments (lines 4,129) stating the Create_box_folder_UPPERCASE action was DELETED and folder-create is now implicit via CreateFile folderPath; fix landed in merged PR #13 (751d7cc). Tier is research/* (point-in-time) so action=flag and newText is a flag-note/suggestion, not a prose rewrite — tier-correct. 03- sibling carries the same stale claim.
  - Suggested: Point-in-time research dossier prose — do not rewrite the analysis. SUGGESTED correction once the operator chooses to refresh it: this was a real bug AT THE TIME OF WRITING but has since been FIXED. finalize-eva-box.definition.json now uses the first-party CreateFile `folderPath` (no `CreateFolder` op), and folder creation moved to the custom-connector flow box-folder-create. Recommend updating to past tense, e.g. "(This WAS exactly the bug in the then-committed `finalize-eva-box` flow — it invented a non-existent `CreateFolder` op; since fixed in the Phase-7 pivot, PR #13 — see 03-current-system-and-what-changes.md.)"

## box-integration-pivot/02-plans-and-cost.md

- **[minor]** TCO table — "Engineering to build it" row
  - oldText matches line 103 verbatim and uniquely; truth re-derived correct (box-fn deployed+Running+Gate-C-verified, gates OFF); tier=point-in-time research so flag-only with no prose rewrite is the right call; cost-attribution framing not actively misleading.
  - Suggested: No edit recommended. This is a point-in-time deep-research cost dossier (per 00-method-and-sources.md / README, dated 2026-06-21, tier = point-in-time research: flag staleness, do not rewrite). As a cost-attribution line the framing remains valid — the engineering effort is the real cost whether or not the webhook Function has since been deployed. Flagged only so a human knows the receiver portion of this build is now deployed + Gate-C-verified (cespkbox-fn-v76a47); the connector/webhook-subscription/KV-secrets/gate-flips are still pending. If the operator wants live-state accuracy here, the freshest place to reflect the deploy is CURRENT_STATUS / live-environment, not this frozen dossier.

## box-integration-pivot/03-current-system-and-what-changes.md

- **[major]** Key facts the pivot must build on — 'Box is already the archival destination' bullet: 'It is built but OFF, and mis-wired'
  - Truth confirmed against live flow def (CreateFolder deleted, S2 byte-read applied, state=off). Amended: original newText deleted the analysis bullet (tier violation); rewrote to PREPEND the flag and PRESERVE the original prose verbatim, matching findings 2/3.
  - Suggested: > **POINT-IN-TIME FLAG (this bullet, 2026-06-21) is now STALE — analysis left as-was per tier.** The Phase-7 build (merged PR #13, 2026-06-22) has applied the rewrite live in `flows/definitions/finalize-eva-box.definition.json`: the invented `Create_box_folder_UPPERCASE` op is REMOVED (folder creation moved to `box-folder-create`; finalize now AUGMENTS a pre-existing UPPERCASE folder), and the S2 fix is in place (each photo is read from Azure Blob via `GetFileContentByPath_V2` and its real bytes are uploaded, not the path string). The flow is still `state=off`, but it is no longer mis-wired and the rewrite is no longer pending.  - **Box is already the archival destination** — `finalize-eva-box` copies images (2‑previews‑then‑all   order), `.eml`, PDFs and the EVA JSON into a per‑case **UPPERCASE Case/PO folder**. It is **built but   OFF**, and **mis‑wired**: it invents a `CreateFolder` op the first‑party connector doesn't have and   uploads the Blob *path string* instead of file *bytes* (the "S2" bug). It needs the rewrite in   `docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md` before activation.

## box-integration-pivot/04-target-architecture.md

- **[major]** 'The one prerequisite that unlocks everything' — 'Azure Function webhook receiver (fits the existing FC1 Function estate)' bullet
  - Deploy confirmed by brief + live Azure probe (cespkbox-fn-v76a47 Running, Gate-C-verified, gated off, KV empty); connector half still future. oldText unique and verbatim; newText prepends flag and preserves the original bullet.
  - Suggested: > **POINT-IN-TIME FLAG (2026-06-21): the webhook-receiver Function described below is no longer purely future work — proposal prose left as-was per tier.** As of 2026-06-22 the receiver IS deployed: `cespkbox-fn-v76a47` (FC1) Running in rg-collisionspike-dev, 9 functions published, Gate-C-verified (no-key→401 / key+unsigned→400 / facade-gated-off→503), gated OFF (`BOX_API_ENABLED=false`), secret-free. Still pending (operator-blocked on CCG auth): the `cr1bd_box_rest` custom connector import/bind, `box-client-secret` + webhook signature keys in KV `cespkboxkvv76a47` (vault currently empty), the `FILE.UPLOADED` subscription, and any gate flip.  - **Azure Function webhook receiver** (fits the existing FC1 Function estate) — public HTTPS:443,   reputable‑CA cert; verify the `BOX-SIGNATURE-PRIMARY/SECONDARY` HMAC‑SHA256 + reject timestamps >10 min;
- **[minor]** Env-var gates table — '`BOX_METADATA_ENABLED` / `BOX_AI_ENABLED`' row
  - Confirmed: manifest line 30 ships BOX_METADATA_ENABLED; note line 38 explicitly excludes BOX_AI_ENABLED. oldText verbatim+unique. Used an HTML comment so the flag sits cleanly above a table row without breaking markdown; original row preserved.
  - Suggested: <!-- POINT-IN-TIME FLAG (vs shipped manifest): only `BOX_METADATA_ENABLED` was actually shipped into dataverse/environment-variables.json (default false, deferred). `BOX_AI_ENABLED` was deliberately NOT added (manifest note: add it additively when Phase C is taken up), so it remains a proposed-future gate name, not a live env-var. Table row left as-was per tier. --> | `BOX_METADATA_ENABLED` / `BOX_AI_ENABLED` | `false` | the Phase‑C enhancements |

## box-integration-pivot/08-relay-automate-assessment.md

- **[style]** Sources section, line 112: "[Automate features by plan (217)]"
  - Verified verbatim at line 112: `[Automate features by plan (217)]` is an empty markdown link label (no `(url)`), unlike the complete links flanking it. It is an external Box-support citation, not an internal repo cross-link, so under point-in-time tier rules it is correctly flagged not auto-edited (supplying an absent external URL would be fabrication).
  - Suggested: Supply the missing URL for the 'Automate features by plan' citation (the Box support article, or drop the empty link brackets and leave it as a plain local-mirror reference '(doc 217)'). Tier=point-in-time: do not rewrite analysis prose; this is a citation-formatting fix only, left to a human since the exact source URL is not in the repo.

## box-integration-pivot/README.md

- **[minor]** "How to read this folder" index table — row after 08-relay-automate-assessment.md (line 133)
  - Confirmed: directory listing shows 09-metadata-role.md exists (25171 bytes); Grep finds no reference to it anywhere in README — the index table stops at 08, leaving the file undiscoverable. oldText (line 133) matches verbatim/uniquely. Flag-only with advisory newText is appropriate.
  - Suggested: Add a row for 09-metadata-role.md (e.g. "| [09-metadata-role.md](./09-metadata-role.md) | The Box Metadata field's role — optional Business Plus reliability upgrade for structured registration capture (not the floor) |") so the index covers every file in the folder.

## box-integration-pivot/plans/00-BUILD-PLAN.md

- **[major]** Free-account REST live-test paragraph (lines 55-56)
  - oldText verbatim+unique. 'Only live touch' contradicts the box-webhook deploy + Gate-C verification this session. Flag (not auto-edit) is appropriate since surrounding prose needs human rewording.
  - Suggested: Reword 'the only live touch' — it is now stale. A second live action occurred this session: the box-webhook Function was deployed to rg-collisionspike-dev (cespkbox-fn-v76a47) and Gate-C-verified on the live host (no-key→401, key+unsigned→400, gated-off facade→503) but remains gated off and secret-free pending CCG authorization. The cloudflared/dev-tunnel approach was also removed — FILE.UPLOADED is to be tested against the deployed endpoint. Suggest: '**Free-account REST live-test:** a throwaway FREE Box account dev token proved 8/9 raw-REST ops ...'

## dataverse/README.md

- **[minor]** M1-live vs staged section / whole-doc Box schema silence
  - Confirmed all cited facts: case.json lines 49-53 carry the 5 cr1bd_box* columns; audit-event.json lines 31-33 carry the 3 Box audit options; environment-variables.json lines 26-32 carry the Box gates/config. action=flag (suggestion, not an exact edit) is the right call — table count is unchanged so the existing 'four tables' prose stays correct.
  - Suggested: Consider adding a short note (here or in the EVA-contract section) that the Phase-7 Box pivot (ADR-0012) added Box columns to the live Case table (cr1bd_boxfolderid/cr1bd_boxfilerequestid/cr1bd_boxfilerequesturl/cr1bd_boxsyncedat/cr1bd_boxfolderurl), 3 Box audit options (box_folder_created=100000019, box_file_request_copied=100000020, box_upload_received=100000021), and the Box env-var gates — all gated OFF, one-way mirror, Dataverse authoritative — so the schema-surface doc is not silent on live Box state. No table-count change (Box added columns/options, not tables).

## docs/activation/email-intake-activation.md

- **[major]** Step 4: chain ending in case-resolve; 'Leave OFF: status-evaluate (needs an EVA-validation connector not deployed yet)'
  - Confirmed: oldText matches email-intake-activation.md:65-68 verbatim; case-resolve state=on/activatedLive=true (flow-state.json:51-53); status-evaluate inline readiness (connection-references.json:116); m1 runbook Step 4 line 56 instructs turning status-evaluate ON. Flag (not edit) is correct given the cross-doc reconciliation needed.
  - Suggested: Reconcile to live state: (a) `case-resolve` is already ON (flow-state.json activatedLive=true) — drop it from the 'turn ON' list or note it is already on. (b) `status-evaluate` no longer needs the EVA-validation connector — it computes readiness INLINE (connection-references.json cr1bd_evavalidation note); the m1-flow-chain runbook (Step 4) instructs turning it ON, so this 'leave OFF' line contradicts the live chain. Suggested: '`intake` → `classify-persist` → `parse` → `provider-match` → `status-evaluate` (`case-resolve` is already ON). Leave OFF: `enrich`, `finalize-eva-box`, `chaser-draft`, `jobsheet-import` (later phases).' Needs operator/author confirmation on the exact intended go-live set.

## docs/activation/m1-flow-chain-activation.md

- **[major]** 'Verified current live state (2026-06-19)' dated section heading
  - Confirmed: heading is unique at line 10; intake.definition.json:463 explicitly states 'LIVE DIVERGES (verified 2026-06-21)... live CS Intake WAS subsequently wired to call Run_case_resolve (+ Run_enrich)'. Flag preserves the dated snapshot table per tier rules — correct.
  - Suggested: Add a staleness note under this dated heading (do not rewrite the dated table). Suggested: '> SUPERSEDED (2026-06-21): the live CS Intake was subsequently wired to invoke the downstream children (classify-persist → parse → status-evaluate → case-resolve → enrich) — verified 2026-06-21 (memory intake-repo-trails-live; intake.definition.json line 463). The table below is the 2026-06-19 snapshot, retained for history.' The dated table data itself stays as the historical record.
- **[minor]** Status banner: 'Status: prepared + de-risked, awaiting the operator's designer step.'
  - Confirmed: oldText matches banner at lines 3-4 verbatim; live chain wired per intake.definition.json:463 + memory intake-repo-trails-live. Flag is appropriate (banner wording is author's call).
  - Suggested: Update the banner to reflect that the live chain was subsequently wired (2026-06-21). Suggested direction: '> **Status (2026-06-21): the live CS Intake now invokes the downstream chain** (classify-persist → parse → status-evaluate → case-resolve → enrich), verified 2026-06-21 (memory intake-repo-trails-live). The repo intake.definition.json trails live (lacks Run_case_resolve + Run_enrich) — reconcile before any solution re-import. The runbook below records the original 2026-06-19 designer activation procedure.' Author to confirm exact current wording.

## docs/activation/multi-inbox-activation.md

- **[minor]** Scenario A.4: 'classify-persist/parse/status-evaluate flows are presently orphaned/manual'
  - Confirmed: oldText at lines 123-125 verbatim; live intake invokes the children per intake.definition.json:463 + memory. Minor/flag is correct — it is a side note, not the multi-inbox mechanism.
  - Suggested: Update to reflect the live chain. Suggested: '(As of 2026-06-21 the live CS Intake invokes classify-persist → parse → status-evaluate downstream — memory intake-repo-trails-live; the repo intake.definition.json trails live. Not a multi-inbox concern either way.)' Author to confirm.

## docs/architecture/architecture-audit-2026-06-20.md

- **[major]** Verified live state table — row 'EVA Sentry REST (M2)' = '_none_ (cespkeva-* absent)' / 'Deploy-pending — CORRECT by design'
  - oldText verbatim-unique. Brief lists cespkeva-fn-ufa3ci as deployed+Running; row was accurate on 2026-06-20 only. action=flag correctly leaves the dated table cell unmutated — covered by the top-of-file banner.
  - Suggested: As-of-date note covered by the SUPERSEDED banner: evasentry (cespkeva-fn-ufa3ci) and evavalidation (cespkeval-fn-6c6fxd) are now both deployed+Running. Leave the dated table row intact; do not rewrite a frozen 2026-06-20 record.
- **[major]** F11 — 'evasentry + evavalidation correctly absent (record only)'
  - oldText verbatim-unique. Brief: both deployed+Running, so F11's 'absent, no drift' is overtaken. action=flag is correct — frozen finding left intact, banner records it.
  - Suggested: F11's premise no longer holds: per the live brief both Functions are now deployed+Running (cespkeva-fn-ufa3ci, cespkeval-fn-6c6fxd). Do not rewrite this frozen finding; the top-of-file SUPERSEDED banner records the change. (If a future re-audit replaces this doc, mark F11 overtaken there.)
- **[minor]** F4 — 'parser-storage Bicep omits allowSharedKeyAccess:false' / 'the only one of the six Function storage accounts missing'
  - oldText verbatim-unique. Independently confirmed: parser bicep L97 = allowSharedKeyAccess:false; commit a8522a3 message = 'S7 parser-storage allowSharedKeyAccess:false'. newText correctly distinguishes F4 (bicep, resolved) from F4-apply (live mutation, possibly still open).
  - Suggested: RESOLVED since 2026-06-20: functions/parser/infra/main.bicep line 97 now sets allowSharedKeyAccess:false (commit a8522a3). Do not rewrite the frozen finding; the SUPERSEDED banner records it. F4-apply (the live storage mutation) may still be open — operator to verify cespikestx7xt3d returns allowSharedKeyAccess=false.
- **[minor]** F1 — 'DOC DRIFT: live-environment.md shows the M1 chain OFF, but it is ON' (highest impact)
  - oldText verbatim-unique. Confirmed live-environment.md L68-70 (CS Classify+Persist / CS Parse / CS Status Evaluate) all read ON. The F1 doc-drift remediation has landed. action=flag correct.
  - Suggested: RESOLVED since 2026-06-20: live-environment.md L68-70 now show CS Classify+Persist / CS Parse / CS Status Evaluate all ON. Leave the frozen finding intact; the SUPERSEDED banner at the top records resolution.
- **[minor]** Cloud flows section — 'flows/flow-state.json declares 12 definitions (totalFlows: 12)' / 10/12 framing
  - oldText verbatim-unique. Confirmed flows/flow-state.json L178 = totalFlows:15 (added box-folder-create / box-file-request-copy / box-blob-purge). 12 was a pre-Phase-7 snapshot. action=flag correct.
  - Suggested: Dated count: flow-state.json now declares totalFlows:15 (the three Phase-7 Box flows were added after this audit). Do not rewrite the frozen 12/10 figure; the SUPERSEDED banner notes the Phase-7 growth.
- **[minor]** Dataverse solution — 'Env-var feature gates (dataverse/environment-variables.json, 11 declared)'
  - oldText verbatim-unique ('11 declared' count=1). Independently confirmed: manifest declares exactly 18 cr1bd_ env-vars = 11 M1 + 5 BOX_* gates + 2 BOX_* config strings. 11 was a pre-Phase-7 snapshot. action=flag correct.
  - Suggested: Dated count: the manifest now declares 18 variables (the original 11 + seven Phase-7 BOX_* entries). Do not rewrite the frozen '11 declared' figure; the SUPERSEDED banner notes the Phase-7 additions.

## docs/architecture/environment.md

- **[minor]** ## Open decision — where does the parser run? / option 3 line 63
  - oldText matches verbatim and is unique at line 63; '(none today)' is genuinely stale per the brief (subscription e6076573-… exists, 6 Functions deployed/Running). Flag (not in-place edit) is correct: the file header (lines 3-9) already disclaims the body as historical and line 69 already records 'Decided: option 3 (subscription provisioned)', so this is low-risk residue in a header-disclaimed companion to live-environment.md. Severity minor is right.
  - Suggested: This is historical: as of 2026-06 the Azure subscription (e6076573-…, rg-collisionspike-dev) DOES exist and the parser/enrichment/address/EVA/box-webhook Functions are deployed and Running. Per the doc's own header, treat this whole section as a preserved pre-Sandbox snapshot; the resolved decision lives in ADR-0004/0006 and the current deployment in live-environment.md. Suggest the maintainer append a one-line "RESOLVED — Azure subscription provisioned; Functions deployed; see live-environment.md" marker here so the "(none today)" line is not read as still-current. (Flag, not rewritten: this is decision-record-adjacent prose in an intentionally-historical doc whose header already redirects to the canonical registry.)

## docs/architecture/repo-constellation.md

- **[minor]** cedocumentmapper_v2.0 section, "Outstanding" bullet (line 53): "review UI (0%)"
  - Frontend scaffold + UX investigation note genuinely exist; flag (no prose lands) is correct for a non-canonical sibling repo. Corrected the file count to the verified 20 tracked (git ls-files) vs the claimed 26.
  - Suggested: Consider updating the review-UI status: cedocumentmapper_v2.0 now has a frontend/ Vite+TS scaffold (20 tracked files) and an investigation/05-ux-and-ui-redesign.md note, so "review UI (0%)" understates current progress. Needs a current read of the sibling repo to set the right figure (it is prior-art, not collisionspike live state).

## docs/plans/m2-umbrella-enrichment-to-scale.md

- **[minor]** §0 TL;DR item 2 (lines 33-36): "build the net-new `cr1bd_evasentry` Function + connector … Also build the net-new `cr1bd_evavalidation` Function/connector"
  - Confirmed as a flag (no edit applied). Same staleness as F2/F3, already covered by the F3 banner (§0 included); advisory pointer so a reader does not re-scope completed build work. oldText matches verbatim + unique.
  - Suggested: Suggest: replace "build the net-new … Function + connector" with "import + bind the (already-built, now-deployed-gated-off) `cr1bd_evasentry` and `cr1bd_evavalidation` Functions/connectors" — both exist in functions/ and are deployed (cespkeva-fn-ufa3ci, cespkeval-fn-6c6fxd). Keep the OAuth-grant rationale.
- **[minor]** §6 heading (line 212): "Sub-phase M2.B — EVA validation surface (net-new Function + connector)" (and §7 heading, line 258)
  - Confirmed as a flag (no edit applied). §6 heading oldText matches verbatim and is unique (the substring 'net-new Function + connector' appears twice but the full heading line is unique). Headings are stale; flagged, not auto-edited, per the proposer's human-call intent.
  - Suggested: Suggest the headings read "(Function built + deployed gated-off — bind + activate)" rather than "(net-new Function + connector)" for both §6 (M2.B) and §7 (M2.C), per repo functions/evavalidation/ + functions/evasentry/ and deployed cespkeval-fn-6c6fxd / cespkeva-fn-ufa3ci.
- **[minor]** §5 M2.A, item A.3 (line 186): DVSA/DVLA creds "Function reads via `@Microsoft.KeyVault(SecretUri=…)`"
  - Confirmed as a flag (no edit applied). Live-probe: enrich app has zero @Microsoft.KeyVault refs and KV cespkenrichkvgi62sd is empty; live-environment.md L25 verbatim flags creds as 'plain app settings (bicep intends KV refs — hygiene deviation)'. The plan's KV-ref prescription is forward-intent, so a flag (not a rewrite) is correct. oldText matches verbatim + unique.
  - Suggested: Note (live divergence): enrichment was activated 2026-06-20 with DVSA/DVLA creds as PLAIN app settings, not KV refs — cespkenrichkvgi62sd is empty and the live function holds no @Microsoft.KeyVault references (bicep intends KV refs; live is a hygiene deviation per live-environment.md L25). The KV-ref path here is the intended design, not the as-built state.

## docs/plans/phase-0-foundations/README.md

- **[link]** "Needs the operator" lines 29-30 — committed parser function key (rotation)
  - Grep: no A31IJ9/functionKey/x-functions-key/parser-config in mockup-app/src; gated.md has zero parser-key/rotation matches. Dangling cross-ref. Correctly a flag, not a mechanical rewrite.
  - Suggested: Resolve: the committed parser key was removed from source (parser-config.ts deleted; parser-connector-transport.ts is now the default path) and gated.md no longer lists a parser-key rotation item — either confirm the Azure key was rotated and drop this paragraph, or restore the entry in gated.md. As written it is a dangling reference to a blocker that no longer exists in gated.md.
- **[minor]** Checklist item 10 line 20 — "all flows off"
  - flows/flow-state.json: 15 flows, 1 on (case-resolve), 14 off. oldText matches line 20 verbatim. Phase-0 deliverable marker was literally true at completion; flag the live-state nuance rather than edit. Minor.
  - Suggested: Clarify this is the as-shipped Phase-0 boundary state: at Phase-0 completion all flow definitions were state=off. Since then case-resolve has been activated live (state=on, 2026-06-20). Consider 'all flow definitions shipped `off` (Phase-0)' to avoid implying the live environment still has every flow off.

## docs/plans/phase-0-foundations/code-audit-cleanup.md

- **[major]** Header line 5 (Date: 2026-06-18) — CRITICAL/SHOULD findings C1–C5, S6
  - Verified live: parser-config.ts gone + no key in src (C1/C2), mock/cases|activity|evidence|providers.ts deleted + src/domain/ present (C3), PowerProvider.tsx exists (C5), package.json desc updated (S6). Dated audit snapshot — flag (banner), no prose rewrite. Tier-safe.
  - Suggested: Add a dated resolution banner near the top (do not rewrite the analysis): note that as of 2026-06-22 the CRITICAL/SHOULD items C1 (key removed from source), C2 (raw fetch retired, parser-connector-transport.ts is the default), C3 (fabricated mock case data deleted; mock/ split into mock/ + src/domain/), C5 (PowerProvider.tsx added) and S6 (package.json description updated to "Dataverse-backed via the @microsoft/power-apps SDK") are implemented; the document stands as the historical 2026-06-18 findings record. Point-in-time analysis — flag staleness, do not edit the per-finding prose.

## docs/plans/phase-1-intake-and-case-tracking/README.md

- **[minor]** Item 12: '10 cloud flows imported state=off'
  - oldText matches line 34 verbatim. flows/definitions = 15 files (ground truth); flow-state.json shows case-resolve state=on. The flat '10 ... state=off' is the M1 snapshot, now superseded. Flag correct.
  - Suggested: Reconcile the count/state to current reality: flows/definitions/ now has 15 definitions (10 M1 + intake-shared-mailbox + 3 Phase-7 Box flows), 14 state=off and case-resolve state=on (activatedLive, merge-by-registration). Phase-7 Box flows are out of Phase-1 scope but the '10 ... state=off' line reads as a stale absolute. Suggest: '10 M1 cloud flows imported (intake live + case-resolve ON; rest off)'.

## docs/plans/phase-1-intake-and-case-tracking/code-app/logo-fix-findings.md

- **[major]** Title + Root cause (lines 1-4)
  - oldText matches lines 1-4 verbatim. CURRENT_STATUS L368 'Logo is NOT broken' + L302 'logo renders (data-URI)' + README item 11 [x] confirm the fix shipped. Stale point-in-time finding; flag correct, body preserved.
  - Suggested: Add a top banner: 'RESOLVED (point-in-time diagnostic, 2026-06-18) — the logo now renders on the live app via an inlined data-URI; see CURRENT_STATUS.md ("Logo is NOT broken") and README item 11 (logo/fonts/nav fixed).' Leave the diagnostic body as the historical record.

## docs/plans/phase-1-intake-and-case-tracking/code-app/ui-redesign.md

- **[minor]** §0 TL;DR item 1 (lines 27-29)
  - oldText matches lines 27-29 verbatim. Genuine in-folder contradiction with logo-fix-findings.md (binary-corrupt vs never-broken); CURRENT_STATUS confirms the data-URI fix shipped and that the createElement console error (L305/L370) is still open. Minor reconciliation flag is fair.
  - Suggested: Add a one-line reconciliation note pointing to the resolved outcome (logo now ships as a data-URI; CURRENT_STATUS 'Logo is NOT broken') and acknowledging that the co-located logo-fix-findings.md reached the opposite (binary-corruption) conclusion on the same date — the data-URI fix is what actually shipped. Point-in-time UI design body otherwise stands.

## docs/plans/phase-1-intake-and-case-tracking/phase-1-operational.md

- **[critical]** §0 TL;DR blocker #2
  - Verified verbatim (lines 32-37). functions/evavalidation/ exists with the exact contract; brief + CURRENT_STATUS L183 ('cespkeval-fn-6c6fxd DEPLOYED + Running') and L163 ('EVA-validation Function PROVEN') confirm. Headline blocker is stale; flag is correct.
  - Suggested: SUPERSEDED (point-in-time, authored 2026-06-18): the validation Function has since been BUILT and DEPLOYED. The directory is `functions/evavalidation/` (function_app.py exposes POST /api/validate-case returning `{ fieldsValid, imagesValid, openIssues[] }`; openapi/evavalidation-connector.json declares operationId `ValidateCase`); it is live as `cespkeval-fn-6c6fxd` (Running). Only the `status-evaluate` connector repoint (M2.B activation) remains. Add a dated 'SUPERSEDED — validation Function now built+deployed; see CURRENT_STATUS.md' banner at the top of this doc rather than treating blocker #2 as open.
- **[major]** §4 connection-bindings table, row cr1bd_evavalidation
  - oldText matches line 262 verbatim. Function + connector OpenAPI present in-repo and deployed per brief; the 'needs Function deployed first' prerequisite is satisfied. Flag is accurate.
  - Suggested: Update to reflect that the validation Function (functions/evavalidation/, cespkeval-fn-6c6fxd) and its connector OpenAPI already exist and the Function is deployed — Path 1's blocker is now just importing/binding the connector and repointing status-evaluate, not net-new Function work. (Point-in-time doc; prefer a top-of-file superseded banner over rewriting design prose.)
- **[major]** Appendix — evidence base, final bullet
  - oldText matches lines 449-451 verbatim. ls confirms functions/evavalidation/ present (the doc looked for the wrong name 'validation'); the validation Function exists and is deployed. Stale assertion, flag correct.
  - Suggested: Flag the trailing 'No functions/validation/ directory exists' as superseded: the validation Function lives at functions/evavalidation/ and is deployed (cespkeval-fn-6c6fxd). (Point-in-time evidence snapshot — note the correction rather than rewriting the 2026-06-18 reads.)
- **[major]** §0 blocker #1, 'The pipeline is not wired together at all'
  - oldText matches lines 23-25 verbatim. flow-state.json shows case-resolve state=on/activatedLive; MEMORY intake-repo-trails-live confirms live CS Intake invokes Run_case_resolve+Run_enrich. Flag is correct; no text overlap with finding #9 (different substring of same para).
  - Suggested: Add a superseded note: as of 2026-06-20/21 the live CS Intake was wired (Run_case_resolve + Run_enrich inserted in the designer; case-resolve is live-invoked, merge-by-registration). The repo intake/enrich definitions still TRAIL live — reconcile before any solution re-import (see MEMORY intake-repo-trails-live). Treat blocker #1 as substantially resolved on the live env, not open.
- **[minor]** §0 blocker #1: 'confirmed by grep across all 10 definitions'
  - oldText matches lines 27-28 verbatim and is unique. 15 flow definitions now exist (ground truth) and MEMORY intake-repo-trails-live + CURRENT_STATUS confirm live child-flow wiring was added. Flag correct; non-overlapping substring vs finding #4.
  - Suggested: Note as point-in-time: there are now 15 flow definitions, and the live CS Intake since gained Run_case_resolve + Run_enrich child invocations (the repo defs still trail live). The 2026-06-18 'all 10 / zero child-flow' grep no longer holds.

## docs/plans/phase-3-enrichment-and-eva/enrichment-activation.md

- **[minor]** §6 first [BUILD] item (lines 206-208) — DVSA 429 hardening listed as pending
  - Confirmed both 'buildable now' items are live in source and recorded done (CURRENT_STATUS line 177). Flag is correct because the same status is woven through §3 gap (b) and §9; reconcile markers without rewriting design. oldText matches lines 206-208 verbatim.
  - Suggested: Mark these §6 pre-activation hardenings DONE and reconcile §3 gap (b): the 429/5xx-parity retry (dvsa_client.py `_RETRY_SAFE_STATUS = {429,500,502,503,504}`, used at dvsa_client.py:288) and the no-secrets dry-run self-check (function_app.py `selfcheck_report()` + `{"dry_run":true}` branch) are built and covered by tests (CURRENT_STATUS line 177). Flip the [ ] checkboxes to [x] and reword '§3 gap (b)' as resolved. Flagged rather than auto-edited because it spans the §3 design narrative; reconcile the status markers only.

## docs/plans/phase-3-enrichment-and-eva/eva-sentry-rest-submission.md

- **[major]** Status block (lines 3-10) — 'is already built offline' + deploy-as-next-step framing
  - Confirmed deploy is done (brief/LIVE-PROBE/CURRENT_STATUS line 181); the deploy-pending framing recurs through §3/§8, so flag (not blanket edit) is correct. oldText matches lines 3-5 verbatim. Note KV cespkevakvufa3ci is empty so creds genuinely still pending — the flag's remaining-sequence list is accurate.
  - Suggested: Update the Status block to reflect that the Function is now DEPLOYED gated-OFF (`cespkeva-fn-ufa3ci`, Running, `EVA_API_ENABLED=false`); the remaining sequence is connector-import/bind → creds → test flip → parity-gated prod cutover. Also reconcile §8 step 3 ('Deploy the Function + Key Vault', tagged [DEPLOY-WITH-LOGIN]) to '(done — `cespkeva-fn-ufa3ci`)' and §1 table could add a 'Live Function' row noting the deploy. Left as a flag because the deploy-pending framing is woven through the runbook narrative; reconcile the explicit status markers without rewriting the design body.

## docs/plans/phase-3-enrichment-and-eva/eva-validation-function.md

- **[major]** §8 step 4 (line 276) — 'Deploy the Function' [DEPLOY-WITH-LOGIN]
  - Confirmed: cespkeval-fn-6c6fxd deployed+Running with /api/validate-case (brief LIVE AZURE FUNCTIONS, LIVE-PROBE state:Running, CURRENT_STATUS line 183). Connection is still genuinely unbound (Unbound/declared-but-unused, §1 table line 67), so the bind/repoint steps stay accurate — only the deploy framing is stale. Flag is correct. oldText matches line 276 verbatim.
  - Suggested: Reconcile to deployed reality: the evavalidation Function is now DEPLOYED + Running as `cespkeval-fn-6c6fxd` (route `POST /api/validate-case`) per the brief and LIVE-PROBE (and CURRENT_STATUS line 183). Mark §8 step 4 '(done — `cespkeval-fn-6c6fxd`, Running)'; set the connector host placeholder (§5 step 5 / §1) to `cespkeval-fn-6c6fxd.azurewebsites.net`; and soften §0/§1 'what remains is activation' to note the deploy itself is done and only connector import + bind + the §5 status-evaluate repoint remain (the connection is still genuinely unbound — live-environment.md). Flagged because the not-yet-deployed framing recurs through the runbook; reconcile the status markers without rewriting the design.

## Inspection-address matcher plan — REMOVED 2026-06-23 (ADR-0013)

- **[resolved]** The earlier flags here concerned the runtime inspection-address matcher plan (its
  Function route/contract and activation runbook). That whole stack — the Azure Function, its
  companion resolve flow, the custom connector, and the planning doc — was **removed root-and-stem
  on 2026-06-23** because it misread `Loc` (an EVA-export artifact) as a runtime intake input. The
  live model is the offline-derived full-address suggestions corpus + manual confirm; there is no
  runtime matcher. See `docs/architecture/inspection-address-corpus.md` and
  `docs/adr/0013-loc-export-artifact-no-runtime-address-matching.md`. Nothing here remains to flag.

## docs/plans/phase-5-ocr-and-scale/ocr-strategy.md

- **[minor]** §5.3 heading (line 170): "Container image (sketch — `functions/parser/Dockerfile`, new)" and the §8 in-parser steps
  - oldText matches line 170 verbatim. Confirmed the as-built diverged: top-level ocr/ holds function_app.py, ocr_pdf_adapter.py, plate_adapter.py, infra/main.bicep, openapi/ocr-connector.json (operationIds OcrPdf + PlateOcr), routes /api/ocr-pdf + /api/plate-ocr; ocr/README.md §'Why this is a SEPARATE host' + ocr/function_app.py 'SEPARATE Azure' confirm it. §8 steps 1-2 do reference functions/parser/Dockerfile + functions/parser/function_app.py. action=flag (dated research/plan tier) correctly inserts a superseded-note above the design rather than rewriting it.
  - Suggested: Point-in-time planning note (2026-06-18): this section proposed extending the parser app in place. The OCR host actually shipped as a SEPARATE top-level `ocr/` app (own Dockerfile, infra/main.bicep, openapi/ocr-connector.json with ops OcrPdf+PlateOcr; routes /api/ocr-pdf + /api/plate-ocr), deployed as cespkocr-fn-dev-glju3v, leaving the FC1 parser untouched. See ocr/README.md for the as-built design; treat the 'functions/parser/...' file paths in §5.3/§8 as superseded.

## docs/plans/phase-7-box-integration/README.md

- **[minor]** Status block — '(CCG mint + HMAC receiver; pytest 71)'
  - Confirmed as a FLAG (not auto-edit): 71->79 is real per live-environment.md ('pytest 79 passed') + REMAINING-STEPS.md; but 71 also appears in CURRENT_STATUS.md:61, gated.md:127, ROADMAP.md:249, 00-BUILD-PLAN.md:43 — all must move in lockstep. oldText matches line 27 and is unique.
  - Suggested: Update to pytest 79 (test_scope_lock.py added this session). Note CURRENT_STATUS.md, gated.md, ROADMAP.md and box-integration-pivot/plans/00-BUILD-PLAN.md still cite 71 — reconcile those together so the count is consistent repo-wide (live = 79, per live-environment.md and REMAINING-STEPS.md).

## docs/requirements/intake-workflow.md

- **[minor]** Target pipeline step 9 (lines 20-21)
  - oldText matches verbatim (unique). ADR-0012 line 8 'a folder at parse-confirm, not only at submit' and line 113 BOX_FOLDER_AT_INTAKE_ENABLED gate confirm the timing shift; CLAUDE.md precedence (ADR > requirements specs) supports reconciling. action=flag (not rewrite) is correct for a target-behaviour requirements doc; all BOX_* gates currently off.
  - Suggested: Reconcile the Box-folder timing to ADR-0012: the folder is created at parse-confirm (gated by BOX_FOLDER_AT_INTAKE_ENABLED), with the EVA submit / finalise step augmenting it — not first creating it at submit. Suggested: note that folder-create now happens earlier in the pipeline per the Phase-7 Box pivot, and that Box is currently gated off (additive one-way mirror; Dataverse authoritative).

## docs/research/00-strategy.md

- **[major]** Move #5 row in the value-vs-effort table (line 27)
  - CONFIRMED: oldText verbatim+unique (line 27); live probe cespkenrich-fn-gi62sd ENRICHMENT_ENABLED=true. Point-in-time tier so flag not rewrite — correct action.
  - Suggested: Stale: enrichment was activated 2026-06-20 (ENRICHMENT_ENABLED=true live in Dev). Point-in-time doc dated 2026-06-18 — do not rewrite the analysis; a dated 'SUPERSEDED — enrichment now live' note at the top would keep it honest. Authoritative current state: CURRENT_STATUS.md / live-environment.md.
- **[major]** One-line read of where we are, line 5
  - CONFIRMED: oldText verbatim+unique (line 5); repo flows/definitions/ holds 15 defs and live registry shows the named downstream flows ON. Flag is correct for the point-in-time tier.
  - Suggested: Stale snapshot (2026-06-18): classify-persist, parse, status-evaluate, enrich are now ON (2026-06-20); only Finalize (EVA+Box), Chaser and Job Sheet remain OFF, and the estate is now 15 flow definitions incl. the Phase-7 Box flows. Point-in-time doc — do not rewrite; defer to CURRENT_STATUS.md / live-environment.md for live flow state.

## docs/research/01-power-platform-native.md

- **[minor]** Grounding blockquote, line 11
  - CONFIRMED: oldText verbatim+unique (line 11); 15 flow defs in repo, named flows now ON. Flag (note, not prose deletion) is tier-correct for a point-in-time lane doc.
  - Suggested: Stale grounding (2026-06-18): the downstream flows named here (Classify+Persist, Parse, Status Evaluate, Enrich) went ON 2026-06-20 and the estate grew to 15 flow definitions with the Phase-7 Box pivot. Point-in-time lane doc — do not rewrite the analysis; a dated 'state has since moved on, see CURRENT_STATUS.md' note would suffice.

## docs/research/02-azure-ai-document.md

- **[minor]** §0 table, Enrichment Function row (line 26)
  - CONFIRMED: oldText verbatim+unique (line 26); live probe ENRICHMENT_ENABLED=true. Flag is tier-correct.
  - Suggested: Stale (2026-06-18): enrichment is now gated-ON (ENRICHMENT_ENABLED=true, 2026-06-20). The 'gated-OFF' label is the only stale state cell; the Azure-pattern analysis around it (managed identity -> Key Vault) remains valid. Point-in-time doc — flag, do not rewrite.
- **[minor]** §7b Key Vault / managed identity hardening (line 266)
  - CONFIRMED: oldText verbatim+unique (line 266). Live probe is explicit — cespkenrich-fn-gi62sd has NO @Microsoft.KeyVault references; vault cespkenrichkvgi62sd empty. The 'already does this right' premise is genuinely false now. Flag (not rewrite) is tier-correct; recommendation preserved.
  - Suggested: Inaccurate vs live: cespkenrich-fn-gi62sd holds NO KV references (DVSA/DVLA creds are plain app settings — a documented hygiene deviation, live-environment.md), and cespkenrichkvgi62sd is empty. The KV-reference pattern IS used on the EVA/Box functions but their vaults are empty too. Point-in-time doc — flag; the recommendation (use KV refs + MI) is still sound even though the 'already does this' premise is now wrong.

## docs/research/README.md

- **[minor]** 'The convergent answer' framing, lines 3-4
  - CONFIRMED: oldText verbatim+unique across lines 3-4 (newline preserved). Phase-7 (ADR-0012, box-webhook fn, 5 BOX_* gates, 15 flow defs) postdates this 2026-06-18 index. Flag is tier-correct for a point-in-time index.
  - Suggested: Point-in-time (2026-06-18 lanes). Since then the Phase-7 Box-centric intake pivot (ADR-0012) landed: schema+5 BOX_* gates live (off), box-webhook Function deployed gated-off (cespkbox-fn-v76a47), 15 flow defs. This index predates that — do not rewrite the lane analyses; a dated banner pointing readers to CURRENT_STATUS.md / docs/plans/phase-7-box-integration/ for the post-2026-06-18 state would keep it honest.

## docs/review-followups-2026-06-19.md

- **[major]** Must-fix #1 — "OCR host not actually serving" ("host deploy is honestly marked pending (revision provisioning expired 3×)")
  - oldText is a verbatim, unique substring (ends at the period before ' Failed-deploy scaffolding' on the same line); live probe confirms cespkocr-fn-dev-glju3v state=Running, OCR_PROVIDER=tesseract — the 2026-06-19 'deploy pending' line is genuinely stale; flag-only respects the dated-snapshot tier.
  - Suggested: STALE as of 2026-06-22: the OCR host (cespkocr-fn-dev-glju3v, Functions-on-ACA) is now DEPLOYED and Running (gated off). This dated 2026-06-19 follow-up records the then-pending state; do not edit the frozen finding, but a reader should consult CURRENT_STATUS.md / live-environment.md for the now-deployed OCR host. Consider adding a one-line "superseded for OCR host status" banner at the top of this dated doc.
- **[major]** Follow-ups #4 — "turn **`CS Case Resolve` OFF** in live (it is ON-but-orphaned — no trigger invokes it)"
  - oldText verbatim/unique (ends at 'no trigger invokes it).' before ' Live intake dedups'); flow-state.json confirms case-resolve state=on/activatedLive=true/[CLAUDE-WIRED 2026-06-20] and brief confirms Run_case_resolve invocation — the 'turn OFF / orphaned' recommendation no longer holds.
  - Suggested: SUPERSEDED 2026-06-20: case-resolve was NOT turned off. It was repurposed to MERGE-BY-REGISTRATION and turned ON live, and is now invoked by CS Intake via Run_case_resolve after parse (verified live 2026-06-21; flows/flow-state.json: case-resolve is the lone state=on flow, [CLAUDE-WIRED 2026-06-20]). Frozen dated finding — do not rewrite; flag only so the reader knows the recommendation was overtaken.
- **[minor]** Follow-ups #7 — "OCR ACA host deploy (the deferred deploy)"
  - oldText verbatim/unique at line 67; brief + live probe confirm OCR host deployed with UAMI cespkocr-acrpull-id and managed env cespkocr-env-dev, Running — the 'deferred deploy' is done. Flag respects the dated tier.
  - Suggested: STALE: the OCR ACA host deploy is now COMPLETE (cespkocr-fn-dev-glju3v Running, UAMI cespkocr-acrpull-id, env cespkocr-env-dev), gated off. This dated 2026-06-19 follow-up records it as deferred; do not rewrite — flag only.

## docs/reviews/190626/new-case/review.md.md

- **[minor]** filename: new-case/review.md.md (double .md extension)
  - Glob confirms the new-case area file is review.md.md while all six other 190626 area folders use review.md; docs/reviews/README.md line 19 defines review.md as the area findings filename. Filename anomaly only (a **/review.md glob would miss it); rename flagged, no prose touched.
  - Suggested: Suggest renaming to docs/reviews/190626/new-case/review.md to match the documented convention (README: each area has a review.md). Frozen review folder — operator/human rename only; do not touch the file's prose.

## functions/enrichment/README.md

- **[minor]** ## Secret handling — Key Vault only — "values are Key Vault references ... resolved by the platform via the Function's system-assigned managed identity"
  - CONFIRMED divergence, AMENDED to a pure flag (no text applied): oldText matches verbatim at README L123-126; infra/main.bicep genuinely declares these four KV refs (L223-236) + the Key Vault Secrets User RBAC grant (roleId 4633458b..., L245), so the README accurately describes the TEMPLATE. But live-probe (re-run via az): cespkenrich-fn-gi62sd carries DVSA_CLIENT_ID/SECRET/API_KEY + DVLA_API_KEY as app settings whose values are PLAIN credentials (DVSA_CLIENT_ID=a raw GUID), with ZERO settings starting with @Microsoft.KeyVault, and vault cespkenrichkvgi62sd holds 0 secrets — yet ENRICHMENT_ENABLED is set and the app is Running. So the deployed Dev app does NOT use the KV-reference mechanism this README/bicep prescribe; secrets are plain app settings. Rejected the original newText (it was an editor meta-instruction, not droppable doc prose, and could legitimize the less-secure plain-setting wiring). Flag only — the operator should decide whether to bring the live deploy onto KV refs (per bicep) rather than rewrite the README to document plain settings.
  - Suggested: 

## raw/inspection_address_helper/current_status.md

- **[minor]** "Relevant implementation files include `src/lib/inspection-location.ts`, `src/parser/` ..."
  - oldText matches line 12 verbatim; file is an AI-DOC under raw/ (flag-only per unit standard). Verified via Glob that inspection-location.ts does NOT exist anywhere in the spike — confirms it is collisioncc reference-build layout, not a stale spike live-state claim.
  - Suggested: Historical research artifact (AI-DOC) — paths refer to the collisioncc reference build, not the collisionspike layout (functions/parser, mockup-app/src). No edit; flagged so it isn't mistaken for the spike's live implementation.

## raw/provider_principal_garage_corpus/current_status.md

- **[minor]** "Relevant implementation files include `src/lib/provider-corpus.ts`, `src/parser/provider-config.ts` ..."
  - oldText matches line 12 verbatim; AI-DOC under raw/ (flag-only). Verified via Glob that provider-corpus.ts and provider-knowledge.ts do NOT exist in the spike — confirms collisioncc reference-build layout; spike corpus lives in cr1bd_workprovider (Dataverse) + functions/parser.
  - Suggested: Historical research artifact (AI-DOC) — paths refer to the collisioncc reference build, not collisionspike (corpus = cr1bd_workprovider in Dataverse + functions/parser). No edit; flagged for context only.

