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

## What this directory deliberately does NOT do (yet)

`intakeOrchestrator.ts`'s live 800+ line generator does **not** call these activities —
wiring the new engine into the actual per-email intake decision (which providers get
matched, which email type a message resolves to, what Case/PO gets minted) is a
follow-up iteration, not part of this pass. This pass's job was narrower: stand up the
new activities, prove they're correctly wired to `@cs/intake-engine` with their own unit
tests (mocked Box client, no live calls), and rip out the Box-folder-creation call sites
the new guard supersedes. See the top-level task notes / final report for the reasoning.
