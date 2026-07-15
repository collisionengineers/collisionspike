/** held-reason — reusable feature support. */

import { type ProviderResolutionSource } from '../inbound/internal/service-support.js';

export interface HeldReason {
  noteName: string;
  noteText: string;
  auditSummary: string;
}

export function buildHeldReason(input: {
  senderDomain: string;
  /** null → true unknown sender (New-client wording). */
  intermediary: {
    /** Intermediary display name (image_source.name); '' tolerated. */
    name: string;
    /** Candidate providers' display names; may be empty (intermediary with no links yet). */
    candidateNames: readonly string[];
    /** Display name of the provider resolved onto the case; resolutionSource says why.
     *  Empty when the name lookup failed or the provider is still unresolved. */
    resolvedProviderName: string;
    resolutionSource: ProviderResolutionSource;
  } | null;
}): HeldReason {
  const { senderDomain: domain, intermediary } = input;
  if (!intermediary) {
    return {
      noteName: 'New client',
      noteText:
        `New client — no work provider matched for sender${domain ? ` @${domain}` : ''}. ` +
        `No Case/PO has been created. Set up the work provider and confirm before EVA.`,
      auditSummary: 'New client routed to Held (no work provider matched)',
    };
  }
  const who = intermediary.name.trim()
    ? `Intermediary sender (${intermediary.name.trim()})`
    : 'Intermediary sender';
  const resolvedName = intermediary.resolvedProviderName.trim();
  if (intermediary.resolutionSource === 'instruction_content') {
    return {
      noteName: 'Held — intermediary sender',
      noteText:
        `${who}: ${
          resolvedName
            ? `the instructions identify ${resolvedName} as the provider`
            : 'the instructions identify the provider'
        }. ` +
        `No Case/PO has been created. Confirm the provider before EVA.`,
      auditSummary: 'Intermediary sender routed to Held (provider found in the instructions)',
    };
  }
  if (intermediary.resolutionSource === 'single_intermediary') {
    return {
      noteName: 'Held — intermediary sender',
      noteText:
        `${who}: This intermediary routes work to one provider` +
        (resolvedName ? `, ${resolvedName},` : ',') +
        ` which has been selected. No Case/PO has been created. Confirm the provider before EVA.`,
      auditSummary: 'Intermediary sender routed to Held (single provider selected)',
    };
  }
  const candidates = intermediary.candidateNames.map((n) => n.trim()).filter(Boolean);
  return {
    noteName: 'Held — intermediary sender',
    noteText:
      `${who}: the instructing provider could not be determined from the instruction.` +
      (candidates.length ? ` Possible providers: ${candidates.join(', ')}.` : '') +
      ` No Case/PO has been created. Pick the provider and confirm before EVA.`,
    auditSummary: 'Intermediary sender routed to Held (provider not yet confirmed)',
  };
}
