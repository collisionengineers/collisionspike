/** Narrow Data API client for the durable archive-mirror outbox monitor. */

export interface PendingArchiveMirror {
  evidenceId: string;
  caseId: string;
  generation: number;
  mirrorEligible: boolean;
}

export interface ArchiveMirrorCompletion {
  completed: boolean;
  pending: boolean;
  missing?: boolean;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function serviceToken(): Promise<string> {
  if (process.env.DATA_API_TOKEN) return process.env.DATA_API_TOKEN;
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;
  const audience = process.env.DATA_API_AUDIENCE;
  const endpoint = process.env.IDENTITY_ENDPOINT;
  const header = process.env.IDENTITY_HEADER;
  if (!audience || !endpoint || !header) {
    throw new Error('missing DATA_API_AUDIENCE / managed-identity endpoint for Data API auth');
  }
  const response = await fetch(
    `${endpoint}?resource=${encodeURIComponent(audience)}&api-version=2019-08-01`,
    { headers: { 'X-IDENTITY-HEADER': header } },
  );
  if (!response.ok) throw new Error(`MSI token ${response.status}`);
  const json = (await response.json()) as { access_token: string; expires_on?: string };
  cachedToken = {
    value: json.access_token,
    expiresAt: json.expires_on ? Number(json.expires_on) * 1000 : now + 3_300_000,
  };
  return cachedToken.value;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const baseUrl = (process.env.DATA_API_URL ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('missing DATA_API_URL');
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await serviceToken()}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`data-api ${method} ${path} -> ${response.status}: ${detail.slice(0, 500)}`);
  }
  return (await response.json()) as T;
}

export const archiveMirrorApi = {
  pending(limit = 100): Promise<{ rows: PendingArchiveMirror[] }> {
    return request('GET', `/api/internal/archive-mirror-outbox/pending?limit=${limit}`);
  },

  complete(evidenceId: string, generation: number): Promise<ArchiveMirrorCompletion> {
    return request(
      'POST',
      `/api/internal/archive-mirror-outbox/${encodeURIComponent(evidenceId)}/complete`,
      { generation },
    );
  },

  defer(
    evidenceId: string,
    generation: number,
    reason: string,
  ): Promise<{ deferred: boolean; pending: boolean; nextAttemptAt?: string }> {
    return request(
      'POST',
      `/api/internal/archive-mirror-outbox/${encodeURIComponent(evidenceId)}/defer`,
      { generation, reason },
    );
  },
};
