import type { CaptureExchangeResponse } from '@cs/capture-contracts';
import type { CaptureApi } from '../api/captureApi';

const BOOTSTRAP_PARAMETER = 'capture';
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class BootstrapSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapSecretError';
  }
}

export function bootstrapSecretFromHash(hash: string, allowDemo = false): string {
  const parameters = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const secret = parameters.get(BOOTSTRAP_PARAMETER);
  if (!secret) {
    throw new BootstrapSecretError('This capture link is missing its secure access code.');
  }
  if (allowDemo && secret === 'demo') return secret;
  if (!SECRET_PATTERN.test(secret)) {
    throw new BootstrapSecretError('This capture link has an invalid secure access code.');
  }
  return secret;
}

export function clearBootstrapFragment(
  location: Pick<Location, 'pathname' | 'search'>,
  history: Pick<History, 'replaceState'>
): void {
  history.replaceState(null, '', `${location.pathname}${location.search}`);
}

/** Exchange once, then remove the bootstrap secret from the address bar/history. */
export async function exchangeBootstrapSecret(
  api: Pick<CaptureApi, 'exchange'>,
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  history: Pick<History, 'replaceState'>,
  allowDemo = false
): Promise<CaptureExchangeResponse> {
  const secret = bootstrapSecretFromHash(location.hash, allowDemo);
  const exchange = await api.exchange(secret);
  clearBootstrapFragment(location, history);
  return exchange;
}

/** Exchange a new fragment when present, otherwise resume from the HttpOnly cookie. */
export async function authorizeCapture(
  api: Pick<CaptureApi, 'exchange' | 'renew'>,
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  history: Pick<History, 'replaceState'>,
  allowDemo = false
): Promise<CaptureExchangeResponse> {
  const parameters = new URLSearchParams(
    location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  );
  if (!parameters.has(BOOTSTRAP_PARAMETER)) return api.renew();
  return exchangeBootstrapSecret(api, location, history, allowDemo);
}
