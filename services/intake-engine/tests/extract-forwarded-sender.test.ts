/* ============================================================
   Stage 0 — recovering the original sender from a staff forward.

   These cover the gap the rest of the corpus suite hid: every other pipeline fixture
   passes `senderAddress` in directly as the ideal provider address, so the engine had
   never been exercised against the alpha's real mail shape (staff forward, envelope
   `From` = Collision Engineers).
   ============================================================ */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  extractForwardedSender,
  resolveIdentifyingSender,
} from '../src/pipeline/extract-forwarded-sender.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(HERE, 'corpus', name), 'utf8');

const STAFF = 'sam.baker@collisionengineers.co.uk';

describe('extractForwardedSender', () => {
  it('recovers the provider address from a real staff-forward body', () => {
    const result = extractForwardedSender(fixture('qdos-staff-forward-audit.txt'));
    expect(result.originalSender).toBe('instructions@qdosassist.co.uk');
    expect(result.rawFromValue).toBe('Instructions <instructions@qdosassist.co.uk>');
  });

  it('handles a bare address with no display name', () => {
    const body = 'FYI\n\nFrom: instructions@qdosassist.co.uk\nSent: today\nSubject: x\n\nbody';
    expect(extractForwardedSender(body).originalSender).toBe('instructions@qdosassist.co.uk');
  });

  it('handles a quoted display name', () => {
    const body = 'FYI\n\nFrom: "QDOS Assist" <instructions@qdosassist.co.uk>\nTo: a@b.com\nSubject: x';
    expect(extractForwardedSender(body).originalSender).toBe('instructions@qdosassist.co.uk');
  });

  it('takes the FIRST block — the most recent original sender in a chain', () => {
    const body = [
      'From: first@qdosassist.co.uk',
      'Sent: today',
      'Subject: x',
      '',
      'From: deeper@example.com',
      'Sent: yesterday',
      'Subject: y',
    ].join('\n');
    expect(extractForwardedSender(body).originalSender).toBe('first@qdosassist.co.uk');
  });

  // The precision guard the Python twin's comment calls out explicitly.
  it('does NOT match prose containing "From:" without the header cascade', () => {
    const body = 'As noted From: our internal notes, the vehicle was inspected last week.';
    expect(extractForwardedSender(body).originalSender).toBe('');
  });

  it('returns empty for a body with no quoted header block at all', () => {
    expect(extractForwardedSender('Please arrange an inspection.').originalSender).toBe('');
  });

  it('returns empty (never guesses) when the From: value is not a parseable address', () => {
    const body = 'From: the claims team\nSent: today\nSubject: x';
    const result = extractForwardedSender(body);
    expect(result.originalSender).toBe('');
    expect(result.rawFromValue).toBe('the claims team');
  });

  it('is empty-safe', () => {
    expect(extractForwardedSender('').originalSender).toBe('');
  });
});

describe('resolveIdentifyingSender', () => {
  it('prefers the forwarded original over the staff envelope sender', () => {
    const result = resolveIdentifyingSender(STAFF, fixture('qdos-staff-forward-audit.txt'));
    expect(result).toMatchObject({
      senderAddress: 'instructions@qdosassist.co.uk',
      source: 'forwarded_header',
    });
  });

  it('falls through to the envelope sender for a direct arrival', () => {
    // A REAL direct-arrival body: Graph gives us the message body only, never the
    // envelope headers. Note the older corpus fixtures (qdos-direct-standard.txt etc.)
    // do open with literal `From:`/`Subject:` lines — that is an authoring artifact of
    // how those files were written, not what a live direct body looks like. See the
    // benign-collision case below.
    const body = "Please arrange a standard engineer inspection for the above vehicle at the\npolicyholder's address.";
    const result = resolveIdentifyingSender('instructions@qdosassist.co.uk', body);
    expect(result).toMatchObject({
      senderAddress: 'instructions@qdosassist.co.uk',
      source: 'envelope',
    });
  });

  it('a corpus fixture whose text embeds header lines resolves to the same address anyway', () => {
    // qdos-direct-standard.txt embeds `From:`+`Subject:`, so it DOES match the quoted
    // header shape. Harmless: the address it yields is the same one the envelope
    // carries, so the resolved sender is identical either way. Asserted so the
    // collision is recorded rather than discovered later.
    const result = resolveIdentifyingSender('instructions@qdosassist.co.uk', fixture('qdos-direct-standard.txt'));
    expect(result.senderAddress).toBe('instructions@qdosassist.co.uk');
    expect(result.source).toBe('forwarded_header');
  });

  it('falls back to the envelope sender when the block exists but is unparseable', () => {
    const result = resolveIdentifyingSender(STAFF, 'From: the claims team\nSent: today\nSubject: x');
    expect(result).toMatchObject({ senderAddress: STAFF, source: 'envelope' });
  });
});
