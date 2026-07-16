import { describe, expect, it, vi } from 'vitest';
import {
  ADD_EVIDENCE_QUEUES,
  uploadEvidenceThenOpen,
  type EvidenceUploadAccess,
} from './add-evidence-submit';

const file = (name: string): File => ({ name } as File);

describe('Add evidence submit contract', () => {
  it('searches every active queue, including Held', () => {
    expect(ADD_EVIDENCE_QUEUES).toEqual(['not-ready', 'review', 'held']);
  });
  it('uploads first and opens the case only after every file has a persisted identity', async () => {
    const events: string[] = [];
    const access: EvidenceUploadAccess = {
      uploadEvidence: vi.fn(async (_caseId, _files, options) => {
        events.push(`upload:${options.source}:${options.idempotencyKey}`);
        return {
          status: 201,
          added: [
            { fileIndex: 0, fileName: 'a.jpg', evidenceId: 'ev-1', duplicate: false },
            { fileIndex: 1, fileName: 'b.pdf', evidenceId: 'ev-2', duplicate: false },
          ],
          rejected: [],
        };
      }),
    };
    const open = vi.fn((path: string) => events.push(`open:${path}`));

    await uploadEvidenceThenOpen(access, 'case-1', [file('a.jpg'), file('b.pdf')], 'key-123456789012', open);

    expect(events).toEqual([
      'upload:add_evidence:key-123456789012',
      'open:/case/case-1',
    ]);
  });

  it('never turns a partial failure into navigation and preserves the retry key', async () => {
    const seenOptions: unknown[] = [];
    const uploadEvidence = vi.fn(async (
      _caseId: string,
      _files: File[],
      options: { source: 'add_evidence'; idempotencyKey: string },
    ) => {
      seenOptions.push(options);
      return {
        status: 207,
        added: [{ fileIndex: 0, fileName: 'a.jpg', evidenceId: 'ev-1', duplicate: false }],
        rejected: [{ fileIndex: 1, fileName: 'b.pdf', reason: 'That file was not added. Try it again.' }],
      };
    });
    const access: EvidenceUploadAccess = { uploadEvidence };
    const open = vi.fn();
    const files = [file('a.jpg'), file('b.pdf')];

    await uploadEvidenceThenOpen(access, 'case-1', files, 'key-123456789012', open);
    await uploadEvidenceThenOpen(access, 'case-1', files, 'key-123456789012', open);

    expect(open).not.toHaveBeenCalled();
    expect(seenOptions[0]).toEqual(seenOptions[1]);
  });

  it('does not navigate on a stale target or an identity-free response', async () => {
    const open = vi.fn();
    const stale: EvidenceUploadAccess = {
      uploadEvidence: vi.fn(async () => ({
        status: 409,
        added: [],
        rejected: [{ fileIndex: 0, fileName: 'a.jpg', reason: 'This case has been merged.' }],
        targetCaseId: 'case-2',
      })),
    };
    await uploadEvidenceThenOpen(stale, 'case-1', [file('a.jpg')], 'key-123456789012', open);
    const identityFree: EvidenceUploadAccess = {
      uploadEvidence: vi.fn(async () => ({ status: 201, added: [], rejected: [] })),
    };
    await uploadEvidenceThenOpen(identityFree, 'case-1', [file('a.jpg')], 'key-123456789012', open);
    expect(open).not.toHaveBeenCalled();
  });
});
