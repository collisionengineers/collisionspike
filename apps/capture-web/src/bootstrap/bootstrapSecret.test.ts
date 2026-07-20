import { describe, expect, it, vi } from 'vitest';
import type { CaptureApi } from '../api/captureApi';
import {
  BootstrapSecretError,
  authorizeCapture,
  bootstrapSecretFromHash,
  exchangeBootstrapSecret
} from './bootstrapSecret';

const SECRET = 'a'.repeat(43);

describe('bootstrapSecretFromHash', () => {
  it('reads a base64url bootstrap secret from the fragment', () => {
    expect(bootstrapSecretFromHash(`#capture=${SECRET}`)).toBe(SECRET);
  });

  it('rejects missing, wrongly sized, and non-base64url secrets', () => {
    expect(() => bootstrapSecretFromHash('')).toThrow(BootstrapSecretError);
    expect(() => bootstrapSecretFromHash('#capture=short')).toThrow(BootstrapSecretError);
    expect(() => bootstrapSecretFromHash(`#capture=${'a'.repeat(44)}`)).toThrow(BootstrapSecretError);
    expect(() => bootstrapSecretFromHash(`#capture=${'a'.repeat(42)}!`)).toThrow(BootstrapSecretError);
  });

  it('accepts the explicit demo link only when enabled', () => {
    expect(bootstrapSecretFromHash('#capture=demo', true)).toBe('demo');
    expect(() => bootstrapSecretFromHash('#capture=demo')).toThrow(BootstrapSecretError);
  });
});

describe('authorizeCapture', () => {
  it('resumes from the protected cookie when no bootstrap fragment is present', async () => {
    const renew = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      accessToken: 'renewed-token',
      accessTokenExpiresAt: '2099-07-13T12:00:00.000Z'
    });
    const exchange = vi.fn();
    const history = { replaceState: vi.fn() };

    await expect(authorizeCapture(
      { exchange, renew } as unknown as CaptureApi,
      { hash: '', pathname: '/capture', search: '' },
      history
    )).resolves.toMatchObject({ accessToken: 'renewed-token' });

    expect(renew).toHaveBeenCalledOnce();
    expect(exchange).not.toHaveBeenCalled();
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it('prefers a new bootstrap fragment over an existing resume cookie', async () => {
    const exchange = vi.fn().mockResolvedValue({
      sessionId: 'session-2',
      accessToken: 'new-token',
      accessTokenExpiresAt: '2099-07-13T12:00:00.000Z'
    });
    const renew = vi.fn();
    const history = { replaceState: vi.fn() };

    await authorizeCapture(
      { exchange, renew } as unknown as CaptureApi,
      { hash: `#capture=${SECRET}`, pathname: '/capture', search: '' },
      history
    );

    expect(exchange).toHaveBeenCalledWith(SECRET);
    expect(renew).not.toHaveBeenCalled();
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/capture');
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
