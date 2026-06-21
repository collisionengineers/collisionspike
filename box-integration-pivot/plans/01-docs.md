# Docs changes & additions — build plan

> **Section owner:** the "Docs changes & additions" slice of the Box-integration pivot.
> **Research base (SETTLED — do not re-litigate):** the `box-integration-pivot/` dossier (README +
> [00](../00-method-and-sources.md)–[07](../07-flaws-risks-and-open-questions.md)); the binding strategy
> is [04-target-architecture.md](../04-target-architecture.md) and the recommendation/options in
> [07-flaws-risks-and-open-questions.md](../07-flaws-risks-and-open-questions.md). Approved by the
> operator **2026-06-21** ("Option 2 — additive hybrid").
> **Last updated 2026-06-21.** This is a **planning** doc — every step here is **doc authoring only**
> (Claude-buildable, offline, zero tenant/Box contact); none of it activates anything. The *build*
> artifacts (connector def, Function, flow rewrite) and the *operator* activations are owned by the
> other five section plans + [gated.md](../../docs/gated.md).

## Overview

The pivot is an **additive, env-var-gated** enhancement that re-centres intake on Box as the
early-contact + archival layer while **Dataverse stays the system of record** (Box Metadata has no
joins; it cannot run dedup/status/Case-sequencing). This plan books the documentation work into the
repo's existing precedence ladder (**binding review > ADR > architecture/requirements > plans**): one
new **ADR-0012** as the binding decision record; one new **`docs/plans/phase-3-box-integration/`** phase
folder (README checklist + connector/Function spec + activation runbook); **§Box** expansions in
`integrations.md`, `data-model.md`, `live-environment.md`; reconciliation of the **existing
`box-archival-pipeline.md`** (built against the *first-party* connector, which cannot do the pivot's
verbs) **down** to the new custom-REST-connector reality; alignment of `CLAUDE.md`, `README.md`,
`ROADMAP.md`, `CURRENT_STATUS.md`, `milestone-model.md`, the plans index, and the `flows/` registry;
and **operator-blocker rows** in `gated.md`. The load-bearing correction the new docs must carry — and
the existing flow comment understates — is that **a custom connector CANNOT mint the Box CCG/JWT
service token** (Power Platform custom connectors support *only* the OAuth2 authorization-code flow —
Microsoft Learn, verbatim), so the **service token is minted inside the Azure Function** exactly like
the EVA-Sentry pattern; the custom connector either calls the Function or carries a function-key/Key
Vault-fronted bearer. The webhook is **best-effort** and the **File-Request→`FILE.UPLOADED`** firing is
**undocumented — live-test it**.

## Current state (what exists today, with paths)

**Decision record — none.** The Box-centric decision lives only in the dossier
(`box-integration-pivot/`), **not** as a binding ADR. Highest existing ADR =
[`docs/adr/0011-work-provider-intermediary-garage-roles.md`](../../docs/adr/0011-work-provider-intermediary-garage-roles.md);
**next free number = `0012`**.

**Phase plans — no Box phase folder.** `docs/plans/` holds `phase-0`…`phase-6` + `milestone-model.md`
+ `m2-umbrella-enrichment-to-scale.md`. Box exists only as **Phase 3d (M2.D)** =
[`docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md`](../../docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md),
which is **built against the FIRST-PARTY Box connector** (verified on `learn.microsoft.com/connectors/box`
2026-06-20) — it correctly notes there is *no first-party `CreateFolder`* and folds the **S2** content
fix, but it does **not** know about the **custom REST connector**, **CCG/JWT service identity**,
**webhook receiver**, **File Request**, or **metadata**. That doc's §3 ("the real Box connector
contract") is now **partially superseded** and must be reconciled **down** to ADR-0012 + the new
architecture docs.

**Existing flow** —
[`flows/definitions/finalize-eva-box.definition.json`](../../flows/definitions/finalize-eva-box.definition.json)
uses `shared_box` (connection ref `cr1bd_box`) with the **first-party** ops: photo loop = Azure-Blob
`GetFileContentByPath_V2` → Box `CreateFile`(`folderPath`/`name`/binary `body`); the UPPERCASE folder is
created *implicitly* by the `folderPath` (the fictional `CreateFolder` was already removed). It is the
**EVA-time finalisation**, not the at-intake folder/File-Request work the pivot adds.

**Architecture docs — thin or silent on Box.**
- [`docs/architecture/integrations.md`](../../docs/architecture/integrations.md) **§Box archival**
  (lines ~81–86) = one paragraph: "in unison with EVA submit", UPPERCASE folder, "Box connector via
  Power Automate". **No** custom connector, CCG/JWT, webhook, HMAC, or env-var gates. Its **env-var
  table** (lines ~88–99) lists EVA/PDF/ENRICHMENT/MAPS/VALUATION/COPILOT — **no `BOX_*`**.
- [`docs/architecture/data-model.md`](../../docs/architecture/data-model.md) — **no Box section**; does
  not state Box-is-a-mirror / Dataverse-authoritative / one-way write.
- [`docs/architecture/live-environment.md`](../../docs/architecture/live-environment.md) — `cr1bd_box`
  appears in the **connection-references** table as `shared_box`, *(none)*, "Unbound (later phase)"; the
  `CS Finalize EVA + Box` flow is listed OFF. **No "Box resources" row** for a custom connector / webhook
  Function / Box Platform app.

**Top-level docs.**
- [`CLAUDE.md`](../../CLAUDE.md) — **Integration & gating** lists `EVA_API_ENABLED`, `PDF_MAPPER_ENABLED`,
  `ENRICHMENT_ENABLED`, `AZURE_MAPS_ENABLED`, `COPILOT_ENABLED` — **no `BOX_*`**; **Agent roster** does
  not name a Box-coordination owner (the natural owner is **eva-sentry-integration**, which already owns
  "drag-drop export, and Box").
- [`README.md`](../../README.md) — line 5 pipeline mentions "**EVA + Box**"; the **start-here** links do
  not reference the pivot dossier.
- [`ROADMAP.md`](../../ROADMAP.md) — Phase 3d "Box archival" present; Phase 2 "Live Activation" does not
  mention the **provisional-folder-then-rename vs mint-at-parse-confirm** timing; no `BOX_*` gates.
- [`CURRENT_STATUS.md`](../../CURRENT_STATUS.md) — newest update 2026-06-21 (enrichment ON + job-sheet
  rules); **no Box-integration-pivot section**.
- [`docs/plans/milestone-model.md`](../../docs/plans/milestone-model.md) — 3d Box = **M2.D**; **no Box
  pivot / B1–B4 rows**.
- [`docs/plans/README.md`](../../docs/plans/README.md) — index has no `phase-3-box-integration/` entry.
- [`flows/README.md`](../../flows/README.md) — `finalize-eva-box` row binds `shared_box`; assumes the
  **first-party** connector; no note that flows are validated against a **custom** Box connector.

**gated.md shape.** [`docs/gated.md`](../../docs/gated.md) is the operator-facing **plain-English**
list (items 1–7; item 5 = "Switch on Box filing… supply the key"). ROADMAP/CURRENT_STATUS use a parallel
**`H#`/`S#`/`B#`** coding (e.g. B5 = "EVA creds + Box casing"). New Box rows must be authored in the
**plain-English** voice gated.md actually uses, while keeping the `B#`-style anchors the other docs cite.

**Verified-contract facts the new docs must encode** (sources in the Verification log):
1. **Custom connectors can't do CCG.** *"Currently, client credentials grant type is not supported by
   custom connectors"* and *"APIHub only supports the authorization code method of OAuth 2.0
   configuration."* → the **service token is minted in the Azure Function**, not the connector. The
   dossier's [04](../04-target-architecture.md) ASCII ("Custom Box REST connector (CCG/JWT)") is a
   **simplification**; ADR-0012 + the connector spec must state the token lives Function-side.
2. **Code App CSP.** Code-apps default `connect-src 'none'`, `frame-src 'self'`, `form-action 'none'`;
   `frame-src` is **admin-editable** via PPAC (Privacy + Security → **App** tab) or the
   `PowerApps_CSPConfigCodeApps` REST setting; custom values **merge** with the default. → B4 embed needs
   an operator `frame-src` edit; UI Elements stay blocked.
3. **File Request copy-only.** *"Currently, the API only allows the creation of new file requests by
   copying an existing file request associated to another folder."* `POST /file_requests/{id}/copy`
   (`folder` required; `status`/`title`/`description`/`expires_at`/`is_email_required` settable; the
   capture form + reg field are **baked into the template**).
4. **Webhook.** `BOX-SIGNATURE-PRIMARY`/`SECONDARY` + **HMAC-SHA256**; reject `BOX-DELIVERY-TIMESTAMP`
   **older than 10 minutes**; **retries up to 10×** on delivery failure (at-least-once, droppable);
   webhooks are **set on specific files/folders, cannot be set at root**; `FILE.UPLOADED` also fires on
   **moves**; the File-Request→`FILE.UPLOADED` link is **undocumented — live-test**.
5. **Plan floor = Business Plus** (Metadata is the gate; Metadata events/actions are higher-tier in Box
   Automate). **Dataverse env-var feature flags** carry definition+value with a default-value fallback;
   a changed value can take **up to ~1 hour** to publish to flows.

## Changes — ordered build steps

Owner tag: **[Claude-buildable]** = authored offline, no tenant/Box contact (all of this section is).
"depends-on" names the doc that must exist/lead first (precedence). The **hard ordering spine** is:
**ADR-0012 first → architecture §Box → phase plans cite them → top-level docs link → gated.md →
reconcile the old plan + flow registry last.**

1. **Create `docs/adr/0012-box-centric-intake-additive-hybrid.md`** (the binding decision record; ADR
   format per 0011 — Context / Decision / Consequences, terse). **[Claude-buildable]** · depends-on:
   *nothing (leads the section)*. Content: adopt **Box as content + intake + archival** while
   **Dataverse stays authoritative** (one-way Dataverse→Box; never run case logic off Box). Record the
   **verified constraints** as decision pillars: (a) **custom Power Platform connector over Box REST is
   mandatory** — the first-party connector is file-only (no folder-create/shared-links/webhooks/File
   Requests/metadata); (b) the **CCG/JWT service token is minted inside the Azure Function**, NOT the
   connector (custom connectors are authorization-code-only — cite Learn); (c) **File Request =
   copy-from-template only** (`POST /file_requests/{id}/copy`; reg baked into the template); (d)
   **metadata gate ⇒ Box Business Plus** floor; (e) **webhook best-effort** + the File-Request firing is
   **live-test-gated**; (f) **Code App embed is iframe-only** behind an operator `frame-src` edit. State
   the **env-var gates** (`BOX_API_ENABLED` unlock + `BOX_FOLDER_AT_INTAKE_ENABLED` /
   `BOX_FILEREQUEST_ENABLED` / `BOX_EMBED_ENABLED`; defer `BOX_METADATA_ENABLED`/`BOX_AI_ENABLED`).
   **Supersession note:** ADR-0012 outranks `box-archival-pipeline.md` where they disagree; the latter is
   reconciled down (step 9). Link the dossier for full rationale + the options matrix. **Status: Accepted
   2026-06-21.** Verify: ADR-0010/0011 format; dossier 04/07; Learn custom-connector OAuth.

2. **Expand `docs/architecture/integrations.md` §Box** (rename the thin "Box archival" to **"Box
   integration (custom REST connector + webhook)"**). **[Claude-buildable]** · depends-on: **step 1**.
   Add: the **custom Box REST connector** (auth = **service identity via CCG/JWT minted in the Function**,
   not the connector; secret on the connection / Key Vault, **never** in the bundle — the parser
   `api_key` precedent); the **webhook receiver** requirements (**HMAC-SHA256** over the payload with the
   primary/secondary keys, **reject timestamp >10 min**, function-key second gate, respond **2xx
   promptly** — *confirm the exact response-time ceiling against Box webhook docs at build time*; do
   dedup + a **reconciliation sweep** because delivery is at-least-once/droppable and fires on moves);
   the **File Request copy-from-template** mechanism; the **four `BOX_*` env-var gates** added to the
   env-var table; and a cross-reference to **ADR-0012** + the new phase plans. Keep the existing CSP
   callout; add that **Box embedding is iframe-only** behind a `frame-src` edit. Verify: dossier 04 §unlock
   + §gates; Box file-requests / webhooks-v2-signatures; Learn CSP code-apps.

3. **Add a "Box integration" section to `docs/architecture/data-model.md`** (the canonical home of the
   **Dataverse-authoritative / Box-is-a-mirror** rule, to avoid duplication). **[Claude-buildable]** ·
   depends-on: **step 1**. State: **Box Metadata has no joins**; Box **cannot** run dedup / status /
   Case-sequencing; **Dataverse is the system of record**; data flows **one-way Dataverse→Box** (the
   webhook Function may write *Evidence* rows from an upload, but case **logic** is never queried off
   Box); the Box folder is a **content + human-navigable mirror**, and mirrors drift → mitigate with
   one-way authority + the reconciliation sweep. `integrations.md` and the phase plans **reference** this
   section rather than restating it. Verify: dossier 07 flaw #4 + risks row "Box/Dataverse drift".

4. **Add a "Box resources (custom connector + webhook Function)" row/table to
   `docs/architecture/live-environment.md`.** **[Claude-buildable]** · depends-on: **step 1** (content
   skeleton now; **real IDs filled at deploy time** by the other sections — this is a planning
   placeholder, flagged as such). List: the **custom Box REST connector** (NOT `shared_box`
   first-party — note both, and that `cr1bd_box`'s *binding* moves to the custom connector), the
   **webhook Azure Function** (name TBD at deploy), the **Box Platform app** (operator-supplied; ID
   redacted), connection reference **`cr1bd_box`**, and the **`BOX_*` env-var gates** (all default
   `false`). Add a one-line note that the **first-party `shared_box`** is insufficient for the pivot.
   Verify: live-environment.md conventions; dossier 04 boundary.

5. **Create the phase folder `docs/plans/phase-3-box-integration/` with `README.md`** (the **ordered B1–B4
   build checklist**; "Milestones in this phase" banner; back-link to milestone-model). **[Claude-buildable]**
   · depends-on: **steps 1–3**. Sequencing decision (Open Q1) recorded as **Phase 3-Box, Milestone
   **M2.E** (after core M1 intake is live; sibling to M2.D Box archival)** — *pending operator
   confirmation* (alternatives: Phase 2.5 / a "B"-milestone). Per-milestone rows with state
   (`pending`/`built`/`gated-OFF`), owner touchpoints, and cross-refs:
   - **B0 (unlock)** — custom Box REST connector + webhook Function; gate `BOX_API_ENABLED`. → step 6 spec.
   - **B1** — folder + archival at case-creation (`POST /2.0/folders` UPPERCASE Case/PO via the custom
     connector; copy `.eml`+instruction PDF+images into Box from day one; bring `finalize-eva-box`
     forward to **augment**, not create); gate `BOX_FOLDER_AT_INTAKE_ENABLED`. Note the
     **provisional-folder-then-rename vs mint-at-parse-confirm** choice (Open Q3; dossier recommends
     mint-at-parse-confirm) and **one UPPERCASE folder per case** (case-insensitive; lowercase sibling
     409s).
   - **B2** — File Request image chaser (hand-build **one** template once; per-case `POST
     /file_requests/{templateId}/copy`; upload → webhook → Function → Evidence + status re-evaluate);
     gate `BOX_FILEREQUEST_ENABLED`; **soft blocker = live-test the `FILE.UPLOADED` firing**.
   - **B3** — permanent File Request drop-boxes for image-only senders (reg captured as **metadata**;
     reg-merge ADR-0010; unmatched → **Held**); same gate.
   - **B4 (optional)** — Code App **Box Embed** iframe behind an operator **`frame-src`** edit + a
     server-minted shared link; gate `BOX_EMBED_ENABLED`. Note the "Open in Box" deep-link lower-touch
     alternative (Open Q5).
   - **Phase C (deferred placeholder)** — Metadata-Query / Box AI / Doc Gen / Governance, each separately
     + tier-gated; **out of M1/M2 scope** (Open Q7).
   Verify: dossier 04 phases B1–C + env-var table; ADR-0012.

6. **Create `docs/plans/phase-3-box-integration/box-custom-connector-and-webhook.md`** (the **BUILD-artifact
   spec** the other sections implement). **[Claude-buildable]** · depends-on: **steps 1, 2, 5**. Two
   halves: **(A) the custom Power Platform Box REST connector** — operations needed (`POST /2.0/folders`,
   `POST /2.0/file_requests/{id}/copy`, `PUT` shared link, `GET`/`ListFolder` for the reconciliation
   sweep, `POST /2.0/webhooks` to subscribe), the **auth posture** (the connector holds a function-key /
   KV-fronted bearer; the **CCG/JWT exchange runs in the Function** because custom connectors are
   authorization-code-only — the same constraint that put EVA's token in `functions/evasentry`),
   throttle/backoff (Box rate limits + the 100-call/conn/60s connector window), error handling, and the
   **api_key-param-first connection idiom** (memory `codeapp-apikey-connector-connection`). **(B) the
   webhook-receiver Azure Function** — HTTP trigger on the FC-style estate; **signature verification**
   (HMAC-SHA256 with primary+secondary, 10-min replay reject), function-key gate, **2xx-then-work**,
   **dedup** (at-least-once) + **disambiguate uploads from moves**, the **Dataverse write** (Evidence row
   + status re-evaluate, one-way), and the **reconciliation sweep** fallback for missed events. State the
   **boundary**: the def + Function are Claude-built; the **Box Platform app, secret, and Admin
   authorization are operator-only** (no Box credential held by Claude). This file is the **source of
   truth for the `finalize-eva-box` rewrite** (step 10). Verify: Box folders/file-requests/webhooks-v2
   APIs; Learn custom-connector OAuth + Azure Functions HTTP trigger.

7. **Create `docs/plans/phase-3-box-integration/box-integration-activation.md`** (the **operator runbook**).
   **[Claude-buildable]** (authoring) · depends-on: **steps 5, 6**. Ordered B0→B4 activation with the
   **gate legend** reused from `box-archival-pipeline.md` (`[BUILD]` / `[DEPLOY-WITH-LOGIN]` /
   `[RESERVED-FOR-USER] 🔒`). **Hard operator-only gates:** create the **Box Platform app (Server Auth)**
   + **Admin-Console authorization**, supply the **`client_secret`**, do the interactive Box sign-in for
   the first-party connection (if still used for byte writes), make the **`frame-src` CSP edit** (B4).
   **Soft gate:** **live-test that a File-Request upload fires `FILE.UPLOADED`** (with the timed
   `ListFolder`/Metadata-Query poll fallback). Each step pairs to a `gated.md` row (step 8). Verify:
   dossier 04 boundary + B2 live-test note; Learn CSP frame-src edit; memory `live-services-boundary`.

8. **Add Box operator-blocker rows to `docs/gated.md`** (plain-English voice; `B#`-style anchors the
   other docs can cite). **[Claude-buildable]** · depends-on: **steps 5, 7**. Rows (map each to its
   phase-gate):
   - **Create the Box Platform app + authorize it in the Admin Console** (the unlock — B0; supplies the
     service identity + `client_secret`; *only you can register/authorize a Box app*).
   - **Confirm the Box plan is Business Plus** (metadata is the gate for the reg-capture form).
   - **Live-test the File Request webhook** (drag a file into a File-Request upload link → confirm a Case
     advances; *only you can do the live drag + watch* — B2 soft gate).
   - **Make the `frame-src` CSP edit for the in-app Box embed** (B4 optional; PPAC → Privacy + Security →
     App tab; *admin-only*).
   Keep the existing item-5 "Switch on Box filing / supply the key" but **point it at** the new rows +
   ADR-0012 (it predates the pivot). Verify: gated.md existing voice; Learn CSP admin-center; dossier 04
   boundary.

9. **Reconcile `docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md` DOWN** (precedence:
   ADR-0012 + architecture win; this stays the **M2.D finalization detail**, NOT a Box-contract source of
   truth). **[Claude-buildable]** · depends-on: **steps 1, 2, 6**. Edits: in **§3 "the real Box connector
   contract"**, add a banner that the **first-party connector is insufficient for the pivot** and the
   **custom REST connector is mandatory** — cross-reference `box-custom-connector-and-webhook.md` +
   **ADR-0012**; clarify the **two coexisting paths** (B1+ at-intake folder/File-Request via the **custom**
   connector; the EVA-time byte archive may still use the first-party `CreateFile` for binary uploads, or
   move to the custom connector — call this out as the boundary between 3d/M2.D and Phase-3-Box). Keep the
   **S2 content-bind** + photo-order detail intact (still correct). Add a one-line "Milestones" note: 3d
   = **M2.D**, the broader pivot = **Phase-3-Box / M2.E**. Verify: precedence (`CLAUDE.md` ladder +
   milestone-model §6); ADR-0012.

10. **Update the `flows/` registry for the custom connector** —
    [`flows/README.md`](../../flows/README.md) + the `finalize-eva-box` **row/notes** (and stamp the
    **definition rewrite as owned by step 6's spec**, executed by the Flows section, not here).
    **[Claude-buildable]** (doc/notes only) · depends-on: **steps 6, 9**. In `flows/README.md`: note that
    Box flows are **validated against the custom-connector contract**, not the first-party connector, and
    that at-intake folder/File-Request actions use **`POST /2.0/folders`** / **`POST
    /file_requests/{id}/copy`** via the custom `cr1bd_box`. Flag the **drift**: the *definition rewrite*
    of `finalize-eva-box.definition.json` to the custom connector is a **build step owned by the Flows
    section plan** (sourced from step 6) — this docs plan only records the requirement so a reader isn't
    misled by the current first-party comment. Verify: flows/README conventions; step 6 spec.

11. **Align the top-level docs** (small, surgical edits; do these once steps 1–9 exist so the links
    resolve). **[Claude-buildable]** · depends-on: **steps 1, 5, 8**.
    - **`CLAUDE.md`** — Integration & gating: add the four **`BOX_*`** gates + a one-liner that **all Box
      automation runs through a custom Box REST connector with a service identity**, the **CCG/JWT token
      lives in the Function**, and **Claude never holds a Box credential**. Agent roster: name
      **eva-sentry-integration** as the **Box-coordination owner** (it already owns "drag-drop export, and
      Box"); cross-link ADR-0012.
    - **`README.md`** — keep "EVA + Box" in line 5 but note Box is **earlier + deeper** (folder at intake);
      add a start-here link to **`box-integration-pivot/`** (and ADR-0012).
    - **`ROADMAP.md`** — Phase 2: add the **provisional-folder-then-rename vs mint-at-parse-confirm**
      timing note (Open Q3); add a **Phase-3-Box (B1–B4)** block referencing the new plans + the `BOX_*`
      gates; mark 3d Box as **M2.D** and the pivot as **M2.E** (per milestone-model).
    - **`CURRENT_STATUS.md`** — add a dated **"Box-integration pivot (approved 2026-06-21)"** section:
      Option 2 hybrid; B0–B4 phases; the four gates (all default `false`); the boundary (Claude builds
      connector/Function/flows/gates/docs offline; operator owns the Box Platform app + service account +
      `frame-src` edit + live-tests). **No live Box change** is claimed.
    - **`docs/plans/README.md`** — add the `phase-3-box-integration/` entry (3 plans, one-line each) +
      ROADMAP-coverage row; cross-link milestone-model + the dossier.
    - **`docs/plans/milestone-model.md`** — add the **Phase-3-Box → M2.E** rows (B0–B4) to the canonical
      table + a one-line "Box pivot" note in §2; keep CURRENT_STATUS/ROADMAP pointing here (don't embed a
      rigid table there). Verify: each file's existing structure; ADR-0012; dossier 04.

12. **(Optional housekeeping) Add a one-line MEMORY.md pointer** "Box-integration-pivot" → the dossier +
    ADR-0012 (custom connector mandatory · CCG token in Function not connector · webhook best-effort +
    live-test · File-Request copy-only · Business Plus floor · Dataverse-authoritative). **[Claude-buildable]**
    · depends-on: **step 1**. *Open Q (operator):* whether the ADR+docs suffice or a 13th memory note is
    wanted (Open Q10).

## Cross-section dependencies

**This (Docs) section provides TO the other five:**
- **ADR-0012** is the **binding decision** every other section cites; it must land **before** the
  Connector/Function, Flows, Schema, Code-App, and Activation sections write text that asserts the Box
  contract (they reconcile to it, never contradict it).
- **`box-custom-connector-and-webhook.md`** (step 6) is the **single source of truth** for the Box REST
  operations, the **token-in-Function** auth, and the webhook contract → the **Connector/Function
  section** implements it; the **Flows section** rewrites `finalize-eva-box.definition.json` from it.
- **`integrations.md §Box` + `data-model.md` Box section** define the **gates** and the
  **Dataverse-authoritative / one-way** rule the **Schema section** (`BOX_*` env-var definitions) and the
  **Flows section** must honour.
- **`gated.md` Box rows + the activation runbook** are the **operator view** the **Activation section**
  drives.

**This section NEEDS FROM the others (consumes at *their* build/deploy time, not here):**
- From **Connector/Function + Flows + Schema**: the **real resource IDs** (custom connector apiId, webhook
  Function name, `BOX_*` env-var schema names) to fill the **`live-environment.md` placeholder** (step 4)
  and the connector spec's binding notes — these are **deploy-time backfills**, flagged as placeholders
  now.
- From **Activation**: confirmation of the **operator decisions** (folder timing Q3, embed-vs-deeplink Q5,
  per-sender vs shared drop-box Q6) to finalise the phase-README wording.
- From the **operator**: the **phase/milestone number** (Open Q1) and **ADR-split** (Open Q2) before the
  phase folder name and ADR scope are frozen.

**Numbering/anchor coordination:** ROADMAP + `docs/plans/README.md` + `milestone-model.md` must agree on
**Phase-3-Box / M2.E** (or whatever the operator picks); `gated.md` `B#` anchors must match the
phase-README checklist IDs and the `CLAUDE.md`/AGENTS boundary statement — all describe the **same**
operator gates (Box Platform app · `frame-src` edit · live-tests).

## Risks & open questions

**Risks (doc-integrity):**
- **Precedence regression** — if `box-archival-pipeline.md` is left asserting the first-party contract as
  truth, it will contradict ADR-0012. *Mitigation:* step 9 reconciles it **down** to a detail reference
  with an explicit supersession banner.
- **Token-auth mis-statement propagating** — the dossier's [04](../04-target-architecture.md) ASCII
  labels the connector "CCG/JWT", which a reader may take to mean the **connector** mints the token. The
  verified fact is the opposite (custom connectors are auth-code-only). *Mitigation:* ADR-0012 + step 6
  state plainly that the **token is minted in the Function**; every Box-auth mention is reconciled to
  that.
- **Stale `live-environment.md`** — adding a Box row at *planning* time with TBD IDs risks reading as
  "deployed". *Mitigation:* the row is explicitly a **planning placeholder, IDs filled at deploy**.
- **Gate-publish latency** — env-var changes take **up to ~1 hour** to reach flows; the activation runbook
  must warn the operator not to expect an instant flip. *Mitigation:* note it in step 7.
- **Webhook 2xx-time-ceiling unverified** — the exact response-time limit (the dossier says 30s) was **not
  confirmed** on the Box signatures page I reached. *Mitigation:* docs say "respond 2xx promptly —
  confirm the exact ceiling against Box webhook docs at build time"; the 10-min replay + HMAC + retries-up-to-10×
  + folder-scoping **are** confirmed.

**Open questions (operator decisions owed — carried from dossier 07 + this plan):**
1. **Phase/milestone number** for B1–B4 — Phase-3-Box / **M2.E** is the working assumption; Phase 2.5 or a
   distinct "B"-milestone are alternatives. *(Freezes the folder name + milestone rows.)*
2. **One ADR or many** — single `0012-box-centric-intake-additive-hybrid`, or split (e.g.
   0012-custom-connector + 0013-filerequest-chaser). *Recommendation: one ADR, sub-decisions inside.*
3. **Folder timing** — provisional-folder-then-rename vs mint-at-parse-confirm (dossier recommends the
   latter; affects B1 flow logic + the ROADMAP note).
4. **File Request template count** — one generic template, or one per form shape / per provider.
5. **Embed vs deep-link** — build+gate B4 (`frame-src` CSP edit) or prefer "Open in Box" deep-links.
6. **Per-sender vs shared drop-box** for B3 image-only senders.
7. **Phase C placement** — mention Metadata-Query/Box AI/Doc Gen/Governance as deferred placeholders, or
   keep entirely out of M1/M2 docs. *(Step 5 keeps a one-line deferred placeholder.)*
8. **Reconcile vs archive** the old `box-archival-pipeline.md` — *rewrite-down* (step 9) is the
   precedence-correct choice; confirm it isn't instead marked "superseded/archived".
9. **`finalize-eva-box` rewrite ownership** — recorded here as a **Flows-section** build step sourced from
   the step-6 spec; confirm that split.
10. **Memory note** — add a "Box-integration-pivot" MEMORY.md item (step 12) or rely on ADR+docs?
11. **Data residency** (dossier flaw #8) — if in-UK claimant-PII processing is mandated, Box Zones
    (Enterprise + seats) changes the tier; the ADR should note residency as **unresolved**, not assume
    Business Plus suffices for PII. *(Surface in ADR-0012 Consequences.)*

## Verification log (sources checked)

**Microsoft Learn (Power Platform / Dataverse / Code Apps) — via microsoft_docs_search/fetch:**
- **Custom connectors CANNOT use client-credentials grant** (decisive for the token-in-Function rule):
  - `https://learn.microsoft.com/connectors/custom-connectors/connection-parameters` — verbatim *"Currently,
    client credentials grant type is not supported by custom connectors."*
  - `https://learn.microsoft.com/connectors/custom-connectors/troubleshoot-oauth2` — *"APIHub only supports
    the authorization code method of OAuth 2.0 configuration."*
  - `https://learn.microsoft.com/troubleshoot/power-platform/power-automate/connections/verify-oauth-configuration`
    — *"Custom connectors use the authorization code flow. The implicit and client credentials flows don't
    issue refresh tokens."* (Mirrors the EVA-Sentry token-in-Function precedent in milestone-model §3.)
- **Code Apps CSP** — defaults + how to edit `frame-src`:
  - `https://learn.microsoft.com/power-apps/developer/code-apps/how-to/content-security-policy` — default
    table (`connect-src 'none'`, `frame-src 'self'`, `form-action 'none'`); `PowerApps_CSPConfigCodeApps`
    REST setting + PPAC **Privacy + Security → App** tab; custom values **merge** with defaults.
  - `https://learn.microsoft.com/power-apps/developer/code-apps/how-to/embed-iframe` — embedding a code app
    in an iframe + the `frame-ancestors` edit (confirms iframe-only embedding posture).
- **Dataverse environment variables** — definition+value split, default-value fallback, **~1-hour** async
  publish to flows:
  - `https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables`
  - `https://learn.microsoft.com/power-apps/maker/data-platform/environment-variables-faq`
- **First-party Box connector is Microsoft-published / Standard** (no Premium badge), and SharePoint —
  *not* Box — has "Create new folder"/"Create sharing link" actions (confirms the first-party Box gap):
  - `https://learn.microsoft.com/connectors/connector-reference/` (Box "By: Microsoft", no Premium badge)
  - `https://learn.microsoft.com/sharepoint/dev/business-apps/power-automate/sharepoint-connector-actions-triggers`
    (the folder/sharing actions the **Box** first-party connector lacks — already verified in
    `box-archival-pipeline.md` §3 against `learn.microsoft.com/connectors/box`)

**Box developer/support docs — live (WebFetch) + local mirror
(`automationsresearch/box/markdown/`):**
- **File Request copy-only** — `https://developer.box.com/guides/file-requests/` — verbatim *"Currently,
  the API only allows the creation of new file requests by copying an existing file request associated to
  another folder."*; metadata form fields set required/optional (baked into the template). Endpoint:
  `https://developer.box.com/reference/post-file-requests-id-copy/` — `POST /file_requests/{id}/copy`,
  `folder` required; `status`/`title`/`description`/`expires_at`/`is_email_required` settable. Local:
  `123-managing-file-requests.md`, `315-about-box-file-request.md`, `317-using-file-request-to-get-content-from-anyone.md`.
- **Webhook signatures + replay** — `https://developer.box.com/guides/webhooks/v2/signatures-v2/` —
  `BOX-SIGNATURE-PRIMARY`/`BOX-SIGNATURE-SECONDARY`, **HMAC-SHA256**, *"Check if the timestamp in the
  `BOX-DELIVERY-TIMESTAMP` header … is not older than ten minutes."*
- **Webhook reliability/scope** — `https://developer.box.com/guides/webhooks/` — V2 webhooks *"Retries up
  to 10 times after notification delivery failure"*, *"Set on specific files/folders, but cannot set at
  the root."* (at-least-once/droppable + folder-scoping confirmed). **NOT confirmed on the pages reached:**
  the exact **2xx-within-30s** ceiling and the explicit "no latency SLA" wording — treated as **best-effort
  guidance to re-confirm at build time** (the dossier's [01](../01-box-capabilities-verified.md) carries
  the deeper webhook research, which the task framing treats as settled).
- **Metadata plan gate (Business Plus floor)** — `217-box-automate-features-in-business-plans.md` —
  *"Metadata events and actions"* are Enterprise+ in Box Automate (consistent with the dossier's verified
  claim #4 that **Metadata gates the plan at Business Plus**); `183-box-ai-features-in-business-plans.md`,
  `357-using-metadata.md`, `046-enabling-folder-level-metadata-and-cascade.md` for the metadata model.
- **Embedding / Zones (residency)** — local `035-complying-with-international-data-privacy-rules-multizones.md`,
  `049-about-box-zones.md` (the Enterprise+seats residency tier — dossier flaw #8 / Open Q11).

**Repo sources reconciled (precedence-checked):** `CLAUDE.md` (precedence ladder + roster), the dossier
[README](../README.md)/[04](../04-target-architecture.md)/[07](../07-flaws-risks-and-open-questions.md),
`docs/adr/0010`+`0011` (ADR format), `docs/plans/milestone-model.md` (§3 token-in-Function, §6 precedence),
`docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md` (first-party contract to reconcile down),
`flows/definitions/finalize-eva-box.definition.json`, `docs/gated.md` (operator voice), and the memory
items `live-services-boundary` / `codeapp-csp-use-connectors` / `codeapp-apikey-connector-connection` /
`flow-webhook-trigger-provisioning`.
