/**
 * orchestration/src/functions/activities/classifyPersist.ts  (activity 3)
 *
 * Durable activity: classify email attachments (instruction / image / email / other) and
 * persist evidence rows for the Case via the Data API (plan 22 §B).
 *
 * D10 — classification uses the shared `@cs/domain` `describeEvidence` (the SAME rule the
 * intake flow mirrors). Idempotent: the Data API upserts by blob path, so a re-run after a
 * partial persist updates existing rows rather than duplicating (at-least-once activities).
 */

import * as df from 'durable-functions';
import { describeEvidence, isEngineerReportLayoutName } from '@cs/domain';
import { gates } from '@cs/domain/gates';
import { dataApi } from '../../lib/data-api.js';
import { downloadEvidenceBytes, uploadEvidenceBytes } from '../../lib/blob.js';
import { classifyImage, classificationToEvidenceFields } from '../../lib/image-classify.js';
import type { InboundEnvelope } from './fetchMessage.js';
import type { AttachmentTyping } from './parse.js';

interface ClassifyPersistInput {
  caseId: string;
  inbound: InboundEnvelope;
  /** Per-document content typings from the parse activity (ADR-0014/ADR-0021): lets a
   *  report-typed attachment be stored as `engineer_report` evidence instead of
   *  `instruction`. Absent → no override (backward-compatible). */
  typings?: AttachmentTyping[];
  /** Best-known case VRM — constrains `registration_visible` to the case vehicle's plate. */
  caseVrm?: string;
  /** Resolved work provider (when known) — used to honour a per-provider AI opt-out
   *  (work_provider.ai_allowed=false) before sending images to the vision model. */
  workProviderId?: string;
}

/** Minimum body length to treat as a genuine in-body instruction (skip one-liners/footers). */
const MIN_BODY_INSTRUCTION_CHARS = 40;

df.app.activity('classifyPersist', {
  handler: async (input: ClassifyPersistInput, ctx): Promise<{ persisted: number }> => {
    const { caseId, inbound } = input;

    const rows: Parameters<typeof dataApi.persistEvidence>[1] = inbound.attachments.map((a) => ({
      ...describeEvidence(a.filename, a.contentType),
      blobPath: a.blobPath,
      size: a.size,
    }));

    // TKT-064 live classifier: role/registration/person-reflection for genuine image
    // attachments (the direct-email path — extractImages covers PDF-embedded images). Runs
    // only when the gate + model are configured; best-effort per image (a fetch/classify
    // failure leaves the row at the default `unknown` role = pre-classifier behaviour).
    // Per-provider AI opt-out (docs/gated.md D6): skip the vision model when the resolved
    // work provider has ai_allowed=false (mirrors triageClassify). Undefined provider
    // (unresolved/held case) = no opt-out; fail-open on lookup error.
    let classifyAllowed = gates.imageRoleClassifyEnabled();
    if (classifyAllowed && input.workProviderId) {
      try {
        const { aiAllowed } = await dataApi.workProviderAiAllowed(input.workProviderId);
        if (aiAllowed === false) {
          classifyAllowed = false;
          ctx.log('[classifyPersist] image classify skipped — work provider opted out of AI (ai_allowed=false)');
        }
      } catch (e) {
        ctx.log(JSON.stringify({ evt: 'classifyPersist.aiAllowedLookupFailed', caseId, err: e instanceof Error ? e.message : String(e) }));
      }
    }
    if (classifyAllowed) {
      for (const r of rows) {
        if (!r.isImage) continue;
        try {
          const bytes = await downloadEvidenceBytes(r.blobPath);
          const cls = await classifyImage({ imageBase64: bytes.toString('base64'), contentType: r.contentType, caseVrm: input.caseVrm });
          if (cls) {
            const f = classificationToEvidenceFields(cls, input.caseVrm);
            r.imageRole = f.imageRole;
            r.registrationVisible = f.registrationVisible;
            r.acceptedForEva = f.acceptedForEva;
            // TKT-123: stamp the advisory reflection flag (dismissible SPA warning);
            // exclusion behaviour below is unchanged.
            r.personReflection = f.personReflection;
            if (f.excluded) {
              r.excluded = true;
              r.exclusionReason = f.exclusionReason;
            }
          }
        } catch (e) {
          ctx.log(JSON.stringify({ evt: 'classifyPersist.imageClassifyFailed', caseId, file: r.filename, err: e instanceof Error ? e.message : String(e) }));
        }
      }
    }

    // engineer_report override (ADR-0014 "store BOTH, never overlay" / ADR-0021): an
    // attachment whose detected LAYOUT is an engineer-report firm's (EVA/CNX) is a
    // third-party engineer's report — persist it as evidence kind engineer_report, not
    // instruction, so it is stored for comparison and never treated as the parse source.
    // Keyed on WHO ISSUED the document (the typing's provider/layout name), NOT its
    // content doc_type: probed against the real corpus, the audit instruction .DOC
    // content-types as `report` (its title says "Audit Report") while the EVA report
    // types as `instruction` — doc_type would reclassify exactly backwards. Guards:
    // (1) gated by AUDIT_CASES_ENABLED so the kind_code 100000007 write is impossible
    // until the operator applies the choice-row delta + flips the gate; (2) never strips
    // the LAST instruction row — if reclassifying would leave no instruction-classed
    // attachment, the override is skipped entirely (the body-text fallback below must
    // keep firing only for genuinely instruction-less emails).
    if (gates.auditCases() && (input.typings?.length ?? 0) > 0) {
      const reportBlobPaths = new Set(
        (input.typings ?? [])
          .filter((t) => isEngineerReportLayoutName(t.providerName))
          .map((t) => t.blobPath),
      );
      if (reportBlobPaths.size > 0) {
        const wouldRemain = rows.some(
          (r) => r.evidenceClass === 'instruction' && !reportBlobPaths.has(r.blobPath),
        );
        if (wouldRemain) {
          let overridden = 0;
          for (const r of rows) {
            if (r.evidenceClass === 'instruction' && reportBlobPaths.has(r.blobPath)) {
              r.evidenceClass = 'engineer_report';
              r.isInstruction = false;
              overridden += 1;
            }
          }
          if (overridden > 0) {
            ctx.log(
              JSON.stringify({ evt: 'classifyPersist.engineerReportOverride', caseId, overridden }),
            );
          }
        } else {
          ctx.log(
            JSON.stringify({ evt: 'classifyPersist.engineerReportOverrideSkipped', caseId, reason: 'would_strip_only_instruction' }),
          );
        }
      }
    }

    // The original message captured as raw `.eml` (box-sync ticket) becomes its own
    // email-class evidence row so the archive holds the email itself. Idempotent on
    // its deterministic blob path ({messageId}/message.eml). Omitted when the
    // `$value` capture failed in fetchMessage (best-effort).
    if (inbound.rawEml) {
      rows.push({
        ...describeEvidence(inbound.rawEml.filename, inbound.rawEml.contentType),
        blobPath: inbound.rawEml.blobPath,
        size: inbound.rawEml.size,
      });
    }

    // Body-only instruction (ADR-0015): a RECEIVING-WORK email whose instructions are typed
    // in the body with NO instruction attachment must still yield instruction evidence, else
    // the case lands empty. Persist the body text to Blob and add one instruction row.
    const hasInstructionAttachment = rows.some((r) => r.evidenceClass === 'instruction');
    const bodyText = (inbound.body ?? '').trim();
    if (!hasInstructionAttachment && bodyText.length >= MIN_BODY_INSTRUCTION_CHARS) {
      const up = await uploadEvidenceBytes(
        inbound.messageId,
        'email-body.txt',
        Buffer.from(bodyText, 'utf8'),
        'text/plain',
      );
      rows.push({
        filename: 'email-body.txt',
        contentType: 'text/plain',
        extension: 'txt',
        evidenceClass: 'instruction',
        isImage: false,
        isInstruction: true,
        blobPath: up.blobPath,
        size: up.size,
      });
      ctx.log(JSON.stringify({ evt: 'classifyPersist.bodyInstruction', caseId, bytes: up.size }));
    }

    const result = await dataApi.persistEvidence(caseId, rows);

    // attachment_classified (auditaction 2) — one branch per persist, matching the flow.
    await dataApi.recordAudit({
      action: 'attachment_classified',
      caseId,
      summary: `classified + persisted ${result.persisted} evidence row(s)`,
    });

    ctx.log(JSON.stringify({ evt: 'classifyPersist', caseId, persisted: result.persisted }));
    return result;
  },
});
