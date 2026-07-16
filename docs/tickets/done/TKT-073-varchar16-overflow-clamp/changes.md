# Changes — TKT-073: Intake write fails with "value too long" — clamp over-length field before insert

## Status
Field identified with KQL evidence; guards deployed (2026-07-09, PLAN-003 intake wave).

## The failing field(s) — named with KQL evidence (azure-diagnostician dispatch)

Postgres **22001** on the **`INSERT INTO case_`** inside the create transaction — TWO columns, THREE
routes, over the full component history (21 error rows / 7 underlying events, each retried ×3 by the
Durable client):

| error | route | column | first | last | sample operation_Id |
|---|---|---|---|---|---|
| varying(100) | POST /api/internal/cases/resolve → 500 | `case_.case_ref` | 2026-06-30 15:09Z | 2026-07-01 09:29Z | `d7e326be7897f380bf16651198ff7972` |
| varying(16) | POST /api/internal/cases/resolve → 500 | `case_.vrm` | 2026-07-02 11:11Z | 2026-07-03 14:42Z | `14574d088bbb02b9c9c8a91e5cff736a` |
| varying(16) | POST /api/internal/retro/create → 500 | `case_.vrm` | 2026-07-07 14:36Z | 2026-07-07 16:24Z | `6fa39300a02624ca9137e2312174589a` |

(22001 doesn't name the column; attribution is by exclusion — `vrm` is the only varchar(16) in the
statement, `case_ref` the only UNclamped varchar(100). The retro incidents lost refs SAB/46329/1 +
DIK/JMO/46440/1. `inbound_email.body_vrm` was NOT the failure point — that upsert swallows its own
errors. Full KQL in the diagnostician result, transcribed to verification.md at verify time.)

## Shipped — one guarded helper at the write seams

- **`services/data-api/src/shared/validation/varchar.ts`** (+tests): `clampVarchar(value, max)` (truncate + report) and
  `vrmOrEmpty(value)` (an over-length "VRM" is a junk sniff — DROPPED to '' like "no VRM", never
  truncated into the correlation key).
- Wired with warn-traces naming the field + original length:
  - `internal.ts` cases/resolve: `vrm` via `vrmOrEmpty` (warn on drop); `candidateRef` clamped to
    100 (warn on clamp); `applyParserFields`' case_ref cap corrected 200→**100** (a latent 22001);
  - `internal-retro.ts` retro/create: the VRM preference chain via `vrmOrEmpty`; `caseRefValue`
    clamped to 100;
  - `upsertInboundEmail` sibling columns clamped (name 200, body_vrm 16-drop, body_caseref 32,
    body_jobref 64) so a swallowed insert no longer silently loses the triage row.
- Unit tests: `services/data-api/src/shared/validation/varchar.test.ts` (over-length in → truncated/dropped out, row
  shape valid; null tolerance).

## Deploy state
api redeployed (89 fns) 2026-07-09.

## Remainders (honest)
- The **zero-recurrence KQL re-run over a stated window** + one observed clamp warn-trace (or an
  explicit no-arrival note) are the verifier's post-deploy items — minutes-old deploys can't prove a
  window yet.
- Upstream hygiene (the parser/body-sniff letting junk >16-char "VRM" tokens through at all) is a
  sibling-engine follow-up candidate, complementary to the TKT-071 loose-shape work.
