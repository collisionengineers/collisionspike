/** internal-backfill-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { tx } from '../../platform/db/client.js';
import { writeEvidenceBackfillNote } from './backfill-note.js';
import { withResolvedEvidenceBackfillTarget } from './backfill-target.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { withServiceAuth } from '../inbound/internal/service-support.js';
import { parseEvidenceBackfillCommittedResult } from './backfill-result.js';

app.http('internalInboundEvidenceBackfillValidate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/inbound/{id}/evidence-backfill/validate',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json().catch(() => ({}))) as {
        targetCaseId?: unknown;
        generation?: unknown;
      };
      const targetCaseId = typeof body.targetCaseId === 'string' ? body.targetCaseId.trim() : '';
      if (!targetCaseId) return { status: 400, jsonBody: { error: 'targetCaseId is required' } };
      const suppliedGeneration = body.generation == null ? null : Number(body.generation);
      if (
        suppliedGeneration != null &&
        (!Number.isSafeInteger(suppliedGeneration) || suppliedGeneration < 1)
      ) {
        return { status: 400, jsonBody: { error: 'generation must be a positive integer' } };
      }
      const resolved = await withResolvedEvidenceBackfillTarget(
        req.params.id,
        targetCaseId,
        async (q) => {
          const rows = await q<{
            evidence_backfill_requested_generation: string | number;
            evidence_backfill_completed_generation: string | number;
            evidence_backfill_completed_result: unknown;
          }>(
            `SELECT evidence_backfill_requested_generation,
                    evidence_backfill_completed_generation,
                    evidence_backfill_completed_result
               FROM inbound_email
              WHERE id = $1`,
            [req.params.id],
          );
          const requested = Number(
            rows[0]?.evidence_backfill_requested_generation ?? suppliedGeneration ?? 1,
          );
          const completed = Number(rows[0]?.evidence_backfill_completed_generation ?? 0);
          const generation = suppliedGeneration ?? requested; // queued jobs may omit the generation
          if (generation < 1 || generation > requested) {
            return { kind: 'generation_mismatch' as const, requested };
          }
          if (suppliedGeneration != null && generation < requested && completed < generation) {
            return { kind: 'superseded' as const, generation };
          }
          const committedGeneration = completed >= generation ? completed : generation;
          const committedResult = completed >= generation
            ? parseEvidenceBackfillCommittedResult(rows[0]?.evidence_backfill_completed_result)
            : null;
          return {
            kind: 'validated' as const,
            generation: committedGeneration,
            completed: completed >= generation,
            ...(committedResult ? { committedResult } : {}),
          };
        },
      );
      if (resolved.kind === 'stale') {
        return {
          status: 409,
          jsonBody: { error: 'evidence backfill target changed', code: 'evidence_backfill_target_changed' },
        };
      }
      if (resolved.value.kind === 'generation_mismatch') {
        return {
          status: 409,
          jsonBody: {
            error: 'evidence backfill generation changed',
            code: 'evidence_backfill_generation_changed',
            requestedGeneration: resolved.value.requested,
          },
        };
      }
      if (resolved.value.kind === 'superseded') {
        return {
          status: 200,
          jsonBody: {
            targetCaseId: resolved.targetCaseId,
            generation: resolved.value.generation,
            completed: false,
            superseded: true,
          },
        };
      }
      return {
        status: 200,
        jsonBody: {
          targetCaseId: resolved.targetCaseId,
          generation: resolved.value.generation,
          completed: resolved.value.completed,
          ...(resolved.value.committedResult
            ? { committedResult: resolved.value.committedResult }
            : {}),
        },
      };
    }),
});

app.http('internalInboundEvidenceBackfill', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/inbound/{id}/evidence-backfill',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const id = req.params.id;
      const body = (await req.json().catch(() => ({}))) as {
        outcome?: unknown;
        targetCaseId?: unknown;
        persisted?: unknown;
        merged?: unknown;
        failedAttachments?: unknown;
        detail?: unknown;
        generation?: unknown;
      };
      const outcome = body.outcome;
      if (outcome !== 'completed' && outcome !== 'partial' && outcome !== 'failed') {
        return { status: 400, jsonBody: { error: "outcome must be 'completed', 'partial' or 'failed'" } };
      }
      const targetCaseId = typeof body.targetCaseId === 'string' ? body.targetCaseId.trim() : '';
      if (!targetCaseId) return { status: 400, jsonBody: { error: 'targetCaseId is required' } };
      const suppliedGeneration = body.generation == null ? null : Number(body.generation);
      if (
        suppliedGeneration != null &&
        (!Number.isSafeInteger(suppliedGeneration) || suppliedGeneration < 1)
      ) {
        return { status: 400, jsonBody: { error: 'generation must be a positive integer' } };
      }
      const requestedDetail = typeof body.detail === 'string' ? body.detail.slice(0, 300) : null;
      const requestedPersisted = typeof body.persisted === 'number' ? body.persisted : null;
      const requestedMerged = typeof body.merged === 'number' ? body.merged : null;
      const requestedFailedAttachments = typeof body.failedAttachments === 'number'
        ? Math.max(0, Math.trunc(body.failedAttachments))
        : null;

      // Every outcome reconciles the ONE source-keyed recovery note under the
      // inbound row lock. Failed/partial upsert the current actionable wording;
      // completed converts a pre-existing manual-action note to resolved wording
      // without creating a success-path note when none existed.
      const report = await tx(async (q) => {
        const locked = await q<{
          case_id: string | null;
          evidence_backfill_report_outcome: string | null;
          evidence_backfill_requested_generation: string | number;
          evidence_backfill_completed_generation: string | number;
          evidence_backfill_completed_result: unknown;
          evidence_backfill_reported_generation: string | number;
        }>(
          `SELECT case_id, evidence_backfill_report_outcome,
                  evidence_backfill_requested_generation,
                  evidence_backfill_completed_generation,
                  evidence_backfill_completed_result,
                  evidence_backfill_reported_generation
             FROM inbound_email
            WHERE id = $1
            FOR UPDATE`,
          [id],
        );
        if (!locked[0]) return { kind: 'missing' as const };
        if ((locked[0].case_id ?? null) !== targetCaseId) return { kind: 'stale' as const };
        const requestedGeneration = Number(
          locked[0].evidence_backfill_requested_generation ?? suppliedGeneration ?? 1,
        );
        const completedGeneration = Number(locked[0].evidence_backfill_completed_generation ?? 0);
        const reportedGeneration = Number(locked[0].evidence_backfill_reported_generation ?? 0);
        const generation = suppliedGeneration ?? requestedGeneration; // reporters may omit the generation
        if (generation < 1 || generation > requestedGeneration) {
          return { kind: 'generation_mismatch' as const, requestedGeneration };
        }

        // A newer committed generation supersedes this delivery. Its own delivery (or
        // another replay) reports that generation; this older one must not reinterpret it.
        if (completedGeneration > generation) {
          return {
            kind: 'replay' as const,
            generation,
            effectiveOutcome: outcome,
            protectedCompletion: true,
          };
        }

        // Persistence truth outranks the reporter for this generation. The exact
        // completed/partial result and recovered rows commit together, so a lost report
        // replays this snapshot instead of guessing that any commit was fully completed.
        const committedResult = completedGeneration === generation
          ? parseEvidenceBackfillCommittedResult(locked[0].evidence_backfill_completed_result)
          : null;
        if (suppliedGeneration != null && completedGeneration === generation && !committedResult) {
          return { kind: 'missing_committed_result' as const, completedGeneration };
        }
        const protectedCompletion = committedResult != null && outcome !== committedResult.outcome;
        const effectiveOutcome = committedResult?.outcome ?? outcome;
        const persisted = committedResult?.persisted ?? requestedPersisted;
        const merged = committedResult?.merged ?? requestedMerged;
        const failedAttachments = committedResult?.failedAttachments ?? requestedFailedAttachments;
        const detail = committedResult?.detail ?? requestedDetail;
        if (
          suppliedGeneration != null &&
          (effectiveOutcome === 'completed' || effectiveOutcome === 'partial') &&
          completedGeneration < generation
        ) {
          return { kind: 'not_committed' as const, completedGeneration };
        }

        const rank: Record<'failed' | 'partial' | 'completed', number> = {
          failed: 0,
          partial: 1,
          completed: 2,
        };
        const currentOutcome = locked[0].evidence_backfill_report_outcome as
          | 'failed'
          | 'partial'
          | 'completed'
          | null;
        if (
          generation < reportedGeneration ||
          (generation === reportedGeneration && currentOutcome != null &&
            rank[currentOutcome] >= rank[effectiveOutcome])
        ) {
          return {
            kind: 'replay' as const,
            generation,
            effectiveOutcome,
            protectedCompletion,
          };
        }
        await writeEvidenceBackfillNote(
          { caseId: targetCaseId, inboundEmailId: id, kind: effectiveOutcome },
          q,
        );

        const updated = await q<{ id: string }>(
          `UPDATE inbound_email
              SET evidence_backfill_report_outcome = $2,
                  evidence_backfill_reported_generation = $3,
                  evidence_backfill_reported_at = now(),
                  updated_at = now()
            WHERE id = $1
              AND evidence_backfill_reported_generation <= $3
          RETURNING id`,
          [id, effectiveOutcome, generation],
        );
        if (!updated[0] && suppliedGeneration != null) {
          return { kind: 'replay' as const, generation, effectiveOutcome, protectedCompletion };
        }

        if (effectiveOutcome === 'completed') {
          await writeAudit({
            action: AUDIT_ACTION.attachment_classified,
            caseId: targetCaseId,
            summary: `Attachments added from the linked email (${persisted ?? '?'} new${
              merged ? `, ${merged} matched` : ''
            })`,
            after: {
              inboundEmailId: id,
              generation,
              persisted,
              merged,
              ...(protectedCompletion ? { protectedFromOutcome: outcome } : {}),
            },
            actor: 'orchestration',
          }, q);
        } else {
          await writeAudit({
            action: AUDIT_ACTION.graph_message_ingest_failed,
            caseId: targetCaseId,
            summary: effectiveOutcome === 'partial'
              ? 'Some attachments from the linked email could not be added'
              : 'Attachments from the linked email could not be added — staff must add them',
            severity: 'warning',
            after: {
              inboundEmailId: id,
              generation,
              ...(failedAttachments != null ? { failedAttachments } : {}),
              ...(detail ? { detail } : {}),
            },
            actor: 'orchestration',
          }, q);
        }
        return {
          kind: 'transition' as const,
          generation,
          effectiveOutcome,
          protectedCompletion,
        };
      });
      if (report.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
      if (report.kind === 'stale') {
        return {
          status: 409,
          jsonBody: { error: 'evidence backfill target changed', code: 'evidence_backfill_target_changed' },
        };
      }
      if (report.kind === 'generation_mismatch') {
        return {
          status: 409,
          jsonBody: {
            error: 'evidence backfill generation changed',
            code: 'evidence_backfill_generation_changed',
            requestedGeneration: report.requestedGeneration,
          },
        };
      }
      if (report.kind === 'not_committed') {
        return {
          status: 409,
          jsonBody: {
            error: 'evidence backfill persistence is not committed',
            code: 'evidence_backfill_not_committed',
            completedGeneration: report.completedGeneration,
          },
        };
      }
      if (report.kind === 'missing_committed_result') {
        return {
          status: 409,
          jsonBody: {
            error: 'evidence backfill committed result is unavailable',
            code: 'evidence_backfill_committed_result_missing',
            completedGeneration: report.completedGeneration,
          },
        };
      }
      ctx.log(
        JSON.stringify({
          evt: 'evidenceBackfillReport',
          inboundEmailId: id,
          outcome: report.effectiveOutcome,
          requestedOutcome: outcome,
          generation: report.generation,
          targetCaseId,
          replay: report.kind === 'replay',
          protectedCompletion: report.protectedCompletion,
        }),
      );
      return { status: 204 };
    }),
});
