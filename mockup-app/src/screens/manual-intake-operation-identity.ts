export interface ManualIntakeOperationIdentity {
  caseCreateKey: string;
  evidenceUploadKey: string;
}

export interface ManualIntakeIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = 'collision-engineers.manual-intake-operation.v1';
const OPERATION_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

function newIdentity(): ManualIntakeOperationIdentity {
  return {
    caseCreateKey: crypto.randomUUID(),
    evidenceUploadKey: crypto.randomUUID(),
  };
}

function isIdentity(value: unknown): value is ManualIntakeOperationIdentity {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.caseCreateKey === 'string'
    && OPERATION_KEY_RE.test(record.caseCreateKey)
    && typeof record.evidenceUploadKey === 'string'
    && OPERATION_KEY_RE.test(record.evidenceUploadKey);
}

function browserStorage(): ManualIntakeIdentityStorage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function persist(
  identity: ManualIntakeOperationIdentity,
  storage: ManualIntakeIdentityStorage | undefined,
): ManualIntakeOperationIdentity {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // A privacy setting can disable sessionStorage. The in-memory identity still
    // protects double-click/network retries for this mounted form.
  }
  return identity;
}

/**
 * Keep the case-create and evidence keys stable across a same-tab reload. A lost
 * response can therefore be recovered by re-entering the reviewed details and
 * reselecting the same files without allocating another case or Case/PO.
 */
export function loadManualIntakeOperationIdentity(
  storage: ManualIntakeIdentityStorage | undefined = browserStorage(),
): ManualIntakeOperationIdentity {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isIdentity(parsed)) return parsed;
    }
  } catch {
    // Corrupt/unavailable storage is replaced with a fresh safe identity below.
  }
  return persist(newIdentity(), storage);
}

export function saveManualIntakeOperationIdentity(
  identity: ManualIntakeOperationIdentity,
  storage: ManualIntakeIdentityStorage | undefined = browserStorage(),
): ManualIntakeOperationIdentity {
  if (!isIdentity(identity)) throw new Error('invalid manual intake operation identity');
  return persist(identity, storage);
}

export function rotateManualIntakeOperationIdentity(
  storage: ManualIntakeIdentityStorage | undefined = browserStorage(),
): ManualIntakeOperationIdentity {
  return persist(newIdentity(), storage);
}

export function clearManualIntakeOperationIdentity(
  storage: ManualIntakeIdentityStorage | undefined = browserStorage(),
): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // The next mount falls back to a fresh in-memory identity.
  }
}
