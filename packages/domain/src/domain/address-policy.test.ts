import { describe, it, expect } from 'vitest';
import {
  resolveInspectionDecision,
  DEFAULT_INSPECTION_POLICY,
  IMAGE_BASED_LITERAL,
  type InspectionLocationPolicy,
  type ReviewerDecision,
} from './address-policy';

/* ----------  Defaults  ---------- */

describe('inspection-address policy — defaults', () => {
  it("prefer_address is the unknown-provider default", () => {
    expect(DEFAULT_INSPECTION_POLICY).toBe<InspectionLocationPolicy>('prefer_address');
  });
});

/* ----------  always_image_based  ---------- */

describe('always_image_based', () => {
  it('does NOT silently resolve image-based — gates for a reviewer decision', () => {
    const r = resolveInspectionDecision('always_image_based', false);
    expect(r.imageBased).toBe(false);
    expect(r.needsReviewerDecision).toBe(true);
    expect(r.resolvedAddressLiteral).toBeUndefined();
  });

  it('resolves image-based ONLY with an explicit decision + reason', () => {
    const decision: ReviewerDecision = { choice: 'image_based', reason: 'policy: no site access' };
    const r = resolveInspectionDecision('always_image_based', false, decision);
    expect(r.imageBased).toBe(true);
    expect(r.decisionMode).toBe('image_based');
    expect(r.resolvedAddressLiteral).toBe(IMAGE_BASED_LITERAL);
    expect(r.reason).toBe('policy: no site access');
  });

  it('an image-based choice with an EMPTY reason is rejected (still gated)', () => {
    const decision: ReviewerDecision = { choice: 'image_based', reason: '   ' };
    const r = resolveInspectionDecision('always_image_based', false, decision);
    expect(r.imageBased).toBe(false);
    expect(r.needsReviewerDecision).toBe(true);
  });

  it('reviewer may override toward a physical address (no reason needed)', () => {
    const decision: ReviewerDecision = { choice: 'use_physical_address' };
    const r = resolveInspectionDecision('always_image_based', true, decision);
    expect(r.imageBased).toBe(false);
    expect(r.decisionMode).toBe('manual');
  });
});

/* ----------  prefer_address  ---------- */

describe('prefer_address', () => {
  it('with a physical address and no override -> manual physical (not image-based)', () => {
    const r = resolveInspectionDecision('prefer_address', true);
    expect(r.imageBased).toBe(false);
    expect(r.decisionMode).toBe('manual');
    expect(r.needsReviewerDecision).toBe(false);
  });

  it('no physical address -> gates for a reviewer decision (never silent image-based)', () => {
    const r = resolveInspectionDecision('prefer_address', false);
    expect(r.imageBased).toBe(false);
    expect(r.needsReviewerDecision).toBe(true);
    expect(r.resolvedAddressLiteral).toBeUndefined();
  });

  it('image-based only with an explicit decision + reason', () => {
    const decision: ReviewerDecision = { choice: 'image_based', reason: 'vehicle at unknown salvage yard' };
    const r = resolveInspectionDecision('prefer_address', false, decision);
    expect(r.imageBased).toBe(true);
    expect(r.resolvedAddressLiteral).toBe(IMAGE_BASED_LITERAL);
  });

  it('reviewer chooses image-based even though an address exists -> needs a reason', () => {
    const noReason: ReviewerDecision = { choice: 'image_based' };
    const r = resolveInspectionDecision('prefer_address', true, noReason);
    expect(r.imageBased).toBe(false);
    expect(r.needsReviewerDecision).toBe(true);

    const withReason: ReviewerDecision = { choice: 'image_based', reason: 'address unreliable' };
    const r2 = resolveInspectionDecision('prefer_address', true, withReason);
    expect(r2.imageBased).toBe(true);
  });
});

/* ----------  required_address  ---------- */

describe('required_address', () => {
  it('with a physical address -> confirmed_physical', () => {
    const r = resolveInspectionDecision('required_address', true);
    expect(r.imageBased).toBe(false);
    expect(r.decisionMode).toBe('confirmed_physical');
    expect(r.needsManagementOverride).toBe(false);
  });

  it('no address -> gates for a Management override (never silent image-based)', () => {
    const r = resolveInspectionDecision('required_address', false);
    expect(r.imageBased).toBe(false);
    expect(r.needsManagementOverride).toBe(true);
    expect(r.resolvedAddressLiteral).toBeUndefined();
  });

  it('image-based requires BOTH a management override AND a reason', () => {
    const noOverride: ReviewerDecision = { choice: 'image_based', reason: 'no site' };
    expect(resolveInspectionDecision('required_address', false, noOverride).imageBased).toBe(false);

    const noReason: ReviewerDecision = { choice: 'image_based', managementOverride: true };
    expect(resolveInspectionDecision('required_address', false, noReason).imageBased).toBe(false);

    const ok: ReviewerDecision = { choice: 'image_based', managementOverride: true, reason: 'salvage, no access' };
    const r = resolveInspectionDecision('required_address', false, ok);
    expect(r.imageBased).toBe(true);
    expect(r.resolvedAddressLiteral).toBe(IMAGE_BASED_LITERAL);
  });
});

/* ----------  The inviolable rule: no silent "Image Based Assessment"  ---------- */

describe('no path yields image-based without a non-empty reason', () => {
  const policies: InspectionLocationPolicy[] = [
    'always_image_based',
    'prefer_address',
    'required_address',
  ];
  const reasonless: Array<ReviewerDecision | undefined> = [
    undefined,
    { choice: 'image_based' },
    { choice: 'image_based', reason: '' },
    { choice: 'image_based', reason: '   ' },
    { choice: 'image_based', managementOverride: true }, // override but no reason
    { choice: 'use_physical_address' },
  ];

  for (const policy of policies) {
    for (const hasAddr of [true, false]) {
      for (const decision of reasonless) {
        it(`${policy} / hasAddress=${hasAddr} / ${JSON.stringify(decision)} -> never image-based without a reason`, () => {
          const r = resolveInspectionDecision(policy, hasAddr, decision);
          if (r.imageBased) {
            // If it ever claims image-based, it MUST carry a non-empty reason
            // and the canonical literal — this branch should never run here.
            expect(r.reason && r.reason.trim().length).toBeGreaterThan(0);
          } else {
            expect(r.resolvedAddressLiteral).toBeUndefined();
          }
        });
      }
    }
  }

  it('every resolved image-based outcome carries the literal AND a reason', () => {
    const decision: ReviewerDecision = { choice: 'image_based', reason: 'r', managementOverride: true };
    for (const policy of policies) {
      const r = resolveInspectionDecision(policy, false, decision);
      if (r.imageBased) {
        expect(r.resolvedAddressLiteral).toBe(IMAGE_BASED_LITERAL);
        expect(r.reason).toBe('r');
      }
    }
  });
});
