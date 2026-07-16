/** metadata — reusable feature support. */

import { type InvocationContext } from '@azure/functions';
import { query, type TxQuery } from '../../platform/db/client.js';
import { requestArchiveMirrorIfEligible, type ArchiveMirrorCandidate } from '../archive/mirror-outbox.js';

export async function applyEvidenceMetadata(
  _ctx: InvocationContext,
  whereClause: string,
  whereVals: unknown[],
  row: {
    imageRole?: string;
    imageRoleCode?: number;
    registrationVisible?: boolean;
    acceptedForEva?: boolean;
    excluded?: boolean;
    exclusionReason?: string | null;
    decisionSource?: 'classifier';
    personReflection?: boolean;
    sha256?: string;
    sequenceIndex?: number;
  },
  computed: {
    imageRoleCode: number;
    registrationVisible: boolean | null;
    excluded: boolean;
    exclusionReason: string | null;
    sha256: string | null;
    sequenceIndex: number | null;
  },
  q: TxQuery = query,
): Promise<{ updated: number; readinessChanged: boolean }> {
  const changedIds = new Set<string>();
  let readinessChanged = false;

  // Autonomous image decisions are compare-and-set per field. A classifier may fill
  // an unowned field or revise its own result, but never overwrite staff/provider/
  // other ownership. An omitted decisionSource is deliberately NOT granted
  // classifier authority during a rolling deployment.
  const ownedSets: string[] = [];
  const ownedChanges: string[] = [];
  const ownedVals: unknown[] = [...whereVals];
  const pushOwned = (column: string, sourceColumn: string, value: unknown): void => {
    ownedVals.push(value);
    const p = `$${ownedVals.length}`;
    const allowed = `(${sourceColumn} IS NULL OR ${sourceColumn} = 'classifier')`;
    ownedSets.push(
      `${column} = CASE WHEN ${allowed} THEN ${p} ELSE ${column} END`,
      `${sourceColumn} = CASE WHEN ${allowed} THEN 'classifier' ELSE ${sourceColumn} END`,
    );
    ownedChanges.push(
      `(${allowed} AND (${column} IS DISTINCT FROM ${p} OR ${sourceColumn} IS DISTINCT FROM 'classifier'))`,
    );
  };

  if (row.decisionSource === 'classifier' && (row.imageRoleCode != null || row.imageRole != null)) {
    pushOwned('image_role_code', 'image_role_source', computed.imageRoleCode);
  }
  if (row.decisionSource === 'classifier' && typeof row.registrationVisible === 'boolean') {
    pushOwned('registration_visible', 'registration_visible_source', computed.registrationVisible);
  }
  if (row.decisionSource === 'classifier' && typeof row.acceptedForEva === 'boolean') {
    pushOwned('accepted_for_eva', 'accepted_for_eva_source', row.acceptedForEva);
  }
  const unattributedExplicitExclusion = row.decisionSource == null && row.excluded === true;
  if ((row.decisionSource === 'classifier' || unattributedExplicitExclusion) && row.excluded != null) {
    ownedVals.push(computed.excluded, computed.exclusionReason);
    const excludedP = `$${ownedVals.length - 1}`;
    const reasonP = `$${ownedVals.length}`;
    const allowed = `(
      (exclusion_decision_source IS NULL OR exclusion_decision_source = 'classifier')
      AND (
        NOT ${excludedP}
        OR archive_mirror_claim_token IS NULL
        OR archive_mirror_claim_expires_at <= now()
      )
    )`;
    ownedSets.push(
      `excluded = CASE WHEN ${allowed} THEN ${excludedP} ELSE excluded END`,
      `exclusion_reason = CASE WHEN ${allowed} THEN ${reasonP} ELSE exclusion_reason END`,
      `exclusion_decision_source = CASE WHEN ${allowed} THEN 'classifier' ELSE exclusion_decision_source END`,
      `archive_mirror_decision_generation = archive_mirror_decision_generation +
        CASE WHEN ${allowed} AND excluded IS DISTINCT FROM ${excludedP} THEN 1 ELSE 0 END`,
    );
    ownedChanges.push(
      `(${allowed} AND (excluded IS DISTINCT FROM ${excludedP} OR exclusion_reason IS DISTINCT FROM ${reasonP} OR exclusion_decision_source IS DISTINCT FROM 'classifier'))`,
    );
  }

  if (ownedSets.length > 0) {
    const res = await q<ArchiveMirrorCandidate>(
      `UPDATE evidence
            SET ${ownedSets.join(', ')}, updated_at = now()
          WHERE ${whereClause}
            AND (${ownedChanges.join(' OR ')})
          RETURNING id, case_id, excluded, storage_path, box_file_id`,
      ownedVals,
    );
    for (const item of res) changedIds.add(item.id);
    if (row.decisionSource === 'classifier' && row.excluded === false) {
      for (const item of res) await requestArchiveMirrorIfEligible(q, item);
    }
    readinessChanged = res.length > 0;
  }

  const simpleSets: string[] = [];
  const simpleChanges: string[] = [];
  const simpleVals: unknown[] = [...whereVals];
  const pushSimple = (column: string, value: unknown): void => {
    simpleVals.push(value);
    const p = `$${simpleVals.length}`;
    simpleSets.push(`${column} = ${p}`);
    simpleChanges.push(`${column} IS DISTINCT FROM ${p}`);
  };
  if (typeof row.personReflection === 'boolean') pushSimple('person_reflection', row.personReflection);
  if (row.excluded == null && typeof row.exclusionReason === 'string' && row.exclusionReason.trim()) {
    pushSimple('exclusion_reason', row.exclusionReason.trim());
  }
  if (row.sha256 != null) pushSimple('sha256', computed.sha256);
  if (row.sequenceIndex != null) pushSimple('sequence_index', computed.sequenceIndex);

  if (simpleSets.length > 0) {
    const res = await q<{ id: string }>(
      `UPDATE evidence
            SET ${simpleSets.join(', ')}, updated_at = now()
          WHERE ${whereClause}
            AND (${simpleChanges.join(' OR ')})
          RETURNING id`,
      simpleVals,
    );
    for (const item of res) changedIds.add(item.id);
  }
  return { updated: changedIds.size, readinessChanged };
}
