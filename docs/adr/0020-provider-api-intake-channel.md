# ADR-0020 — Provider API intake channel (machine-to-machine case lodging)

**Status:** Proposed (2026-07-03). Adds a third intake channel alongside email (ADR-0015)
and manual entry. Reuses the dedup/mint/evidence path shared by those channels (ADR-0010,
the shared Case/PO mint) and the EVA 12-field + image contract (unchanged). Realised by
ticket [TKT-055](../tickets/verify/TKT-055-provider-api-intake/TKT-055-provider-api-intake.md);
the publishable contract is [provider-api-intake-spec.md](../reference/provider-api-intake-spec.md).

## Context

Cases arrive today by **email** (the live Graph PUSH intake) and by **manual entry** in the
SPA. Some work providers run their own case-management software and would rather **POST a
case directly** — structured fields plus the instruction document(s) and photos — than
compose an email our classifier then has to parse. A direct channel removes the
parse/classify uncertainty for those providers (the fields arrive typed, not extracted) and
gives them a synchronous `201` with the case id.

The constraints:

1. **No new identity model.** The provider must be identified without a person in the loop,
   but we already model providers (`work_provider`, principal codes, automation modes). The
   channel must resolve identity from *our* corpus, not trust a client-supplied code.
2. **No duplication of the case path.** The dedup ladder, the advisory-locked Case/PO mint,
   the 12 EVA columns, the Blob evidence landing, and the append-only audit trail are all
   already built and proven for email/manual intake. A new channel must **reuse** them.
3. **Secrets discipline.** The 2026-06-26/27 sweep removed every plaintext secret from the
   stack. A new credential type must not reintroduce one.

## Decision

Add `POST /api/provider-intake/cases`, authenticated by a per-provider **API key**.

1. **API-key auth (hash-only, show-once).** A key is `cspk_<32+ url-safe chars>`. Only its
   **SHA-256 hash** + a 12-char display prefix are stored (`provider_api_key` table); the
   plaintext is returned **once** at mint and never persisted. Verification looks the
   candidate rows up by prefix, then does a **constant-time** (`crypto.timingSafeEqual`)
   hash compare and rejects revoked keys — every failure is a **generic 401** (no oracle for
   which keys exist). A leaked database yields no usable keys. Keys are minted/revoked by a
   **Superuser** in the Admin console; revoke is a **soft flag** (`revoked_at`), never a row
   delete, so the audit of "this key existed" survives.
   - *Rejected:* reusing Entra JWTs / client-credentials app registrations per provider —
     heavyweight to provision per provider and couples every provider onboarding to a tenant
     app-registration change; an app-owned API key is the lighter, provider-scoped fit.

2. **Server-resolved provider identity.** The provider (`work_provider_id`) and its principal
   code come **only** from the authenticated key — the submission body carries no principal
   code and any such field would be ignored. This makes cross-provider spoofing structurally
   impossible: a key can only ever create cases for its own provider.

3. **Base64-in-JSON transport (v1).** Instructions + images are inlined as Base64 in the JSON
   body, guarded at ~50 MB (`413` otherwise). One request → one case.
   - *Rejected for v1:* `multipart/form-data`. It is the better fit for very large photo
     sets and remains a **documented future option** (added additively, v1 preserved), but
     Base64-in-JSON is simpler for a first provider integration and keeps the whole request a
     single typed JSON object the validator can check before any I/O.

4. **Reuse the shared case path.** The route mints the Case/PO via the **shared
   advisory-locked helper** (`api/src/lib/case-po.ts`, extracted from the duplicated
   email/manual mint logic in this same change), writes the 12 EVA columns via
   `EVA_FIELD_ORDER` (with `work_provider` auto-filled from the provider display name),
   computes status via the shared `statusForReviewCase` guard, lands evidence bytes in Blob
   via the same `uploadEvidenceBytes`, and writes append-only audit rows
   (`provider_api_case_created` / `_rejected`). Validation **mirrors the DB CHECK
   constraints** (date format, VAT/mileage enums, exclusion-reason) so a bad submission is a
   `400` with a machine-readable error code — never a `500` on a constraint violation.

The case enters the **normal review workflow** (a person confirms before EVA), exactly like
email intake — the API channel changes *how a case arrives*, not the domain model, the EVA
contract, or the human-review gate.

## Consequences

- **New table** `provider_api_key` (+ RLS + FK CASCADE from `work_provider`), a new
  `provider_api` intake-channel-kind, and four new audit actions — all additive, idempotent
  delta [`2026-07-03-provider-api-intake.sql`](../../migration/assets/schema/deltas/2026-07-03-provider-api-intake.sql).
- **The mint is now single-sourced** (`case-po.ts`) — email/manual/provider-API all share
  one advisory-locked implementation, removing the prior copy-paste.
- **Operator surface:** the Admin "API keys" section (Superuser) mints/lists/revokes keys;
  the plaintext is shown once with a copy affordance and an explicit "won't be shown again"
  warning.
- **Not yet done / follow-ups:** per-key rate limiting, a multipart transport, and a
  provider-facing "test my key" ping are out of scope for v1. Enrichment/parse still run on
  the created case as usual (the provider's typed fields are authoritative; parse fills gaps
  fill-if-empty).
