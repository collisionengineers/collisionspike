import { describe, expect, it } from 'vitest';
import {
  appendManualIntakeFiles,
  manualIntakeBatchRejection,
  manualIntakeFileRejection,
  nextManualInstruction,
  partitionManualIntakeFiles,
  type ManualIntakeFileLike,
} from './manual-intake-files';

const file = (name: string, type: string): ManualIntakeFileLike => ({ name, type });

describe('manual intake file partition', () => {
  it('keeps GIF, HEIC and TIFF visible in the rejected partition', () => {
    const unsupported = [
      file('damage.gif', 'image/gif'),
      file('vehicle.heic', 'image/heic'),
      file('inspection.tiff', 'image/tiff'),
    ];

    const result = partitionManualIntakeFiles(unsupported);

    expect(result.accepted).toEqual([]);
    expect(result.rejected.map(({ file: rejected }) => rejected.name)).toEqual([
      'damage.gif',
      'vehicle.heic',
      'inspection.tiff',
    ]);
    expect(result.rejected.map(({ reason }) => reason)).toEqual([
      'This image can’t be added. Use JPG, PNG or WebP.',
      'This image can’t be added. Use JPG, PNG or WebP.',
      'This image can’t be added. Use JPG, PNG or WebP.',
    ]);
  });

  it('accepts only the formats the intake and upload path can handle', () => {
    const result = partitionManualIntakeFiles([
      file('instructions.pdf', 'application/pdf'),
      file('overview.jpg', 'image/jpeg'),
      file('damage.webp', 'image/webp'),
      file('scan.png', 'image/png'),
      file('hidden.gif', 'image/gif'),
    ]);

    expect(result.accepted.map((accepted) => accepted.name)).toEqual([
      'instructions.pdf',
      'overview.jpg',
      'damage.webp',
      'scan.png',
    ]);
    expect(result.rejected.map(({ file: rejected }) => rejected.name)).toEqual(['hidden.gif']);
  });

  it('gives other unsupported files concise handler-facing guidance', () => {
    expect(manualIntakeFileRejection(file('notes.txt', 'text/plain'))).toBe(
      'This file can’t be added. Use PDF, JPG, PNG or WebP.',
    );
  });

  it('does not promise Word or email files that the canonical upload rejects', () => {
    const result = partitionManualIntakeFiles([
      file('instructions.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      file('instructions.doc', 'application/msword'),
      file('message.eml', 'message/rfc822'),
      file('message.msg', 'application/vnd.ms-outlook'),
    ]);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(4);
  });

  it('mirrors the server count, per-file and aggregate-size boundaries', () => {
    expect(manualIntakeFileRejection({
      name: 'empty.pdf',
      type: 'application/pdf',
      size: 0,
    })).toContain('empty');
    expect(manualIntakeFileRejection({
      name: 'large.pdf',
      type: 'application/pdf',
      size: (15 * 1024 * 1024) + 1,
    })).toContain('15 MB');
    expect(manualIntakeBatchRejection(
      Array.from({ length: 21 }, (_, index) => file(`${index}.pdf`, 'application/pdf')),
    )).toContain('20 files');
    expect(manualIntakeBatchRejection([
      { name: 'a.pdf', type: 'application/pdf', size: 60 * 1024 * 1024 },
      { name: 'b.pdf', type: 'application/pdf', size: 60 * 1024 * 1024 },
    ])).toContain('too large');
  });

  it('matches server MIME and extension checks, including contradictions', () => {
    expect(manualIntakeFileRejection(file('fake.pdf', 'image/jpeg')))
      .toBe('That file name and format do not match.');
    expect(manualIntakeFileRejection(file('fake.jpg', 'application/pdf')))
      .toBe('That file name and format do not match.');
    expect(manualIntakeFileRejection(file('scan.pdf', 'application/octet-stream')))
      .toBeUndefined();
    expect(manualIntakeFileRejection(file('scan', 'application/pdf'))).toBeUndefined();
    expect(manualIntakeFileRejection(file('scan.txt', 'application/pdf'))).toBeDefined();
  });

  it('keeps distinct files with identical names and sizes for server-side hashing', () => {
    const first = { name: 'scan.pdf', type: 'application/pdf', size: 4, bytes: 'aaaa' };
    const second = { name: 'scan.pdf', type: 'application/pdf', size: 4, bytes: 'bbbb' };
    expect(appendManualIntakeFiles([first], [second])).toEqual([first, second]);
  });

  it('never promotes an extra PDF to instruction during recovery', () => {
    const extra = file('estimate.pdf', 'application/pdf');
    expect(nextManualInstruction(undefined, [extra], false)).toBeUndefined();
    expect(nextManualInstruction(undefined, [extra], true)).toBe(extra);
  });
});
