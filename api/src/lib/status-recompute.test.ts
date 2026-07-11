import { describe, expect, it, vi } from 'vitest';
import { requestStatusRecompute } from './status-recompute.js';

describe('requestStatusRecompute', () => {
  it('increments and returns the durable generation through the supplied transaction', async () => {
    const q = vi.fn().mockResolvedValue([{ status_recompute_requested_generation: '12' }]);
    await expect(requestStatusRecompute(q, 'case-1')).resolves.toBe(12);
    expect(q).toHaveBeenCalledWith(expect.stringContaining('status_recompute_requested_generation + 1'), ['case-1']);
  });

  it('fails closed when the target case has disappeared', async () => {
    const q = vi.fn().mockResolvedValue([]);
    await expect(requestStatusRecompute(q, 'missing')).rejects.toThrow('target case disappeared');
  });
});
