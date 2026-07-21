/* ============================================================
   Collision Engineers — EVA image rules contract (CANONICAL).

   Re-implements collisioncc `src/lib/image-rules.ts`
   `validateEvaImageRequirements`, aligned with the web app's
   `apps/web/src/shared/ui/readiness.ts` image checks.

   The EVA upload set must satisfy:
     - >= 2 accepted images, AND
     - >= 1 `overview` whose registration is visible (full reg on the photo), AND
     - >= 1 `damage_closeup`.

   "Accepted" = image-kind evidence that staff accepted for EVA and that is
   NOT excluded (e.g. a person's reflection makes a photo unusable). This
   matches `readiness.ts`'s `acceptedImages` predicate
   (`kind === 'image' && acceptedForEva && !excluded`); the collisioncc
   original lacked the `!excluded` clause — the prototype is the authority here.

   THOSE THREE RULES ARE THE WHOLE CONTRACT (TKT-130, operator ruling
   2026-07-21). There is deliberately NO "image reviewed / not reviewed" state
   here. An earlier `evaluateEvaImageReadiness` added a fourth gate that held a
   case whenever the classifier had auto-excluded a photo that no person had
   confirmed. That is not a missing requirement: the photo is already excluded,
   so it never counted toward the three rules above, and holding a complete case
   because a machine discarded a spare photo made Not-ready mean something other
   than "the EVA requirements aren't met". The classifier's opinion still shows
   on the Evidence tab as advisory copy (`Evidence.reviewRequired`, which the SPA
   reads) — it simply no longer decides readiness. Do not reintroduce it.

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
}

/** Stable codes for each rule failure (UI / flow can branch on these). */
export type ImageRuleCode = 'min_count' | 'missing_overview' | 'missing_damage_closeup';

export interface ImageRuleFailure {
  code: ImageRuleCode;
  message: string;
}

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
 * Thin validator returning just the ordered failure list — the shape the
 * status guard consumes (mirrors collisioncc `validateEvaImageRequirements`,
 * which returned `string[]`; here it returns structured failures).
 */
export function validateEvaImageRules(
  evidence: readonly ImageRuleEvidence[],
): ImageRuleFailure[] {
  return evaluateEvaImageRules(evidence).failures;
}
