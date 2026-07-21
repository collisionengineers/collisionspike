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
  group: 'fields' | 'images' | 'address' | 'vehicle' | 'source';
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

  const MISSING_KIND_BY_GROUP: Record<ChecklistItem['group'], MissingItem['kind']> = {
    fields: 'required_field',
    vehicle: 'required_field',
    images: 'image_rule',
    address: 'inspection_address',
    source: 'source_evidence',
  };

  const missing: MissingItem[] = items
    .filter((i) => !i.ok)
    .map((i) => ({
      kind: MISSING_KIND_BY_GROUP[i.group],
      label: i.detail ?? i.label,
    }));

  return { items, missing, ready: canonical.ready };
}
