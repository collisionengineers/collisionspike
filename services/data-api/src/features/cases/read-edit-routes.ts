/** read-edit-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { CASE_PO_SHAPE_RE, SaveInspectionDecisionParams, EVA_FIELD_ORDER, normaliseEvaEdit, extractVrm, normalizeCasePo, sourceReadinessInputForCase, statusForReviewCase, type EvaFields, type EvaFieldKey } from '@cs/domain';
import { caseTypeCodec, inspectionDecisionCodec, statusToInt } from '@cs/domain/codecs';
import { withRole } from '../../platform/auth/staff-auth.js';
import { query, tx } from '../../platform/db/client.js';
import { acknowledgeStatusRecompute, requestStatusRecompute } from './status-recompute.js';
import { isUniqueViolation } from '../inbound/internal/unique-violation.js';
import { ifMatch } from '../../platform/http/concurrency.js';
import { isUuid } from '../../shared/validation/uuid.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit, writeAuditStrict } from '../../shared/audit.js';
import { EVA_COLUMN_BY_KEY } from '../../shared/mapping/index.js';
import { loadCaseFullSnapshotUsing, recomputeStatus, upsertManualProvenance, upsertManualProvenanceStrict, type VersionedCaseSnapshot } from './case-support.js';

app.http('caseById', {
  methods: ['GET'],
  authLevel: 'anonymous',
  // Keep the literal `/cases/next-po` allocator outside the parameter route even if host
  // registration order changes.
  route: 'cases/{id:guid}',
  handler: withRole('CollisionSpike.User', async (req) => {
    const id = req.params.id;
    if (!isUuid(id)) return { status: 400, jsonBody: { error: 'invalid id' } };
    const snapshot = await loadCaseFullSnapshotUsing(query, id, new Date());
    if (!snapshot) return { status: 404, jsonBody: { error: 'not found' } };
    return {
      status: 200,
      jsonBody: { ...snapshot.value, version: snapshot.version },
      headers: { ETag: `"${snapshot.version}"`, 'Access-Control-Expose-Headers': 'ETag' },
    };
  }),
});

app.http('patchCase', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'cases/{id}',
  handler: withRole('CollisionSpike.User', async (req, ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json().catch(() => ({}))) as {
      vrm?: string;
      evaFields?: Partial<Record<EvaFieldKey, string>>;
      /** ADR-0021 review-time case-type correction — notably the repairable-vs-total-loss
       *  refinement of a QDOS audit ('audit' → 'audit_total_loss'), which is NEVER
       *  determinable at intake. 'standard' (or '') clears back to the default. */
      caseType?: string;
      /** ADR-0022 transition seam — staff stamp the REAL Case/PO over a placeholder (or
       *  onto an un-numbered case) at EVA-add time during the parallel-run, and the
       *  cutover renumber uses the same write. Shape-validated; '' clears. */
      casePo?: string;
      /** TKT-153: one reviewed field/address/decision save. */
      inspectionDecision?: unknown;
      editSession?: true;
    };
    const explicitSave = body.editSession === true;
    const parsedInspection =
      body.inspectionDecision === undefined
        ? undefined
        : SaveInspectionDecisionParams.safeParse({
            ...(body.inspectionDecision as Record<string, unknown>),
            caseId: id,
          });
    if (parsedInspection && !parsedInspection.success) {
      return {
        status: 400,
        jsonBody: {
          error: 'invalid inspection decision',
          message: 'Check the inspection choice and try again.',
          issues: parsedInspection.error.issues,
        },
      };
    }
    const inspection = parsedInspection?.data;
    const inspectionLines = (inspection?.addressLines ?? [])
      .map((line) => line.trim())
      .filter(Boolean);
    const inspectionPostcode = inspection?.postcode?.trim() ?? '';
    const inspectionAddress = inspection
      ? inspection.decisionMode === 'image_based'
        ? 'Image Based Assessment'
        : [...inspectionLines, ...(inspectionPostcode ? [inspectionPostcode] : [])]
            .join('\n')
            .slice(0, 2000)
      : undefined;
    const inspectionModeCode = inspection
      ? inspectionDecisionCodec.toInt(inspection.decisionMode)
      : undefined;
    const requestedVrm = body.vrm === undefined
      ? undefined
      : (() => {
          const raw = String(body.vrm ?? '').trim();
          const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
          return raw ? extractVrm(raw) || cleaned : '';
        })();
    const actor = actorFromClaims(claims);
    let attemptedCasePo: string | undefined;
    let outcome:
      | { kind: 'response'; response: { status: number; jsonBody: unknown } }
      | { kind: 'unchanged'; snapshot: VersionedCaseSnapshot }
      | {
          kind: 'changed';
          changedEvaFields: Array<{ key: EvaFieldKey; value: string }>;
          statusGeneration?: number;
          explicitSave: boolean;
        };
    try {
      const identityEditRequested = requestedVrm !== undefined || body.casePo !== undefined;
      const [vrmProbe] = !identityEditRequested
        ? []
        : await query<{ vrm: string | null }>('SELECT vrm FROM case_ WHERE id=$1', [id]);
      const observedVrm = (vrmProbe?.vrm ?? '').toUpperCase().replace(/\s+/g, '');
      const archiveVrmLocks = !identityEditRequested
        ? []
        : [...new Set([observedVrm, requestedVrm].filter((value): value is string => Boolean(value)))].sort();
      outcome = await tx(async (q) => {
        for (const vrm of archiveVrmLocks) {
          await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`archive-holding:${vrm}`]);
        }
        const snapshot = await loadCaseFullSnapshotUsing(q, id, new Date(), true);
        if (!snapshot) {
          return { kind: 'response' as const, response: { status: 404, jsonBody: { error: 'not found' } } };
        }
        const expected = ifMatch(req);
        if (explicitSave && !expected) {
          return {
            kind: 'response' as const,
            response: {
              status: 428,
              jsonBody: {
                error: 'version_required',
                message: 'Reload this case before saving your changes.',
              },
            },
          };
        }
        if (expected && expected !== snapshot.version) {
          return {
            kind: 'response' as const,
            response: {
              status: 409,
              jsonBody: {
                error: 'stale',
                currentVersion: snapshot.version,
                ...(explicitSave
                  ? { message: 'This case changed while you were editing it. Reload it before saving.' }
                  : {}),
              },
            },
          };
        }
        const existing = snapshot.value;
        const sets: string[] = [];
        const vals: unknown[] = [];
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        const changedEvaFields: Array<{ key: EvaFieldKey; value: string }> = [];

        if (requestedVrm !== undefined) {
          const actualVrm = existing.vrm.toUpperCase().replace(/\s+/g, '');
          if (actualVrm && !archiveVrmLocks.includes(actualVrm)) {
            return {
              kind: 'response' as const,
              response: {
                status: 409,
                jsonBody: {
                  error: 'stale',
                  currentVersion: snapshot.version,
                  message: 'This case changed while you were editing it. Reload it before saving.',
                },
              },
            };
          }
          const newVrm = requestedVrm;
          if (newVrm !== actualVrm) {
            const activeHolding = await q<{ id: string }>(
              `SELECT id FROM archive_holding_folder
                WHERE (state='adopting' AND claim_token IS NOT NULL AND claim_expires_at>now()
                    AND (adopted_case_id=$1 OR normalized_vrm=ANY($2::text[])))
                  OR (state<>'adopted' AND resolved_case_id=$1)
                LIMIT 1`,
              [id, [actualVrm, newVrm].filter(Boolean)],
            );
            if (activeHolding.length) {
              return {
                kind: 'response' as const,
                response: {
                  status: 409,
                  jsonBody: {
                    error: 'archive_holding_active',
                    message: 'Registration images are being filed for this case. Try the change again shortly.',
                  },
                },
              };
            }
            sets.push(`vrm = $${vals.length + 1}`);
            vals.push(newVrm);
            before.vrm = existing.vrm;
            after.vrm = newVrm;
          }
        }

        let inspectionAddressChanged = false;
        if (body.evaFields && typeof body.evaFields === 'object') {
          for (const [k, rawVal] of Object.entries(body.evaFields)) {
            if (rawVal === undefined || !(k in EVA_COLUMN_BY_KEY)) continue;
            const key = k as EvaFieldKey;
            const norm = normaliseEvaEdit(key, String(rawVal ?? ''));
            if ('error' in norm) {
              return { kind: 'response' as const, response: { status: 400, jsonBody: { error: norm.error } } };
            }
            const oldVal = existing.evaFields[key]?.value ?? '';
            if (norm.value === oldVal) continue;
            sets.push(`${EVA_COLUMN_BY_KEY[key]} = $${vals.length + 1}`);
            vals.push(norm.value);
            before[key] = oldVal;
            after[key] = norm.value;
            changedEvaFields.push({ key, value: norm.value });
            if (key === 'inspectionAddress') inspectionAddressChanged = true;
          }
        }
        if (inspectionAddressChanged && !inspection) {
          if (explicitSave) {
            return {
              kind: 'response' as const,
              response: {
                status: 400,
                jsonBody: {
                  error: 'inspection_decision_required',
                  message: 'Choose an inspection address or Image Based Assessment before saving.',
                },
              },
            };
          }
          sets.push('inspection_decision_code = NULL');
        }

        if (inspection) {
          if (inspectionModeCode == null || inspectionAddress == null) {
            return {
              kind: 'response' as const,
              response: { status: 400, jsonBody: { error: 'invalid inspection decision mode' } },
            };
          }
          const submittedAddress = body.evaFields?.inspectionAddress;
          if (submittedAddress !== undefined && submittedAddress !== inspectionAddress) {
            return {
              kind: 'response' as const,
              response: {
                status: 400,
                jsonBody: {
                  error: 'inspection_address_mismatch',
                  message: 'The inspection address and choice do not match. Review them and try again.',
                },
              },
            };
          }
          if (inspectionAddress !== existing.evaFields.inspectionAddress.value && submittedAddress === undefined) {
            return {
              kind: 'response' as const,
              response: {
                status: 400,
                jsonBody: {
                  error: 'inspection_address_required',
                  message: 'Include the inspection address with the inspection choice.',
                },
              },
            };
          }
          // An explicit decision payload is deliberate even when its mode/address
          // text matches the prior row (for example, staff supplied a new reason).
          // Write the decision column in this same statement so the paired address
          // and choice can never be split or reordered.
          sets.push(`inspection_decision_code = $${vals.length + 1}`);
          vals.push(inspectionModeCode);
          if (inspection.decisionMode !== existing.inspectionDecision) {
            before.inspectionDecision = existing.inspectionDecision;
          }
          after.inspectionDecision = inspection.decisionMode;
        }

        if (body.casePo !== undefined) {
          const raw = String(body.casePo ?? '').trim();
          const normalized = raw ? normalizeCasePo(raw) : '';
          if (normalized && !CASE_PO_SHAPE_RE.test(normalized)) {
            return {
              kind: 'response' as const,
              response: { status: 400, jsonBody: { error: `casePo '${raw}' is not Case/PO-shaped` } },
            };
          }
          const oldPo = (existing.casePo ?? '').toUpperCase();
          if (normalized !== oldPo) {
            const activeHolding = await q<{ id: string }>(
              `SELECT id FROM archive_holding_folder
                WHERE state='adopting' AND claim_token IS NOT NULL AND claim_expires_at>now()
                  AND (adopted_case_id=$1 OR normalized_vrm=$2)
                LIMIT 1`,
              [id, existing.vrm.toUpperCase().replace(/\s+/g, '')],
            );
            if (activeHolding.length) {
              return {
                kind: 'response' as const,
                response: {
                  status: 409,
                  jsonBody: {
                    error: 'archive_holding_active',
                    message: 'Registration images are being filed for this case. Try the change again shortly.',
                  },
                },
              };
            }
            const adoptedHolding = await q<{ id: string }>(
              `SELECT id FROM archive_holding_folder
                WHERE state='adopted' AND adopted_case_id=$1 LIMIT 1`,
              [id],
            );
            if (adoptedHolding.length) {
              return {
                kind: 'response' as const,
                response: {
                  status: 409,
                  jsonBody: {
                    error: 'archive_folder_name_locked',
                    message: 'This Case/PO names the existing Archive folder and cannot be changed.',
                  },
                },
              };
            }
            attemptedCasePo = normalized || undefined;
            sets.push(`case_po = $${vals.length + 1}`);
            vals.push(normalized || null);
            before.casePo = oldPo || '(none)';
            after.casePo = normalized || '(cleared)';
          }
        }

        if (body.caseType !== undefined) {
          const rawType = String(body.caseType ?? '').trim();
          const validName = rawType === '' || caseTypeCodec.toInt(rawType as never) != null;
          if (!validName) {
            return {
              kind: 'response' as const,
              response: {
                status: 400,
                jsonBody: { error: `caseType must be one of ${caseTypeCodec.names().join(', ')}` },
              },
            };
          }
          const newCode = rawType === '' || rawType === 'standard'
            ? null
            : caseTypeCodec.toInt(rawType as never)!;
          const oldCode = caseTypeCodec.toInt(existing.caseType as never) ?? null;
          if (newCode !== oldCode) {
            sets.push(`case_type_code = $${vals.length + 1}`);
            vals.push(newCode);
            before.caseType = existing.caseType ?? 'standard';
            after.caseType = rawType || 'standard';
          }
        }

        if (sets.length === 0) return { kind: 'unchanged' as const, snapshot };

        // TKT-153 explicit saves recompute readiness from the complete reviewed draft
        // exactly once, inside this transaction, so a response can never confirm the
        // field changes while carrying a stale status.
        if (explicitSave) {
          const changedByKey = new Map(changedEvaFields.map((field) => [field.key, field.value]));
          const nextEvaFields = Object.fromEntries(
            EVA_FIELD_ORDER.map(({ key }) => {
              const prior = existing.evaFields[key];
              return [
                key,
                changedByKey.has(key)
                  ? { ...prior, value: changedByKey.get(key)!, reviewState: 'reviewed' as const }
                  : prior,
              ];
            }),
          ) as unknown as EvaFields;
          const nextVrm = typeof after.vrm === 'string' ? after.vrm : existing.vrm;
          const nextCasePo = typeof after.casePo === 'string'
            ? (after.casePo === '(cleared)' ? '' : after.casePo)
            : existing.casePo;
          const evaluated = statusForReviewCase({
            status: existing.status,
            evaFields: nextEvaFields,
            evidence: existing.evidence,
            inspectionDecision: inspection?.decisionMode ?? existing.inspectionDecision,
            instructionCount: existing.evidence.filter((item) => item.kind === 'instruction').length,
            ...sourceReadinessInputForCase(existing),
            hasIdentity:
              nextVrm.trim().length > 0 ||
              (nextCasePo ?? '').trim().length > 0 ||
              existing.providerCode.trim().length > 0 ||
              nextEvaFields.claimantName.value.trim().length > 0,
            mergedInto: existing.mergedInto,
          });
          if (evaluated !== existing.status) {
            sets.push(`status_code = $${vals.length + 1}`);
            vals.push(statusToInt(evaluated));
            before.status = existing.status;
            after.status = evaluated;
          }
        }
        vals.push(id);
        await q(`UPDATE case_ SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);

        if (explicitSave) {
          for (const field of changedEvaFields) {
            await upsertManualProvenanceStrict(q, id, field.key, field.value);
          }
          if (inspection) {
            const imageBased = inspection.decisionMode === 'image_based';
            const label = imageBased
              ? `Image Based Assessment (${id})`
              : (() => {
                  const suffix = ` (${id})`;
                  const base = [inspectionLines[0], inspectionPostcode].filter(Boolean).join(', ') || 'Inspection address';
                  return `${base.slice(0, 200 - suffix.length)}${suffix}`;
                })();
            const sourceNote = [
              `case=${id}`,
              ...(existing.providerCode ? [`provider=${existing.providerCode}`] : []),
              inspection.sourceNote,
            ].join(' ').trim();
            await q(
              `INSERT INTO inspection_address
                 (label, decision_mode_code, decision_reason, source_label, source_note,
                  address_line1, address_line2, address_line3, address_line4, address_line5, address_line6, postcode)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               ON CONFLICT (label) DO UPDATE SET
                 decision_mode_code = EXCLUDED.decision_mode_code,
                 decision_reason = EXCLUDED.decision_reason,
                 source_label = EXCLUDED.source_label,
                 source_note = EXCLUDED.source_note,
                 address_line1 = EXCLUDED.address_line1,
                 address_line2 = EXCLUDED.address_line2,
                 address_line3 = EXCLUDED.address_line3,
                 address_line4 = EXCLUDED.address_line4,
                 address_line5 = EXCLUDED.address_line5,
                 address_line6 = EXCLUDED.address_line6,
                 postcode = EXCLUDED.postcode`,
              [
                label,
                inspectionModeCode,
                imageBased ? inspection.sourceNote : null,
                inspection.sourceLabel ?? (imageBased ? 'image_based' : 'manual'),
                sourceNote,
                inspectionLines[0] ?? null,
                inspectionLines[1] ?? null,
                inspectionLines[2] ?? null,
                inspectionLines[3] ?? null,
                inspectionLines[4] ?? null,
                inspectionLines[5] ?? null,
                imageBased ? null : inspectionPostcode || null,
              ],
            );
          }
          const fieldLabels = new Map(EVA_FIELD_ORDER.map((field) => [field.key, field.label]));
          const changedFields = Object.keys(after).map((key) =>
            fieldLabels.get(key as EvaFieldKey) ??
            ({
              vrm: 'Registration',
              casePo: 'Case/PO',
              caseType: 'Case type',
              inspectionDecision: 'Inspection choice',
              status: 'Readiness',
            } as Record<string, string>)[key] ??
            key,
          );
          await writeAuditStrict(
            {
              action: AUDIT_ACTION.status_changed,
              caseId: id,
              summary: `Case saved: ${changedFields.join(', ')}`,
              // Record WHAT changed without copying claimant/contact values into the
              // generic audit payload.
              before: { changedFields },
              after: { changedFields },
              ...(actor ? { actor } : {}),
            },
            q,
          );
          return { kind: 'changed' as const, changedEvaFields, explicitSave: true };
        }

        await writeAudit({
          action: AUDIT_ACTION.status_changed,
          caseId: id,
          summary: `Case edited: ${Object.keys(after).join(', ')}`,
          before,
          after,
          ...(actor ? { actor } : {}),
        }, q);
        const statusGeneration = await requestStatusRecompute(q, id);
        return { kind: 'changed' as const, changedEvaFields, statusGeneration, explicitSave: false };
      });
    } catch (e) {
      if (isUniqueViolation(e) && attemptedCasePo) {
        const holder = await query<{ id: string; vrm: string | null }>(
          'SELECT id, vrm FROM case_ WHERE upper(case_po) = $1 AND id <> $2',
          [attemptedCasePo.toUpperCase(), id],
        );
        return {
          status: 409,
          jsonBody: {
            error: 'case_po_in_use',
            message: `Case/PO ${attemptedCasePo} is already assigned to another case.`,
            conflictCaseId: holder[0]?.id ?? null,
            conflictVrm: holder[0]?.vrm ?? null,
          },
        };
      }
      throw e;
    }

    if (outcome.kind === 'response') return outcome.response;
    if (outcome.kind === 'unchanged') {
      return {
        status: 200,
        jsonBody: { ...outcome.snapshot.value, version: outcome.snapshot.version },
      };
    }
    if (!outcome.explicitSave) {
      for (const field of outcome.changedEvaFields) {
        await upsertManualProvenance(id, field.key, field.value);
      }
      try {
        const evaluated = await recomputeStatus(id, actor);
        if (!evaluated) throw new Error('case was not available for readiness evaluation');
        await acknowledgeStatusRecompute(query, id, outcome.statusGeneration!);
      } catch (error) {
        ctx.warn(
          `[patch-case] readiness recompute remains pending for ${id} ` +
            `(generation ${outcome.statusGeneration}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const updated = await loadCaseFullSnapshotUsing(query, id, new Date());
    return updated
      ? {
          status: 200,
          jsonBody: { ...updated.value, version: updated.version },
          headers: { ETag: `"${updated.version}"`, 'Access-Control-Expose-Headers': 'ETag' },
        }
      : { status: 404, jsonBody: { error: 'not found' } };
  }),
});
