# IA-MOVE-MAP — repo-hygiene execution blueprint (2026-06-28)

**Status:** design only. Authored by `doc-cartographer` (read-only). This is the executable spec for the
`restructurer` (#10) and `fact-reconciler` (#11) agents. Precedence of source-of-truth for *live numbers*
during execution: **`LIVE_FACTS.json`** (root, from task #7) → mirrored in
`docs/architecture/live-environment.md`. No other doc may embed a live number after this runs.

Repo root for all paths below: `/home/pc/projects/collisionsuite/active/collisionspike/`.

---

## A. MOVE / DELETE TABLE

### A.1 — Files to MOVE to `docs/HISTORICAL/` (leave a pointer stub at the old path)

Create `docs/HISTORICAL/` with its own `README.md` (see §D.9). For each move: `git mv` the file, then
**write a stub at the OLD path** with the text in the "Stub text" column.

| # | Move from | Move to | Stub text to leave at OLD path |
|---|---|---|---|
| 1 | `PLAN.md` | `docs/HISTORICAL/PLAN.md` | `# PLAN.md — MOVED`<br><br>`> **Historical.** The original narrative plan now lives at [docs/HISTORICAL/PLAN.md](./docs/HISTORICAL/PLAN.md). It predates the Power-Platform→Azure migration and is kept for domain/provenance reference only.`<br>`> For forward work see [ROADMAP.md](./ROADMAP.md); for live state see [CURRENT_STATUS.md](./CURRENT_STATUS.md).` |
| 2 | `DEPLOY-RUNBOOK.md` | `docs/HISTORICAL/DEPLOY-RUNBOOK.md` | `# DEPLOY-RUNBOOK.md — MOVED`<br><br>`> **Historical / superseded.** The Power-Platform-era deploy runbook now lives at [docs/HISTORICAL/DEPLOY-RUNBOOK.md](./docs/HISTORICAL/DEPLOY-RUNBOOK.md). Live deploy procedure is the Azure playbooks under [docs/azure/](./docs/azure/README.md) (deploy.md).` |
| 3 | `box-integration-pivot/` (whole dir, 11 md + `plans/`) | `docs/HISTORICAL/box-integration-pivot/` | Leave **one** stub file `box-integration-pivot/README.md` (replacing the moved one) reading:<br>`# box-integration-pivot — MOVED`<br>`> **Historical research.** The Phase-7 Box-pivot research set moved to [docs/HISTORICAL/box-integration-pivot/](../docs/HISTORICAL/box-integration-pivot/). Live Box state: [docs/handoff/02-box-activation.md](../docs/handoff/02-box-activation.md) + [docs/azure/box-activation.md](../docs/azure/box-activation.md); design of record is [docs/adr/0012-box-centric-intake-additive-hybrid.md](../docs/adr/0012-box-centric-intake-additive-hybrid.md).` |
| 4 | `migration/` (whole dir, 38 files) | `docs/HISTORICAL/migration/` | Leave **one** stub `migration/README.md` (replacing the moved one):<br>`# migration — MOVED (cutover COMPLETE)`<br>`> The Power-Platform→Azure cutover is **executed + complete** (2026-06-27). The full record moved to [docs/HISTORICAL/migration/](../docs/HISTORICAL/migration/). Live state: [CURRENT_STATUS.md](../CURRENT_STATUS.md); registry: [docs/architecture/live-environment.md](../docs/architecture/live-environment.md).` |

> **Caveat for the restructurer on #4 (`migration/`):** CLAUDE.md describes `migration/` as a
> "temporary, delete-when-done folder" and references `migration/assets/schema/*.sql` and
> `flows/definitions/` as **still-referenced** provenance. **Before moving**, grep for live references:
> `grep -rn "migration/assets" --include='*.md' --include='*.cjs' --include='*.json' .` and
> `grep -rn "migration/" docs/architecture/live-environment.md`. If `migration/assets/schema/` is cited
> as the canonical schema source, **keep `migration/assets/` in place** (or move it to
> `docs/architecture/schema/` and update the citation) and move only the narrative `NN-*.md` plans.
> Do not orphan a live schema reference. This is the one move that needs a citation-check first.

### A.2 — Root files to DELETE (no stub; confirm preconditions first)

| # | Delete | Precondition the restructurer MUST confirm first | Notes |
|---|---|---|---|
| 5 | `Azureresources.csv` | none (raw az export; superseded by `live-environment.md` + `LIVE_FACTS.json`) | untracked/cruft |
| 6 | `Azureresources (1).csv` | none | duplicate export |
| 7 | `941197_re7d6t50_config.json` | **Confirm the Box JWT config is safely stored as KV secret `box-config-json`** (per OPEN_ITEMS A* "DONE 2026-06-28 · WS2"). Only delete after KV presence is verified. | On-disk **untracked** secret. Already covered by `.gitignore` (`*_config.json`, line 83) so it is NOT in git — this is a local-disk hygiene delete, not a git operation. |
| 8 | `941197_re7d6t50_config.json:Zone.Identifier` | same as #7 | Windows ADS sidecar |

> **Note:** the on-disk filename is `941197_re7d6t50_config.json`; OPEN_ITEMS prose calls it
> `941197__config.json` (double-underscore, the gitignore example). Both are gitignored. Delete whatever
> `941197*config.json*` files exist at root once KV is confirmed.

---

## B. STATUS-DOC MERGE SPEC (3 → 2)

**Target end-state:** `ROADMAP.md` = the single **forward-work** doc (folds in OPEN_ITEMS' live worklist).
`CURRENT_STATUS.md` = a dated **session/CHANGELOG narrative only** (no embedded live numbers — link the
registry). `OPEN_ITEMS.md` = a **thin pointer**.

### B.1 — OPEN_ITEMS.md → ROADMAP.md section mapping

ROADMAP already has a `## Now / Next / Later` block (lines 81–142) that **substantially duplicates**
OPEN_ITEMS §A. The merge is mostly **reconcile + absorb the few OPEN_ITEMS-only items**, not a wholesale
paste. Map:

| OPEN_ITEMS.md section | → ROADMAP.md destination | Action |
|---|---|---|
| `### A* — 2026-06-28 session frontier (start here)` (L37–79) | **`CURRENT_STATUS.md`** dated entry (it is session narrative), AND the still-open bullets → ROADMAP "Now" | Split: "DONE 2026-06-28" bullets are history → CURRENT_STATUS changelog. The `[OPERATOR]`/`[WS*]` open bullets (WS1b email go-live, WS3 OCR, WS6 identity, WS7 verification) → ROADMAP "Now"/"Next". |
| `### A0 — P0 / hard deadlines` (L81–89) | ROADMAP "Now" (already there: DB-security ✅, Free-Trial→PAYG) | Reconcile — keep ROADMAP's version (it also has the secret-sweep ✅ that OPEN_ITEMS lacks). Drop duplicates. |
| `### A1 — Live automated email intake` (L91–102) | ROADMAP "Now" → "Take orchestration live" bullet (L103–111) | Already present in ROADMAP. Fold the OPEN_ITEMS "verify end-to-end live path" sub-bullet into it. |
| `### A2 — API + identity hardening` (L104–109) | ROADMAP "Next" → "Durable API hardening" + "Staff app-role assignment" (L114–118) | Already present. Reconcile (ROADMAP has the `.Engineer` placeholder note; OPEN_ITEMS still says `.Admin` — keep ROADMAP's `Superuser`). |
| `### A3 — Reproducibility` (L111–114) | ROADMAP "Next" → "IaC config layer" (L119–120) | Already present. Fold the OPEN_ITEMS Blob-hardening sub-item (A4 last bullet, L135) here. |
| `### A4 — Domain milestones` (L116–137) | ROADMAP "Next"/"Later" (EVA, enrichment, Box, OCR, governance, PII) | Mostly present. Add OPEN_ITEMS-only items: **PII pre-scrub helper** (`[BUILD]`, L134) and the **cross-store DSAR/erasure** detail → ROADMAP "Later" governance bullet. |
| `# HISTORICAL — Power-Platform-era SDLC worklist` (L141–end) | **Drop** (redundant) OR move to `docs/HISTORICAL/open-items-pp-era.md` | ROADMAP already carries the full Power-Platform phase checklist in its own HISTORICAL band (L147+). This OPEN_ITEMS historical tail is duplicative → restructurer may delete it or archive it; do **not** paste into ROADMAP. |

**Legend to carry into ROADMAP:** OPEN_ITEMS' tag legend (`[P0]`/`[OPERATOR]`/`[BUILD]`/`[DEFERRED]`/
`[DRIFT]`, L19–25) is useful — add it to ROADMAP's `## Legend` (L65) so the folded items keep their tags.

### B.2 — New `CURRENT_STATUS.md` skeleton (headings only)

Strip every embedded live number from the "Live now" table (L48–81) — replace with a one-line link to the
registry. Keep the dated `🔔 Update —` narrative entries (they are genuine changelog and carry no
duplication risk once numbers are removed). Target skeleton:

```
# CURRENT_STATUS — collisionspike
> Live numbers (function counts, corpus counts, mailbox set, subscription state) are NOT duplicated here.
> Single source: LIVE_FACTS.json (root) · mirrored in docs/architecture/live-environment.md.

## Snapshot (prose, no numbers)        # 2-3 sentences: pure Azure PaaS; read-only + manual case-create; intake not live; Box live.
## ⚠️ Honest known gaps               # keep the 5-point gap list (L82-112) but link registry for any number
## Changelog — dated session entries   # all the 🔔 Update — YYYY-MM-DD blocks, newest first, VERBATIM (history)
   ### 2026-06-28 … (new: fold A* session-frontier DONE items here)
   ### 2026-06-26 …  ### 2026-06-24 …  ### 2026-06-23 …  (etc — unchanged)
## Historical — Power Platform era     # keep the banded blocks (L113-128, L610-654)
## Key docs                            # link table → ROADMAP, registry, gated, OPEN_ITEMS pointer
```

### B.3 — OPEN_ITEMS.md pointer-stub text (replace whole file)

```
# OPEN_ITEMS.md — MERGED into ROADMAP

> **This worklist was folded into [ROADMAP.md](./ROADMAP.md) on 2026-06-28.**
> The single forward-work doc is now **ROADMAP.md** — see its **§ Now / Next / Later** for the live
> Azure migration-remediation backlog, and the **§ HISTORICAL** band for the Power-Platform-era checklist.
>
> - What's live now → [CURRENT_STATUS.md](./CURRENT_STATUS.md)
> - What needs the operator → [docs/gated.md](./docs/gated.md)
> - Live numbers (authoritative) → [LIVE_FACTS.json](./LIVE_FACTS.json) / [docs/architecture/live-environment.md](./docs/architecture/live-environment.md)
```

---

## C. EMBEDDED-LIVE-FACTS INVENTORY  ⭐ (the fact-reconciler's worklist)

Every row is a **hand-embedded live number/claim** that must become a **link to the registry** (or be
corrected to match `LIVE_FACTS.json`). Rule: **prose docs state the fact ONCE via the registry**; only
`LIVE_FACTS.json` + `docs/architecture/live-environment.md` hold the literal numbers. `CLAUDE.md`,
`README.md`, `AGENTS.md` may keep a *single* canonical phrasing but should link the registry and must not
drift.

**Replacement-pointer text** (use as the link target):
`see [the live registry](docs/architecture/live-environment.md) (single source: LIVE_FACTS.json)`
(adjust relative depth per file).

### C.1 — Orchestration function count (canonical: orch = **41**, api = **42** — confirm vs LIVE_FACTS)

| File:line | Current claim | Action |
|---|---|---|
| `README.md:28`, `README.md:76` | "41 functions" | Link registry; keep at most one canonical mention. |
| `CLAUDE.md:37`, `CLAUDE.md:53` | "41 functions" | Canonical-doc; keep one phrasing + registry link. |
| `AGENTS.md:27`, `AGENTS.md:149` | "41 functions" | Link registry. |
| `ROADMAP.md:34`, `ROADMAP.md:104` | "41 functions" | Link registry. |
| `CURRENT_STATUS.md:62`, `CURRENT_STATUS.md:84` | "41 functions registered" | **Remove the number** (per B.2) → registry link. |
| `OPEN_ITEMS.md:33`, `OPEN_ITEMS.md:92` | "41 functions" | File becomes a stub (B.3) — number disappears. |
| `docs/gated.md:26,141,192` | "41 functions" | Link registry. |
| `docs/roles-and-permissions.md:76` | "deployed + wired (41 functions)" | Link registry. |
| `docs/architecture/live-environment.md:37,76,135` | "41 functions" | **KEEP — this is the registry mirror.** Ensure it matches LIVE_FACTS. |
| `docs/azure/diagnose.md:30` | "Healthy = 41 functions (orch) / 42 (api)" | **KEEP** (operational threshold) but cite registry. This line is the authority that orch=41, api=42. |
| `migration/00-MASTER-WORKFLOW.md:13`, `migration/22-orchestration-migration.md:4`, `migration/README.md:13` | "41 functions" | Moving to HISTORICAL (§A.1 #4) — leave as-is (history). |
| `memory/azure-orch-deploy.md:19,31,41` | "41 functions" | memory/ — leave (memory is allowed to hold facts). |
| `memory/azure-api-deploy-and-auth.md:16,18` | "42 functions" (api) | memory/ — leave. |
| **⚠️ `docs/handoff/OPERATOR-CHECKLIST.md:14`** | **"42 functions"** | **DRIFT — VERIFY.** If this refers to the **orch** app it should be **41**; "42" is the **api** count. Fact-reconciler: confirm which app, correct to match LIVE_FACTS, then link registry. |

### C.2 — Postgres corpus counts (canonical/live: work_provider **390**, repairer **32**, image_source **19**, inspection_address **2209** = 174 confirmed + 2035 suggested, case_ **0**, 36 tables)

| File:line | Current claim | Action |
|---|---|---|
| `CLAUDE.md:45-46`, `CLAUDE.md:176` | full corpus tallies + "174 confirmed + 2035 suggested" | Canonical doc — keep one phrasing, link registry. |
| `README.md` (corpus mentions) | tallies | Link registry. |
| `ROADMAP.md:35-36` | "work_provider 390 / repairer 32 / image_source 19 / inspection_address 2209 [174+2035] / case_ 0" | Link registry (forward doc shouldn't re-embed). |
| `CURRENT_STATUS.md:63` | full tally row | **Remove numbers** (B.2) → registry link. |
| `docs/gated.md:31-32,51-52,301` | tallies (390/32/19/2209) + "32 providers verified domains" | Link registry. |
| `docs/architecture/data-model.md:6` | "work_provider 390 … 2209 (174+2035)" | Reconcile to registry; this is architecture — may mirror but must match. |
| `docs/architecture/live-environment.md:38,139` | "36 tables (14 business + 22 choice_*) … 390/32/19/2209" | **KEEP — registry mirror.** Verify vs LIVE_FACTS. |
| `docs/plans/milestone-model.md:76` | "390 WorkProvider, 174 InspectionAddress" | Mark as historical-load note OR link registry. |
| **⚠️ `CURRENT_STATUS.md:619`** | "InspectionAddress **174** … Repairer **20** … ImageSource **20**" | **STALE (Dataverse-era).** Inside a dated 2026-06-19 changelog entry — acceptable as *history* IF the entry is clearly dated; do NOT use as a current number. Add no registry link (it's a snapshot). Flag only. |
| **⚠️ `docs/plans/phase-1-intake-and-case-tracking/README.md:24`** | "**871 InspectionAddress** — 174 confirmed + **697 volatile suggested**" | **STALE — CONTRADICTS live 2209.** Fact-reconciler: this is a superseded interim load (2026-06-20). Correct to the live figure via registry link, or band it as a dated historical load. |
| **⚠️ `CURRENT_STATUS.md:566`** | "WorkProvider 390 updated (Corpus 2026-06-18 provenance)" | Dated changelog — history, leave but ensure dated context is clear. |
| `PLAN.md:349-350` | "work_provider 390 / repairer 32 / image_source 19 / inspection_address 2209" | Moving to HISTORICAL (§A.1 #1) — leave as-is. |

> **Highest-value contradictions for the fact-reconciler:** InspectionAddress is stated as **2209**,
> **871**, and **174** across live docs; Repairer as **32** and **20**; ImageSource as **19** and **20**.
> The live/canonical set (per CLAUDE.md + live-environment.md) is **2209 / 32 / 19**. The 871/20/697 and
> 174/20 figures are **Dataverse-era or interim loads** and must be either banded-as-dated-history or
> corrected.

### C.3 — Intake liveness: mailbox set, push-vs-poll, subscription/RBAC state

| File:line | Current claim | Action |
|---|---|---|
| **⚠️ `CLAUDE.md:38`** | intake = "change-notification subscriptions (**push**)" | **CONTRADICTS** every other doc which says **delta-poll, no push subscription** (ROADMAP:109, OPEN_ITEMS:99, CURRENT_STATUS:62, gated:143). Fact-reconciler: pick the truth from LIVE_FACTS (the deployed `graph-renew` bootstraps subscriptions → likely **push** per CLAUDE; but ROADMAP/OPEN_ITEMS say **poll**). **This is a genuine architecture contradiction — must be resolved by task #7's live verification, not guessed.** |
| **`CLAUDE.md:40,54`** | `GRAPH_INTAKE_MAILBOXES` = "**engineers@ + digital@**" (2 mailboxes) | **RESOLVED 2026-06-28 (operator) — NOT a contradiction; a testing-vs-prod label gap.** `digital@` = test-only (operator's dev mailbox); `engineers@` = a **real/production** mailbox **currently used for testing**; **we are still in the testing phase**. So "engineers@ + digital@" is the **current testing configuration**, and "info@ + engineers@ + desk@" (OPEN_ITEMS:64, CURRENT_STATUS:42) is the **production target**. Fact-reconciler: do NOT pick one — relabel both explicitly: e.g. *"Currently configured (testing): engineers@ (prod mailbox, under test) + digital@ (test-only). Production target: info@ + engineers@ + desk@ (digital@ dropped)."* Source the literal set from LIVE_FACTS. |
| `OPEN_ITEMS.md:63-65` | test = digital@ + engineers@; prod = info@ + engineers@ + desk@ (drop digital@) | File → stub; ensure the mailbox truth migrates to ROADMAP/registry. |
| `CURRENT_STATUS.md:42,85-86` | "0 subscriptions … no Exchange RBAC scope on the 3 real mailboxes" | Remove count, link registry. |
| `ROADMAP.md:103-111,109` | "deployed + wired (41) … 0 subscriptions … 3 shared inboxes … no push subscription; intake polls (delta query)" | Forward doc — keep the *narrative* but pull the number/state from registry. |
| `README.md:28,30,76` | "deployed + wired (41), not yet live … delta-poll over Exchange-RBAC-scoped mailboxes" | Link registry. |
| `AGENTS.md:27,30,37,57,149,190` | "deployed + wired (41) but NOT YET LIVE; no Graph subscriptions / no Exchange RBAC scope" | Link registry; keep one canonical phrasing. |
| `docs/gated.md:27,142-143,150-218` | "0 subscriptions … 3 mailboxes … GRAPH_INTAKE_MAILBOXES = engineers@ + digital@ (watermarked 2026-06-27); add the third" | Reconcile mailbox set vs C.3 row 2; link registry. |
| `docs/roles-and-permissions.md:76` | "deployed + wired (41 functions) but not yet live (no Graph subscriptions / Exchange RBAC scope)" | Link registry. |
| `docs/handoff/01-stack-health.md:92-97`, `docs/handoff/OPERATOR-CHECKLIST.md:12-15` | "deployed + wired, NOT live … no Graph subscription/poll" | Link registry (and fix the 42→41 in OPERATOR-CHECKLIST per C.1). |

### C.4 — Other live-fact strings to sweep (lower volume)

| Pattern | Where it recurs | Action |
|---|---|---|
| Resource names (`cespk-api-dev`, `cespk-orch-dev`, `cespk-pg-dev`, `cespk-spa-dev`, `cespkevidstdev01`, `rg-collisionspike-dev`, region `uksouth`) | ~all root docs + docs/ | These are **identifiers, not volatile numbers** — acceptable to repeat, but the canonical list is `live-environment.md`. No mass change; just ensure new edits link the registry. |
| Subscription GUID `e6076573-…`, client-id `fa2fb28c…` | CLAUDE, ROADMAP, OPEN_ITEMS, gated | Identifiers — leave; registry holds full GUIDs. |
| "Free-Trial → PAYG ~30-day deadline" | CLAUDE:58, ROADMAP:100, OPEN_ITEMS:87, gated | Status claim (not a number) — keep; it's a standing risk, not registry data. |
| Box state "LIVE 2026-06-28 (JWT)" / `box-config-json` / `BOX_*` gates | CLAUDE:199-205, OPEN_ITEMS A*, handoff/02 | Reconcile to one phrasing; Box-live is in `memory/box-activation-live-state.md` + handoff. Link, don't re-derive. |

---

## D. PER-DIR README STUBS (content outlines)

Add `README.md` to each dir below (none exist today). Each: 1-line "what this dir is" + a file list with a
one-line gloss. Keep them short; they exist for discoverability + link-checker reachability.

### D.1 — `docs/adr/README.md`
> Architecture Decision Records. One decision per file, numbered. 0015–0017 are **Proposed**; the rest **Accepted**.
- `0001` repairer as first-class entity · `0002` VRM↔open-case correlation · `0003` channel-aware chasers (WhatsApp constraint) · `0004` parser as inline Azure Function · `0005` EVA API full-scope test env · `0006` enrichment REST wrapper (DVSA, M1) · `0007` WhatsApp intake (manual bulk OCR match) · `0008` tool boundary ends at EVA handoff · `0009` image AI OCR (M1) / classification (M2) · `0010` dedup by reference, no time-window · `0011` work-provider/intermediary/garage roles · `0012` Box-centric intake (additive hybrid) · `0013` Loc export-artifact, no runtime address matching · `0014` audit case-type (second inspection) · `0015` email-triage inbox management *(Proposed)* · `0016` inspection-address corpus (EVA export) · `0017` data retention/erasure/PII lifecycle *(Proposed)* · `0018` cedocumentmapper dual-target vendored engine.

### D.2 — `docs/architecture/README.md`
> How the system is built. **Canonical live registry = `live-environment.md`** (mirrors LIVE_FACTS.json).
- `live-environment.md` **(canonical registry — live IDs/counts)** · `data-model.md` (tables + status machine) · `microsoft-stack.md` (service-per-requirement) · `eva-field-model.md` (12-field EVA contract) · `eva-sentry-api.md` (Sentry API v1.2) · `integrations.md` (EVA/enrichment/parser/Box + gating) · `inspection-address-corpus.md` (ADR-0013 model) · `data-protection.md` · `azure-cost-model.md` · `repo-constellation.md` (sibling repos) · `architecture-audit-2026-06-20.md` (dated audit) · `environment.md` *(historical — superseded by live-environment.md)*.

### D.3 — `docs/handoff/README.md`
> Operator handoff pack (2026-06-27 onboarding). Read `OPERATOR-CHECKLIST.md` first.
- `OPERATOR-CHECKLIST.md` (the ordered operator actions — #1 = Exchange-RBAC mailbox grant) · `00-environment.md` · `01-stack-health.md` · `02-box-activation.md` (Box went live 2026-06-28) · `03-api-hardening.md` · `04-iac-and-pii.md`.

### D.4 — `docs/activation/README.md`
> Operator activation playbooks for email intake. **Note:** these describe the prior digital@/V3-trigger path; live intake is the Azure orchestration delta-poll/Exchange-RBAC path — see [docs/azure/entra-graph.md](../azure/entra-graph.md) + [docs/gated.md](../gated.md).
- `email-intake-activation.md` · `m1-flow-chain-activation.md` · `multi-inbox-activation.md`.

### D.5 — `docs/requirements/README.md`
> The business problem + domain rules (platform-independent; unchanged by the Azure migration).
- `admin-overview.md` (manual process today) · `intake-workflow.md` (target 10-step pipeline) · `provider-corpus.md` (governed corpus, modes, kill switches) · `inspection-address.md` (policy model + ranked candidates) · `company-background.md` (who CE are + terminology).

### D.6 — `docs/reference/README.md`
> External specs + superseded snapshots. Reference only.
- `Sentry API Documentation 1.2 Amended.pdf` **(current EVA spec)** · `Sentry API Documentation 1.1.pdf` *(superseded)* · `over-length-principal-codes.md` (the 37 EVA-export name-artifacts) · `provider-corpus-status.md` *(superseded snapshot)*.

### D.7 — `docs/design/README.md`
> UI/UX design spec + visual history.
- `ui-ux.md` (M1 IA, four-screen flow, status machine, Fluent v9) · `THEME-MAPPING.md` (CE→Fluent v9 token table) · `screenshots/` (versioned visual history).

### D.8 — `docs/_audit/README.md`
> Point-in-time audit artefacts (not living docs).
- `FLAGS.md` · `findings.json` · `review-2026-06-22/` (dated audit) · `repo-hygiene-2026-06-28/` (this hygiene pass — IA-MOVE-MAP.md + outputs).

### D.9 — `docs/HISTORICAL/README.md` (NEW dir)
> Decommissioned/superseded material kept for provenance. **Nothing here is current.** Live state: [CURRENT_STATUS.md](../../CURRENT_STATUS.md); forward work: [ROADMAP.md](../../ROADMAP.md).
- `PLAN.md` (original narrative plan) · `DEPLOY-RUNBOOK.md` (Power-Platform-era deploy) · `box-integration-pivot/` (Phase-7 Box research) · `migration/` (executed PP→Azure cutover record).

---

## E. `docs/README.md` DIFF (exact changes)

Current `docs/README.md` is **stale** (calls the project "a fast Power Platform spike", lists Dataverse,
ADRs only "0001–0012", links root `PLAN.md`/`DEPLOY-RUNBOOK.md` which are moving, omits `handoff/`,
`_audit/`, `HISTORICAL/`, `MAINTENANCE.md`). Changes:

1. **L3-4 intro:** change "a fast Power Platform spike" → "a fast Azure-PaaS spike (migrated off Power
   Platform 2026-06-27)".
2. **L6-10 "Start with the root docs":** repoint `../PLAN.md` → `HISTORICAL/PLAN.md` *(historical)*;
   `../DEPLOY-RUNBOOK.md` → `HISTORICAL/DEPLOY-RUNBOOK.md` *(historical)*; drop OPEN_ITEMS as a separate
   "start" doc (now a stub) or relabel it "(merged → ROADMAP)". Add `LIVE_FACTS.json` +
   `architecture/live-environment.md` as **"the live registry — authoritative numbers"**.
3. **L26 data-model gloss:** "Dataverse tables" → "Postgres tables (was Dataverse)".
4. **L65-66 ADRs:** "0001–0012" → "0001–0018 (0015 & 0017 Proposed)"; link the new `adr/README.md`.
5. **Add new index sections:**
   - `## Operator handoff` → `handoff/README.md` (+ OPERATOR-CHECKLIST.md).
   - `## Historical` → `HISTORICAL/README.md` (PLAN, DEPLOY-RUNBOOK, box-integration-pivot, migration).
   - `## Audit` → `_audit/README.md`.
   - `## Maintenance` → `../MAINTENANCE.md` (the freshness-engineer, task #12, creates it) + the
     verify-live gate + link-checker.
6. **Per-dir README links:** update the Requirements/Architecture/Design/Reference/ADR/Activation section
   headers to point at the new `<dir>/README.md` index files (D.1–D.7) rather than deep-linking individual
   files only.
7. **L30 live-environment gloss:** relabel as **"canonical live registry — mirrors LIVE_FACTS.json"**.

---

## F. FILE-OWNERSHIP PARTITION (restructurer #10 vs fact-reconciler #11)

**Rule:** the two agents must not edit the same file in the same pass. Ordering: **restructurer runs first**
(moves/merges/creates structure), **fact-reconciler second** (rewrites the numbers-as-pointers in the
*final* locations). Files needing both are flagged with an explicit order.

### F.1 — RESTRUCTURER ONLY (structural: moves, merges, new files, stubs)
- **Moves/stubs:** `PLAN.md`, `DEPLOY-RUNBOOK.md`, `box-integration-pivot/**`, `migration/**` (+ their stubs).
- **Deletes:** `Azureresources.csv`, `Azureresources (1).csv`, `941197_re7d6t50_config.json(+:Zone.Identifier)`.
- **Status-doc merge (structure):** fold OPEN_ITEMS §A into `ROADMAP.md`; rewrite `OPEN_ITEMS.md` → stub
  (B.3); restructure `CURRENT_STATUS.md` to the B.2 skeleton (move blocks, strip the live-table — but leave
  the literal-number *replacement* to the fact-reconciler; restructurer just removes the duplicated table
  rows / marks them `<!-- LIVE: replace with registry pointer -->`).
- **New files:** all per-dir `README.md` (D.1–D.9), `docs/HISTORICAL/README.md`.
- **`docs/README.md`:** the structural section adds/repoints (E.1, E.2, E.5, E.6).

### F.2 — FACT-RECONCILER ONLY (content: numbers → registry pointers, drift corrections)
- All §C rows in: `README.md`, `AGENTS.md`, `docs/gated.md`, `docs/roles-and-permissions.md`,
  `docs/architecture/data-model.md`, `docs/architecture/live-environment.md` *(verify-it-matches only — do
  not gut the registry)*, `docs/plans/milestone-model.md`,
  `docs/plans/phase-1-intake-and-case-tracking/README.md`, `docs/handoff/01-stack-health.md`.
- The C.3 contradictions (CLAUDE push-vs-poll L38; CLAUDE mailbox-set L40/54) — **after** task #7 resolves
  the truth.

### F.3 — BOTH TOUCH → explicit ordering
| File | Restructurer does | Then fact-reconciler does | Order |
|---|---|---|---|
| `ROADMAP.md` | folds in OPEN_ITEMS §A (B.1), adds legend tags | replaces embedded 41/390/2209/etc with registry pointers (C.1–C.3) | **R → F** |
| `CURRENT_STATUS.md` | applies B.2 skeleton, strips dup table to `<!-- LIVE -->` markers | fills each marker with a registry pointer; bands stale L619/566 as dated history | **R → F** |
| `CLAUDE.md` | none structural (canonical doc, stays at root) | resolves push-vs-poll (L38) + mailbox-set (L40/54) + links registry (C.1/C.2) | **F only** |
| `docs/handoff/OPERATOR-CHECKLIST.md` | adds to `handoff/README.md` index | fixes "42 functions"→41 + registry link (C.1 ⚠) | R(index) ∥ F(file) — different files, safe |
| `docs/README.md` | structural section edits (E) | verify the live-registry callouts say "authoritative numbers" | **R → F** |

---

## G. LINK NORMALIZATION (`[[wikilinks]]` outside `memory/` → relative markdown)

Policy: **`[[wikilinks]]` reserved for `memory/` only**; everything else uses relative markdown links.

**Convert these (all are `[[name]]` → `memory/<name>.md` cross-refs living in `docs/azure/`):**

| File | Wikilinks to convert | Convert to |
|---|---|---|
| `docs/azure/deploy.md:31,33,35` | `[[azure-orch-deploy]]`, `[[azure-api-deploy-and-auth]]` (×2) | `[azure-orch-deploy](../../memory/azure-orch-deploy.md)`, `[azure-api-deploy-and-auth](../../memory/azure-api-deploy-and-auth.md)` |
| `docs/azure/logs-kql.md:34` | `[[azure-orch-deploy]]` | `[…](../../memory/azure-orch-deploy.md)` |
| `docs/azure/identity-rbac.md:28,33` | `[[azure-orch-deploy]]`, `[[azure-api-deploy-and-auth]]` | relative |
| `docs/azure/entra-graph.md:19,22,34,42` | `[[exchange-rbac-unblocks-graph-intake]]`, `[[azure-orch-deploy]]` (×3) | relative |
| `docs/azure/diagnose.md:30,32,35` | `[[azure-orch-deploy]]`, `[[azure-api-deploy-and-auth]]` | relative |
| `docs/azure/secrets-keyvault.md:31,34` | `[[azure-api-deploy-and-auth]]`, `[[azure-orch-deploy]]` | relative |
| `docs/azure/postgres.md:24` | `[[azure-api-deploy-and-auth]]` | relative |
| `docs/azure/README.md:71-72` | documents the `[[name]]` convention | **Update the note** to say wikilinks are reserved for `memory/`-internal cross-refs; docs link via relative paths. |

**Leave as-is (allowed):**
- `memory/exchange-rbac-unblocks-graph-intake.md`, `memory/sdlc-sweep-2026-06-24.md`,
  `memory/azure-orch-deploy.md`, `memory/azure-api-deploy-and-auth.md` — wikilinks **inside** `memory/` are
  permitted.

**Flag / out-of-scope:**
- `.claude/agents/box-integration-architect.md` uses `[[wikilinks]]` but is an **agent definition under
  `.claude/`**, not repo docs — outside the doc-hygiene scope (read-only). Note only; do not edit unless the
  team-lead extends scope.

> **Owner:** these are mechanical content edits → **fact-reconciler** (or a dedicated link pass). They touch
> only `docs/azure/*` which the restructurer does not move, so no ordering conflict.

---

## Execution order summary
1. **restructurer (#10):** moves + deletes (§A) → status-doc merge structure (§B, leaving `<!-- LIVE -->`
   markers) → create all per-dir READMEs (§D) + `docs/HISTORICAL/` → `docs/README.md` structural edits (§E).
   **Precondition:** confirm Box config in KV before deleting the cred (§A.2 #7); citation-check
   `migration/assets/` before moving (§A.1 #4).
2. **fact-reconciler (#11):** wait for task #7 `LIVE_FACTS.json` → resolve the C.3 contradictions →
   replace all §C embedded numbers with registry pointers → link normalization (§G).
3. **freshness-engineer (#12):** `MAINTENANCE.md` + verify-live gate + link-checker (will catch any stub or
   README this map missed).
