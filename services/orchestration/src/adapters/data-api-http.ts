/** Authentication and HTTP error handling for the REST data service. */

/* ---------- service token ---------- */

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getDataApiToken(): Promise<string> {
  const local = process.env.DATA_API_TOKEN;
  if (local) return local; // local dev / func start

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

  const audience = process.env.DATA_API_AUDIENCE;
  const idEndpoint = process.env.IDENTITY_ENDPOINT;
  const idHeader = process.env.IDENTITY_HEADER;
  if (!audience || !idEndpoint || !idHeader) {
    throw new Error('missing DATA_API_AUDIENCE / managed-identity endpoint for Data API auth');
  }
  const url = `${idEndpoint}?resource=${encodeURIComponent(audience)}&api-version=2019-08-01`;
  const res = await fetch(url, { headers: { 'X-IDENTITY-HEADER': idHeader } });
  if (!res.ok) throw new Error(`MSI token ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_on?: string };
  cachedToken = {
    value: json.access_token,
    expiresAt: json.expires_on ? Number(json.expires_on) * 1000 : now + 3_300_000,
  };
  return cachedToken.value;
}

/* ---------- request core ---------- */

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const baseUrl = (process.env.DATA_API_URL ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('missing DATA_API_URL');
  const token = await getDataApiToken();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 409) {
    // Surfaced verbatim so caseResolve can map a UNIQUE(sourcemessageid) collision
    // to `already_ingested` (idempotent intake).
    const detail = await safeText(res);
    if (detail.includes('evidence_backfill_reclassification_required')) {
      let targetCaseId: string | undefined;
      try {
        const parsed = JSON.parse(detail) as { targetCaseId?: unknown };
        if (typeof parsed.targetCaseId === 'string' && parsed.targetCaseId.trim()) {
          targetCaseId = parsed.targetCaseId.trim();
        }
      } catch {
        // The typed code is enough to force a safe retry; targetCaseId is an
        // optional convenience for the terminal report path.
      }
      throw new EvidenceBackfillReclassificationRequiredError(
        `${method} ${path} → 409: ${detail}`,
        targetCaseId,
      );
    }
    if (detail.includes('evidence_backfill_target_changed')) {
      throw new EvidenceBackfillTargetChangedError(`${method} ${path} → 409: ${detail}`);
    }
    throw new ConflictError(`${method} ${path} → 409: ${detail}`);
  }
  if (!res.ok) {
    const detail = await safeText(res);
    throw new DataApiHttpError(
      `data-api ${method} ${path} → ${res.status}: ${detail}`,
      res.status,
      detail,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ConflictError extends Error {}
export class DataApiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(message);
  }
}
export class EvidenceBackfillTargetChangedError extends ConflictError {}
export class EvidenceBackfillReclassificationRequiredError extends ConflictError {
  constructor(message: string, public readonly targetCaseId?: string) {
    super(message);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
