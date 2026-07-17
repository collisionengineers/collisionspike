/* ============================================================
   inbox-email-type — PURE helpers for the single-list inbox's "E-mail type"
   filter (TKT-054 / 020726 E1-E2). No React — Inbox.tsx renders these.

   The taxonomy display constants moved here from Inbox.tsx when the category
   TabList was removed: one compact dropdown (categories with their subtypes)
   is now the only type filter, applied CLIENT-SIDE over the loaded rows.

   URL scheme: `?type=<categoryId|subtypeId>` (omitted = all) + `?dismissed=1`
   (show dismissed).
   ============================================================ */

import {
  INBOUND_CATEGORIES,
  INBOUND_SUBTYPES,
  type InboundCategory,
  type InboundEmail,
  type InboundSubtype,
} from '@cs/domain';

export const CATEGORY_ORDER: InboundCategory[] = [
  'receiving_work',
  'query',
  'website_enquiry',
  'case_update',
  // Taxonomy v3 (TKT-084) — directions held for a later official instruction.
  'pre_instruction',
  'cancellation',
  'billing',
  'non_actionable',
  'other',
];

export const CATEGORY_LABEL: Record<InboundCategory, string> = {
  receiving_work: 'Receiving work',
  query: 'Queries',
  website_enquiry: 'Website enquiries',
  case_update: 'Case updates',
  pre_instruction: 'Pre-instruction',
  cancellation: 'Cancellations',
  billing: 'Billing',
  non_actionable: 'No action',
  other: 'Other',
};

export const SUBTYPE_LABEL: Record<InboundSubtype, string> = {
  existing_provider_instruction: 'Provider instruction',
  existing_provider_audit: 'Audit re-inspection',
  existing_provider_diminution: 'Diminution',
  new_client_work: 'New client work',
  query_existing_work: 'Case query',
  query_new_enquiry: 'New enquiry',
  website_general_enquiry: 'Website enquiry',
  billing_request: 'Invoice request',
  case_summary: 'Case summary',
  acknowledgement: 'Acknowledgement',
  images_received: 'Images received',
  cancellation_notice: 'Cancellation notice',
  update_general: 'Case update',
  // Taxonomy v3 (TKT-105/120 + TKT-084).
  payment_remittance: 'Payment received',
  pre_instruction_directions: 'Pre-instruction directions',
  // TKT-226 — correspondence retro-linked to a reconstructed case (system-stamped).
  retro_related: 'Related (retro-linked)',
  other: 'Unidentified',
};

/** Subtypes that belong under each category — drives the grouped dropdown options. */
export const SUBTYPES_BY_CATEGORY: Record<InboundCategory, InboundSubtype[]> = {
  receiving_work: [
    'existing_provider_instruction',
    'existing_provider_audit',
    'existing_provider_diminution',
    'new_client_work',
  ],
  // The Enquiries-vs-Case-Queries split (TKT-034) lives here, as the two query subtypes.
  query: ['query_existing_work', 'query_new_enquiry'],
  website_enquiry: ['website_general_enquiry'],
  case_update: ['images_received', 'update_general', 'retro_related'],
  pre_instruction: ['pre_instruction_directions'],
  cancellation: ['cancellation_notice'],
  // payment_remittance (taxonomy v3, TKT-105/120): an inbound remittance advice /
  // transfer notice — the mirror-image of the invoice request.
  billing: ['billing_request', 'payment_remittance'],
  non_actionable: ['case_summary', 'acknowledgement'],
  other: ['other'],
};

/** One dropdown filter over the whole taxonomy: everything, a category, or one subtype. */
export type EmailTypeFilter =
  | { kind: 'all' }
  | { kind: 'category'; category: InboundCategory }
  | { kind: 'subtype'; subtype: InboundSubtype };

export const EMAIL_TYPE_ALL: EmailTypeFilter = { kind: 'all' };

/** Parse `?type=` — category ids win over subtype ids on the one collision ('other'
 *  names both; the category is the broader — and here equivalent — read, since the
 *  Other category holds only the other subtype). Junk/absent -> all (never throws
 *  on a stale bookmark). */
export function parseEmailType(value: string | null): EmailTypeFilter {
  if (!value) return EMAIL_TYPE_ALL;
  if ((INBOUND_CATEGORIES as readonly string[]).includes(value)) {
    return { kind: 'category', category: value as InboundCategory };
  }
  if ((INBOUND_SUBTYPES as readonly string[]).includes(value)) {
    return { kind: 'subtype', subtype: value as InboundSubtype };
  }
  return EMAIL_TYPE_ALL;
}

/** Inverse of parseEmailType — the `?type=` value, or undefined for all (param omitted). */
export function emailTypeParam(f: EmailTypeFilter): string | undefined {
  if (f.kind === 'category') return f.category;
  if (f.kind === 'subtype') return f.subtype;
  return undefined;
}

/** The dropdown's button text. */
export function emailTypeDisplayLabel(f: EmailTypeFilter): string {
  if (f.kind === 'category') return CATEGORY_LABEL[f.category];
  if (f.kind === 'subtype') return SUBTYPE_LABEL[f.subtype];
  return 'All types';
}

/** Row predicate for the client-side type filter. */
export function matchesEmailType(
  e: Pick<InboundEmail, 'category' | 'subtype'>,
  f: EmailTypeFilter,
): boolean {
  if (f.kind === 'category') return e.category === f.category;
  if (f.kind === 'subtype') return e.subtype === f.subtype;
  return true;
}

export interface InboxFilterParams {
  emailType: EmailTypeFilter;
  showDismissed: boolean;
}

/** Read the two supported URL-backed filters without mutating other parameters. */
export function readInboxFilterParams(params: URLSearchParams): InboxFilterParams {
  return {
    emailType: parseEmailType(params.get('type')),
    showDismissed: params.get('dismissed') === '1',
  };
}
