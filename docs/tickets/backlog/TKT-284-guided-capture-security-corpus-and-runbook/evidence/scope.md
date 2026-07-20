# Scope — TKT-284 (formerly CCAP-015)

Already covered by TKT-200's test suites: rate limiting, blob security, HS256 pinning, replay/idempotency/
duplicate-completion. Not covered: a consolidated checked-in probe corpus, and a runbook (the original
spec named `docs/azure/capture-verify.md` — no `docs/azure/` directory exists in this repository) to
re-run those probes per environment, including post-deploy once TKT-283's CI deploy job exists.
