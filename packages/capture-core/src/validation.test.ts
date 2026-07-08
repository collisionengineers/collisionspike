import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCEPTED_MIME_TYPES, DEFAULT_MAX_FILE_BYTES } from './checklist';
import { validateUploadRequest } from './validation';

const policy = {
  maxFileBytes: DEFAULT_MAX_FILE_BYTES,
  acceptedMimeTypes: DEFAULT_ACCEPTED_MIME_TYPES
};

describe('upload validation', () => {
  it('accepts a normal JPEG photo', () => {
    expect(
      validateUploadRequest(
        {
          shotId: 'overview',
          fileName: 'overview.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 3_000_000
        },
        policy
      )
    ).toEqual({ ok: true });
  });

  it('rejects an oversize photo', () => {
    expect(
      validateUploadRequest(
        {
          shotId: 'overview',
          fileName: 'overview.jpg',
          contentType: 'image/jpeg',
          sizeBytes: DEFAULT_MAX_FILE_BYTES + 1
        },
        policy
      ).ok
    ).toBe(false);
  });
});

