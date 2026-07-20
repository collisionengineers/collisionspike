# Verification — TKT-271: Establish the anti-drift guard doctrine and meta-guard

## Verdict

PASS

## Evidence

- **A1 — doctrine.** ADR-0033 and `docs/governance/anti-drift-guards.md` define the four guard modes,
  production scoping, and the no-lexical-ban rule; both resolve and are linked (ADR README index;
  governance README bullet). `node scripts/checks/check-doc-links.mjs` passes.
- **A2 — classification.** `node scripts/checks/check-tickets.mjs` passes with the new `plan-kind`
  requirement over all twelve backfilled plans. The four consolidation plans carry the terminal-guard
  triple with each guard ticket a plan member.
- **A3 — derived register + meta-check.** `node scripts/checks/check-guard-register.mjs` derives the four
  registered guards and passes with zero findings. The register is computed from plan metadata, not
  hand-maintained. `node --test scripts/checks/check-guard-register.test.mjs` — 13/13 pass, covering the
  missing-kind, missing-guard, non-member, invalid-mode, unwired-command, not-a-script, and missing-fixture
  negative cases plus the real-corpus happy path and the real fixture probe for both source and behavioural
  modes.
- **A4 — CI + fixtures.** `check:guard-register` and `check:parity` are in `verify-all.mjs`'s `checks`
  array (offline aggregate) and in `package.json` scripts. `npm run check:parity` runs the `parser-parity`
  guard in isolation (4/4 tests pass). Each registered guard's mode-appropriate fixtures are asserted
  present by the meta-check's fixture probe.
- **A5 — no live write.** Only docs, plan frontmatter, checks, and tests changed.

## Commands

```
node scripts/checks/check-tickets.mjs
node scripts/checks/check-guard-register.mjs
node --test scripts/checks/check-guard-register.test.mjs
npm run check:parity
node scripts/checks/check-doc-links.mjs
```

## Pending / gaps

None.
