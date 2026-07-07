# Operator plan excerpt — § 8 Housekeeping (varchar(16) overflow clamp)

> From `PLAN-assistant-intake-search-fixes.md` (planning session 2026-07-06). The full plan is
> preserved at
> [TKT-066 evidence](../../../verify/TKT-066-assistant-lookup-observability/evidence/operator-note.md).

Bonus live finding (diagnostic summary): 03/07 API errors
`value too long for type character varying(16)` on an internal (`withServiceAuth`) route — a
field (likely a ref/VRM candidate) exceeds its column; needs a clamp.

Housekeeping: clamp the `varchar(16)` overflow (identify the failing internal-route field from
the 03/07 stack, truncate at the mapper).
