# Verification — TKT-065: Audit cases resolve NO work provider

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26. Orchestrator ruling on line 4: closed with the
QDOS-domain item re-homed to ticket board D3 (where it was already tracked) — the live data shows
qdosassist.co.uk ALREADY resolves (D3's "cannot domain-resolve" wording is stale; the remaining ask
is additional domains such as qdoslaw.co.uk), and the acceptance's probe line was met on the
stronger domain arm.

## Ticket-verifier verdict (transcribed, dispatch of 2026-07-10)

- **Line 1 (forward fix deployed):** proven live by the probe evidence; structural mint guard
  confirmed in source (internal.ts:1040-1055 — Case/PO mints only when provider resolved, so a live
  A.* Case/PO cannot exist without work_provider_id at create).
- **Line 2 (backfill clean):** applied live 2026-07-06 (delta post-check remaining_mislabelled=0 at
  apply); no re-creation path exists (engine suppression + denylist deployed; zero contradicting
  signals in 5 days of KQL). Independent re-proof = queued V3.
- **Line 3 (live-occurrence probe — the close condition): PROVEN at volume, both principals.**
  KQL since 07-06: providerMatch matched pch-ltd.com **54**, matched qdosassist.co.uk **233**,
  intermediary connexus.co.uk 16 (by design). 246 creates: 227 mode=review_auto vs 19 manual
  (unmatched→Held by design). 60 engineerReportOverride events (the audit-email shape) cross-matched
  to live A.PCH cases. **Decisive per-case correlation: all 10 sampled audit-marker cases (4 A.PCH +
  6 A.QDOS, 07-09→10) hit caseResolve created/review_auto each immediately preceded (0–7s) by
  providerMatch matched on the expected domain** — against a background of only 127 events/23h.
  19 audit-marker cases live; their extraction stems embed the RESOLVED principal (TKT-143 W3);
  TKT-028 certified 85% match with zero resolve-path exceptions.
- **QDOS-signal finding:** the resolved A.QDOS audits came via SENDER-DOMAIN match on
  qdosassist.co.uk — not the content fallback. The "QDOS unseeded" premise is stale for that domain;
  D3's remaining live value is confirming/seeding additional QDOS domains. D3 blocks nothing in this
  acceptance.
- **Line 4 (QDOS domains supplied + seeded):** open operator data item → re-homed to ticket board D3 on
  close (orchestrator ruling above).
- Expected absences: a direct-domain-unmatched QDOS audit exercising the pure content path was not
  observed (all six domain-matched) — the content path stays pinned by unit tests + the TKT-051
  corpus probe; not an acceptance requirement. Ticket hygiene: the folder had no verification.md
  before this transcription (change record embedded in the spec).

Queued SQL V1–V5 (next data pass, corroborative): audit-marker census since the fix (expect all
has_provider=true); the original bug's shape (expect 0); the delta post-check re-proof; the QDOS/PCH
known_email_domains rows (settles the D3 wording update); per-case provenance signal.

## How to re-verify
The five banked KQL files (scratchpad q1–q5.kql, orch component, --offset 132h — retention short);
V1–V5 in the next window; ongoing: any new A.PCH/A.QDOS mint is self-proving (mint requires a
resolved provider).
