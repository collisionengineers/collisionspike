import { describe, expect, it } from 'vitest';
import { manualIntakeUploadOutcome } from './manual-intake-upload';

const files = [{ name: 'instruction.pdf' }, { name: 'overview.jpg' }, { name: 'damage.png' }];

describe('manual intake upload outcome', () => {
  it('reports the confirmed instruction role and every extra only when all identities exist', () => {
    const outcome = manualIntakeUploadOutcome({
      status: 201,
      added: files.map((file, fileIndex) => ({
        fileIndex,
        fileName: file.name,
        evidenceId: `evidence-${fileIndex}`,
        duplicate: false,
      })),
      rejected: [],
    }, files, 0);

    expect(outcome.complete).toBe(true);
    expect(outcome.message).toBe('Case created — the instruction and 2 extra files added');
    expect(outcome.items.map(({ role, state }) => ({ role, state }))).toEqual([
      { role: 'instruction', state: 'added' },
      { role: 'extra', state: 'added' },
      { role: 'extra', state: 'added' },
    ]);
  });

  it('keeps partial failure outstanding by original file index and never calls it complete', () => {
    const outcome = manualIntakeUploadOutcome({
      status: 207,
      added: [
        { fileIndex: 0, fileName: 'instruction.pdf', evidenceId: 'instruction-evidence', duplicate: false },
        { fileIndex: 2, fileName: 'damage.png', evidenceId: 'damage-evidence', duplicate: false },
      ],
      rejected: [{ fileIndex: 1, fileName: 'overview.jpg', reason: 'That image could not be read.' }],
    }, files, 0);

    expect(outcome.complete).toBe(false);
    expect(outcome.message).toContain('2 of 3 files added');
    expect(outcome.items[1]).toMatchObject({
      fileName: 'overview.jpg',
      state: 'outstanding',
      reason: 'That image could not be read.',
    });
  });

  it('treats an apparently successful response with a missing identity as incomplete', () => {
    const outcome = manualIntakeUploadOutcome({
      status: 201,
      added: [{ fileIndex: 0, fileName: 'instruction.pdf', evidenceId: 'instruction-evidence', duplicate: false }],
      rejected: [],
    }, files.slice(0, 2), 0);
    expect(outcome.complete).toBe(false);
    expect(outcome.items[1].state).toBe('outstanding');
  });
});
