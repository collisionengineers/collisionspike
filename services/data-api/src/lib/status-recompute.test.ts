import { describe, expect, it, vi } from 'vitest';
import {
  acknowledgeStatusRecompute,
  requestStatusRecompute,
} from './status-recompute.js';

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

describe('acknowledgeStatusRecompute', () => {
  it('acks only the evaluated generation and leaves a newer request pending', async () => {
    const q = vi.fn().mockResolvedValue([{
      status_recompute_requested_generation: '14',
      status_recompute_completed_generation: '12',
    }]);

    await expect(acknowledgeStatusRecompute(q, 'case-1', 12)).resolves.toEqual({
      completed: true,
      pending: true,
    });
    expect(q).toHaveBeenCalledWith(
      expect.stringMatching(/GREATEST[\s\S]*LEAST\(\$2::bigint, status_recompute_requested_generation\)/),
      ['case-1', 12],
    );
  });

  it('reports fully settled when requested and completed meet', async () => {
    const q = vi.fn().mockResolvedValue([{
      status_recompute_requested_generation: '12',
      status_recompute_completed_generation: '12',
    }]);
    await expect(acknowledgeStatusRecompute(q, 'case-1', 12)).resolves.toEqual({
      completed: true,
      pending: false,
    });
  });
});
