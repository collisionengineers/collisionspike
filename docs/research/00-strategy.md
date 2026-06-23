# 00 — Strategy & Synthesis (Research Lane 4 of 4)

_Cross-cutting prioritization for the `collisionspike` M1 spike. Companion to [CURRENT_STATUS.md](../../CURRENT_STATUS.md), [ROADMAP.md](../../ROADMAP.md), [PLAN.md](../../PLAN.md). Lanes 1–3 (Power-Platform-native, Azure/AI, domain/workflow) hold the per-feature detail; this lane stays at the **prioritization and sequencing altitude**. Date: 2026-06-18._

> **One-line read of where we are.** The offline M1 vertical slice is *built and largely deployed* to the dev Sandbox — Code App live on Dataverse (11 tables), parser Function live and extracting real PDFs into the 12-field EVA contract, enrichment Function deployed gated-OFF, 10 flows imported. **Email intake is now ON** (2026-06-18): `CS Intake` flow running with a rebuilt `OnNewEmailV3` trigger on the connected `digital@` mailbox, Provider Match and Case Resolve also ON; a test email created a real `cr1bd_cases` row. Classify+Persist, Parse, Status Evaluate, Enrich, Finalize, Chaser, and Job Sheet flows remain authored but OFF. The frontier is therefore not "build more app" or "activate live email intake" — it is **downstream-flow activation, corpus incorporation, the offline inspection-address suggestions corpus, and the parser CSP/connector fix**. Everything below ranks against that reality.

---

## 0. Framing: what actually moves the needle

For Collision Engineers the two needles are **throughput** (how fast an email becomes an EVA-ready, deduped, provider-matched Case with a confirmed inspection address and minimal human keystrokes) and **data quality** (the Case that lands in EVA is correct: right provider, right inspection address, registration legible, no duplicate). The predecessor tool (the Tkinter `cedocumentmapper` monolith — no tests, no version control, manual everything) set a low bar: it parsed a document to JSON but did **nothing** about intake, dedup, provider/address resolution, audit, or readiness gating, and it could not be safely changed.

So the needle-movers are the capabilities that (a) eliminate manual re-keying and manual triage, and (b) catch the data-quality failures the old tool let through. The data analysis tells us *precisely where the quality problems are*: **57% of located cases carry only a part-postcode** (7,474 of 13,217 located; 5,743 full), **137 active principals instruct us but aren't on the job sheet**, and inspection truly happens at **English storage yards** that the Scottish REPAIRER list doesn't cover. Those three facts drive the ranking.

---

## 1. Value-vs-effort ranked shortlist (the next moves)

Effort is relative to a spike (S ≈ hours–1 day, M ≈ a few days, L ≈ 1–2 weeks). "Dependency that must clear first" names the single thing without which the move is blocked.

| # | Move | Value | Effort | Pain it removes | Dependency that must clear first |
|---|---|---|---|---|---|
| **1** | ✅ **DONE 2026-06-18 — Live email intake on `digital@` mailbox.** `CS Intake` (rebuilt `OnNewEmailV3` trigger), Provider Match, and Case Resolve turned ON; a test email created a real `cr1bd_cases` row. **New #1 priority: corpus incorporation + downstream-flow activation (Classify+Persist, Parse, Status Evaluate, Enrich) + the parser CSP/connector fix.** | **High** | **Done** | "Emails don't populate the app" — resolved. The gate that converts the spike from an offline artifact to an actually-running intake tool has been crossed. | — |
| **2** | **Incorporate the CONFIRMED provider corpus** into Sandbox Dataverse (the `dataverse-corpus-incorporation.md` plan: scripts `10`–`14`). | **High** | **M** | Provider matching and address resolution are only as good as the corpus behind them. Today the corpus is a 45-row seed from a 58-row job sheet that **under-covers the active base by 137 principals**. Widening it (PCH 1,725 cases, HVL 422, TL 263…) directly raises the auto-match hit-rate and pre-loads the known-site lookup that address-matching needs. | **`[DEPLOY-WITH-LOGIN]` operator login** (pure Dataverse data; no inbox/SharePoint/Box/EVA). Plan is written, idempotent, ready for `dataverse-data-architect`. **No build dependency** — can proceed in parallel with #1. Inputs are the already-analysed CSVs (no mock data). |
| **3** | **Offline inspection-address suggestions corpus → manual pick in the Code App → EVA field 9.** Mine Box/EVA case history per provider into full-address-only suggestions (`cr1bd_inspectionaddress`); staff pick/edit, postcode.io-normalise, or record "Image Based Assessment" with a reason. **No runtime resolver** (ADR-0013). | **High** | **M** | The single largest *data-quality* gap in EVA submissions: **57% of located cases carry only a part-postcode**, and EVA field 9 needs a full address (or an explicit "Image Based Assessment" decision — never silent). Without good suggestions, a human hand-resolves the majority of cases. | **Move #2** must land first (the suggestions ride on `Repairer` known-sites + the corpus rows). The address-policy *gate* is already built; this adds the static, offline-derived suggestions. Offline-buildable (postcode.io is free); partials/bare postcodes stay a backlog, never loaded. |
| **4** | **Drive the EVA M1 JSON drag-drop path end-to-end into the EVA test environment + Box archival.** | **High** | **M** | The *output* half of the slice and the literal definition of M1 "done." Validating it proves the contract is right **before** any REST API work, and it's the permanent fallback path regardless of REST. | **B5 (operator)** — EVA **test** credentials in Key Vault + Box UPPERCASE-folder casing confirmation. Serializer, `finalize-eva-box` flow, readiness gate all built; this is activation + one live drag-drop. |
| **5** | **Activate enrichment (DVSA/DVLA) in a test env** — inject creds, set `DVSA_TENANT_ID`, consent the Entra app, flip `ENRICHMENT_ENABLED=true`. | **Med** | **S–M** | Removes manual mileage/vehicle-detail lookup and fills EVA fields the parser can't. Narrower than 1–4: it improves an already-working Case rather than unblocking the pipeline (ADR-0006 scopes mileage to "only when the document lacks it"). | **Operator** (creds + Entra consent). Function deployed gated-OFF; gateway retired (B1 obviated). No build dependency. |
| **6** | **Clarifying-info ingestion: Input 3 (canonical `principalCode`) then Input 5 (the 137 CONSIDER decisions)** per `clarifying-info-ingestion.md`. | **Med** | **M** | Resolves code-drift/slash-code/per-VRM ambiguities (`ZEN`vs`ZENITH`, `R1AM/MOTORX`, Arianna per-VRM) that corrupt the Case/PO prefix and the matcher's keys, and stages the 137 off-sheet principals with real operator decisions. | **Operator worklists** — these inputs require the operator to *return decisions* (🔒 by design). Writers are specified; they wait on human input. |
| **7** | **Activate draft-only chasers** (confirm a chaser *drafts*, never sends; targets the right garage). | **Med** | **S** | The chaser workflow is the answer to partial cases (held until complete). Drafting saves the manual "who do I email for photos" lookup. | Channel-aware targeting wants the **garage↔provider coverage N:N** (clarifying-info Input 4). The draft-only mechanism is built. Lower-leverage until intake (#1) feeds it real partial cases. |

### How to read this table

Moves **1–4 are the spine** of a demonstrable M1. **1 and 4 are operator-gated activations** of already-built code (low Claude-effort, high value, but not Claude-actionable). **2 and 3 are Claude-buildable now** (2 is pure data under operator login; 3 is offline-buildable and depends on 2). **5–7 are real but second-order** — they sharpen an already-working pipeline rather than create it.

---

## 2. Anti-features — what to explicitly NOT build (yet), and why

| Anti-feature | Why NOT now |
|---|---|
| **EVA Sentry REST API submission (v1.2).** | **Build the drag-drop JSON path first and prove the 12-field contract is accepted by EVA test (Move #4) before writing a line of REST submit code.** The contract — not the transport — is the risk. ADR-0005 already makes drag-drop the M1 path + permanent fallback; REST is explicitly "later." |
| **Image-classification AI (overview vs damage) and person/reflection detection.** | **Intake has to work before image-AI has anything to classify.** ADR-0009 defers this to M2: M1 only needs **registration-OCR** (cheap, deterministic); the obvious services (Azure Custom Vision, Image Analysis 4.0 people-detection) are on the **2028 retirement path**; manual role-tagging is fine for a spike's volume. |
| **OCR for scanned (image-only) PDFs ("B-full" on Azure Container Apps).** | Deferred correctly (Phase 5). The live parser handles **text** PDF/DOCX/DOC/EML/MSG today; that covers the M1 path. Standing up a second compute host is infra the spike doesn't need to prove its thesis. Revisit if real intake shows a material share of scanned-only instructions. |
| **Over-engineering orchestration / a "workflow engine."** | The 10 flows + status machine + dedup ladder are enough for one mailbox. Scale to three inboxes is a *copy-the-working-flow* step after one works — not a design-it-generic-upfront step. |
| **Mock/seed *case* data to make the app "look populated."** | Explicit hard principle (CURRENT_STATUS, ROADMAP). The empty intake list is *correct* until Move #1 is on; faking cases hides the real gate and produces a demo that lies. The corpus seed (providers/yards/addresses) is reference data and *is* loaded — that's not case data. |
| **Loading the *deferred* corpus slices** (partial-postcode resolutions, paper providers, red-herrings, REVIEW unknowns, unconfirmed code-drift, note-mining). | The corpus-incorporation plan §8 excludes these because they're stale/uncertain without operator confirmation. Loading guesses pollutes the corpus with low-confidence rows the matcher will trust. They belong to the operator-confirmed clarifying-info phase (Move #6). |
| **Per-provider AI/full-auto modes + the Improvement-Review queue.** | PLAN scopes the spike to **`Review auto` only + global kill switches + field-level provenance**. Per-provider automation tiers are mature-build governance — premature for a workflow-validation spike. |
| **Valuation connector (`valuationbot`) and the Copilot Studio agent.** | M2/M3+ by design. Valuation is staff-triggered and narrow; Copilot needs core data first. Both are additive to a *working* pipeline — neither de-risks M1. |
| **Calling `collisioncc` at runtime.** | Out of bounds permanently. We re-implement its *contracts*; the all-Microsoft spike must not depend on it at runtime. |
| **Audatex / WhatsApp *automated* intake.** | Audatex out of scope. WhatsApp intake stays **manual** (no free automated send — ADR-0003/0007). |

---

## 3. Recommended next-3-moves sequence (what unblocks what)

The boundary is the organising constraint: **Claude builds offline; the operator activates anything touching live inbox/SharePoint/Box/EVA; no mock case data.** That splits the next three moves into one operator track and one Claude track running in parallel.

**Move 1 — ✅ DONE 2026-06-18 — Live email intake on `digital@` mailbox.**
`CS Intake` (rebuilt `OnNewEmailV3` trigger), Provider Match, and Case Resolve are ON. A test email created a real `cr1bd_cases` row. The spike has an email→Case path. The new top priorities are: corpus incorporation (Move 2), downstream-flow activation (Classify+Persist, Parse, Status Evaluate, Enrich), and the parser CSP/connector fix (needed before Parse can be turned ON).

**Move 2 (Claude, in parallel, no inbox contact) — Incorporate the CONFIRMED provider corpus into Dataverse.**
The highest-value work Claude can do *without* waiting on the boundary — pure Dataverse data under `[DEPLOY-WITH-LOGIN]`, the plan is written and idempotent (scripts `10`–`14`), inputs are the analysed CSVs (no mock data). It widens the corpus toward the real active base (the 137 off-sheet principals) and lays the `Repairer`/`InspectionAddress`/yard rows that Move 3 depends on.

**Move 3 (Claude, depends on Move 2) — Derive the offline inspection-address suggestions corpus.**
With the corpus seeded (Move 2) and intake feeding real Cases (Move 1), mine Collision Engineers' own Box/EVA case history per provider into **full-address-only suggestions** (`cr1bd_inspectionaddress`), loaded once as a static snapshot. These surface in the Code App Address tab so the **57%-part-postcode** problem becomes a one-click **manual pick/edit** instead of a per-case research task — postcode.io-normalised, with the built policy gate ensuring no silent "Image Based Assessment." There is **no runtime resolver** (ADR-0013): partials and bare postcodes are never loaded or suggested, staying an offline future-investigation backlog. It's offline-buildable and the clearest *measurable* win over the predecessor (which resolved no addresses at all).

**Why this order:** Move 1 is the only true blocker and it's not Claude's to do — hand it to the operator now, run concurrently. Move 2 precedes Move 3 by a hard data dependency. EVA-export validation (shortlist #4) is the natural fourth move — it needs operator EVA-test creds (B5) and benefits from Moves 2–3 producing a clean Case with a confirmed inspection address to export.

---

## 4. North star for the spike

> **The smallest set of capabilities that makes `collisionspike` demonstrably better than the predecessor:** a real email landing in **one** shared inbox becomes a **tracked, deduplicated, provider-matched Case** whose instruction is **auto-parsed into the 12 EVA fields with provenance**, whose **part-postcode is resolved to a real inspection address** from a corpus that covers the **actually-active** provider base (not just the 58-row job sheet), which a human readiness-reviews in one screen and **exports to EVA (drag-drop JSON) with a Box archive** — every action audited, nothing re-keyed, and the whole thing **versioned and testable**. The predecessor parsed a document to JSON and stopped; the spike's north star is the *workflow around* that parse — intake, dedup, match, resolve, gate, export, audit — proven on one real input end-to-end.

---

### Key files for the next moves
- `DEPLOY-RUNBOOK.md` — §7 operator activation sequence for Move 1 (and B5 for EVA-export).
- `docs/plans/phase-1-intake-and-case-tracking/corpus/dataverse-corpus-incorporation.md` — ready-to-run idempotent spec for Move 2 (scripts `10`–`14`).
- `raw/principalandrepairersheets/outputs/reports/provider_corpus_recommendation.csv` — the spine of Move 2; pairs with `outputs/task5_principal_postcode_profiles/full_postcodes_repeated.csv` (InspectionAddress seed) and `outputs/claudeschoice/top_inspection_locations.csv` (yards feeding Move 3).
- `docs/plans/phase-1-intake-and-case-tracking/corpus/clarifying-info-ingestion.md` — writer specs for Move 6 (Inputs 3 then 5) and the address-worklist (Input 1) feeding Move 3's coverage.
- `docs/architecture/integrations.md` — the env-var gates governing Moves 4 and 5.
