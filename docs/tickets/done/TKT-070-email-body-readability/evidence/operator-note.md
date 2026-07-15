# Operator plan excerpt — § 5 Email body readability

> From `PLAN-assistant-intake-search-fixes.md` (planning session 2026-07-06). The full plan is
> preserved at
> [TKT-066 evidence](../../../verify/TKT-066-assistant-lookup-observability/evidence/operator-note.md).

Diagnostic (verified 06/07): `services/orchestration/src/workflows/intake/fetchMessage.ts` line 137
collapses ALL whitespace into one line before storing `body_preview`; no URL/quoted-chain/
signature stripping. The Inbox panel renders `pre-wrap`, so a cleaned multi-line preview
displays fine.

Plan:

- New pure util in `packages/domain/src/domain` (e.g. `email-body-clean.ts`): preserve newlines
  (collapse runs of 3+ blank lines to one), strip/shorten URLs (keep domain), cut quoted reply
  chains (`From:/Sent:` and `On … wrote:` blocks), drop signature/disclaimer boilerplate below
  common markers. Unit-tested on real samples from `tests/fixtures/manifests/evidence.json#`.
- Use it in `fetchMessage.ts` (and `services/orchestration/src/workflows/retro/retro-envelope.ts`) to build
  `bodyPreview` instead of `replace(/\s+/g,' ')`. Column `inbound_email.body_preview` is `text`
  — multi-line is fine; SPA already `pre-wrap`s.
- Optional backfill: existing rows can't be fully repaired (line breaks already lost); a small
  script can re-clean URLs/quote-chains in place for recent rows, or re-fetch recent messages
  from Graph by id.
