# intake-v2

Orchestration-layer wiring for the from-scratch email-intake engine, `@cs/intake-engine`
(`services/intake-engine`). This directory is **thin by design**: every file here is a
Durable Functions activity wrapper (plus a small exported "core" function for in-process
reuse/unit-testing) around one pure stage of the new engine. No classification, matching,
numbering, or Box-safety logic is implemented here — it all lives in
`@cs/intake-engine`, which has zero I/O and zero live SDK dependencies of its own (see
`services/intake-engine/README.md`).

## Files

- `identifyPrincipal.ts` — activity `identifyPrincipalV2`. Loads the registry
  (`loadRegistry()`) and runs Stage 1 (`identifyPrincipal`) against a sender address.
- `classifyEmailType.ts` — activity `classifyEmailTypeV2`. Runs Stage 2
  (`classifyEmailType`) against a resolved principal's registry entry + content text.
- `mintCaseNumber.ts` — activity `mintCaseNumberV2`. Wraps the pure
  `mintCaseNumber`/`formatCaseNumber` ALLOCATION CONTRACT. This activity does **not**
  talk to a database — it produces `{ sequenceScopeKey, prefix }` only. The live
  MAX+1/advisory-lock sequence allocation still belongs to the Data API
  (`services/data-api/src/features/cases/case-po.ts`'s `mintCasePo`), which is
  out of scope for this pass — see that activity's own doc comment for the exact seam
  a future PR would wire this into (and why it isn't wired in live today: the two
  systems use different prefix casing and a different per-marker-scoping rule — see
  `@cs/intake-engine`'s own README §4).
- `ensureArchiveFolder.ts` — activity `ensureArchiveFolderV2`. Adapts this app's
  existing Box facade client (`../../adapters/functions-client.js`'s `box.getFolder`/
  `box.createFolder`) to the `BoxFolderClient` shape `@cs/intake-engine`'s
  `ensureArchiveFolder` guard expects, then calls it. **This is the one true
  Box-folder-creation primitive for this rebuild** — every other Box-folder-creation
  call site in `services/orchestration/src` (the Case/PO archive folder, the EVA
  folder-augment step, the unmatched-images VRM folder) now routes through this
  activity's exported `ensureArchiveFolderV2Core` function rather than calling
  `box.createFolder` directly. See that guard's own doc comment
  (`services/intake-engine/src/adapters/box-scope-guard.ts`) for why the pinned-root
  assertion happens before any Box call.

## The engine is wired AUTHORITATIVELY (INTAKE_ENGINE_ENABLED)

`intakeEngineDecision.ts` puts `@cs/intake-engine` on the live intake path. Ships dark;
flipping `INTAKE_ENGINE_ENABLED` on is a live operator action, no deploy. Two decisions
move:

1. **Provider identification** (`providerMatch.ts`) matches on the sender recovered from a
   forwarded email's quoted header block, not the envelope `From`. This is the change that
   makes the alpha work at all: every alpha instruction is a staff forward, so the envelope
   `From` is a Collision Engineers address that correctly matches nothing
   (docs/operations/alpha-testing.md). The recovered address then goes through the
   **existing** `matchSenderIdentity` against the full live provider corpus — not the
   engine's two-entry registry — so no provider loses coverage.
2. **Case type** (`intakeOrchestrator.ts`) comes from the engine's email-type classifier,
   mapped onto `CaseWorkType`.

### Taxonomy mapping

| engine email type | `CaseWorkType` | `dual` | minted marker |
|---|---|---|---|
| `1a_standard` | `standard` | false | (none) |
| `1b_audit_repairable` | `audit` | false | `A.` |
| `1b_audit_total_loss` | `audit_total_loss` | false | `AP.` |
| `1c_inspection_and_audit` | `audit` | **true** | (none — dual keeps the standard number) |

The mapping deliberately stops at the TYPE. The engine's own Case/PO prefix strings
(`'a.'`/`'ap.'`, lower-case by its design note) are **never used** — `markerForMint` in
`packages/domain/src/domain/case-type.ts` remains the single owner of marker format, so the
canonical upper-case markers are produced exactly as before and the two casing conventions
never need reconciling.

The `1c` → `dual: true` mapping is not a guess: `markerForMint` already returns `''` for a
dual decision, and the engine's own corpus test independently asserts `1c` yields prefix
`''`. Both sides already agreed.

### Falls back, never guesses

Anything the engine does not resolve — unknown sender, ambiguous domain, or an audit whose
verdict it could not determine (`needs_review`) — defers to the existing
`decideCaseType(signals)`. Any throw does too. So the worst case is today's behaviour.

### Known limit: diminution

The engine has no `diminution` concept, accepted for the QDOS alpha experiment. A legacy
diminution decision is **preserved, not overridden** — the engine cannot meaningfully
contradict a type it cannot express, and silently downgrading one to `standard` would mint
a wrong Case/PO. `packages/domain/src/domain/case-type.ts` therefore stays, and is in any
case still called independently by `retro-reconstruct.ts`.
