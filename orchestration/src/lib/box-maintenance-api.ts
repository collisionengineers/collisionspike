/** Narrow Data API client for wake-safe Box maintenance monitors. */

export interface BoxFileRequestDrainSummary {
  processed: number;
  completed: number;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function serviceToken(signal?: AbortSignal): Promise<string> {
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
    { headers: { 'X-IDENTITY-HEADER': header }, signal },
  );
  if (!response.ok) throw new Error(`MSI token ${response.status}`);
  const json = (await response.json()) as { access_token: string; expires_on?: string };
  cachedToken = {
    value: json.access_token,
    expiresAt: json.expires_on ? Number(json.expires_on) * 1000 : now + 3_300_000,
  };
  return cachedToken.value;
}

async function post<T>(path: string): Promise<T> {
  const baseUrl = (process.env.DATA_API_URL ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('missing DATA_API_URL');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await serviceToken(controller.signal)}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`data-api POST ${path} -> ${response.status}: ${detail.slice(0, 500)}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const boxMaintenanceApi = {
  drainFileRequests(): Promise<BoxFileRequestDrainSummary> {
    return post('/api/internal/box-file-request-outbox/drain');
  },
};
