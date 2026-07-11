import { describe, expect, it, vi } from 'vitest';
import {
  matchesCommittedWriteSubscription,
  notifyCommittedWrite,
  subscribeCommittedWrites,
  type CommittedWriteTarget,
} from './mutation-events';

describe('committed write notifications', () => {
  const caseOne: CommittedWriteTarget = { kind: 'case', id: 'case-1' };

  it('matches exact resources, kind-wide lists, and aggregate readers', () => {
    expect(matchesCommittedWriteSubscription({ kind: 'case', id: 'case-1' }, caseOne)).toBe(true);
    expect(matchesCommittedWriteSubscription({ kind: 'case', id: 'case-2' }, caseOne)).toBe(false);
    expect(matchesCommittedWriteSubscription({ kind: 'case' }, caseOne)).toBe(true);
    expect(matchesCommittedWriteSubscription({ kind: 'inbound' }, caseOne)).toBe(false);
    expect(matchesCommittedWriteSubscription({ kind: 'any' }, caseOne)).toBe(true);
  });

  it('delivers once while subscribed and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCommittedWrites(listener);

    notifyCommittedWrite(caseOne);
    unsubscribe();
    notifyCommittedWrite({ kind: 'inbound', id: 'mail-1' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(caseOne);
  });

  it('does not let one failed reader block the others', () => {
    const broken = subscribeCommittedWrites(() => {
      throw new Error('render failed');
    });
    const healthy = vi.fn();
    const unsubscribeHealthy = subscribeCommittedWrites(healthy);

    expect(() => notifyCommittedWrite(caseOne)).not.toThrow();
    expect(healthy).toHaveBeenCalledWith(caseOne);

    broken();
    unsubscribeHealthy();
  });
});
