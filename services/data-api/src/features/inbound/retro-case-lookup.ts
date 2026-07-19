/**
 * services/data-api/src/features/inbound/retro-case-lookup.ts — the shared retro existence
 * ladder + inbound-link primitives (extracted from retro-routes.ts, ADR-0022 / TKT-058).
 *
 * These are the read/link building blocks every retro route reaches for: the ANY-STATUS
 * existence probe (the whole point of the surface — linkReply matches open cases only), the
 * mailbox-qualified trigger-link read, and the first-link-wins envelope linker. Behaviour is
 * byte-identical to the inline versions; only the file boundary moved.
 */

import { query, type TxQuery } from '../../platform/db/client.js';
import { type Row } from '../../shared/mapping/index.js';
import { upsertInboundEmail } from './persistence.js';
import { type InboundClassificationDto, type InboundEnvelope } from './internal/inbound-identity.js';
import { type NormalisedRetroKeys } from './retro-validate.js';

export interface ExistingCaseRow extends Row {
  id: string;
  case_po: string | null;
  case_ref: string | null;
  vrm: string | null;
  status_code: number;
}

/**
 * The ANY-STATUS existence ladder (the whole point of this surface — linkReply matches
 * open cases only): probe the strongest present key first, falling to the next only on
 * ZERO hits. Reference keys probe case_po AND case_ref (either may hold the token); the
 * VRM probe is provider-scoped when a provider is known (ADR-0010: never auto-link
 * across providers on a registration alone) and single-hit-only either way.
 */
export async function findExistingCases(
  q: TxQuery,
  keys: NormalisedRetroKeys,
  providerId: string | null,
): Promise<{ rows: ExistingCaseRow[]; matchedBy: 'case_po' | 'external_ref' | 'vrm' | null }> {
  const SELECT = 'SELECT id, case_po, case_ref, vrm, status_code FROM case_';
  for (const [token, matchedBy] of [
    [keys.casePo, 'case_po'],
    [keys.externalRef, 'external_ref'],
  ] as const) {
    if (!token) continue;
    const rows = await q<ExistingCaseRow>(
      `${SELECT} WHERE (upper(case_po) = upper($1) OR upper(case_ref) = upper($1)) ORDER BY created_at`,
      [token],
    );
    if (rows.length > 0) return { rows, matchedBy };
  }
  if (keys.vrm) {
    const rows = providerId
      ? await q<ExistingCaseRow>(`${SELECT} WHERE vrm = $1 AND work_provider_id = $2 ORDER BY created_at`, [
          keys.vrm,
          providerId,
        ])
      : await q<ExistingCaseRow>(`${SELECT} WHERE vrm = $1 ORDER BY created_at`, [keys.vrm]);
    if (rows.length > 0) return { rows, matchedBy: 'vrm' };
  }
  return { rows: [], matchedBy: null };
}

/** The trigger row's presence + current case link, MAILBOX-QUALIFIED to the dedup key
 *  (source_mailbox, source_message_id) — an eml-arm anchor can share an Internet-Message-Id
 *  with the live delivery in a real mailbox, and an unqualified read would see the wrong
 *  row (NEVER RE-POINT guard + the exists probe for classification preservation). */
export async function currentInboundLink(
  internetMessageId: string,
  sourceMailbox: string,
): Promise<{ exists: boolean; caseId: string | null }> {
  const rows = await query<Row>(
    `SELECT case_id FROM inbound_email WHERE source_message_id = $1 AND source_mailbox = $2`,
    [internetMessageId, (sourceMailbox ?? '').trim().toLowerCase()],
  );
  return { exists: rows.length > 0, caseId: (rows[0]?.case_id as string | null) ?? null };
}

/** Link one envelope's inbound_email row to a case ('routed'). The upsert SQL enforces
 *  first-link-wins atomically; true means THIS case holds the link (pre-existing or
 *  stamped now) — a lost race to another case, or a swallowed upsert failure, is false. */
export async function linkEnvelopeRow(
  envelope: InboundEnvelope,
  providerId: string | null,
  caseId: string,
  classification?: InboundClassificationDto,
): Promise<boolean> {
  const existing = await currentInboundLink(envelope.internetMessageId, envelope.sourceMailbox);
  if (existing.caseId) return existing.caseId === caseId;
  const { linkedCaseId } = await upsertInboundEmail(
    envelope, providerId, caseId, classification, undefined, 'routed',
  );
  return linkedCaseId === caseId;
}
