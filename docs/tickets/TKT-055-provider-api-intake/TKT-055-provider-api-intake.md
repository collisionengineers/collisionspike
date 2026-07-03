---
id: TKT-055
title: Provider API intake channel (machine-to-machine case lodging)
status: now
priority: P2
area: intake
tickets-it-relates-to: [TKT-013, TKT-004]
research-link: docs/adr/0020-provider-api-intake-channel.md
---

# Provider API intake channel

## Problem
Some work providers run their own case-management software and would rather **POST a case
directly** (structured fields + instruction documents + photos) than send an email our
classifier must parse. There is no machine-to-machine intake channel today — every case
arrives by email (Graph PUSH) or manual SPA entry.

## Evidence
- Email + manual are the only live intake channels (`api/src/functions/internal.ts`
  cases/resolve; `cases.ts` createCase). Both mint the Case/PO with the SAME advisory-locked
  block (previously copy-pasted).
- The EVA 12-field contract, image rules, Blob evidence landing, dedup, and audit trail are
  already built and channel-independent — a new channel should reuse them, not fork them.

## Proposed change
Add `POST /api/provider-intake/cases`, authenticated by a per-provider **API key**
(`X-Api-Key: cspk_…`), hash-only + show-once. Design + rationale: **[ADR-0020](../../adr/0020-provider-api-intake-channel.md)**.
Publishable provider contract: **[provider-api-intake-spec.md](../../reference/provider-api-intake-spec.md)**.

- **Schema:** new `provider_api_key` table (canonical `migration/assets/schema/170_provider_api_key.sql`
  + FK/RLS in `900_constraints.sql`); idempotent delta
  [`deltas/2026-07-03-provider-api-intake.sql`](../../../migration/assets/schema/deltas/2026-07-03-provider-api-intake.sql)
  (table + FK + RLS + GRANT, audit actions `100000042–45`, intake-channel-kind `provider_api` `100000002`).
- **API:** `api/src/lib/api-key-auth.ts` (`withApiKey`), `api/src/lib/case-po.ts` (shared mint,
  both existing call sites refactored to it), `api/src/lib/blob.ts` (ported `uploadEvidenceBytes`),
  `api/src/lib/provider-intake-validate.ts` (pure validator), `api/src/functions/provider-keys.ts`
  (Superuser mint/list/revoke), `api/src/functions/provider-intake.ts` (the intake route).
- **SPA:** Admin → provider editor → "API keys" section (Superuser): list, generate (plaintext
  shown once + copy), revoke. `rest-client.ts` + `@cs/domain` DTOs.

## Acceptance
- A valid `X-Api-Key` + submission creates a case (201 `{ caseId, casePo }`) that enters the
  normal review workflow; instructions/images land as evidence in Blob.
- Provider identity + principal come ONLY from the key (never the body).
- Bad submissions → 400 with a machine-readable error code (mirrors the DB CHECKs); missing/
  revoked key → generic 401; body > 50 MB → 413.
- Superuser can mint (plaintext shown once), list, and revoke keys in Admin.
- Key secret is never stored in plaintext (SHA-256 hash + prefix only); revoke is a soft flag.

## Research
Design authority: [ADR-0020](../../adr/0020-provider-api-intake-channel.md). Contract to send
providers: [provider-api-intake-spec.md](../../reference/provider-api-intake-spec.md).

## Artifacts
- [changes.md](./changes.md) — what was built.
- [verification.md](./verification.md) — how it was proven + what remains (operator: apply the
  delta, then a Superuser mints the first key).
