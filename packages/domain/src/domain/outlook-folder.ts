/* ============================================================
   Suggested Outlook filing folder per e-mail type (TKT-054 / 020726 E6).

   ONE source of truth shared by:
     - the SPA "Suggested action" column ("File to <folder>"),
     - the Data API's POST /api/inbound/{id}/outlook-move (server derives the
       destination from the row's OWN subtype — a client-supplied folder is
       never trusted),
     - the orchestration mover (splits the path into Inbox child segments).

   Pure + browser-safe. Historically this mapping lived display-only in the SPA
   (Inbox.tsx suggestedFolderLabel, "suggestion only — not auto-applied"); with
   the gated Outlook-move path it became actionable, so it moved here.
   ============================================================ */

import type { InboundSubtype } from '../dto/index.js';

/** The Outlook folder path (under the shared-mailbox root) an e-mail type files to. */
export function suggestedOutlookFolder(subtype: InboundSubtype): string {
  switch (subtype) {
    case 'existing_provider_instruction':
      return 'Inbox/Instructions';
    case 'existing_provider_audit':
      return 'Inbox/Audits';
    case 'existing_provider_diminution':
      return 'Inbox/Diminution';
    case 'new_client_work':
      return 'Inbox/New clients';
    case 'query_existing_work':
      return 'Inbox/Queries/Case queries';
    case 'query_new_enquiry':
    case 'website_general_enquiry':
      return 'Inbox/Queries/Enquiries';
    case 'billing_request':
    // payment_remittance is the inbound mirror of billing_request (an incoming
    // remittance advice / transfer notice) — it files to Billing, not Other (TKT-105/120).
    case 'payment_remittance':
      return 'Inbox/Billing';
    // pre_instruction_directions are provider directions held for the later official
    // instruction (TKT-084 pre_instruction lane) — kept together in their own folder
    // rather than silently landing in Other.
    case 'pre_instruction_directions':
      return 'Inbox/Pre-instructions';
    case 'case_summary':
    case 'acknowledgement':
      return 'Inbox/No action';
    case 'images_received':
      return 'Inbox/Images';
    case 'cancellation_notice':
      return 'Inbox/Cancellations';
    case 'update_general':
      return 'Inbox/Case updates';
    default:
      return 'Inbox/Other';
  }
}

/**
 * The child-folder segments BELOW the well-known Inbox — what the mover walks/creates.
 * 'Inbox/Queries/Case queries' -> ['Queries', 'Case queries']; a bare 'Inbox' -> [].
 */
export function outlookFolderSegments(path: string): string[] {
  const parts = path.split('/').map((p) => p.trim()).filter(Boolean);
  return parts[0]?.toLowerCase() === 'inbox' ? parts.slice(1) : parts;
}
