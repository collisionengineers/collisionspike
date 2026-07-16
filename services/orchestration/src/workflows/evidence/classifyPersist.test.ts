/**
 * classifyPersist row assembly (TKT-133) — the email-attachment evidence lane must carry
 * each attachment's sha256 (hashed at blob landing) so the Data API can dedup/link the
 * Box FILE.UPLOADED mirror twin on (case_id, sha256). Pure builder only — no Durable
 * harness (the triagePolicy.test.ts convention).
 */
import { describe, expect, it } from 'vitest';
import { buildBaseEvidenceRows } from './classifyPersist.js';
import type { InboundEnvelope } from '../intake/fetchMessage.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_EML = 'e'.repeat(64);

function attachment(
  overrides: Partial<InboundEnvelope['attachments'][number]> = {},
): InboundEnvelope['attachments'][number] {
  return {
    filename: 'IMG_0421.jpg',
    contentType: 'image/jpeg',
    blobPath: 'msg-1/IMG_0421.jpg',
    size: 123_456,
    sha256: SHA_A,
    ...overrides,
  };
}

describe('buildBaseEvidenceRows — TKT-133 sha256 carry-through', () => {
  it('carries sha256 onto every attachment row', () => {
    const rows = buildBaseEvidenceRows({
      attachments: [
        attachment(),
        attachment({ filename: 'instruction.pdf', contentType: 'application/pdf', blobPath: 'msg-1/instruction.pdf', sha256: SHA_B }),
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].sha256).toBe(SHA_A);
    expect(rows[1].sha256).toBe(SHA_B);
  });

  it('still classifies via describeEvidence (image vs instruction) alongside the hash', () => {
    const rows = buildBaseEvidenceRows({
      attachments: [
        attachment(),
        attachment({ filename: 'instruction.pdf', contentType: 'application/pdf', blobPath: 'msg-1/instruction.pdf', sha256: SHA_B }),
      ],
    });
    expect(rows[0].evidenceClass).toBe('image');
    expect(rows[0].isImage).toBe(true);
    expect(rows[1].evidenceClass).toBe('instruction');
    expect(rows[1].isInstruction).toBe(true);
  });

  it('omits sha256 entirely when the envelope predates the hash (replay-safe)', () => {
    const withoutHash = attachment();
    delete (withoutHash as { sha256?: string }).sha256;
    const rows = buildBaseEvidenceRows({ attachments: [withoutHash] });
    expect(rows).toHaveLength(1);
    expect('sha256' in rows[0]).toBe(false);
  });

  it('adds the raw .eml row as email-class evidence with its own sha256', () => {
    const rows = buildBaseEvidenceRows({
      attachments: [attachment()],
      rawEml: {
        filename: 'message-ab12cd34.eml',
        contentType: 'message/rfc822',
        blobPath: 'msg-1/message-ab12cd34.eml',
        size: 17_600_000,
        sha256: SHA_EML,
      },
    });
    expect(rows).toHaveLength(2);
    const eml = rows[1];
    expect(eml.evidenceClass).toBe('email');
    expect(eml.isImage).toBe(false);
    expect(eml.isInstruction).toBe(false);
    expect(eml.sha256).toBe(SHA_EML);
  });

  it('omits the raw .eml row when the $value capture failed (rawEml absent)', () => {
    const rows = buildBaseEvidenceRows({ attachments: [attachment()] });
    expect(rows).toHaveLength(1);
  });
});
