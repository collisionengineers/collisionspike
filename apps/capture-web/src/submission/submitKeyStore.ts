const STORAGE_PREFIX = 'collisioncapture.submit.v1.';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SubmitKeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SubmitKeyDependencies {
  storage?: SubmitKeyStorage;
  crypto?: Pick<Crypto, 'randomUUID'>;
}

export class SubmitKeyPersistenceError extends Error {
  constructor() {
    super('This browser could not safely remember the send attempt.');
    this.name = 'SubmitKeyPersistenceError';
  }
}

/**
 * Returns one non-secret idempotency key per capture session. Authorization and
 * bootstrap secrets are deliberately outside this persistence boundary.
 */
export function getOrCreateSubmitKey(
  sessionId: string,
  dependencies: SubmitKeyDependencies = {}
): string {
  const storageKey = storageKeyForSession(sessionId);
  const storage = resolveStorage(dependencies.storage);

  try {
    const existing = storage.getItem(storageKey);
    if (existing && UUID_PATTERN.test(existing)) return existing;

    const cryptoProvider = dependencies.crypto ?? globalThis.crypto;
    if (!cryptoProvider || typeof cryptoProvider.randomUUID !== 'function') {
      throw new SubmitKeyPersistenceError();
    }
    const created = cryptoProvider.randomUUID();
    storage.setItem(storageKey, created);
    return created;
  } catch (error) {
    if (error instanceof SubmitKeyPersistenceError) throw error;
    throw new SubmitKeyPersistenceError();
  }
}

/** Clear only after the server has confirmed submission. A failed cleanup must
 * not turn a confirmed send into a visible failure; replaying the retained key
 * remains idempotent.
 */
export function clearSubmitKey(
  sessionId: string,
  dependencies: Pick<SubmitKeyDependencies, 'storage'> = {}
): void {
  try {
    resolveStorage(dependencies.storage).removeItem(storageKeyForSession(sessionId));
  } catch {
    // Best effort after confirmed success. The value is non-secret and safe to replay.
  }
}

export function submitStorageKey(sessionId: string): string {
  return storageKeyForSession(sessionId);
}

function storageKeyForSession(sessionId: string): string {
  const normalized = sessionId.trim();
  if (normalized.length === 0) throw new SubmitKeyPersistenceError();
  return `${STORAGE_PREFIX}${encodeURIComponent(normalized)}`;
}

function resolveStorage(storage: SubmitKeyStorage | undefined): SubmitKeyStorage {
  if (storage) return storage;
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // Access can throw when durable browser storage is blocked.
  }
  throw new SubmitKeyPersistenceError();
}
