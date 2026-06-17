/* ============================================================
   Collision Engineers — Inspection-address policy gate (DOMAIN LOGIC, M1).

   Phase-1 plan §5.9. M1 scope = policy gate + manual 6-line entry only
   (candidate ranking is M2, EXIF/GPS + Azure Maps M3 — NOT built here).

   THE POLICY (`WorkProvider.inspectionLocationPolicy`):
     - 'always_image_based'  -> the provider's inspections are image-based by
                                policy. Even so there is NO SILENT image-based
                                outcome: the reviewer must record the decision +
                                reason (the policy supplies the default reason,
                                but the explicit decision is still required).
     - 'prefer_address'      -> DEFAULT for unknown providers. Attempt a physical
                                address; fall back to image-based ONLY with an
                                explicit reviewer decision + reason.
     - 'required_address'    -> image-based ONLY by Management override (audited),
                                always with a reason.

   THE INVIOLABLE RULE: no path yields an "Image Based Assessment" without an
   explicit reviewer decision carrying a non-empty reason. When a reason is
   absent, the resolver returns a *gate* (needsReviewerDecision /
   needsManagementOverride), NEVER a resolved image-based decision.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No React, no I/O, no live calls.
   ============================================================ */

/** Binding inspection-location policy enum (data-model.md / provider-corpus.md).
 *  Supersedes the stale prototype `'physical'|'image_based'|'mixed'` (Risk #6). */
export type InspectionLocationPolicy =
  | 'always_image_based'
  | 'prefer_address'
  | 'required_address';

/** Default policy for an unknown/unmatched provider (§5.9). */
export const DEFAULT_INSPECTION_POLICY: InspectionLocationPolicy = 'prefer_address';

/** The canonical image-based address literal (EVA field 9 alternative form). */
export const IMAGE_BASED_LITERAL = 'Image Based Assessment';

/** `decisionMode` recorded on the InspectionAddress row. */
export type InspectionDecisionMode =
  | 'confirmed_physical'
  | 'manual'
  | 'image_based'
  | 'unknown';

/** An explicit reviewer decision. `reason` MUST be non-empty for any image-based outcome. */
export interface ReviewerDecision {
  /** What the reviewer chose. */
  choice: 'use_physical_address' | 'image_based';
  /** Free-text reason. Required (non-empty) to authorise an image-based outcome. */
  reason?: string;
  /** Management override flag — required to go image-based under 'required_address'. */
  managementOverride?: boolean;
}

export interface InspectionDecisionResult {
  /** The resolved decision mode, or undefined while a gate is open. */
  decisionMode?: InspectionDecisionMode;
  /** The serialized inspection-address value when resolved image-based. */
  resolvedAddressLiteral?: typeof IMAGE_BASED_LITERAL;
  /** Reviewer must make an explicit image-based-vs-address decision (+reason). */
  needsReviewerDecision: boolean;
  /** Management override (+reason) required before image-based is permitted. */
  needsManagementOverride: boolean;
  /** True only when an image-based outcome was authorised WITH a reason. */
  imageBased: boolean;
  /** The recorded reason (echoed for audit), when present. */
  reason?: string;
}

/** A reason is valid only when it is a non-empty trimmed string. */
function hasReason(reason: string | undefined): reason is string {
  return typeof reason === 'string' && reason.trim().length > 0;
}

/**
 * Resolve the inspection-location decision for a case.
 *
 * @param policy               the provider's inspectionLocationPolicy.
 * @param hasPhysicalAddress   whether a usable physical address is present.
 * @param reviewerDecision     the explicit reviewer decision, when one exists.
 *
 * Image-based is NEVER returned without a non-empty reason — instead a gate
 * flag is raised so the UI/flow forces the explicit decision.
 */
export function resolveInspectionDecision(
  policy: InspectionLocationPolicy,
  hasPhysicalAddress: boolean,
  reviewerDecision?: ReviewerDecision,
): InspectionDecisionResult {
  switch (policy) {
    /* ----- always_image_based -----
       Image-based by policy, but still requires an explicit decision + reason.
       The policy itself does not silently resolve it. */
    case 'always_image_based': {
      if (reviewerDecision?.choice === 'use_physical_address' && hasPhysicalAddress) {
        // Reviewer overrode policy toward a physical address — allowed, no reason needed.
        return {
          decisionMode: 'manual',
          needsReviewerDecision: false,
          needsManagementOverride: false,
          imageBased: false,
        };
      }
      if (hasReason(reviewerDecision?.reason)) {
        return resolvedImageBased(reviewerDecision!.reason!);
      }
      return gate('reviewer');
    }

    /* ----- prefer_address (default for unknown providers) -----
       Prefer the physical address; image-based only on explicit reviewer
       decision + reason. */
    case 'prefer_address': {
      if (hasPhysicalAddress && reviewerDecision?.choice !== 'image_based') {
        return {
          decisionMode: 'manual',
          needsReviewerDecision: false,
          needsManagementOverride: false,
          imageBased: false,
        };
      }
      // Either no physical address, or reviewer explicitly chose image-based.
      if (reviewerDecision?.choice === 'image_based' && hasReason(reviewerDecision.reason)) {
        return resolvedImageBased(reviewerDecision.reason!);
      }
      return gate('reviewer');
    }

    /* ----- required_address -----
       Physical address expected; image-based ONLY by Management override + reason. */
    case 'required_address': {
      if (hasPhysicalAddress && reviewerDecision?.choice !== 'image_based') {
        return {
          decisionMode: 'confirmed_physical',
          needsReviewerDecision: false,
          needsManagementOverride: false,
          imageBased: false,
        };
      }
      // Going image-based here demands a Management override carrying a reason.
      if (
        reviewerDecision?.choice === 'image_based' &&
        reviewerDecision.managementOverride === true &&
        hasReason(reviewerDecision.reason)
      ) {
        return resolvedImageBased(reviewerDecision.reason!);
      }
      return gate('management');
    }
  }
}

/* ----------  Internal builders  ---------- */

function resolvedImageBased(reason: string): InspectionDecisionResult {
  return {
    decisionMode: 'image_based',
    resolvedAddressLiteral: IMAGE_BASED_LITERAL,
    needsReviewerDecision: false,
    needsManagementOverride: false,
    imageBased: true,
    reason: reason.trim(),
  };
}

function gate(kind: 'reviewer' | 'management'): InspectionDecisionResult {
  return {
    // No decisionMode resolved while a gate is open — 'unknown' until decided.
    decisionMode: 'unknown',
    needsReviewerDecision: kind === 'reviewer',
    needsManagementOverride: kind === 'management',
    imageBased: false,
  };
}
