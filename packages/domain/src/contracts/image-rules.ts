/* ============================================================
   Collision Engineers — EVA image rules contract (CANONICAL).

   Re-implements collisioncc `src/lib/image-rules.ts`
   `validateEvaImageRequirements`, aligned with the prototype's
   `mockup-app/src/components/readiness.ts` image checks.

   The EVA upload set must satisfy:
     - >= 2 accepted images, AND
     - >= 1 `overview` whose registration is visible (full reg on the photo), AND
     - >= 1 `damage_closeup`.

   "Accepted" = image-kind evidence that staff accepted for EVA and that is
   NOT excluded (e.g. a person's reflection makes a photo unusable). This
   matches `readiness.ts`'s `acceptedImages` predicate
   (`kind === 'image' && acceptedForEva && !excluded`); the collisioncc
   original lacked the `!excluded` clause — the prototype is the authority here.

   PURE + DETERMINISTIC + FRAMEWORK-FREE.
   ============================================================ */

/** Image role classification (superset-compatible with the prototype `ImageRole`). */
export type ImageRole = 'overview' | 'damage_closeup' | 'additional' | 'unknown';

/** The minimum a piece of evidence must expose for the image rules. */
export interface ImageRuleEvidence {
  /** Discriminator; only `'image'` evidence is considered. */
  kind: string;
  imageRole: ImageRole;
  /**
   * Registration legible on the photo — set by the parser/OCR Function, not by
   * staff (M1 semantics: does the image's OCR text contain the case VRM?). The
   * overview rule requires this `true` on at least one accepted overview image.
   */
  registrationVisible: boolean;
  /** Has staff accepted this image into the EVA upload set? */
  acceptedForEva: boolean;
  /** Flagged unusable (e.g. a person's reflection is visible). */
  excluded?: boolean;
  /**
   * An automatic image decision still needs a person to confirm it. A case with
   * any such unresolved image cannot be ready even when its other accepted
   * images happen to satisfy the count/role rules.
   */
  reviewRequired?: boolean;
}

/** Stable codes for each rule failure (UI / flow can branch on these). */
export type ImageRuleCode = 'min_count' | 'missing_overview' | 'missing_damage_closeup';

export interface ImageRuleFailure {
  code: ImageRuleCode;
  message: string;
}

/** A readiness-owned image gap. Base EVA rule failures retain their stable
 * codes; unresolved automatic decisions are the one additional image gate
 * shared by status, the checklist and chaser availability. */
export type ImageReadinessGap =
  | ImageRuleFailure
  | {
      code: 'review_required';
      message: string;
      count: number;
    };

/** Minimum accepted images required for an EVA upload set. */
export const MIN_ACCEPTED_IMAGES = 2;

/** True when the evidence item counts toward the EVA upload set. */
export function isAcceptedEvaImage(e: ImageRuleEvidence): boolean {
  return e.kind === 'image' && e.acceptedForEva && e.excluded !== true;
}

/** The accepted EVA image subset, in input order (deterministic). */
export function acceptedEvaImages(
  evidence: readonly ImageRuleEvidence[],
): ImageRuleEvidence[] {
  return evidence.filter(isAcceptedEvaImage);
}

/** A complete pass/fail summary for the EVA image rules. */
export interface ImageRuleResult {
  ok: boolean;
  acceptedCount: number;
  hasOverview: boolean;
  hasDamageCloseup: boolean;
  failures: ImageRuleFailure[];
}

/** The complete image-readiness verdict used by every case surface. */
export interface EvaImageReadinessResult {
  ok: boolean;
  rules: ImageRuleResult;
  unresolvedReviewCount: number;
  gaps: ImageReadinessGap[];
}

/**
 * Evaluate the EVA image rules over a Case's evidence.
 * Returns structured failures in a stable order (count, overview, closeup).
 */
export function evaluateEvaImageRules(
  evidence: readonly ImageRuleEvidence[],
): ImageRuleResult {
  const accepted = acceptedEvaImages(evidence);
  const acceptedCount = accepted.length;
  const hasOverview = accepted.some(
    (e) => e.imageRole === 'overview' && e.registrationVisible,
  );
  const hasDamageCloseup = accepted.some((e) => e.imageRole === 'damage_closeup');

  const failures: ImageRuleFailure[] = [];
  if (acceptedCount < MIN_ACCEPTED_IMAGES) {
    failures.push({
      code: 'min_count',
      message: `At least ${MIN_ACCEPTED_IMAGES} accepted EVA images are required (have ${acceptedCount}).`,
    });
  }
  if (!hasOverview) {
    failures.push({
      code: 'missing_overview',
      message:
        'At least one overview image with a visible registration is required.',
    });
  }
  if (!hasDamageCloseup) {
    failures.push({
      code: 'missing_damage_closeup',
      message: 'At least one main-damage close-up image is required.',
    });
  }

  return {
    ok: failures.length === 0,
    acceptedCount,
    hasOverview,
    hasDamageCloseup,
    failures,
  };
}

/**
 * Evaluate every readiness-owned image gate in stable order.
 *
 * A person's-reflection observation is deliberately not a gap by itself. It
 * affects this verdict only when another persisted decision marks the image
 * excluded or awaiting review, preserving the Image Based Assessment exception.
 */
export function evaluateEvaImageReadiness(
  evidence: readonly ImageRuleEvidence[],
): EvaImageReadinessResult {
  const rules = evaluateEvaImageRules(evidence);
  const unresolvedReviewCount = evidence.filter(
    (item) => item.kind === 'image' && item.reviewRequired === true,
  ).length;
  const gaps: ImageReadinessGap[] = [...rules.failures];
  if (unresolvedReviewCount > 0) {
    gaps.push({
      code: 'review_required',
      message: `${unresolvedReviewCount} image${unresolvedReviewCount === 1 ? '' : 's'} still ${unresolvedReviewCount === 1 ? 'needs' : 'need'} review.`,
      count: unresolvedReviewCount,
    });
  }
  return {
    ok: gaps.length === 0,
    rules,
    unresolvedReviewCount,
    gaps,
  };
}

/**
 * Thin validator returning just the ordered failure list — the shape the
 * status guard consumes (mirrors collisioncc `validateEvaImageRequirements`,
 * which returned `string[]`; here it returns structured failures).
 */
export function validateEvaImageRules(
  evidence: readonly ImageRuleEvidence[],
): ImageRuleFailure[] {
  return evaluateEvaImageRules(evidence).failures;
}
