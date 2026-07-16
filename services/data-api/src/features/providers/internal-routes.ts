/** internal-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { type CaseStatus } from '@cs/domain';
import { automationModeCodec, caseStatusCodec } from '@cs/domain/codecs';
import { query } from '../../platform/db/client.js';
import { type Row } from '../../shared/mapping/index.js';
import { hasColumn } from '../../platform/db/schema-introspection.js';
import { exactCaseForSourceMessage } from '../inbound/internal/inbound-identity.js';
import { TERMINAL_INT_CODES, withServiceAuth } from '../inbound/internal/service-support.js';

app.http('internalProviderMatchRecords', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/provider-match-records',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        'SELECT id, principal_code, known_email_domains, known_email_addresses, active, provider_automation_mode_code FROM work_provider ORDER BY display_name',
      );
      const providers = rows.map((r) => ({
        workProviderId: r.id as string,
        principalCode: r.principal_code as string,
        knownEmailDomains: parseDomains(r.known_email_domains),
        knownEmailAddresses: parseDomains(r.known_email_addresses),
        active: Boolean(r.active),
        // Lets the orchestrator branch on the matched provider's automation mode
        // (work-todo-spike: automation-mode). Default review_auto (the live default).
        providerAutomationMode:
          automationModeCodec.toName(r.provider_automation_mode_code) ?? 'review_auto',
      }));

      // image_source(kind=intermediary) LEFT JOINed through imagesource_workprovider so an
      // intermediary with zero linked providers still returns a row (candidateProviderIds:
      // []), never silently dropped. kind_code 100000002 = 'intermediary'
      // (000_enums_lookups.sql choice_image_source_kind) — hardcoded here because this
      // route only ever surfaces that one kind (no codec needed for a single literal).
      const imageSourceRows = await query<Row>(
        `SELECT img.id, img.name, img.email_domain,
                COALESCE(array_agg(iw.work_provider_id) FILTER (WHERE iw.work_provider_id IS NOT NULL), '{}') AS candidate_provider_ids
           FROM image_source img
           LEFT JOIN imagesource_workprovider iw ON iw.image_source_id = img.id
          WHERE img.kind_code = 100000002
          GROUP BY img.id, img.name, img.email_domain
          ORDER BY img.name`,
      );
      const imageSources = imageSourceRows.map((r) => ({
        imageSourceId: r.id as string,
        name: r.name as string,
        emailDomain: (r.email_domain as string | null) ?? '',
        kind: 'intermediary',
        candidateProviderIds: (r.candidate_provider_ids as string[] | null) ?? [],
      }));

      return { status: 200, jsonBody: { providers, imageSources } };
    }),
});

function parseDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const s = raw.trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((d) => String(d).trim()).filter(Boolean);
    } catch { /* fall through */ }
  }
  return s.split(/[\r\n,]+/).map((d) => d.trim()).filter(Boolean);
}

app.http('internalWorkProviderAiAllowed', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/work-provider/{id}/ai-allowed',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const workProviderId = req.params.id;
      if (!(await hasColumn('work_provider', 'ai_allowed'))) {
        return { status: 200, jsonBody: { aiAllowed: null } };
      }
      const rows = await query<Row>('SELECT ai_allowed FROM work_provider WHERE id = $1', [
        workProviderId,
      ]);
      const raw = rows[0]?.ai_allowed;
      const aiAllowed = raw == null ? null : Boolean(raw);
      return { status: 200, jsonBody: { aiAllowed } };
    }),
});

app.http('internalDedupContext', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/dedup-context',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const workProviderId = req.query.get('workProviderId') ?? '';
      const vrm = req.query.get('vrm') ?? '';
      const sourceMessageId = (req.query.get('messageId') ?? '').trim();
      const exactSourceOwner = sourceMessageId
        ? await exactCaseForSourceMessage(query, sourceMessageId)
        : null;

      // No provider matched (unknown sender, e.g. a non-provider gmail address):
      // there is nothing to dedup on the provider axis, and work_provider_id is a
      // uuid column so binding '' raises `invalid input syntax for type uuid`.
      // Return an empty context — the UNIQUE(source_message_id) insert backstop in
      // cases/resolve still guards a genuine repeat of the same message.
      if (!workProviderId) {
        return {
          status: 200,
          jsonBody: {
            openProviderCases: [],
            seenMessageIds: [],
            seenPayloadHashes: [],
            ...(exactSourceOwner ? { exactSourceOwner } : {}),
          },
        };
      }

      // Open same-provider cases (non-terminal) for the provider + VRM.
      // VRM = '' skips the VRM filter so resolveCase sees all provider cases.
      const caseRows = vrm
        ? await query<Row>(
            `SELECT id, case_ref, status_code, work_provider_id
               FROM case_
              WHERE work_provider_id = $1
                AND (vrm = $2 OR vrm IS NULL OR vrm = '')
                AND status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
              ORDER BY created_at`,
            [workProviderId, vrm],
          )
        : await query<Row>(
            `SELECT id, case_ref, status_code, work_provider_id
               FROM case_
              WHERE work_provider_id = $1
                AND status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
              ORDER BY created_at`,
            [workProviderId],
          );

      const openProviderCases = caseRows.map((r) => ({
        caseId: r.id as string,
        caseRef: (r.case_ref as string | null) ?? undefined,
        status: (caseStatusCodec.toName(r.status_code as number) ?? 'error') as CaseStatus,
        workProviderId: (r.work_provider_id as string | null) ?? undefined,
      }));

      // Seen message IDs for rung-1 repeat guard — provider-scoped from
      // case_ (the primary dedup key store).
      const msgRows = await query<Row>(
        `SELECT source_message_id FROM case_
          WHERE work_provider_id = $1 AND source_message_id IS NOT NULL`,
        [workProviderId],
      );
      const seenMessageIds = msgRows.map((r) => r.source_message_id as string);

      // Seen payload hashes — provider-scoped from case_.
      const hashRows = await query<Row>(
        `SELECT payload_hash FROM case_
          WHERE work_provider_id = $1 AND payload_hash IS NOT NULL`,
        [workProviderId],
      );
      const seenPayloadHashes = hashRows.map((r) => r.payload_hash as string);

      return {
        status: 200,
        jsonBody: {
          openProviderCases,
          seenMessageIds,
          seenPayloadHashes,
          ...(exactSourceOwner ? { exactSourceOwner } : {}),
        },
      };
    }),
});
