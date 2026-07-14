# Reopen follow-up — 2026-07-14

The independent PLAN-005 sweep found a fresh live counterexample and returned **FAILED**.

At 2026-07-13 12:22:46Z a real message from `@connexus.co.uk` contained explicit Performance Car Hire
evidence, including the provider name and `performancecarhire.co.uk` domain. Both attachments parsed, but
the live path still classified the arrival as `receiving_work/new_client_work` and created manual Held case
`d5c30230-7cca-4d3c-8243-4b44f10ddb68` instead of resolving the PCH principal.

## Required repair

- Trace the parsed provider signal through the Connexus intermediary content-resolution seam.
- Resolve explicit PCH and SBL content to the correct principal before the generic new-client/manual-Held
  path.
- Preserve the explicit unresolved-principal Held path when neither candidate can be determined.
- Keep the source-aware Held wording from the 2026-07-11 regression repair.
- Add the exact PCH-shaped counterexample as a regression fixture without embedding mailbox secrets.
- Deploy through the normal Azure route, then wait for naturally occurring PCH, SBL and unresolved Connexus
  messages for independent live verification; do not send synthetic production mail.

The complete read-only evidence and repeatable verification steps are in `../verification.md`.
