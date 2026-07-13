import { describe, expect, it, vi } from 'vitest';
import {
  associateOutstandingImageChasersWithFileRequest,
  imageChaserRequiresUploadLink,
  markImageChasersResponded,
} from './image-chasers.js';

describe('image chaser upload-link lifecycle', () => {
  it.each([
    'Image request',
    'Image upload link',
    'Overview photo request',
    'Photo reminder',
    'Pictures needed',
    'Vehicle pics',
  ])(
    'recognises %s as an image chaser',
    (label) => expect(imageChaserRequiresUploadLink(label)).toBe(true),
  );

  it('does not classify instruction or cadence chasers as image requests', () => {
    expect(imageChaserRequiresUploadLink('Instruction request')).toBe(false);
    expect(imageChaserRequiresUploadLink('Weekly chase')).toBe(false);
  });

  it('associates an existing image draft with the validated request', async () => {
    const q = vi.fn(async (_sql: string, _params?: unknown[]) => [
      { id: 'ch-1' },
      { id: 'ch-2' },
    ]);
    await expect(associateOutstandingImageChasersWithFileRequest(
      q as never,
      'case-1',
      '9001',
      'https://app.box.com/f/token',
    )).resolves.toBe(2);
    expect(String(q.mock.calls[0][0])).toMatch(/template_used = ANY/);
    expect(String(q.mock.calls[0][0])).toMatch(/photograph/);
    expect(q.mock.calls[0][1]).toEqual(expect.arrayContaining(['case-1', '9001']));
  });

  it('responds only image-linked/image-template chasers and audits the exact rows', async () => {
    const q = vi.fn(async (sql: string) => {
      if (sql.includes('UPDATE chaser')) return [{ id: 'ch-image' }];
      return [];
    });
    await expect(markImageChasersResponded(q as never, 'case-1', 'archive upload')).resolves.toBe(1);
    expect(String(q.mock.calls[0][0])).toMatch(/box_file_request_id IS NOT NULL/);
    expect(String(q.mock.calls[0][0])).toMatch(/photograph/);
    expect(q.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO audit_event'))).toBe(true);
  });
});
