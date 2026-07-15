/** persistence — reusable feature support. */

import { normalizeOutlookWebLink, type InboundCategory, type InboundSubtype } from '@cs/domain';
import { query } from '../../platform/db/client.js';
import { INBOUND_CATEGORY_TO_INT, INBOUND_SUBTYPE_TO_INT } from '../../shared/mapping/index.js';
import { planOptionalColumns, tableColumns } from '../../platform/db/schema-introspection.js';
import { clampVarchar, vrmOrEmpty } from '../../shared/validation/varchar.js';
import { type InboundClassificationDto, type InboundEnvelope } from './internal/inbound-identity.js';
import { senderDomain } from './internal/service-support.js';

export async function upsertInboundEmail(
  inbound: InboundEnvelope,
  workProviderId: string | null,
  caseId: string | null,
  classification?: InboundClassificationDto,
  parserVrm?: string,
  /** When set (e.g. 'routed' for a linked reply), stamps triage_state on INSERT and ON
   *  CONFLICT; when omitted, INSERT defaults to 'new' and an existing state is preserved. */
  triageState?: string,
): Promise<string | null> {
  const subject = (inbound.subject ?? '').trim();
  // TKT-073: this helper's own varchar columns, clamped so a long value degrades instead
  // of silently losing the whole triage row (the catch below swallows DB errors).
  const name = clampVarchar(`Email: ${subject || inbound.internetMessageId}`, 200).value;
  const categoryCode = classification
    ? INBOUND_CATEGORY_TO_INT[classification.category as InboundCategory] ?? null
    : null;
  const subtypeCode = classification
    ? INBOUND_SUBTYPE_TO_INT[classification.subtype as InboundSubtype] ?? null
    : null;
  // Prefer the parser-confirmed PDF VRM for the inbox triage row too (so it shows the same
  // mark the case persists), then the classifier body sniff, then the email-subject sniff.
  // body_vrm is varchar(16): an over-length sniff is junk — dropped, never truncated.
  const bodyVrm = vrmOrEmpty(parserVrm || classification?.bodyVrm || inbound.candidateVrm).value || null;
  const bodyCaseref =
    clampVarchar(classification?.bodyCaseref || inbound.candidateRef || '', 32).value || null;
  const bodyPreview = (inbound.bodyPreview ?? '') || null;
  const confidence = classification ? classification.confidence : null;
  const signals = classification ? JSON.stringify(classification.signals ?? []) : null;
  const bodyJobref = clampVarchar(classification?.bodyJobref, 64).value || null;
  const conversationId = (inbound.conversationId ?? '').trim() || null;
  // An identifier must remain byte-for-byte exact. Reject an impossible oversize value
  // instead of truncating it into a different (and unusable) message identity.
  const rawGraphMessageId = (inbound.graphMessageId ?? '').trim();
  const normalizedOutlookWebLink = normalizeOutlookWebLink(inbound.outlookWebLink) ?? null;
  // Persist the Graph identity + browser target as one tuple. Partial input stores
  // neither value, so an at-least-once replay can never combine one message's id with
  // another delivery's link under the same mailbox-qualified Internet-Message-Id.
  const hasCompleteOutlookTuple =
    rawGraphMessageId.length > 0 &&
    rawGraphMessageId.length <= 1_024 &&
    normalizedOutlookWebLink !== null;
  const graphMessageId = hasCompleteOutlookTuple ? rawGraphMessageId : null;
  const outlookWebLink = hasCompleteOutlookTuple ? normalizedOutlookWebLink : null;
  try {
    // Base statement occupies $1..$18 below (unchanged from before Phase 2) — optional
    // columns, if present live, are appended starting at $19.
    const presentCols = await tableColumns('inbound_email');
    const optional = planOptionalColumns(
      'inbound_email',
      [
        { column: 'body_jobref', value: bodyJobref },
        { column: 'conversation_id', value: conversationId },
        { column: 'graph_message_id', value: graphMessageId },
        { column: 'outlook_web_link', value: outlookWebLink },
      ],
      presentCols,
      19,
    );
    const optionalColsFragment = optional.cols.length ? `, ${optional.cols.join(', ')}` : '';
    const optionalValsFragment = optional.placeholders.length
      ? `, ${optional.placeholders.join(', ')}`
      : '';
    const optionalUpdateFragment = optional.updateSets.length
      ? `${optional.updateSets.join(',\n         ')},\n         `
      : '';

    const rows = await query<{ id: string }>(
      `INSERT INTO inbound_email
         (name, source_message_id, subject, from_address, sender_domain,
          source_mailbox, received_on, has_attachments, category_code, subtype_code,
          confidence, classifier_mode, signals, triage_state, body_vrm, body_caseref,
          body_preview, case_id, work_provider_id${optionalColsFragment})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'deterministic',$12,COALESCE($18, 'new'),$13,$14,$15,$16,$17${optionalValsFragment})
       ON CONFLICT (source_mailbox, source_message_id) DO UPDATE SET
         case_id          = COALESCE(EXCLUDED.case_id, inbound_email.case_id),
         category_code    = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.category_code
                              ELSE COALESCE(EXCLUDED.category_code, inbound_email.category_code)
                            END,
         subtype_code     = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.subtype_code
                              ELSE COALESCE(EXCLUDED.subtype_code, inbound_email.subtype_code)
                            END,
         confidence       = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.confidence
                              ELSE COALESCE(EXCLUDED.confidence, inbound_email.confidence)
                            END,
         signals          = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.signals
                              ELSE COALESCE(EXCLUDED.signals, inbound_email.signals)
                            END,
         body_vrm         = COALESCE(EXCLUDED.body_vrm, inbound_email.body_vrm),
         body_caseref     = COALESCE(EXCLUDED.body_caseref, inbound_email.body_caseref),
         body_preview     = COALESCE(EXCLUDED.body_preview, inbound_email.body_preview),
         work_provider_id = COALESCE(EXCLUDED.work_provider_id, inbound_email.work_provider_id),
         ${optionalUpdateFragment}triage_state     = CASE
                              WHEN inbound_email.triage_state IN ('actioned','dismissed')
                                THEN inbound_email.triage_state
                              ELSE COALESCE($18, inbound_email.triage_state)
                            END,
         updated_at       = now()
       RETURNING id`,
      [
        name,
        inbound.internetMessageId ?? null,
        subject || null,
        inbound.senderAddress ?? null,
        senderDomain(inbound.senderAddress ?? ''),
        (inbound.sourceMailbox ?? '').trim().toLowerCase() || null,
        inbound.receivedAt ?? null,
        (inbound.attachments?.length ?? 0) > 0,
        categoryCode,
        subtypeCode,
        confidence,
        signals,
        bodyVrm,
        bodyCaseref,
        bodyPreview,
        caseId,
        workProviderId,
        triageState ?? null,
        ...optional.values,
      ],
    );
    const inboundEmailId = rows[0]?.id ?? null;
    // Stamp the classifier SUGGESTION distinctly (fill-if-null) so a later staff override is
    // visible (work-todo-spike: suggested-tags). Guarded: the suggested_* columns may be
    // absent on a not-yet-migrated DB — a failure here must not block intake.
    if (inboundEmailId && classification && (categoryCode != null || subtypeCode != null)) {
      await query(
        `UPDATE inbound_email
            SET suggested_category_code = COALESCE(suggested_category_code, $2),
                suggested_subtype_code  = COALESCE(suggested_subtype_code, $3)
          WHERE id = $1`,
        [inboundEmailId, categoryCode, subtypeCode],
      ).catch(() => { /* suggested_* columns absent pre-migration — best-effort */ });
    }
    return inboundEmailId;
  } catch {
    // inbound_email is triage provenance; failure must not block primary intake.
    return null;
  }
}
