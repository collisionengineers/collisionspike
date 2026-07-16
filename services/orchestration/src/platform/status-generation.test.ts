import { beforeEach, describe, expect, it, vi } from 'vitest';

const dataApiMock = vi.hoisted(() => ({
  evaluateStatus: vi.fn(),
}));
vi.mock('../adapters/data-api.js', () => ({ dataApi: dataApiMock }));

const { settlePersistedStatusGeneration } = await import('./status-generation.js');
const ctx = { warn: vi.fn() };

beforeEach(() => {
  dataApiMock.evaluateStatus.mockReset().mockResolvedValue({
    value: 'needs_review',
    completed: true,
    pending: false,
  });
  ctx.warn.mockReset();
});

describe('settlePersistedStatusGeneration', () => {
  it('atomically evaluates and acknowledges the exact returned generation', async () => {
    await expect(
      settlePersistedStatusGeneration('case-1', { statusGeneration: 7 }, ctx),
    ).resolves.toBe(true);
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledWith('case-1', 7);
  });

  it('leaves the generation pending when evaluation fails', async () => {
    dataApiMock.evaluateStatus.mockRejectedValue(new Error('status 503'));
    await expect(
      settlePersistedStatusGeneration('case-1', { statusGeneration: 8 }, ctx),
    ).resolves.toBe(false);
    expect(ctx.warn).toHaveBeenCalled();
  });

  it('does nothing when persistence returned no generation', async () => {
    await expect(settlePersistedStatusGeneration('case-1', {}, ctx)).resolves.toBe(false);
    expect(dataApiMock.evaluateStatus).not.toHaveBeenCalled();
  });
});
