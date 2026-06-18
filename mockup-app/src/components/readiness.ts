import {
  EVA_FIELD_ORDER,
  type Case,
  type Evidence,
  type MissingItem,
} from '../mock';

/** A single deterministic readiness check result. */
export interface ChecklistItem {
  id: string;
  label: string;
  ok: boolean;
  /** Category, for grouping/iconography. */
  group: 'fields' | 'images' | 'address' | 'conflicts';
  /** Optional detail shown when not ok. */
  detail?: string;
}

export interface ReadinessResult {
  items: ChecklistItem[];
  /** Derived Missing list (every failed item). */
  missing: MissingItem[];
  /** True only when every item passes. */
  ready: boolean;
}

const acceptedImages = (c: Case): Evidence[] =>
  c.evidence.filter((e) => e.kind === 'image' && e.acceptedForEva && !e.excluded);

/**
 * Deterministically compute EVA readiness for a Case:
 *  - all REQUIRED 12-field entries non-empty
 *  - image rules: ≥2 accepted images incl. ≥1 overview (registration visible)
 *    + ≥1 damage_closeup
 *  - inspection-address decision made (not "unknown")
 *  - no field left in "conflict" review state
 *
 * Pure + side-effect free so the UI and any export path agree.
 */
export function computeReadiness(c: Case): ReadinessResult {
  const items: ChecklistItem[] = [];

  // 1. Required fields valid.
  for (const desc of EVA_FIELD_ORDER) {
    if (!desc.required) continue;
    const field = c.evaFields[desc.key];
    const ok = field.value.trim().length > 0;
    items.push({
      id: `field-${desc.key}`,
      label: `${desc.label} present`,
      ok,
      group: 'fields',
      detail: ok ? undefined : `${desc.label} is empty`,
    });
  }

  // 2. Image rules.
  const imgs = acceptedImages(c);
  const hasOverview = imgs.some((e) => e.imageRole === 'overview' && e.registrationVisible);
  const hasCloseup = imgs.some((e) => e.imageRole === 'damage_closeup');
  const atLeastTwo = imgs.length >= 2;

  items.push({
    id: 'img-count',
    label: '≥2 EVA images accepted',
    ok: atLeastTwo,
    group: 'images',
    detail: atLeastTwo ? undefined : `Only ${imgs.length} accepted image(s)`,
  });
  items.push({
    id: 'img-overview',
    label: 'Overview photo with registration visible',
    ok: hasOverview,
    group: 'images',
    detail: hasOverview ? undefined : 'No overview image with a visible registration',
  });
  items.push({
    id: 'img-closeup',
    label: 'Main-damage closeup present',
    ok: hasCloseup,
    group: 'images',
    detail: hasCloseup ? undefined : 'No damage-closeup image accepted',
  });

  // 3. Inspection-address decision.
  const addrOk = c.inspectionDecision !== 'unknown';
  items.push({
    id: 'address-decision',
    label:
      c.inspectionDecision === 'image_based'
        ? 'Inspection address: Image Based Assessment (override)'
        : 'Inspection address decided',
    ok: addrOk,
    group: 'address',
    detail: addrOk ? undefined : 'No inspection-address decision made',
  });

  // 4. No conflicts.
  const conflictFields = EVA_FIELD_ORDER.filter(
    (d) => c.evaFields[d.key].reviewState === 'conflict',
  );
  const noConflicts = conflictFields.length === 0;
  items.push({
    id: 'no-conflicts',
    label: 'No unresolved field conflicts',
    ok: noConflicts,
    group: 'conflicts',
    detail: noConflicts
      ? undefined
      : `Conflict in: ${conflictFields.map((d) => d.label).join(', ')}`,
  });

  const missing: MissingItem[] = items
    .filter((i) => !i.ok)
    .map((i) => ({
      kind:
        i.group === 'fields'
          ? 'required_field'
          : i.group === 'images'
            ? 'image_rule'
            : i.group === 'address'
              ? 'inspection_address'
              : 'conflict',
      label: i.detail ?? i.label,
    }));

  return { items, missing, ready: missing.length === 0 };
}
