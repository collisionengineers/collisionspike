\# Multi-persona deep code review — collisionspike



\*\*Date:\*\* 2026-07-20  

\*\*Scope:\*\* Whole codebase (not a PR). Branch `main`.  

\*\*Method:\*\* Six parallel specialist subagents + synthesis under the strict code-review skill.  

\*\*Verdict:\*\* \*\*Request structural work.\*\* Product and reliability intent are strong; incidental structure and incomplete half-migrations are the failure mode.



\---



\## Review board (personas)



| Persona | Lens | Grade of their area | Stance |

| --- | --- | --- | --- |

| \*\*A. Durable / intake architect\*\* | Orchestration control flow | \*\*Request-changes\*\* | Highest structural severity |

| \*\*B. Data-API principal\*\* | Service module ownership | Strained, not rotten | Mechanical moves, no frameworks |

| \*\*C. SPA frontend architect\*\* | Web contracts \& controllers | \*\*B−\*\* structure / \*\*A−\*\* purity | Finish half-migrations |

| \*\*D. Domain / contract purist\*\* | `@cs/domain`, server-runtime, parity | Sound core, sloppy packaging | Taxonomy + identity pack |

| \*\*E. Reliability / SRE\*\* | Outbox, monitors, generations | \*\*B−\*\* reliability structure | Align protocols; registry, not mega-drain |

| \*\*F. Python services architect\*\* | `services/functions/\*\*` | Accept / hold course | Module split; affirm ADR-0032 |



\---



\## Executive synthesis (board consensus)



\### Approve bar (skill)



Fails as a healthy baseline on:



1\. \*\*Missed code judo\*\* — intake disposition + shared evidence attach; SPA dual-contract fiction; mirror complete/defer fork  

2\. \*\*Spaghetti accretion\*\* — 804-line intake generator, \~73 casts, order-dependent fall-through  

3\. \*\*Boundary dual-worlds\*\* — `DataAccess` vs Ext (casts are \*noise\* after Ext became truth); dual `ParserEvaFields`; dual `recomputeStatus`  

4\. \*\*Incomplete generalisation\*\* — server-runtime landed; monitor ensure and outbox response handling still multi-homed  



\### What the board agrees must NOT be “simplified”



\- Dark gates / suggest-first triage (ADR-0019); env only inside activities  

\- Stage A category drives mint; Stage B only short-circuits via explicit arms  

\- VRM-only never auto-attaches (ADR-0010)  

\- Generation counters + request-in-decision-TX + API-verified ack (ADR-0030)  

\- Vendored parser; no in-tree rewrite (ADR-0018)  

\- Independent Python packaging (ADR-0032); shared \*checks\*, not shared runtime clients  

\- Three specialized outbox \*data planes\* (mirror / provider / file-request) — \*\*do not merge into one mega-drain\*\*  

\- `@cs/domain` vs `@cs/server-runtime` split (ADR-0031)



\### Highest-leverage sequence (board rank)



| # | Move | Personas | Deletes complexity |

| ---: | --- | --- | --- |

| 1 | Pure \*\*IntakePlan\*\* + single \*\*finishOnExistingCase\*\* + \*\*maybeRetro\*\* + type root envelopes | A | Triple evidence chain, twin retro, cast soup, fall-through hazards |

| 2 | Align \*\*archive-mirror complete/defer\*\* with provider’s pending→defer | E | Protocol fork / hot re-attempt thrash |

| 3 | One honest \*\*StaffDataAccess\*\*; delete Ext casts; stub factory | C | Cast fiction + triple stub drift |

| 4 | Slice \*\*`features/cases`\*\* by capability; move `withServiceAuth` to platform; rename dual `recomputeStatus` | B | Navigation tax, wrong-import risk |

| 5 | Lift \*\*taxonomy + ParserEvaFields wire type + provider content-match\*\* out of DTO/support grab-bags; close \*\*VRM D2\*\* | D | Dual definitions, codecs→dto inversion |

| 6 | \*\*Monitor registry\*\* (ensure/Failed revival); leave data-plane protocols lane-owned | E | N ensure dialects |

| 7 | Split fat \*\*function\_app.py\*\* (box-webhook, parser) — behaviour-neutral | F | Review surface |

| 8 | Authoring-repo split of vendored `engine.py` on next re-vendor | F, D | Giant rules files (not this repo) |



\---



\## Size map (owned production, tests excluded)



| Area | \~Files | \~Lines |

| --- | ---: | ---: |

| `services/functions` | 129 | \~31k |

| `services/data-api/src` | 139 | \~29k |

| `apps/web/src` | 125 | \~25k |

| `services/orchestration/src` | 85 | \~15k |

| `packages/domain/src` | 37 | \~6.8k |

| `packages/server-runtime/src` | 8 | \~0.6k |



\*\*data-api feature density:\*\* cases \~92 files (kitchen sink); inbound 36; assistant 25; evidence 24; archive 18.  

\*\*HTTP:\*\* ≥125 `app.http`; ≥52 on internal modules alone.



\---



\# Persona A — Durable intake architect



\*\*Primary file:\*\* `services/orchestration/src/workflows/intake/intakeOrchestrator.ts` (\*\*\~804 lines\*\*, \*\*\~73 casts\*\*, \*\*\~33 `inbound as {…}`\*\*, \*\*8 terminal returns\*\*, \*\*\~12 identical best-effort try/catch\*\*).



\### Quantified damage



Activities already type `InboundEnvelope`, `ProviderMatchActivityResult`, `InboundClassification`, `TriagePolicyDecision`. The orchestrator types A0/A1 as \*\*`unknown`\*\* and recasts forever — including:



```ts

const inboundForCase = { ...(inbound as Record<string, unknown>), candidateRef: … };

```



\### Finding A1 — Triple-copied evidence attach pipeline (BLOCKER)



| Path | Location | Drift vs siblings |

| --- | --- | --- |

| attach\_case | \~L105–143 | no `attachmentTypings` |

| linked reply | \~L259–302 | no typings |

| mint | \~L726–772 | has typings; + folder/enrich/setIngested |

| retro | `retro-reconstruct.ts` \~L152–218 | fourth copy |



This is one product behaviour (record-keeping after a case id exists) with \*\*silent policy divergence\*\* (e.g. engineer\_report reclass via typings only on mint).



\*\*Judo:\*\* one generator `finishOnExistingCase` / `attachCaseEvidence` with optional knobs; mint \*composes\* extras around it. Extract-without-collapse cements drift.



\### Finding A2 — Cast/unknown soup (BLOCKER)



Cast \*\*once\*\* at yield boundary to `InboundEnvelope` / `ProviderMatchActivityResult`. Delete \~33 structural peeks.



\### Finding A3 — Twin retro blocks (\~70 lines × 2)



Reply \~L304–369 vs non-reply \~L432–485. Comments say “twin.” Variance is `isReply` + `linkReplyOutcome` only → `maybeRetro`.



\### Finding A4 — No disposition model — fall-through spaghetti (BLOCKER)



Routing is chronological ticket accretion:



1\. drop\_duplicate → return  

2\. attach\_case → evidence → return  

3\. triage assist (side, no return)  

4\. route\_images\_unmatched (side, \*\*continue\*\*)  

5\. !categoryMintsCase → reply / pdf-vrm / retro  

6\. mint path  



Invariants (Stage A drives mint; suggest\_attach must not auto-mint; attach must not fall into receiving\_work) live in \*\*prose + order\*\*, not a typed decision. `intake-decisions.ts` only holds provider recovery — not intake disposition. \*\*Note:\*\* `case-disposition.ts` is retention delete, not this model (naming collision).



\*\*Target pure model:\*\*



```ts

type IntakePlan =

&#x20; | { kind: 'terminal'; code: 'drop\_duplicate' | … }

&#x20; | { kind: 'attach'; caseId: string; vrmPolicy: 'triage' | 'reply' }

&#x20; | { kind: 'reply\_link'; side: SideEffect\[] }

&#x20; | { kind: 'non\_mint'; side: SideEffect\[]; allowPdfVrm: true; allowRetro: true }

&#x20; | { kind: 'mint'; side: SideEffect\[] };

```



Orchestrator becomes `decideIntakePlan` → `runSideEffects` → `switch (plan.kind)`. Fall-through becomes illegal.



\### Finding A5 — Comment archaeology + hollow automationMode



`automationMode` assigned and returned but record-keeping is mode-identical — dead branch surface. Long ADR essays belong in tickets; keep 1-line + ADR id.



\### Deliberately complex (A will not allow flattening)



Gates inside activities only; Stage A/B split; attach short-circuit; VRM never auto-attach; categoryMintsCase + refused\_category belt; already\_ingested vs replayed; parse-failure still mints; provider recovery hard-fail after archive; best-effort extract/archive/enrich; pure domain `decide\*`.



\### Persona A verdict



\*\*request-changes.\*\* Collapse three evidence pipelines + two retros behind typed envelopes and pure `IntakePlan`. Keep kill-switch and anti-merge semantics.



\---



\# Persona B — Data-API principal



\### Finding B1 — `features/cases` kitchen sink (\~92 files)



Folder owns lifecycle \*\*plus\*\* mobile capture (\~20 files), archive holding, MCP image ingest, Box purge/disposition, staff cleanup, merge side-effects, ops dumps (`internal-operations-routes`, `internal-maintenance-routes`).



\*\*Judo:\*\* folder moves only, routes stable:



| Target | Move |

| --- | --- |

| `features/capture/` | `capture\*.ts` |

| `features/archive/` expand | holding + internal-archive-holding |

| `features/case-lifecycle/` | CRUD, merge, status, terminal, queue, search, dashboard, inspection, evidence-delete |

| `features/assistant/` | `mcp-image-ingestion\*` |

| platform / internal-ops | disposition, box purge, staff cleanup claims |



\### Finding B2 — Dual `recomputeStatus` (name collision)



\- Staff: `case-support.ts` → `runStatusRecompute` → \*\*boolean\*\*  

\- Internal: `inbound/internal/service-support.ts` → same core → \*\*StatusRecomputeResult\*\* + generation ack  

\- Vehicle staff retry already imports \*\*internal\*\* variant  



Core is unified (`status-recompute-core.ts` TKT-276) — good. Wrappers are not.



\*\*Remedy:\*\* `recomputeStatusForStaff` / `ForInternal` co-located with core; stop exporting status from inbound service-support.



\### Finding B3 — Internal MSI fan-out



11 registration modules is \*\*not\*\* the bug; \*\*ownership\*\* is. `withServiceAuth` lives under `inbound/internal/service-support` (audience-only, TKT-245). Ops for Box purge under cases.



\*\*Do not\*\* invent internal router framework or one god `internal.ts`.  

\*\*Do\*\* move service auth → `platform/auth/service-auth.ts`; capability-slice ops routes; keep register as \*\*manifest\*\*.



\### Finding B4 — Outbox triple: \*\*leave specialized\*\*



| Concern | Storage | Shape |

| --- | --- | --- |

| Evidence mirror | `archive\_mirror\_outbox` | evidence-scoped |

| Provider folder | columns on `case\_` | case-scoped |

| File Request | `box\_file\_request\_outbox` + claim | remote Box + lease |



Same \*vocabulary\*, different entity/eligibility/remote op. Generic `Outbox<T>` would lie. Optional: SQL helpers for GREATEST/LEAST complete + claim expiry only.



\*\*Corrects earlier simplification series over-reach:\*\* PLAN-008 “one drain registry” for \*data plane\* is wrong; Persona E agrees — registry for \*lifecycle\*, not merge protocols.



\### Finding B5 — Dual parser-eva-fields: complementary, not clone



\- Orch \*\*builds\*\* (`buildParserEvaFields`)  

\- API \*\*guards/persists\*\* (CHECK constraints, content→provider id)  



Lift \*\*wire type + content match + normalize key\*\* to `@cs/domain`. Keep SPEC/column mapping API-side.



\### Finding B6 — Silent fallbacks



| Pattern | Risk |

| --- | --- |

| proxy-routes catch → `\[]` / skipped | Hides Function death from staff |

| upsertManualProvenance catch | Edit OK, provenance gone |

| mintBlockedByCategory catch → null | Intake proceeds if category read fails |

| `sourceTypeCodec.toInt('staff') ?? 100000000` | Wrong code if codec drifts |



Prefer fail-closed on write paths; structured degrade on assist proxies.



\### Finding B7 — “support” grab-bags



`case-support`, `service-support`, `upload-support` (\~673) are unowned cores → split by verb (`case-load`, `evidence-persist`, …).



\### Already improved (do not restate as open)



status-recompute-core; merge decomposition; domain codecs/gates; server-runtime focusedFn + MI; generation-in-tx for mirror/status; FN client transport share.



\### Persona B verdict



\*\*Not a rewrite.\*\* Blockers: cases size, dual recomputeStatus, ParserEvaFields/content-match not in domain, god modules (upload-support, file-request-outbox, archive-holding). Audience-only internal trust is \*\*product posture\*\*, not a code-slice bug.



\---



\# Persona C — SPA frontend architect



\### Quantified



| Metric | Value |

| --- | --- |

| Domain `DataAccess` | \~29 methods (“frozen”) |

| SPA `DataAccessExt` | \~40 additive + optional API-key methods |

| `getDataAccess()` return | \*\*already `DataAccessExt`\*\* (`data/index.ts`) |

| Production Ext casts | \*\*\~10 dead casts\*\* (type already Ext) |

| Controllers | case-list \~798, case-detail \~706, manual-intake \~666 |



\### Finding C1 — Dual contract is cargo-cult



Casts add \*\*zero\*\* type safety after selector was widened. Rename Ext → `StaffDataAccess`; delete casts; optional methods → required no-ops on stubs.



\### Finding C2 — Case-detail flat mega-VM (\~100 keys)



View split exists; still `{...props}` fan-out to header/main/sidebar/dialogs.  

\*\*Judo:\*\* structured VM slices (`case`, `evidence`, `address`, `header`, `dialogs`); composition root \~150 lines.



\### Finding C3 — Case-list mixes grid JSX with orchestration



Move columns/cell renderers out; controller < 300 lines data+actions.



\### Finding C4 — Feature I/O in `shared/ui`



`CasePeekDrawer`, `GuidedPhotoRequestPanel`, `ManualSourceArchiveRecovery`, `OutlookMessageAction`, `LinkedEmailsPanel`, parts of `AppShell` — \*\*case/inbox features\*\*, not shared primitives. Move to `features/\*/ui/\*`. Keep dumb primitives only.



\### Finding C5 — Manual intake vs case detail EVA half-shared



Shared `EvaFieldRow` / `FIELD\_CLUSTERS` good; intake still has `MANUAL\_CLUSTER\_KEYS` + `emptyEvaFields` cast soup. One empty builder + layout filter over same clusters.



\### Finding C6 — Three hand-maintained `DataAccessExt` impls



empty-source, fixture-source, rest-client.  

\*\*Judo:\*\* `createStubDataAccess('empty'|'fixture')`; only REST hand-written.



\### Already good (do not undo)



Empty-by-default production; domain pure helpers; controller/view/styles split direction; EvaFieldRow; case-edit-session; evidence-review locks; hooks + invalidation; inbox pure modules (best feature package shape); staff-facing errors.



\### Persona C verdict



\*\*B− structure, A− purity.\*\* Finish half-migrations; do not grow React into domain.



\---



\# Persona D — Domain / contract purist



\### Finding D1 — `dto/index.ts` god-file + layer inversion



\~843 lines: DataAccess + wire DTOs + \*\*InboundCategory/Subtype/TriageState\*\* + assistant/gates.  

\*\*Codecs import taxonomy from dto\*\* — pure layer inverted.



\*\*Remedy:\*\* taxonomy → `contracts/inbound-classification.ts` (case-status pattern); split dto modules; codecs must not import dto.



\### Finding D2 — VRM multi-homed with \*\*documented semantic drift\*\*



| Home | Behaviour |

| --- | --- |

| TS `canonicalizeVrm` | strip `\[^A-Z0-9]` |

| Parser `normalize\_vrm` | whitespace + OCR; \*\*hyphen kept (D2)\*\* |

| OCR / enrichment | match TS |



Parity corpus \*\*allows\*\* D2 (`YT13-UTV` differs). That is a \*\*defect for comparison/storage\*\*, not a blessed divergence.



\*\*Remedy:\*\* post-adapter canonicalize at parser Function boundary, or fix on re-vendor; keep D1 as extraction-only OCR repair if needed.



\### Finding D3 — EVA 12-field keys redeclared N times



domain `eva-export`, root `contracts/eva-payload.schema.json`, parser\_adapter, vendored models, OCR, eva-sentry. Guards exist; still hand tuples.  

\*\*Judo:\*\* one machine-readable identity pack; generate/load in tests.



\### Finding D4 — Evidence-kind dual tables (TS classification vs box-webhook Python)



Parity-pinned. Generate both from one JSON.



\### Finding D5 — Stage A Python brain vs Stage B domain (intentional)



ADR-0019 sound. Smell is taxonomy authority in DTO file, not stage split.



\### Finding D6 — capabilities + zod on main domain barrel



Pulls validation infra into SPA graph. Subpath-export `@cs/domain/capabilities` like gates/codecs.



\### Server-runtime adoption



TS MI hand-rolls \*\*gone\*\* outside package (AST guard). Focused-fn shared. Healthy. Do not merge into domain.



\### Canonical home map (D)



| Concern | Home |

| --- | --- |

| Case status | `contracts/case-status` + code table + codecs |

| Triage Stage B | `domain/triage-policy.ts` |

| Triage Stage A | vendored classifier |

| VRM comparison | `vrm-canon.ts` only |

| EVA order/keys | `eva-export` + wire schema |

| Outbox generation | \*\*data-api only\*\* |

| MI / focused-fn / data-api HTTP | `@cs/server-runtime` |

| Gates | `@cs/domain/gates` subpath |



\### Persona D highest judo



Split taxonomy out of dto + identity JSON pack + close VRM D2.



\---



\# Persona E — Reliability / SRE



\### Finding E1 — Ensure lifecycle still N implementations



`durable-monitor.ts` has race-safe ensure, but:



| Lane | Policy | Failed revival |

| --- | --- | --- |

| Box FR + classification | ensureMonitor | no |

| Evidence-backfill publisher | local copy | no |

| Archive-mirror / provider | thin ensure | no |

| Subscription | inline | no |



\*\*Failed/Terminated singleton is stuck\*\* until human DF surgery; bootstrap `startNew` on fixed id fails.



\### Finding E2 — Complete/defer already forked (HIGH)



\- \*\*Provider:\*\* inspects `{ completed:false, pending:true }` → \*\*defer\*\* with backoff  

\- \*\*Archive-mirror:\*\* \*\*ignores\*\* complete response; pending stays hot-relisted, attempt\_count unchanged (ADR-0030 known gap)



This is the highest-signal reliability maintainability defect in the outbox family.



\### Finding E3 — Four claim/ack dialects



File-request claim-token is cleanest remote-effect model. Mirror/provider use DF singleton as implicit claim — \*\*not named as a rule\*\*, so second consumer would double-Box.



\### Finding E4 — Non-atomic intermediate seams



\- Backfill: enqueue then mark enqueued (dual-write; consumer supersede usually saves)  

\- Provider defer without case mutation lock  

\- Status recovery piggybacked on \*\*classification\*\* sweep (correct order, wrong ownership)  

\- Graph webhook 202 + queue output classic loss window  



\### Finding E5 — Serial head-of-line inside eternal monitors



Intentional if singleton = isolation; looks like “copy first monitor” unless documented.



\### Finding E6 — Catch/log/continue hides missing ensure surfaces



No single “ensure all eternal monitors from registry on deploy/traffic.”



\### Preserve vs collapse



\*\*Preserve:\*\* API sole generation authority; request-in-decision-TX; row-specific proof; inert generation for gated work; file-request claim; classify SKIP LOCKED; backfill completed-result replay; lane-owned DF bodies.



\*\*Collapse:\*\* monitor registry + Failed revival; \*\*shared complete→pending→defer helper\*\*; defer SQL lock discipline; status drain ownership out of classification name; do \*\*not\*\* merge data-plane protocols.



\### Persona E verdict



Architecture intent \*\*strong\*\*. Sibling-lane consistency is where the next silent strand lands. \*\*B−\*\*.



\---



\# Persona F — Python services architect



\### Finding F1 — Vendored rules gods (\~3.1k engine, \~1.7k classifier)



Private `\_` imports from engine into classifier. Split only in \*\*authoring\*\* repo; re-vendor. Never hand-edit vendored AST here.



\### Finding F2 — box-webhook `function\_app.py` \~884 / \~16 routes



Client mixins good; webhook pipeline + routes still fat. Extract `webhook\_receiver.py` + `archive\_routes.py`.



\### Finding F3 — parser `function\_app.py` \~849



MIME explode + base64 defense are library work. Extract `explode\_email.py` + `document\_decode.py`. Adapter seam for parse is clean.



\### Finding F4 — Cross-service HTTP envelopes intentionally different



EVA/vehicle fail-soft 200; Box needs non-2xx. Do not unify envelopes. Document caller contract matrix.



\### Finding F5 — Token/retry “dup” is policy diversity



Affirm ADR-0032. Inventory + `\_authconf` harness is correct hybrid. Weakest: `location-assist/ai\_reasoning.py` claims `\[]` (no refresh).



\### Persona F verdict



\*\*Accept / hold course.\*\* Highest no-behaviour-change win: split two fat function\_apps. Affirm independent packaging.



\---



\## Cross-persona contradictions (resolved)



| Topic | Earlier / PLAN-008 take | Board resolution |

| --- | --- | --- |

| One outbox mega-drain | Suggested | \*\*Reject.\*\* One \*\*monitor lifecycle\*\* registry; keep ≥3 data-plane protocols. Unify \*\*complete/defer response handling\*\* only. |

| Dual parser-eva modules | “Delete one” | \*\*Keep builder vs guard.\*\* Share \*\*wire type\*\* + content-match in domain. |

| DataAccess Ext | “Promote Ext” | \*\*Confirm:\*\* Ext is already the runtime type; casts are dead. Rename + delete casts. |

| Internal route count | “Consolidate modules” | \*\*Wrong ownership, not count.\*\* Auth to platform; slice ops; no framework. |

| Python share token package | Tempting | \*\*Reject\*\* under ADR-0032. |



\---



\## Unified blocker list (merge order)



\### P0 — structural / reliability



1\. \*\*IntakePlan + finishOnExistingCase + maybeRetro + typed envelopes\*\* (A)  

2\. \*\*Archive-mirror complete/defer parity with provider\*\* (E)  



\### P1 — contract honesty



3\. \*\*StaffDataAccess rename; delete Ext casts; stub factory\*\* (C)  

4\. \*\*Dual recomputeStatus rename + co-locate\*\* (B)  

5\. \*\*ParserEvaFields wire type + content-match → domain; close VRM D2\*\* (D, B)  



\### P2 — ownership / packaging



6\. \*\*Slice `features/cases`; move withServiceAuth\*\* (B)  

7\. \*\*Monitor registry + Failed revival\*\* (E)  

8\. \*\*dto taxonomy out; identity JSON pack\*\* (D)  

9\. \*\*SPA case-detail VM slices; list columns out; feature panels out of shared/ui\*\* (C)  



\### P3 — local clarity



10\. Fat function\_app splits (F)  

11\. Comment diet on intake (A)  

12\. Authoring-repo engine split on re-vendor (F)  



\---



\## What already improved (board: do not re-litigate)



\- `@cs/server-runtime`: MI mint, data-api HTTP core, focused-fn, storage credential, retry  

\- `status-recompute-core` single writer  

\- Merge file decomposition  

\- Durable-monitor partial share  

\- Domain pure policy modules (best part of repo)  

\- Empty production SPA boundary  

\- Vendor-lock + many parity guards  

\- Auth conformance inventory for Python  



\---



\## Approval statement



\*\*This codebase does not meet the strict code-review approval bar for structural health.\*\*



It meets a high bar for \*\*intentional product/reliability design\*\* and has proven it can delete duplication (PLAN-007). The remaining failures are \*\*half-finished judo\*\* and \*\*accretion in the single most important control flow\*\* (intake).



Next PR touching intake, outbox complete/defer, or SPA data access \*\*without\*\* advancing P0/P1 should be blocked unless it includes an explicit judo slice.



\---



\## Suggested ticket batch (for later minting — not implemented here)



| Draft title | Persona | Behaviour change? |

| --- | --- | --- |

| Intake disposition model + shared evidence attach | A | No (replay-safe refactor) |

| Archive-mirror complete/defer alignment | E | Yes, reliability (backoff) — ticket carefully |

| StaffDataAccess + stub factory | C | No |

| Status recompute entrypoint rename | B | No |

| Domain wire types: ParserEvaFields + VRM boundary canonicalize | D | Possible VRM edge cases — parity first |

| cases/ capability folder slice | B | No |

| Eternal monitor registry + Failed revival | E | Ops reliability |

| Split box-webhook/parser function\_app modules | F | No |



\---



\## Method appendix



Subagents (explore, read-only):



1\. Intake orchestration — full orchestrator read, cast/branch counts, disposition sketch  

2\. Data-API structure — module census, outbox table, dual status, ownership map  

3\. SPA contract/UI — Ext cast audit, controller sizes, shared/ui coupling  

4\. Domain/contracts — dual-def inventory, VRM D1/D2, canonical homes  

5\. Reliability/outbox/retro — complete/defer fork, ensure matrix, atomicity risks  

6\. Python functions — function\_app sizes, ADR-0032, vendor stance  



Prior single-pass review findings were retained where confirmed and \*\*corrected\*\* where specialists disproved them (especially outbox mega-drain and Ext cast semantics).



