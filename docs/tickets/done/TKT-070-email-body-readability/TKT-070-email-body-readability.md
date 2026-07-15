---
id: TKT-070
title: Inbox email previews are one unreadable line — keep line breaks, cut noise
status: done
priority: P2
area: email
tickets-it-relates-to: [TKT-005, TKT-054]
research-link: docs/tickets/done/TKT-070-email-body-readability/evidence/operator-note.md
plan: PLAN-003
---

# Inbox email previews are one unreadable line — keep line breaks, cut noise

## Problem

Every inbound email's stored preview is a single run-on line: `fetchMessage.ts` (~line 137)
builds `bodyPreview` with `body.replace(/\s+/g, ' ')` — destroying every line break — and does
no cleanup of long URLs, quoted reply chains (`From:/Sent:`, `On … wrote:`), or
signature/disclaimer boilerplate. Handlers reading the Inbox panel get a wall of text where the
actual message is buried between tracking links and legal footers. The display side is already
fine: the Inbox panel renders `pre-wrap`, and `inbound_email.body_preview` is `text`, so a
multi-line preview needs no schema or SPA change.

## Evidence

- [evidence/operator-note-2026-07-08.md](./evidence/operator-note-2026-07-08.md) — 2026-07-08 operator re-report (workstream item 5): QDOS signature/link garbage fills the preview — strip boilerplate, show the typed body first.
- `evidence/operator-note.md` — plan § 5 + diagnostic (2026-07-06 planning session, verified
  live 06/07).
- `services/orchestration/src/workflows/intake/fetchMessage.ts` ~line 137 — the whitespace collapse
  (`BODY_PREVIEW_CAP` 3,500 chars).
- `services/orchestration/src/workflows/retro/retro-envelope.ts` — the retro path builds previews the same way.
- Real sample emails for fixtures: `tests/fixtures/manifests/evidence.json#`.

## Proposed change

PROPOSED (not built):

- **New pure util** in `packages/domain/src/domain` (e.g. `email-body-clean.ts`):
  - preserve newlines; collapse runs of 3+ blank lines to one;
  - strip/shorten URLs (keep the domain visible);
  - cut quoted reply chains (`From:/Sent:` and `On … wrote:` blocks);
  - drop signature/disclaimer boilerplate below common markers.
- **Wire it in** to `fetchMessage.ts` and `retro-envelope.ts` to build `bodyPreview` instead of
  the whitespace collapse. No schema change; no SPA change.
- **Optional backfill** (scope decision at implementation): existing rows can't recover lost
  line breaks, but a small script can re-clean URLs/quote-chains in place for recent rows, or
  re-fetch recent messages from Graph by id.

## Acceptance

- [ ] New intake stores a multi-line `body_preview`: paragraphs preserved, ≤1 blank line runs,
      URLs shortened to their domain, quoted chains and signature boilerplate removed.
- [ ] The Inbox panel renders the cleaned preview with visible line structure (no run-on wall).
- [ ] The VRM sniff and parser inputs are unaffected — cleaning applies to the stored preview,
      not to the `body` used for extraction.
- [ ] The util is pure (no I/O) and unit-tested on real samples from `tests/fixtures/manifests/evidence.json#`.

## Verification requirements (proof standard)

1. **Offline tests** — `packages/domain` vitest suite for `email-body-clean` covering: newline
   preservation, blank-line collapse, URL shortening, `From:/Sent:` chain cut, `On … wrote:`
   chain cut, signature-marker drop — each pinned on a real sample from `tests/fixtures/manifests/evidence.json#`.
2. **Gate** — `node verify-all.mjs` green; orch deploy recorded in [changes.md](./changes.md).
3. **Live probe** — after deploy, send/await one real email and capture the stored
   `body_preview` from Postgres showing multi-line structure + cleaned noise; screenshot the
   Inbox panel rendering. Record both in [verification.md](./verification.md).
4. **Regression guard** — confirm (test or live case) that `candidate_vrm` extraction on the
   same message is unchanged pre/post (the sniff reads `body`, not the preview).

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-assistant-intake-search-fixes.md`
(§ 5); excerpt in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (excerpt)](./evidence/operator-note.md)
