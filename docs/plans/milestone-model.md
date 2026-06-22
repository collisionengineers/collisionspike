# Milestone model — the two-axis Phase × Milestone map (authoritative)

> **What this doc is.** The single canonical mapping of every ROADMAP **Phase** sub-letter (0–6) to
> exactly one **Milestone** (M0/M1/M2/M3), with each milestone's entry/exit criteria. It exists because
> "Phase" and "Milestone" are **two different axes** and conflating them is the documented source of the
> M1/M2 overlap. `CLAUDE.md` and [README.md](./README.md) (`docs/plans/`) point here; when a phase
> README, the M2 umbrella, or any plan disagrees about *which milestone* a sub-letter belongs to, **this
> table wins** — and where this table itself derives a milestone from an ADR, the **ADR is the binding
> source** (precedence note, §6).
>
> Companion docs: [../../ROADMAP.md](../../ROADMAP.md) (the forward Phase 0–6 checklist) ·
> [../../CURRENT_STATUS.md](../../CURRENT_STATUS.md) (what is live now) ·
> [../../PLAN.md](../../PLAN.md) · [../gated.md](../gated.md) (operator blockers) ·
> [./README.md](./README.md) (plans index) ·
> [./m2-umbrella-enrichment-to-scale.md](./m2-umbrella-enrichment-to-scale.md) (the M2 dependency graph) ·
> ADRs [0004](../adr/0004-parser-as-azure-function-inline.md) /
> [0005](../adr/0005-eva-api-full-scope-test-environment.md) /
> [0006](../adr/0006-enrichment-rest-wrapper-dvsa-m1.md) /
> [0008](../adr/0008-tool-boundary-ends-at-eva-handoff.md) /
> [0009](../adr/0009-image-ai-ocr-m1-classification-m2.md).
> Last updated **2026-06-20**. Read-only planning doc; nothing here is activated by Claude.

---

## 1. The two axes (and why they are NOT the same thing)

There are two orthogonal ways to slice this build, and the repo uses **both**:

- **Phases (ROADMAP 0–6) = the WORK-BREAKDOWN axis.** Phases group the *build steps* — "the parser",
  "the flows", "enrichment & EVA", "OCR & scale". Each phase folder under `docs/plans/<phase>/README.md`
  holds that phase's ordered checklist. Phases are about **where code lives** and **build order**.
- **Milestones (M0/M1/M2/M3) = the CAPABILITY axis.** Milestones are *demoable slices of product value* —
  "foundations green", "one case end-to-end on the fallback transport", "automation at scale", "assistive
  extras". Milestones are about **what works for the business**.

> ### 🔒 Phase ≠ Milestone
>
> **A Phase is NOT a Milestone.** A single phase can contain pieces of **several** milestones, because the
> capability slices cut *across* the work-breakdown. The old shorthand "M1 = Phase 1; M2 = Phases 3–5" is
> the precise origin of the overlap the operator reports — it is **retired**. Concrete proof (each from a
> binding ADR):
>
> 1. **Phase 3b (EVA JSON drag-drop) = M1, but Phase 3c (EVA Sentry REST) = M2.** Same phase ("EVA Sentry"),
>    two different milestones. The drag-drop JSON export "remains the **M1 path and the permanent fallback**"
>    ([ADR-0005](../adr/0005-eva-api-full-scope-test-environment.md)); the REST API is the net-new automation
>    transport, and it *cannot* be done at the connector layer (custom connectors don't support the
>    client-credentials grant — see §3, Microsoft Learn), so its token-in-a-Function build is **M2**.
> 2. **Phase 3a (DVSA enrichment) = M1.** "**DVSA enrichment is pulled into M1**"
>    ([ADR-0006](../adr/0006-enrichment-rest-wrapper-dvsa-m1.md)) — mileage (only when the document lacks it;
>    the document is authoritative) + make/model. It sits in "Phase 3" but it is an **M1** capability.
>    (Valuation, in the *same* phase 5c, is M3 — see §2 and §4.)
> 3. **Phase 5a (plate-OCR for registration) = M1, but Phase 5b (image classification + reflection) = M2.**
>    "**M1 — OCR for registration matching only**"; "**M2 — classification + reflection**"
>    ([ADR-0009](../adr/0009-image-ai-ocr-m1-classification-m2.md)). One "OCR & Scale" phase, split across two
>    milestones; overview/damage role-tagging stays **manual** in M1.

**Rule of thumb:** to find *where to build* something, use its **Phase** (ROADMAP + the phase README). To
find *whether it is in the current capability slice*, use its **Milestone** (this table). Each Phase
sub-letter maps to **exactly one** milestone, so there is no double-counting.

---

## 2. Canonical mapping — every Phase sub-letter → exactly one Milestone

Legend: `[x]` built/deployed (per CURRENT_STATUS / the offline gate) · `[ ]` remaining ·
⚙️ deployed but **gated-OFF** by design · 🔒 **operator-gated** (crosses the live-services boundary).
"Build state" is the *engineering* state; live activation of anything 🔒 is the operator's, in
DEPLOY-RUNBOOK order.

| Phase sub-letter | Capability | **Milestone** | Build state | Binding source |
|---|---|---|---|---|
| **0** — Foundations (all) | Repo, typed contracts, Dataverse schema-as-code, Code App scaffold, env-var gates, offline gate | **M0** | `[x]` complete | ROADMAP Phase 0 |
| **1a** — Parser → Azure Function | cedocumentmapper_v2.0 vendored into an FC1 Function; 12-field extraction + provenance | **M1** | `[x]` live | [ADR-0004](../adr/0004-parser-as-azure-function-inline.md) |
| **1b** — Dataverse schema in Sandbox | `CollisionSpike` solution: 11 tables, 19 choice sets, 15 relationships, 3 alt keys, 11 env-vars | **M1** | `[x]` built | ROADMAP 1b |
| **1b.1** — Provider-corpus seed + analysis | WorkProvider/Repairer/ImageSource seed; reproducible analysis | **M1** | `[x]` done | ROADMAP 1b.1 |
| **1b.2** — Corpus incorporation | Idempotent upsert of the CONFIRMED corpus (390 WorkProvider, 174 InspectionAddress, N:N) | **M1** | `[x]` loaded 2026-06-19 | ROADMAP 1b.2 |
| **1b.3** — Clarifying-info ingestion | The five operator worklists (code reconciliation, CONSIDER seeding, addresses, coverage, intermediaries) | **M1** | `[ ]` 🔒 awaits operator worklists | ROADMAP 1b.3 |
| **1c** — Code App (live) | Live Code App wired to live Dataverse; manual-intake upload→parse→Case; real rows only | **M1** | `[x]` live | ROADMAP 1c |
| **1d** — Flows (imported OFF; M1 chain wired) | 10 flows imported `state=off`; M1 chain wired via CLI; dedup ladder ([ADR-0010](../adr/0010-dedup-reference-disambiguated-no-time-window.md)) | **M1** | `[x]` wired (children await operator flip) | ROADMAP 1d |
| **2** — Live Activation (all three inboxes) | Bind Outlook shared-mailbox + Dataverse + parser; turn the chain ON; one inbox first, then all three | **M1** *(exit gate)* | `[ ]` 🔒 operator | ROADMAP Phase 2 — the §7 three-mailbox checklist **is** the M1 "done" definition |
| **3a** — Enrichment (DVSA/DVLA) | DVSA mileage (document-authoritative) + make/model, gated `ENRICHMENT_ENABLED` | **M1** | `[x]` deployed ⚙️ gated-OFF; activation 🔒 | [ADR-0006](../adr/0006-enrichment-rest-wrapper-dvsa-m1.md) ("pulled into M1") |
| **3b** — EVA JSON drag-drop | 12-field JSON serializer (exact order, 6-line address, enums); drag-drop export | **M1** | `[x]` built; live export 🔒 | [ADR-0005](../adr/0005-eva-api-full-scope-test-environment.md) ("the M1 path and the permanent fallback") |
| **3c** — EVA Sentry REST API | `functions/evasentry` v1.2 two-request submit; token lifecycle **inside the Function** | **M2** | `[x]` built (pytest 42/42) ⚙️; Azure deploy + activation 🔒 | [ADR-0005](../adr/0005-eva-api-full-scope-test-environment.md) + §3 (connector can't do client-credentials) |
| **3c-Fn** — EVA-validation Function | `functions/evavalidation` `POST /validate-case`; ports image-rules + case-status so flow ＝ Code App | **M2** | `[ ]` no Function backs `cr1bd_evavalidation` yet | [m2-umbrella §6](./m2-umbrella-enrichment-to-scale.md); on the M2 critical path |
| **3d** — Box archival | `finalize-eva-box` Box folder (UPPERCASE Case/PO) + EVA photo-order upload | **M2** | `[x]` flow built ⚙️; bind + activate 🔒 (B5/S2) | [m2-umbrella §8](./m2-umbrella-enrichment-to-scale.md); [ADR-0005](../adr/0005-eva-api-full-scope-test-environment.md)/[0008](../adr/0008-tool-boundary-ends-at-eva-handoff.md) |
| **3e** — EVA readiness gate | Image-rules / readiness checklist in the Code App; address decision gate; AuditEvent rows | **M1** | `[x]` built; drive green on a live Case 🔒 | ROADMAP 3e; `mockup-app/src/contracts/image-rules.ts` |
| **4a** — Address **policy** gate | Per-provider inspection-address policy; **no** silent "Image Based Assessment"; postcode.io normalise | **M1** | `[x]` built (Code App) | ROADMAP 4a; `docs/requirements/inspection-address.md` |
| **4a** — Address **matching** service | `functions/addressmatch`: part-postcode `Loc` → linked yard → `InspectionAddress` → EVA field 9 | **M2** | `[x]` deployed 2026-06-19; activation 🔒 | ROADMAP 4a; [inspection-address-matching](./phase-4-address-and-chaser/inspection-address-matching.md) |
| **4a** — Azure Maps (gated) | Optional geocoding upgrade over postcode.io; `AZURE_MAPS_ENABLED` | **M3** | `[ ]` gated-OFF, optional | ROADMAP 4a ("only if needed, later") |
| **4b** — Chaser **send** | Kill-switched outbound email send (`CHASER_SEND_ENABLED`); `chaser-draft` stays draft-only | **M2** | `[x]` `chaser-draft` built ⚙️; send flow `[ ]`; activation 🔒 | [ADR-0003](../adr/0003-channel-aware-chasers-whatsapp-constraint.md); [m2-umbrella §10](./m2-umbrella-enrichment-to-scale.md) |
| **5a** — Plate-OCR for **registration** | `fast-alpr`/DI-Read plate read → `registrationVisible` + VRM-match; OCR host (ACA) for scanned PDFs | **M1** | `[x]` host built + image pushed; deploy done; wiring 🔒 | [ADR-0009](../adr/0009-image-ai-ocr-m1-classification-m2.md) ("M1 — OCR for registration matching only") |
| **5b** — Image **classification** + reflection | overview-vs-`damage_closeup` (AI Builder / Foundry vision) + person-reflection exclusion | **M2** | `[ ]` planned | [ADR-0009](../adr/0009-image-ai-ocr-m1-classification-m2.md) ("M2 — classification + reflection") |
| **5b** — WhatsApp bulk-media import | Bulk-import WhatsApp media, OCR each for VRM, auto-match to the open Case | **M3** | `[ ]` planned | [ADR-0007](../adr/0007-whatsapp-intake-manual-bulk-ocr-match.md); off the EVA/Box critical path |
| **5c** — **Valuation** (`valuationbot`) | Staff-on-demand Companion Report PDF as `Evidence(kind=valuation)`, gated `VALUATION_ENABLED` | **M3** 🔒 *(LOCKED — see §4)* | `[ ]` planned | [ADR-0006](../adr/0006-enrichment-rest-wrapper-dvsa-m1.md) ("Valuation … follows in **M3**") |
| **5c** — Copilot Studio agent | Staff assistant grounded over Dataverse, gated `COPILOT_ENABLED` | **M3** | `[ ]` planned, gated-OFF | ROADMAP 5c; `docs/architecture/microsoft-stack.md` |
| **(5c)** — Dataverse-MCP-in-Copilot | Dataverse Model Context Protocol surfaced inside the Copilot agent | **M3** | `[ ]` planned, gated-OFF | `docs/architecture/microsoft-stack.md` |
| **6** — Boundary evidence & handoff | Offline gates green; connection inventory; deploy log; **§7 live-validation across all three mailboxes** | **M1** *(evidence)* | `[x]` offline gates; `[ ]` 🔒 live evidence | ROADMAP Phase 6 — the §7 checklist is the M1 "done" evidence |
| **7** — Box-centric intake pivot (ADR-0012) | Folder at parse-confirm + File-Request image chasers + webhook intake; **one-way Box mirror, Dataverse authoritative** | **M2-class** *(extends M2.D)* | `[x]` authored + offline-verified + free-account REST-tested; deploy/bind/flip + the BUSINESS `FILE.UPLOADED` live-test 🔒 | [ADR-0012](../adr/0012-box-centric-intake-additive-hybrid.md); the broader successor to **3d**/M2.D; build order in `box-integration-pivot/plans/00-BUILD-PLAN.md` |

> **Phase 7 vs the milestone axis.** Phase 7 is a later **additive** work-breakdown phase, not a new
> milestone. Its capabilities are **M2-class** — they extend the **3d = M2.D** Box family (Box-archival)
> from "folder at EVA-submit" to "folder at parse-confirm + File-Request chasers + webhook intake". It
> stays off the **M1** critical path (M1 ships on EVA JSON drag-drop with Box archival; Phase 7 is not an
> M1 gate), and EVA itself stays gated OFF throughout the pivot.

**Why some Phase 4a/5c rows appear more than once:** a few phase sub-letters bundle *more than one
capability* under one ROADMAP letter (e.g. 4a holds the policy gate **and** the matching service **and**
Azure Maps; 5c holds valuation **and** Copilot). Each *capability* still maps to exactly one milestone —
the sub-letter is just a build-folder label, not a milestone. This is itself a worked example of
"Phase ≠ Milestone".

### One-line milestone summary

- **M0 — Foundations** = **Phase 0**. _(done)_
- **M1 — Working vertical slice** (ONE case end-to-end on the **permanent-fallback** transport) =
  **Phase 1** (1a–1d, 1b.\*) + **Phase 2** live activation (**all three inboxes** = the "done" definition)
  + **3a** DVSA enrichment + **3b** EVA JSON drag-drop + **3e** readiness gate + **4a** address-**policy**
  gate + **5a** plate-OCR-for-registration + **Phase 6** §7 evidence.
- **M2 — Automation + richer transports at scale** = **3c** EVA Sentry REST + the **EVA-validation
  Function** + **3d** Box archival activation + **4a** address-**matching** service + **4b** chaser-send +
  **5b** image classification / reflection.
- **M3 — Assistive + optional** (all gated-OFF, none on the EVA/Box critical path) = **5c** valuation
  (LOCKED, [ADR-0006](../adr/0006-enrichment-rest-wrapper-dvsa-m1.md)) + **5c** Copilot Studio + **4a**
  Azure Maps + **5b** WhatsApp bulk-media import + Dataverse-MCP-in-Copilot.

---

## 3. The one external-contract fact that fixes the 3b/3c boundary

The drag-drop-vs-REST split (M1 vs M2) is not arbitrary — it falls out of a hard Power Platform limit:

> **Power Platform custom connectors use the OAuth 2.0 *authorization-code* flow; the implicit and
> client-credentials flows do not issue refresh tokens and are unsuitable for custom-connector auth.**
> ([Verify OAuth configuration for custom connectors](https://learn.microsoft.com/troubleshoot/power-platform/power-automate/connections/verify-oauth-configuration#verify-oauth-flow);
> [Troubleshoot OAuth configuration](https://learn.microsoft.com/connectors/custom-connectors/troubleshoot-oauth2) — "APIHub only supports the *authorization code* method".)

EVA's `POST /Connect/token` is a client-id/secret body exchange returning a ~5-minute JWT — a
client-credentials-style flow with **no** authorization-code/refresh story. So the EVA token **cannot** be
minted at the connector layer; it must be minted, cached, and attached as `Authorization: Bearer`
**inside `functions/evasentry`** (function-key on the connector; EVA creds as Key Vault refs). That extra
server-side build is exactly why **3c is M2** while the **3b** drag-drop export — pure JSON serialisation,
no token at all — is **M1** and the permanent fallback. Full design: [m2-umbrella §7](./m2-umbrella-enrichment-to-scale.md)
and [eva-sentry-rest-submission](./phase-3-enrichment-and-eva/eva-sentry-rest-submission.md).

---

## 4. 🔒 Locked decision — Valuation is **M3**

Valuation's milestone was inconsistent across docs ([ADR-0006](../adr/0006-enrichment-rest-wrapper-dvsa-m1.md)
said M3; the m2-umbrella labelled it "M2.G"; ROADMAP/phase-5 said "M2/M3+"). **Resolved by precedence in
favour of the ADR: valuation is M3.** Rationale: it is **staff-on-demand**, **off the EVA/Box critical
path** ([ADR-0008](../adr/0008-tool-boundary-ends-at-eva-handoff.md)), the lowest-priority/parallel item even in the
umbrella's own framing, and ADR-0006 (higher precedence than a plan) states valuation "**follows in M3**".
The m2-umbrella's "M2.G" label is reconciled **up** to this doc and re-tagged **M3.A (tracked for
dependency context only)**; ROADMAP 5c and the phase-5 README are reconciled to "M3". The build still
lives in the Phase 5c folder and in [valuation-and-copilot](./phase-5-ocr-and-scale/valuation-and-copilot.md)
— **Phase ≠ Milestone**, again.

---

## 5. Entry / exit criteria per milestone

These are the **capability gates** — what must be demonstrably true to *enter* and to *call done*.

### M0 — Foundations _(done)_
- **Entry:** repo initialised.
- **Exit `[x]`:** `node verify-all.mjs` green (**6/6 gates**) — typed EVA/case-status/image-rules
  contracts, classification + ADR-0010 dedup + provider-match + address-policy in TS, Dataverse
  schema-as-code parity, env-var gates defined, and the boundary-compliance gates (no live calls in the
  app, no secret values in the repo, all flows `state=off`).

### M1 — Working vertical slice (the permanent-fallback transport)
- **Entry:** M0 green.
- **Exit** (this **is** the ROADMAP "done for M1" text, with the locked all-three-inboxes scope):
  a **real email** in **each of the three** Outlook shared inboxes becomes a tracked **Case**; is
  **parsed** (and optionally **DVSA-enriched**, document-authoritative) into the **12 EVA fields** with
  **provenance**; passes a **human readiness review** (3e); and is **exported to EVA as drag-drop JSON**
  (3b) with a **Box archive folder**. **Dedup** ([ADR-0010](../adr/0010-dedup-reference-disambiguated-no-time-window.md)),
  **provider-matching**, and the **inspection-address policy gate** (4a) behave per the **offline
  decision-table tests**; plate-OCR (5a) satisfies the registration-visible check. **DEPLOY-RUNBOOK §7
  complete across all three mailboxes** = the Phase 6 evidence.
- **Note:** "one inbox first, then scale to all three" is the *activation order*; the **done bar is all
  three** (ROADMAP Phase 2 + Phase 6). A single-inbox slice is a useful intermediate, not M1-done.

### M2 — Automation + richer transports at scale
- **Entry:** M1 exit met for **≥1 inbox** (the m2-umbrella "M2.0 pipeline-on" prerequisite — classify-
  persist + parse + status-evaluate ON, provider email-domains seeded).
- **Exit** (adapted from [m2-umbrella §15](./m2-umbrella-enrichment-to-scale.md)): an **enriched,
  image-classified, human-reviewed** `ready_for_eva` Case is **submitted to the EVA *test* environment via
  the Sentry REST API** (3c) and **archived to Box** (3d) in **one idempotent finalisation**; the
  **drag-drop JSON** path is proven as the **permanent fallback**; **kill-switched email chasers** (4b) are
  sendable; **address auto-matching** (4a) is live; and the **EVA *production* cutover** is staged behind a
  **passing parity test** (a case submitted via the API matches the drag-drop result). All integrations
  remain **gated, default-off**.

### M3 — Assistive + optional
- **Entry:** M2 stable in **test**.
- **Exit:** **valuation** attaches a Companion Report PDF as `Evidence(kind=valuation)` **on demand**,
  and/or the **Copilot Studio** agent answers grounded Dataverse questions — **each behind its own gate**
  (`VALUATION_ENABLED`, `COPILOT_ENABLED`, `AZURE_MAPS_ENABLED`), with **no extension past the EVA/Box
  handoff** ([ADR-0008](../adr/0008-tool-boundary-ends-at-eva-handoff.md)). M3 features are optional and never on
  the pipeline critical path.

---

## 6. Precedence note (read before "correcting" anything)

When documents disagree, follow the `CLAUDE.md` precedence ladder — **reconcile the lower/older doc up to
the higher one**, never the reverse:

> **binding review** (`docs/reviews/<DDMMYY>/`) > **ADRs** (`docs/adr/`) >
> **architecture / requirements** specs > **plans** (incl. this one).

Consequences for *this* doc:
- This table's milestone assignments are **derived from the ADRs** (0004/0005/0006/0008/0009) and are the
  canonical *mapping*; but if a future **ADR amendment** or a **later binding review** changes a milestone
  boundary, the ADR/review wins and **this doc is reconciled to it** (not vice-versa).
- The **valuation = M3** decision (§4) is locked **because** ADR-0006 outranks the m2-umbrella plan. To move
  valuation *into* M2 you must **amend ADR-0006's one line first** (a dated update) — silently contradicting
  it would re-break precedence. (Carried as Open Question 1, §7.)
- **Do not embed a rigid milestone table in CURRENT_STATUS or ROADMAP** — those are frequently-updated
  "live now" docs and would go stale. They **link here**; the canonical mapping lives **only** in this
  file.
- No work is being **re-sequenced** by this doc — the Phase 0–6 build order and the m2-umbrella dependency
  graph are unchanged. This is a **re-labelling** (capability axis) layered on top of the existing
  work-breakdown axis.

---

## 7. Open questions (carried, for the operator)

1. **Valuation milestone** — locked to **M3** here per ADR-0006 (§4). If the operator instead wants
   valuation in **M2**, amend **ADR-0006** explicitly (one dated line) and this doc + the umbrella + ROADMAP
   5c reconcile to that. _Recommendation: keep M3 (off critical path, staff-on-demand, lowest priority)._
2. **M0 naming** — this doc introduces **M0** for the already-complete Foundations so that **M1 stays the
   vertical slice**. If the operator prefers to fold Foundations into M1, drop the M0 row and renumber; the
   capability boundaries are otherwise identical. _Recommendation: keep M0 (cleaner slices)._
3. **Phase 2 as M1 vs a distinct gate** — modelled here as **M1's exit gate** (ROADMAP already calls the
   three-mailbox §7 checklist "the M1 done definition"). The operator may prefer to track live activation as
   its own milestone. _Recommendation: fold into M1._
4. **M1 "done" scope** — modelled as **all three inboxes** (per the ROADMAP "done" text + Phase 6). If a
   single inbox (`digital@`) is acceptable for an interim "M1.0" with the other two deferred to an "M1.x",
   say so and this table adds the sub-split. _Recommendation: all three = M1-done; single inbox = interim._

---

## 8. Back-links (each phase README should point here)

Each `docs/plans/<phase>/README.md` carries a one-line **"Milestones in this phase"** banner naming which
sub-letters are M1 vs M2 vs M3, and links back to this doc as the authority:

- **phase-0-foundations** → all **M0**.
- **phase-1-intake-and-case-tracking** → all **M1** (1a–1d, 1b.\*).
- **phase-2-live-activation** → **M1 exit gate** (the three-mailbox §7 checklist).
- **phase-3-enrichment-and-eva** → **3a/3b/3e = M1**; **3c/3c-Fn/3d = M2**.
- **phase-4-address-and-chaser** → **4a policy gate = M1**; **4a matching + 4b chaser-send = M2**; **4a Azure
  Maps = M3**.
- **phase-5-ocr-and-scale** → **5a plate-OCR = M1**; **5b classification/reflection = M2**; **5b WhatsApp
  import + 5c valuation + 5c Copilot = M3**.
- **phase-6-handoff** → **M1 evidence** (the §7 live-validation across all three mailboxes).
