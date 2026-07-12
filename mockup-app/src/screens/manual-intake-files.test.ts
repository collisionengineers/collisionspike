import { describe, expect, it } from 'vitest';
import {
  manualIntakeFileRejection,
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
      'This file can’t be added. Use PDF, Word, email, JPG, PNG or WebP.',
    );
  });
});
