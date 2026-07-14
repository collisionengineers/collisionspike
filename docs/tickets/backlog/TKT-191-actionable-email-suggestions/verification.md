# Verification — TKT-191: Suggest email replies and urgency only when justified

## Verdict
PENDING — the required cohort audit has not been completed and no implementation, offline evaluation or signed-in live proof has been supplied.

## Acceptance-to-evidence matrix

| Acceptance | Required offline proof | Required signed-in live proof | Verdict |
| --- | --- | --- | --- |
| A1 — representative cohort independently labelled | Versioned cohort manifest covers every named class, stores independent labels/rationale and records adjudication of disagreements. | Read-only signed-in reconciliation checks every live-backed manifest identifier, or records a specific unavailable/retention reason; no sample is claimed as full reconciliation. | PENDING |
| A2 — Reply needed requires a clear case-specific request | Rule/schema tests include positive request/question/confirmation examples and negative sender/category/attachment/greeting/information-only counterexamples. | Signed-in shadow/rendered review of representative live positives shows each suggestion points to a real unanswered request and no negative example is labelled positive. | PENDING |
| A3 — uncertainty and bulk/automatic safeguards | Cohort evaluation tests assert uncertain copy on conflicts/gaps and no positive reply label on non-request newsletters, promotions, acknowledgements or out-of-office messages. | Signed-in review of the full current mass-email cohort shows every unsupported positive suppressed or uncertain, with operator adjudication recorded. | PENDING |
| A4 — Urgent requires a concrete time-sensitive reason | Tests cover explicit deadlines/appointments/time-bound instructions plus negative capitals, punctuation, sender, category and bulk-arrival examples. | Every signed-in live Urgent example in the shadow cohort displays and links to an actual deadline/time-bound fact; no unsupported Urgent remains. | PENDING |
| A5 — explanations are concise and handler-facing | Rendered-copy tests assert the cited request/deadline/missing context and reject scores, prompt/internal/service terms and all app-copy banned language. | Signed-in screenshots of positive and uncertain reply/urgency advice show understandable explanations matching the underlying email/thread fact. | PENDING |
| A6 — advisory only and separate from filing | Component/integration mutation guards prove suggestion display/evaluation performs no send, draft, move, case or status write and is visually separate from filing. | Signed-in network and audit capture while viewing suggestions shows no mutation; no email/case changes until a distinct handler action is deliberately invoked. | PENDING |
| A7 — zero unsupported mass-email positives before rollout | Reproducible evaluation report against the operator-approved cohort shows zero unsupported Reply needed and Urgent results and documents every uncertain/disagreement outcome. | Signed-in operator adjudication of every current cohort result confirms the zero-unsupported-positive result before the feature is made visible generally. | PENDING |
| A8 — explicit correction action appends evidence | Domain/integration tests exercise every “Change suggestion” choice, required reason, preserved original suggestion/version and zero email/case mutation. | Signed in, use the correction control on an operator-designated suggestion and reconcile visible history/audit/evaluation data to the untouched original email. | PENDING |
| A9 — consistent and accessible presentation | Shared rendering tests compare inbox/preview/detail; keyboard, accessible-name, narrow and 200% zoom checks pass with exact plain-language copy. | Signed-in captures of every surface at desktop/narrow/200% show consistent advice and successful keyboard/screen-reader access. | PENDING |

## Required artifact
- [Email suggestion cohort audit](./evidence/email-suggestion-cohort-audit.md) — PENDING.
