import type { InboundClassification } from './classifyInbound.js';

/**
 * Whether the legacy reply-link lane may attach this non-minting email to a case.
 * Website forms are prospective-customer enquiries even if their generated message
 * unexpectedly carries threading headers or the visitor types a live reference.
 */
export function shouldLinkReplyToCase(
  classification: Pick<InboundClassification, 'category' | 'isReply'>,
): boolean {
  return classification.isReply && classification.category !== 'website_enquiry';
}
