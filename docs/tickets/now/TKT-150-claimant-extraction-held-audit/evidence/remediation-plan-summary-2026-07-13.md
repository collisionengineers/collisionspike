# Blank-claimant source replay plan — 2026-07-13

> **prior evidence only — never approved for apply.** This 134-case v1 snapshot was
> generated against `engine-v2.23`; current code is newer and PLAN-005 requires a fresh,
> separately checksummed v2 plan. Its broad non-claimant suggestions are outside the final
> TKT-150 remediation allowlist.

This was a read-only, source-backed planning run after `engine-v2.23` was deployed. It read
Postgres, retained evidence in Blob/Archive, and the deployed parser. It did not change any case,
mailbox item, Blob, or Archive item. The temporary caller-IP Postgres rule was removed; final
readback showed only `AllowAzureServices`.

The earlier 132-case census had grown to **134** active blank-claimant cases before this run. The
hash-protected full plan contains live personal data and is intentionally not retained in Git; the
hash below preserves its prior identity without making it an apply artifact.

- Plan contract: `tkt150-claimant-remediation-plan-v1`
- Internal plan integrity: `5e3ee846f7ee9d0975e08559aa263a6b8f60bf8e09bfabea640e1d6e012cdc95`
- Evidence-file SHA-256: `0d42eae6da1e446b85f1e53933c54d468e53fae7b0a087e73eaee8ccc236c500`
- Repaired candidates: **37** — 14 from retained documents and 23 from retained email text
- Absent in source: **96**
- Conflicting: **0**
- Failed: **1** — one case retains an empty `images.pdf` (zero bytes; parser 400). Its retained
  email body yielded no defensible claimant, so this remains an actionable failed-source case; the exact
  Case/PO remains only in the external prior artifact.

Queue ownership before apply:

| Queue | Repaired | Absent in source | Failed |
|---|---:|---:|---:|
| Held | 4 | 55 | 0 |
| Not Ready | 9 | 15 | 0 |
| Review | 24 | 26 | 1 |

The plan also found safe fill-only improvements alongside claimant repair: 32 overview claim
references, 8 case references, 7 loss dates, 7 instruction dates, 6 accident-circumstance values,
4 claimant telephone numbers, 3 claimant emails, and 2 mileage-unit values. Every proposed value
is tied to retained evidence and is applied only if the corresponding live field still matches the
blank before-value.

QDOS26079 now replays successfully from its retained earlier Word instruction. The plan recovers its
claimant, provider reference, loss date, and instruction date from the retained DOC source, with the
email body independently agreeing on the claimant. The exact evidence UUID remains outside Git with
the raw plan. No parser or source-read failure remained for that case.

The apply step remains separate and guarded: it verifies this plan hash, locks one case at a time,
rejects changed/held/status/merged rows, fills only blank fields, records current-value provenance
and a redacted before/after audit, recomputes readiness from the canonical domain implementation,
and emits a complete post-run ledger.
