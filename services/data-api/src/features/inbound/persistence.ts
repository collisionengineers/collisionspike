/** persistence — reusable feature support. */

import { normalizeOutlookWebLink, type InboundCategory, type InboundSubtype } from '@cs/domain';
import { query } from '../../platform/db/client.js';
import { INBOUND_CATEGORY_TO_INT, INBOUND_SUBTYPE_TO_INT } from '../../shared/mapping/index.js';
import { planOptionalColumns, tableColumns } from '../../platform/db/schema-introspection.js';
import { clampVarchar, vrmOrEmpty } from '../../shared/validation/varchar.js';
import { type InboundClassificationDto, type InboundEnvelope } from './internal/inbound-identity.js';
import { senderDomain } from './internal/service-support.js';

/** TKT-226 — loud unmapped-taxonomy guard. A non-empty classification name with no
 *  code-table mapping used to null out SILENTLY (`retro_related` rendered
 *  'Unidentified' for days with zero signal). The structured marker below is the
 *  metric — KQL-alertable (`traces | where message has "inboundTaxonomyUnmapped"`).
 *  NEVER throws: these run before upsertInboundEmail's try block, and triage
 *  provenance must not block primary intake. */
function unmappedTaxonomyCode(field: 'category' | 'subtype', value: string): null {
  console.error(JSON.stringify({ evt: 'inboundTaxonomyUnmapped', field, value }));
  return null;
}

/** The category code for a classification name, or null (loudly, when the name is
 *  non-empty but unmapped). PURE apart from the diagnostic marker. */
export function categoryCodeFor(name: string | null | undefined): number | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return null;
  return (
    INBOUND_CATEGORY_TO_INT[trimmed as InboundCategory] ??
    unmappedTaxonomyCode('category', trimmed)
  );
}

/** The subtype code for a classification name, or null (loudly, when the name is
 *  non-empty but unmapped). PURE apart from the diagnostic marker. */
export function subtypeCodeFor(name: string | null | undefined): number | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return null;
  return (
    INBOUND_SUBTYPE_TO_INT[trimmed as InboundSubtype] ?? unmappedTaxonomyCode('subtype', trimmed)
  );
}

/** TKT-226 — the ON CONFLICT subtype rule: subtype refreshes TOGETHER with category.
 *  Every caller supplies category+subtype as ONE classification tuple
 *  (InboundClassificationDto), so a mapped category arriving with a NULL subtype
 *  means "unmapped subtype name" — persisting a mismatched pair like
 *  (case_update, billing_request) is strictly worse than the honest
 *  (case_update, NULL) → 'Unidentified' (which the loud guard above now surfaces).
 *  `human` mode still freezes both halves. Exported so the test can pin the SQL. */
export const INBOUND_SUBTYPE_PAIR_REFRESH_SQL = `subtype_code     = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.subtype_code
                              WHEN EXCLUDED.category_code IS NOT NULL
                                THEN EXCLUDED.subtype_code
                              ELSE COALESCE(EXCLUDED.subtype_code, inbound_email.subtype_code)
                            END`;

/** TKT-230 (item 4) — clear a stale failure stamp on the FIRST link. retroRecordFailure
 *  stamps `attention_reason='unable_to_locate'`; when a later retro (or any) upsert fills
 *  case_id on that row, the stamp is a contradiction the chip keeps rendering. The CASE
 *  fires exactly on the unlinked→linked transition (old row case_id IS NULL, incoming row
 *  carries one) and otherwise preserves whatever is there — it never touches an
 *  already-linked row's reason. Emitted ONLY when the live table has the column (see the
 *  schema-tolerance note in upsertInboundEmail). Exported so the test can pin the SQL. */
export const INBOUND_ATTENTION_CLEAR_ON_LINK_SQL = `attention_reason = CASE
                              WHEN inbound_email.case_id IS NULL AND EXCLUDED.case_id IS NOT NULL
                                THEN NULL
                              ELSE inbound_email.attention_reason
                            END`;

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
  // TKT-226 — mapped via the LOUD helpers: a non-empty unmapped name logs the
  // inboundTaxonomyUnmapped marker instead of nulling silently (never throws).
  const categoryCode = classification ? categoryCodeFor(classification.category) : null;
  const subtypeCode = classification ? subtypeCodeFor(classification.subtype) : null;
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
    // TKT-230 (item 4) — SCHEMA-TOLERANT: attention_reason is NOT in the INSERT column list
    // (nothing here ever stamps it; only internalInboundAttention does), so the clear-on-link
    // SET may reference it only when the live table actually has the column — otherwise the
    // WHOLE upsert 500s on an older DB and primary intake silently loses its triage row.
    const attentionClearFragment = presentCols.has('attention_reason')
      ? `${INBOUND_ATTENTION_CLEAR_ON_LINK_SQL},\n         `
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
         ${attentionClearFragment}category_code    = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.category_code
                              ELSE COALESCE(EXCLUDED.category_code, inbound_email.category_code)
                            END,
         ${INBOUND_SUBTYPE_PAIR_REFRESH_SQL},
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
