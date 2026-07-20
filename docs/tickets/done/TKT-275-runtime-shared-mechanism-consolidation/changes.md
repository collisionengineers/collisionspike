# Changes — TKT-275: Consolidate residual runtime shared mechanisms

## New shared homes (`@cs/server-runtime`, `@cs/domain`)

- `packages/server-runtime/src/content-digest.ts`: `contentSha256(bytes)` (the single evidence
  content-SHA-256 producer) and `requestDigest(value, options)` (the single stable-JSON idempotency
  digest, parameterised on key order + primitive coercion).
- `packages/server-runtime/src/safe-error-text.ts`: `safeErrorText(res)` (500-char cap, `'<no body>'`).
- `packages/domain/src/contracts/vehicle-data.ts`: exports `SHA256_HEX_RE` + `isSha256Hex` beside the
  existing `sha256Schema` (the single strict lower-case hex validator).
- All re-exported from the `@cs/server-runtime` / `@cs/domain` barrels.

## M1 — content SHA-256 producer + hex validator

- Six inline `createHash('sha256').update(bytes).digest('hex')` producers now call `contentSha256`
  (`blob.ts`, `imagesUnmatched.ts` ×2, `upload-route.ts`, `capture-upload.ts`, `mcp-image-ingestion.ts`,
  `intake-route.ts`). Byte-identical.
- Eight inline hex validators now use the single `SHA256_HEX_RE`. **The `/i`-vs-strict split is resolved
  to one strict lower-case alphabet**; the two former `/i` sites (`internal-persist-routes.ts`,
  `merge-evidence.ts`) lower-case their input before matching, preserving their accept-upper-case
  behaviour. `sha256Schema`'s generated JSON Schema is unchanged.

## M2 — request digest

- `manual-intake-operation.ts` and `intake-operation.ts` adopt `requestDigest(value)` (default policy,
  byte-identical to their prior serializer). `vehicle/persistence.ts` adopts
  `requestDigest(value, { localeSort: true, undefinedToken: 'null' })`, byte-identical to its
  locale-collated / `null`-coercing serializer. **No persisted idempotency key changes** — proven by a
  parity regression test over a battery of inputs. The three fixed-key-order `JSON.stringify` idempotency
  sites deliberately keep hashing their literal order (they never reorder keys), so they are not routed
  through the key-sorting digest.

## M3 — safeText

- The three orchestration transport adapters (`graph.ts`, `functions-client.ts`, `data-api-http.ts`)
  drop their byte-identical local `safeText` and import `safeErrorText`.

## Result

`check:runtime-contract` byte-identical (191 routes, 56 DTOs, 7 schemas, 65 Postgres tables, 22 code
tables). Net −28 lines in owned runtime source. No live write.
