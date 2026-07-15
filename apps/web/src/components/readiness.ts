import {
  readinessForCase,
  type Case,
  type MissingItem,
} from '@cs/domain';

/** A single deterministic readiness check result. */
export interface ChecklistItem {
  id: string;
  label: string;
  ok: boolean;
  /** Category, for grouping/iconography. */
  group: 'fields' | 'images' | 'address' | 'vehicle' | 'conflicts' | 'source';
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

/**
 * UI adapter over the canonical domain evaluator. It does not recalculate any
 * readiness rule; it only projects the shared checks into the existing
 * checklist/missing-item presentation shape.
 */
export function computeReadiness(c: Case): ReadinessResult {
  const canonical = readinessForCase(c);
  const items: ChecklistItem[] = canonical.checks.map((check) => ({ ...check }));

  const missing: MissingItem[] = items
    .filter((i) => !i.ok)
    .map((i) => ({
      kind:
        i.group === 'fields' || i.group === 'vehicle'
          ? 'required_field'
          : i.group === 'images'
            ? 'image_rule'
            : i.group === 'address'
              ? 'inspection_address'
              : i.group === 'source'
                ? 'source_evidence'
                : 'conflict',
      label: i.detail ?? i.label,
    }));

  return { items, missing, ready: canonical.ready };
}
