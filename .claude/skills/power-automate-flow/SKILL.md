---
name: power-automate-flow
description: Power Automate cloud-flow authoring patterns for the collisionspike intake pipeline — copy-pasteable Logic Apps "definition" JSON (triggers/actions, @-expressions, runAfter, Apply_to_each, Condition, Scope, Switch) for the shared-mailbox intake trigger, attachment classify+persist loop, the ADR-0010 dedup ladder, the status-machine guard order, Dataverse env-var feature gates, the EVA+Box atomic submit, draft-only chasers, and DLP/ALM packaging. Use when building, editing, reviewing, or verifying any Power Automate flow for this spike (intake, dedup, status, parser/enrichment calls, finalization, chasers) or when you need the exact flow-definition shape, an @-expression, or the connection-reference/env-var idiom. Pairs with the power-automate-flow-builder agent and Phase-1 plan §5.
---

# Power Automate cloud-flow authoring (collisionspike)

Authoring patterns for the M1 intake pipeline: **email in a shared inbox → parse + classify → dedup +
case-resolve → status → enrich → EVA + Box finalize → chase**. Every pattern is a real, copy-pasteable
Power Automate / Logic Apps **`definition`** fragment (`triggers`/`actions`, `@`-expressions, `runAfter`,
`Foreach`, `If`, `Switch`, `Scope`). Ground truth is the Phase-1 plan
`plans/phase-1-intake-and-case-tracking-implementation.md` §5 (and §7's skill spec) and
`docs/architecture/integrations.md`.

## When to reach for this

- Authoring or editing any flow in §5.1–5.10: intake, classify/persist, case-resolve/dedup, status,
  parser call, enrichment call, EVA+Box finalization, chasers, job-sheet import.
- You need the **exact definition shape** of a trigger/action, a working `@`-expression, `runAfter`
  wiring, or a `Foreach`/`If`/`Switch`/`Scope` skeleton.
- You need the project idioms: **connection references**, **Dataverse environment-variable gates**, the
  **ADR-0010 dedup ladder**, the **status guard order**, **draft-only chasers**, or **solution packaging
  with flows shipped OFF**.
- Reviewing a flow for boundary/DLP compliance before handoff.

This skill is **[BUILD] only**: author definitions and verify them offline (well-formedness, schema lint,
fixture decision-tables, solution/flow checker static run). **Never** activate a flow, point a trigger at
a live Collision Engineers mailbox, or run anything against live SharePoint/Box/EVA — those are
`[RESERVED-FOR-USER]`. `collisioncc` is reference-only: re-implement its `graph-intake`/`case-status`/
`image-rules` semantics in-flow, never call it.

## Pattern index

| # | Pattern | Read | Plan ref |
|---|---|---|---|
| 1 | Shared-mailbox intake trigger (V2, attachments+content, concurrency=1, Message-ID dedup guard) | `references/01-shared-mailbox-trigger.md` | §5.1 |
| 2 | Attachment Apply-to-each: classify by ext/MIME, SHA256, write bytes to Blob/file column, one Evidence row each | `references/02-attachment-loop.md` | §5.2 |
| 3 | ADR-0010 dedup ladder: drop / attach / new+risk / propose-attach — never VRM+time, never cross-provider | `references/03-dedup-branch.md` | §5.3 |
| 4 | Status-machine guard order: terminal → missing_required_fields → missing_images → needs_review → ready_for_eva | `references/04-status-guard-order.md` | §5.4 |
| 5 | Dataverse env-var feature gate: read current value → Condition → branch (flows READ, never DEFINE) | `references/05-env-var-gate.md` | §5.5/5.6 |
| 6 | EVA + Box atomic submit: UPPERCASE Box vs lowercase EVA, 2-previews-then-all order, idempotent by payload hash, gated by EVA_API_ENABLED | `references/06-eva-box-submit.md` | §5.10 |
| 7 | WhatsApp draft-only chaser (ADR-0003): compose + log `drafted`, never auto-send | `references/07-chaser-draft-only.md` | §5.10 / integrations.md |
| 8 | DLP + ALM: connection references, env-var definitions, no premium surprises, flows ship OFF | `references/08-dlp-alm-packaging.md` | §6 / §8.5 |

## House conventions every fragment follows

These hold across all eight patterns — apply them when adapting a fragment.

- **Connection references, not connections.** `host.connectionName` is a logical
  reference (`shared_office365`, `shared_box`, `shared_commondataserviceforapps`, custom
  `shared_ceparser` / `shared_evasentry`) packaged in the `CollisionSpike` solution. The user binds it to
  a real connection **at activation**. Claude never binds a live mailbox. (Pattern 8.)
- **Dataverse logical names are placeholders.** `cr123_*` table/column names and the `192350xxx`
  `statuscode` option values are stand-ins — reconcile them against the frozen `CollisionSpike` schema
  and the 11-value `CaseStatus` choice set (§5.4) before deploy. Keep terminal-status exclusions in OData
  `$filter`s in lockstep with the terminal set.
- **Gates are READ, never DEFINED.** A flow reads an environment variable's current value and branches
  (Pattern 5). M1 defaults — `PDF_MAPPER_ENABLED=true`, `ENRICHMENT_ENABLED=true`, `EVA_API_ENABLED=false`,
  `AZURE_MAPS_ENABLED=false` — are owned by the env-var manifest (dataverse-data-architect), not set in a
  flow.
- **Secrets are Key Vault references only.** No `EVA_CLIENT_SECRET` / gateway secret literal ever appears
  in a flow, definition, or committed config. Token exchange happens **inside** the custom connector /
  Function. (CLAUDE.md.)
- **Bytes go to storage, never inline in a Dataverse row.** Attachment/`.eml` bytes → Azure Blob or a
  Dataverse *file* column; rows carry only the `storagePath` reference. (Pattern 2; graph-intake
  invariant.)
- **Idempotency is explicit.** Trigger concurrency = 1 (Pattern 1) + get-or-create by Message-ID
  (Pattern 3) + finalize-once by payload hash (Pattern 6). Retries must never double-create or
  double-submit.
- **Initialize every variable at root, before first use.** A fragment that reads `@variables('x')`
  assumes an `InitializeVariable` for `x` ran earlier at the flow's **top level** — Power Automate
  forbids `InitializeVariable` inside a `Scope`/`Foreach`/`If`. Pattern 1 seeds
  `messageId`/`attachmentHashes`; patterns 2–6 also consume `payloadHash`, `candidateVrm`,
  `candidateRef`, `workProviderId` — declare those in one root `Init_*` block when stitching fragments,
  and use `SetVariable`/`AppendToArrayVariable` (never `InitializeVariable`) inside loops.
- **The 12 EVA fields are settled and the export is byte-identical to the Code App's.** Build the payload
  with the shared serializer (`eva-export.ts` / `eva-payload.schema.json`), never field-by-field in
  Power Fx. The 12 are work_provider, vehicle_model, claimant_name, claimant_telephone, claimant_email,
  date_of_loss, date_of_instruction, accident_circumstances, inspection_address, vat_status, mileage,
  mileage_unit. (Engineer allocation is NOT an EVA submission field — assigned inside EVA after submission;
  removed from the contract, B3 RESOLVED.) **`vrm` and `reference` are Case-identity fields, NOT EVA payload
  fields.** (Pattern 6; eva-sentry-api skill.)
- **Audit every decision.** Write an `AuditEvent` row (`actor`=flow name, `action` from the §4 vocabulary,
  `before`/`after`) at each branch outcome — drop, attach, create, status change, parser/enrichment call,
  finalize, chaser draft.
- **Mirror, don't call, `collisioncc`.** The dedup ladder, status guard order, and image-rules are
  re-implemented in-flow / behind a shared validation surface — never a runtime call to the reference
  build.

## Offline build-verification (the only run this skill performs)

Per §8.1/§8.5 — all static, no tenant contact:
1. Lint each exported `flows/*.definition.json`: well-formed; references only declared connection refs;
   trigger/action schema matches the connector swagger; all `@`-expressions compile (no unresolved
   dynamic-content tokens).
2. Drive the fixture decision-tables: dedup ladder (Pattern 3), classification map (Pattern 2), status
   transitions (Pattern 4) — assert the forbidden paths (VRM+time merge, cross-provider link, silent
   "Image Based Assessment") are unreachable.
3. Run the Power Platform solution/flow checker **statically** (no run) → no errors.
4. Assert every intake/categorize/SharePoint/Box/EVA-submit flow ships `state = off`; grep for
   secret-var names → only Key Vault references appear. (Pattern 8.)
