# Diagnostics & Fix Plan — Assistant, Email Body, VRM False-Positives, Search

> Saved from the planning session of 2026-07-06. Working checklist at the bottom.

## Diagnostic summary (verified live 06/07)

- **Assistant lookup**: `POST /api/assistant/chat` requests all returned **200** (5–13s). App Insights (workspace `DefaultWorkspace-…SUK`) shows **no DB errors** at the lookup times. Root causes are in code:
  - [api/src/lib/aoai-chat.ts](api/src/lib/aoai-chat.ts) line 174: tool exceptions become `{error}` fed to the model **with no logging** — the "internal error" the model reported is invisible in telemetry.
  - [api/src/functions/assistant.ts](api/src/functions/assistant.ts) line 88: `lookup_case` does `c.vrm ILIKE '%YT13 UTV%'` but intake stores VRMs **compacted** (`YT13UTV` — `extractVrm` strips spaces), so a spaced VRM can never match.
- **Email body**: [orchestration/src/functions/activities/fetchMessage.ts](orchestration/src/functions/activities/fetchMessage.ts) line 137 collapses ALL whitespace into one line before storing `body_preview`; no URL/quoted-chain/signature stripping. The Inbox panel renders `pre-wrap`, so a cleaned multi-line preview displays fine.
- **HD4110**: [packages/domain/src/domain/vrm-filter.ts](packages/domain/src/domain/vrm-filter.ts) — the LOOSE dateless rule accepts `HD4110` because the ANCHOR check is document-wide (any "vehicle"/"registration" anywhere in a letter of instruction licenses it), and the postcode-outward guard only covers 1–2 digit districts.
- **Search**: [mockup-app/src/components/AppShell.tsx](mockup-app/src/components/AppShell.tsx) line 438–444 — the SearchBox only `navigate('/')` on Enter. No search endpoint exists; `openVrmTwins` (`GET /api/cases?vrm=`) already returns all open same-VRM cases.
- **Bonus live finding**: 03/07 API errors `value too long for type character varying(16)` on an internal (`withServiceAuth`) route — a field (likely a ref/VRM candidate) exceeds its column; needs a clamp.

## 1 — Assistant: lookup fix + observability

In [api/src/functions/assistant.ts](api/src/functions/assistant.ts) and [api/src/lib/aoai-chat.ts](api/src/lib/aoai-chat.ts):

- Normalize the lookup: compare space/case-insensitively on VRM and Case/PO, e.g. `replace(upper(c.vrm),' ','') LIKE replace(upper($1),' ','')` (keep plain ILIKE for claimant/ref). Trim + collapse the incoming query once.
- Log tool failures: pass a logger into `runChat` (or wrap `execTool`) so every tool exception emits `ctx.warn('[assistant] tool <name> failed: <msg>')` — the audit-lite event should also carry `toolErrors: n`.
- Resilience: retry a failed tool query once (covers Postgres cold-connect within the 5s `connectionTimeoutMillis` in [api/src/lib/db.ts](api/src/lib/db.ts)).

## 2 — Assistant: reset/clear chat (SPA only)

In [mockup-app/src/components/AssistantDrawer.tsx](mockup-app/src/components/AssistantDrawer.tsx): add a "New chat" button in the drawer header (next to close) that clears `turns` + `input` (disabled while `sending`). No API change — history lives client-side.

## 3 — Assistant: attach files/images → link to case

Keep the model itself read-only (TKT-060 invariant); the write happens as an explicit, user-confirmed SPA action:

- Drawer gains an attach button (accepts images/PDF). Attachments are held client-side and described to the model as context ("user attached 2 photos named …").
- The assistant identifies the target case via `lookup_case`; the SPA renders a confirmation card ("Add 2 files to CCPY26050?").
- On confirm the SPA calls a new authenticated endpoint `POST /api/cases/{id}/evidence/upload` (multipart; staff role; lands bytes in Blob `cespkevidstdev01` via the existing evidence path, inserts `case_evidence` + audit rows — mirrors the intake attachment landing). The model never performs the write.

## 4 — Assistant: additional read-only tools

Add to `TOOLS`/`execTool` (all SELECT-only, handler-language results):

- `get_case_detail` — full case card (status/queue, provider, claimant, VRM, outstanding items, inspection address, hold reason).
- `case_activity` — recent audit entries for a case.
- `vrm_twins` — all open cases sharing a VRM (reuses the `openVrmTwins` query).
- `list_queue_cases` — top N oldest cases in a named queue with ages.
- `emails_for_case` — inbound emails linked to a case.
- `aging_exceptions` — the dashboard's overdue list.

Update the system prompt + drawer suggestion chips accordingly.

## 5 — Email body readability

- New pure util in [packages/domain](packages/domain/src/domain) (e.g. `email-body-clean.ts`): preserve newlines (collapse runs of 3+ blank lines to one), strip/shorten URLs (keep domain), cut quoted reply chains (`From:/Sent:` and `On … wrote:` blocks), drop signature/disclaimer boilerplate below common markers. Unit-tested on real samples from `test-cases-and-data/`.
- Use it in `fetchMessage.ts` (and [orchestration/src/lib/retro-envelope.ts](orchestration/src/lib/retro-envelope.ts)) to build `bodyPreview` instead of `replace(/\s+/g,' ')`. Column `inbound_email.body_preview` is `text` — multi-line is fine; SPA already `pre-wrap`s.
- Optional backfill: existing rows can't be fully repaired (line breaks already lost); a small script can re-clean URLs/quote-chains in place for recent rows, or re-fetch recent messages from Graph by id.

## 6 — HD4110 / VRM false positives

In [packages/domain/src/domain/vrm-filter.ts](packages/domain/src/domain/vrm-filter.ts) (+ mirror the rule change into the parser's Python sniff via the `cedocumentmapper_v2.0` sibling per ADR-0018):

- Replace the document-wide ANCHOR test with **proximity anchoring**: the loose dateless shape is only accepted when the anchor word appears within ~40 chars of the candidate.
- Require a *tight* anchor (immediately preceding, e.g. "reg HD4110") when the candidate's letter prefix is a postcode area (HD, LS, …).
- Add regression fixtures to [vrm-filter.test.ts](packages/domain/src/domain/vrm-filter.test.ts): `"***URGENT*** FW: HD4110 - LETTER OF INSTRUCTION"` → `''`; existing accepted marks unchanged.
- Data fix: SQL update clearing `candidate_vrm/vrm='HD4110'`-style junk on affected cases (audited), and check devnotes item 5 (networkhduk → YML) against the `work_provider` corpus while in there.

## 7 — Global search + same-VRM display

- New endpoint `GET /api/search?q=` (staff role) in a new `api/src/functions/search.ts` (to be created): one normalized query across `case_` (Case/PO, VRM space-insensitive, ref, claimant), `inbound_email` (subject, sender), `work_provider` (name/code). Returns `{ cases[], emails[], providers[] }` capped per group.
- SPA: wire the AppShell SearchBox to a results view (`/search?q=`) listing all matches — every case sharing the searched VRM is listed with provider/status/age so "3 same VRM" shows all three; case rows link to case detail, email rows to the inbox item.
- Reuse the twin logic for a "N other cases share this registration" grouping header.

## 8 — Housekeeping

- Clamp the `varchar(16)` overflow (identify the failing internal-route field from the 03/07 stack, truncate at the mapper).
- File tickets per repo convention (TKT-066…069: assistant lookup+tools, email-body readability, VRM false-positive, global search) and board them; note remaining open board items are unchanged (TKT-054/001/005 … awaiting live probes; TKT-004/010/032/057 operator-blocked).
- Tests: `packages/domain` vitest for the new util + filter change; api unit tests for search + assistant normalization; `node verify-all.mjs`.
- Deploy api + orch + SPA per [docs/azure/deploy.md](docs/azure/deploy.md); verify live with a YT13 UTV assistant lookup, an HD4110-style intake replay, and a search click-through.

## Checklist

- [ ] Normalize VRM/Case-PO matching in `lookup_case` + log tool failures in `runChat` + one retry
- [ ] Add New chat (clear) button to AssistantDrawer
- [ ] Attach files in drawer + user-confirmed evidence upload endpoint linking to case
- [ ] Add read-only tools: case detail, activity, vrm twins, queue cases, emails-for-case, aging
- [ ] Pure body-clean util (newlines, URLs, quote chains, signatures) wired into fetchMessage/retro-envelope
- [ ] Proximity-anchor loose VRM rule + HD4110 regression tests + data fix; mirror to Python sniff
- [ ] `GET /api/search` endpoint + SPA results view with same-VRM grouping
- [ ] varchar(16) clamp, file TKT-066…069, tests, verify-all, deploy api/orch/SPA + live smoke
