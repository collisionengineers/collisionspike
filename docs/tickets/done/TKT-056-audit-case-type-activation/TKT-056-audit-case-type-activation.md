---
id: TKT-056
title: Audit case-type end-to-end — activation (delta + shadow review + gate flip + live probe)
status: done
priority: P1
area: intake
tickets-it-relates-to: [TKT-051, TKT-021]
research-link: docs/adr/0021-case-po-marker-taxonomy.md
---

# Audit case-type end-to-end — activation

## Problem

Audit emails (PCH direct + QDOS dual report+audit letters) were landing as plain standard cases —
worse, the attached third-party EVA report could leak "EVA (Engineers)" as the case's **work
provider** (the operator's 2026-07-03 report; TKT-051 follow-on). The parser detected audits since
ADR-0014 but nothing downstream consumed it: no `case_type_code`, no `A.`/`AP.`/`D.` Case/PO
markers, no `engineer_report` evidence.

## Built (2026-07-03 — code-complete, shadow-safe; see [changes.md](./changes.md) + [verification.md](./verification.md))

- **Provider leak closed** (3 layers): engine-v2.6 suppresses the layout-name fallback for
  `engineer_report:true` layouts; the Data API denylists engineer-report layout names
  (`isEngineerReportLayoutSentinel`); the D9 delta deactivates any live EVA work_provider row.
- **Multi-doc parse**: up to 3 document attachments parsed (Word-first), instruction selected by
  `content_typing`; report-typed attachments persist as `engineer_report` evidence (gated).
- **Case-type end-to-end**: parser `case_type` envelope (+ dual flag) → `decideCaseType` →
  case-resolve writes `case_type_code` + mints per-marker sequences (`A.PCH26001`…); QDOS dual
  letters keep the standard number (derived audit ID at review); PCH {A., D.} / QDOS {A., AP., D.}
  allowlist; staff PATCH `caseType` correction seam. All behind `AUDIT_CASES_ENABLED` (observe-only
  audit_events while off).

## Activation ladder — steps 1–5 ✅ DONE (2026-07-04, user-instructed go-live); only step 6 remains

1. ✅ **D9** applied (2026-07-04) — a **verified no-op**: pre-check + a broad `ILIKE '%eva%'` sweep
   found ZERO matching `work_provider` rows (the corpus never held an EVA row; the mislabel was
   entirely the parser layout-name fallback).
2. ✅ api + orch + parser (**and the SPA**) redeployed at `aafeba1` — counts re-verified 77/53/3,
   SPA CSP re-verified live.
3. ✅ **D10** delta applied (2026-07-04) — `choice_case_type` 4 rows, `engineer_report` 100000007
   confirmed.
4. ⏭️ Shadow review **waived** — the user explicitly instructed an immediate flip ("flip things to
   true now"), skipping the observe-only window.
5. ✅ `AUDIT_CASES_ENABLED=true` set + list-verified on **both** `cespk-api-dev` + `cespk-orch-dev`.
6. ⏳ **Live probe (the only remaining item):** on the next real pch-ltd.com audit email → expect
   work provider = PCH, `case_po = A.PCH26xxx` (fresh sequence), `case_type_code = audit`, EVA
   report stored as `engineer_report` evidence; and a QDOS dual letter → standard `QDOS26xxx` +
   case-type audit. Record the outcome in [verification.md](./verification.md).

## Evidence corpus

`emails/…Engineers 2… 577037/577039.eml` (direct pch-ltd.com), `tests/fixtures/manifests/evidence.json#{A.PCH261339,
D.PCH26190, QDOS261608, QDOS261572}` (added 2026-07-03), `tests/fixtures/manifests/evidence.json#test-cases/
{A.PCH261269, A.PCH261272, QDOS261253, QDOS261530}`, TKT-051's Connexus-routed sample.
