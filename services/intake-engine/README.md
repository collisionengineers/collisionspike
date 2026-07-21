# @cs/intake-engine

An email-intake classification engine: sender + body/document text in, a resolved
principal + email type + Case/PO minting **contract** out. This is a from-scratch
experimental rebuild — it does not port or follow any existing ADR/ticket field-rule
design; it only reuses a small, explicitly confirmed set of sender-domain/principal-code
facts as seed data (see `src/registry/providers/*.json`).

## 1. Zero I/O, zero live SDK dependencies, by design

Every module under `src/registry/` and `src/pipeline/` is pure, deterministic,
framework-free TypeScript: given the same inputs, always the same outputs, no network
calls, no database, no Box/Graph SDK imports anywhere. The only file-system reads in
this package are:

- `src/registry/loader.ts` reading its own `providers/*.json` files, and
- `src/adapters/box-test-guard.ts` reading `tools/box-scope.json` to resolve the pinned
  archive-root id.

Both are read-only, local-repo reads — never a live API call. This is why the package
can be tested with `vitest run` and no fixtures/mocks beyond plain JS objects and small
`.txt` files.

## 2. Adding provider #26 — no code changes required

Every provider is one JSON file under `src/registry/providers/`. To onboard a new
direct provider, create `src/registry/providers/ACME.json`:

```json
{
  "principalCode": "ACME",
  "relationship": "direct",
  "knownEmailDomains": ["acme-claims.co.uk"]
}
```

That's it — every other field (`active`, `knownEmailAddresses`, `caseTypeMarkers`,
`emailTypeRules`, etc.) falls back to `src/registry/defaults.ts`'s fallback layer.
`loadRegistry()` (in `src/registry/loader.ts`) is the **only** function in this package
that reads a provider JSON file directly — nothing else may add its own
`readFileSync` for provider config. Every pipeline stage receives the already-merged,
already-typed entry.

To onboard an intermediary (a sender that routes to one of several actual instructing
principals), add `relationship: "intermediary"` and a `candidatePrincipals` list, each
with its own content-signal phrases used to disambiguate which principal a given
message is actually for (see `src/registry/providers/CNX.json` for a worked, clearly
marked *illustrative* example — Connexus's domain is real/confirmed, but its two
candidate codes and their signal phrases are placeholder seed data for a human operator
to correct/expand).

If a provider file is malformed (bad JSON or fails schema validation), `loadRegistry()`
throws with the file name in the error. If a provider code simply has no file at all,
it is absent from the registry — that is normal, not an error (a sender that doesn't
match any registry entry proceeds through the pipeline as `unmatched`, per
`identify-principal.ts`).

## 3. The two safety guards, and why they're single choke points

- **`src/adapters/box-test-guard.ts`** — `ensureArchiveFolder(name, boxClient, opts?)`
  is the *only* way this package touches a Box folder. It resolves the pinned test-root
  id from `tools/box-scope.json` (the SAME pinned root, `392761581105`, already
  enforced elsewhere in this repo — see `.claude/hooks/box-scope-lib.mjs`) and asserts
  the target parent folder against it **before** calling either injected client method.
  `boxClient` is an injected interface, never a live SDK import, so this package has no
  network dependency and its guard can be exhaustively unit-tested with a fake client
  (see `tests/box-test-guard.test.ts`, including the negative case: a mismatched root
  throws before the fake client is ever called).
- **`src/adapters/outlook-readonly-guard.ts`** — exports only read-shaped types
  (`ReadOnlyMessageAccess`: `getMessageBody`, `getAttachments`). It documents/enforces,
  by type shape alone, that this package only ever consumes already-fetched message
  data. There is no runtime check that could prevent a mutation-shaped export from being
  added elsewhere — the point of keeping this in one small file is that adding a
  move/mark-read/send/delete-shaped export here would be an obvious, single-file,
  reviewable diff.

Both guards exist as single choke points on purpose: any future contributor extending
this package has exactly one place to look (and one place a reviewer needs to check) for
"does this still only touch Box/Outlook the way it's supposed to."

## 4. The shared-counter and lowercase-prefix decisions (deliberate, not bugs)

`src/pipeline/mint-case-number.ts` defines the Case/PO **allocation contract** — this
package has no DB access, so nothing here talks to a live counter. Two behaviors are
confirmed, deliberate deviations from what you might otherwise expect from a
"per-marker-scoped sequence" design:

1. **Shared counter.** `sequenceScopeKey` is `` `${principalCode}${year}` `` — it does
   NOT fold the email-type marker/prefix into the key. Standard (`1a`), audit
   (`1b_audit_repairable` / `1b_audit_total_loss`), and inspection+audit (`1c`) cases
   for the *same* principal+year all share **one** counter. A "QDOS26" standard case and
   an "a.QDOS26" audit case draw from the same sequence, not two separate ones.
2. **Lowercase prefixes.** The literal prefixes are `'a.'` and `'ap.'` — lowercase, even
   though the principal-code segment of the formatted case number
   (`formatCaseNumber('QDOS', '26', 1, 'a.')` → `'a.QDOS26001'`) is upper-case.

Both are recorded here so a future reader who expects the "obvious" per-marker-scoped,
upper-cased-prefix design isn't confused — this is the confirmed behavior, not an
inconsistency to "fix."

## Package layout

```
src/
  registry/         provider registry: schema, defaults/fallback layer, loader, seed JSON
  pipeline/          identify-principal -> resolve-intermediary-principal ->
                     classify-email-type -> mint-case-number -> resolve-archive-folder-name,
                     composed by pipeline.ts
  adapters/          box-test-guard.ts, outlook-readonly-guard.ts
  index.ts           public barrel export
tests/
  registry.test.ts, identify-principal.test.ts, classify-email-type.test.ts,
  mint-case-number.test.ts, box-test-guard.test.ts, pipeline.corpus.test.ts (+ tests/corpus/*.txt)
```
