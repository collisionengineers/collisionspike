---
id: TKT-071
title: Job references like HD4110 wrongly captured as a vehicle registration
status: verify
priority: P1
area: parsing
tickets-it-relates-to: [TKT-001, TKT-072]
research-link: docs/tickets/verify/TKT-071-vrm-false-positive-hd4110/evidence/operator-note.md
---

# Job references like HD4110 wrongly captured as a vehicle registration

## Problem

An email whose subject carried the provider job reference `HD4110`
(`"***URGENT*** FW: HD4110 - LETTER OF INSTRUCTION"`) had that reference captured as the case's
**vehicle registration**. Root cause in the shared VRM filter
(`packages/domain/src/domain/vrm-filter.ts`): the LOOSE dateless shape (`[A-Z]{1,3}\d{1,4}`) is
licensed by a **document-wide** ANCHOR test — any occurrence of "vehicle"/"registration"/"reg"
anywhere in a letter of instruction licenses every loose candidate in it — and the
postcode-outward guard only rejects 1–2 digit districts, so 4-digit `HD4110` slips through.
Wrong VRMs poison dedup/twin matching (VRM is the primary correlation key, ADR-0002) and flow
into EVA fields.

## Evidence

- `evidence/operator-note.md` — plan § 6 + diagnostic (2026-07-06 planning session, verified
  06/07).
- `packages/domain/src/domain/vrm-filter.ts` — `ANCHOR.test(text)` is document-wide (~line
  104); `isPostcodeOutwardCode` covers only `[A-Z]{1,2}[0-9]{1,2}`.
- Existing regression suite: `packages/domain/src/domain/vrm-filter.test.ts`.
- Live data: cases exist with `candidate_vrm`/`vrm='HD4110'`-style junk (data fix in scope).
- The parser's Python sniff mirrors this rule — dual-home per ADR-0018 (edit the
  `cedocumentmapper_v2.0` sibling first, then re-vendor).

## Proposed change

PROPOSED (not built):

- **Proximity anchoring**: accept the loose dateless shape only when an anchor word appears
  within ~40 chars of the candidate (not anywhere in the document).
- **Tight anchor for postcode-area prefixes**: when the candidate's letter prefix is a postcode
  area (HD, LS, …), require the anchor to immediately precede it ("reg HD4110").
- **Regression fixtures** in `vrm-filter.test.ts`: the HD4110 subject line → `''`; all
  currently-accepted marks unchanged (no recall regression).
- **Mirror into the Python sniff** via the `cedocumentmapper_v2.0` sibling (ADR-0018:
  edit-in-sibling-first, add the same fixtures there, then re-vendor into the parser Function).
- **Data fix**: an audited SQL update clearing `candidate_vrm`/`vrm` junk of this shape on
  affected live cases; while in the corpus, check devnotes item 5 (networkhduk → YML) against
  `work_provider`.

## Acceptance

- [ ] `"***URGENT*** FW: HD4110 - LETTER OF INSTRUCTION"` extracts NO vrm (TS filter and Python
      sniff both).
- [ ] Every previously-accepted fixture in `vrm-filter.test.ts` still passes (strict shapes,
      anchored dateless plates like "reg A1").
- [ ] A genuinely-anchored dateless plate near its anchor still extracts ("registration
      HD4110" tight-anchored → accepted; "vehicle … <3 pages> … HD4110" → rejected).
- [ ] The Python sniff in the `cedocumentmapper_v2.0` sibling carries the same rule + fixtures,
      re-vendored into the parser Function (ADR-0018 provenance updated).
- [ ] Affected live rows are cleaned by an audited delta (each cleared value recorded), and no
      case retains an `HD4110`-style junk VRM.

## Verification requirements (proof standard — all classes required before `done`)

1. **Offline tests (dual-language)** — vitest fixtures in `vrm-filter.test.ts` (new rejections +
   full existing-acceptance regression) AND the sibling's Python test suite carrying the same
   fixtures; both green, outputs recorded.
2. **Gate** — `node verify-all.mjs` green; orch/api/parser deploys recorded in
   [changes.md](./changes.md) with the sibling re-vendor commit noted.
3. **Live intake replay** — replay an HD4110-style email through the deployed stack and prove
   via Postgres that the created/updated case has NO junk VRM (`candidate_vrm`/`vrm` empty or
   correct). Record the row in [verification.md](./verification.md).
4. **Data-fix proof** — before/after SQL counts of affected rows (junk-VRM count → 0), plus the
   audit rows written by the delta.
5. **Recall guard** — at least one live (or replayed) genuine-VRM email still extracts its
   registration correctly post-deploy.

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-assistant-intake-search-fixes.md`
(§ 6); excerpt in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (excerpt)](./evidence/operator-note.md)
