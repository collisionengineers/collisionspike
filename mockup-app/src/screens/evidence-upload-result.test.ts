import { describe, expect, it } from 'vitest';
import type { EvidenceUploadResult } from '../data';
import {
  addEvidenceTopLevelMessage,
  evidenceUploadIsComplete,
  manualIntakeEvidenceNotice,
} from './evidence-upload-result';

function result(overrides: Partial<EvidenceUploadResult> = {}): EvidenceUploadResult {
  return {
    status: 201,
    added: [{ fileIndex: 0, fileName: 'photo.jpg', evidenceId: 'ev-1', duplicate: false }],
    rejected: [],
    ...overrides,
  };
}

describe('evidence upload completion', () => {
  it('requires one confirmed identity per selected file and no refusals', () => {
    expect(evidenceUploadIsComplete(result(), 1)).toBe(true);
    expect(evidenceUploadIsComplete(result({ status: 207 }), 1)).toBe(false);
    expect(evidenceUploadIsComplete(result({ added: [] }), 1)).toBe(false);
    expect(evidenceUploadIsComplete(result({
      added: [
        { fileIndex: 0, fileName: 'same.jpg', evidenceId: 'ev-1', duplicate: false },
        { fileIndex: 0, fileName: 'same.jpg', evidenceId: 'ev-2', duplicate: false },
      ],
    }), 2)).toBe(false);
    expect(evidenceUploadIsComplete(result({
      rejected: [{ fileIndex: 0, fileName: 'photo.jpg', reason: 'Not added' }],
    }), 1)).toBe(false);
    expect(evidenceUploadIsComplete(result(), 2)).toBe(false);
  });
});

describe('Add evidence top-level result copy', () => {
  it('explains authorization and server failures without showing raw server wording', () => {
    expect(addEvidenceTopLevelMessage(result({ status: 401, added: [], error: 'Missing bearer token' }), 1))
      .toContain('sign-in has expired');
    expect(addEvidenceTopLevelMessage(result({ status: 403, added: [], error: 'forbidden' }), 1))
      .toContain('permission');
    expect(addEvidenceTopLevelMessage(result({ status: 500, added: [], error: 'internal' }), 1))
      .toBe('The files could not be added right now. Try again.');
  });

  it('keeps identity-free and other top-level refusals visible for retry', () => {
    expect(addEvidenceTopLevelMessage(result({ added: [] }), 1)).toContain('could not confirm');
    expect(addEvidenceTopLevelMessage(result({ status: 400, added: [], error: 'bad request' }), 1))
      .toContain('Check the selected case and files');
    expect(addEvidenceTopLevelMessage(result(), 1)).toBeUndefined();
    expect(addEvidenceTopLevelMessage(result({
      status: 207,
      rejected: [{ fileIndex: 0, fileName: 'photo.jpg', reason: 'Not added' }],
    }), 1)).toBeUndefined();
  });
});

describe('manual intake evidence notice', () => {
  it('reports complete success only when every selected photo has an identity', () => {
    expect(manualIntakeEvidenceNotice(result(), 1)).toEqual({
      complete: true,
      intent: 'success',
      message: 'Case created — 1 photo attached',
    });
    expect(manualIntakeEvidenceNotice(result({ status: 207 }), 1).complete).toBe(false);
  });

  it('treats a mixed 207 and an identity shortfall as incomplete while the case still opens', () => {
    const partial = result({
      status: 207,
      rejected: [{ fileIndex: 1, fileName: 'second.jpg', reason: 'Not added' }],
    });
    expect(manualIntakeEvidenceNotice(partial, 2)).toEqual({
      complete: false,
      intent: 'error',
      message: 'Case created — 1 of 2 photos attached. Add the remaining photo from the case.',
    });
    expect(manualIntakeEvidenceNotice(result({ added: [] }), 1)).toMatchObject({
      complete: false,
      intent: 'error',
    });
  });
});
