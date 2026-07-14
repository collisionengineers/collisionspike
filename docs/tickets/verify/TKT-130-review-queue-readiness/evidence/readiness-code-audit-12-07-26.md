# Readiness code audit — 2026-07-12

- `packages/domain/src/contracts/case-status.ts:197-260` deliberately ignores review state and can emit `needs_review` for combined field/image failures or `ready_for_eva` with unresolved field conflict.
- `packages/domain/src/model/queues.ts:59-87,132-155` maps `needs_review` into Review under the now-superseded rule.
- `mockup-app/src/components/readiness.ts:40-129` is a separate evaluator and does not treat every unresolved `needs_review` field as a blocker.
- `packages/domain/src/contracts/eva-readiness.parity.test.ts:328-371` documents disagreement between evaluators.
- `packages/domain/src/contracts/eva-export.ts:78-90` identifies required EVA fields including claimant and vehicle model.
- `packages/domain/src/contracts/image-rules.ts:53-86` already rejects excluded images at the image-rule layer, but queue mapping does not consistently consume one canonical result.

This was a read-only source audit; no case state was recomputed.
