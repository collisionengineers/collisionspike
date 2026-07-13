import { describe, expect, it, vi } from 'vitest';
import {
  clearManualIntakeOperationIdentity,
  loadManualIntakeOperationIdentity,
  rotateManualIntakeOperationIdentity,
  saveManualIntakeOperationIdentity,
  type ManualIntakeIdentityStorage,
} from './manual-intake-operation-identity';

function memoryStorage(): ManualIntakeIdentityStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe('Manual Intake operation identity', () => {
  it('survives a same-tab reload and rotates only for an intentional new draft', () => {
    const storage = memoryStorage();
    const firstMount = loadManualIntakeOperationIdentity(storage);
    const reloadedMount = loadManualIntakeOperationIdentity(storage);
    expect(reloadedMount).toEqual(firstMount);

    const rotated = rotateManualIntakeOperationIdentity(storage);
    expect(rotated.caseCreateKey).not.toBe(firstMount.caseCreateKey);
    expect(rotated.evidenceUploadKey).not.toBe(firstMount.evidenceUploadKey);
    expect(loadManualIntakeOperationIdentity(storage)).toEqual(rotated);
  });

  it('persists a changed evidence key without changing the case-create key', () => {
    const storage = memoryStorage();
    const first = loadManualIntakeOperationIdentity(storage);
    const next = saveManualIntakeOperationIdentity({
      ...first,
      evidenceUploadKey: crypto.randomUUID(),
    }, storage);
    expect(next.caseCreateKey).toBe(first.caseCreateKey);
    expect(next.evidenceUploadKey).not.toBe(first.evidenceUploadKey);
    expect(loadManualIntakeOperationIdentity(storage)).toEqual(next);
  });

  it('clears a completed operation and tolerates disabled storage', () => {
    const storage = memoryStorage();
    const first = loadManualIntakeOperationIdentity(storage);
    clearManualIntakeOperationIdentity(storage);
    expect(loadManualIntakeOperationIdentity(storage)).not.toEqual(first);

    const blocked: ManualIntakeIdentityStorage = {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
      removeItem: vi.fn(() => { throw new Error('blocked'); }),
    };
    expect(() => loadManualIntakeOperationIdentity(blocked)).not.toThrow();
    expect(() => clearManualIntakeOperationIdentity(blocked)).not.toThrow();
  });
});
