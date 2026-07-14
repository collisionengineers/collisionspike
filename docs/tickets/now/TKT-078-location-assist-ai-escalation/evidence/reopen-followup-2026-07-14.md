# PLAN-005 reopen follow-up — 2026-07-14

Independent verification returned `FAILED`: the sole `MAX_AI_PHOTOS=4` limit is per-request photo
counting. No per-case/day counter or N+1 refusal/logging path exists in exact main `308294c`.

Reopen TKT-078 to implement the durable cap contract and registry tracking before attempting the pending
operator-approved hard-photo live proof.
