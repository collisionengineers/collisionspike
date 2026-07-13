import { describe, expect, it, vi } from 'vitest';
import type { CaptureApi } from '../api/captureApi';
import {
  BootstrapSecretError,
  bootstrapSecretFromHash,
  exchangeBootstrapSecret
} from './bootstrapSecret';

const SECRET = 'a'.repeat(43);

describe('bootstrapSecretFromHash', () => {
  it('reads a base64url bootstrap secret from the fragment', () => {
    expect(bootstrapSecretFromHash(`#capture=${SECRET}`)).toBe(SECRET);
  });

  it('rejects missing and short secrets', () => {
    expect(() => bootstrapSecretFromHash('')).toThrow(BootstrapSecretError);
    expect(() => bootstrapSecretFromHash('#capture=short')).toThrow(BootstrapSecretError);
  });

  it('accepts the explicit demo link only when enabled', () => {
    expect(bootstrapSecretFromHash('#capture=demo', true)).toBe('demo');
    expect(() => bootstrapSecretFromHash('#capture=demo')).toThrow(BootstrapSecretError);
  });
});

describe('exchangeBootstrapSecret', () => {
  it('clears the fragment only after a successful single exchange', async () => {
    const exchange = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      accessToken: 'ephemeral-token',
      accessTokenExpiresAt: '2026-07-13T12:00:00.000Z'
    });
    const history = { replaceState: vi.fn() };

    await expect(exchangeBootstrapSecret(
      { exchange } as unknown as CaptureApi,
      { hash: `#capture=${SECRET}`, pathname: '/capture', search: '?language=en' },
      history
    )).resolves.toMatchObject({ sessionId: 'session-1' });

    expect(exchange).toHaveBeenCalledOnce();
    expect(exchange).toHaveBeenCalledWith(SECRET);
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/capture?language=en');
  });

  it('keeps the fragment available when exchange fails', async () => {
    const exchange = vi.fn().mockRejectedValue(new Error('offline'));
    const history = { replaceState: vi.fn() };

    await expect(exchangeBootstrapSecret(
      { exchange } as unknown as CaptureApi,
      { hash: `#capture=${SECRET}`, pathname: '/', search: '' },
      history
    )).rejects.toThrow('offline');
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
