import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../lib/db.js', () => ({ query: db.query }));

const { consumeImageIngestRateLimit } = await import('./mcp-image-ingestion.js');

beforeEach(() => {
  db.query.mockReset();
  delete process.env.MCP_IMAGE_INGEST_REQUESTS_PER_MINUTE;
});

describe('durable image-ingest admission control', () => {
  it('admits only when the atomic database counter returns a row', async () => {
    db.query.mockResolvedValueOnce([{ request_count: 1 }]).mockResolvedValueOnce([]);
    await expect(consumeImageIngestRateLimit('client-1')).resolves.toBe(true);
    await expect(consumeImageIngestRateLimit('client-1')).resolves.toBe(false);
    expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT (principal_id) DO UPDATE');
    expect(db.query.mock.calls[0][1]).toEqual(['client-1', 60]);
  });

  it('clamps the configured per-minute limit', async () => {
    process.env.MCP_IMAGE_INGEST_REQUESTS_PER_MINUTE = '9999';
    db.query.mockResolvedValue([{ request_count: 1 }]);
    await consumeImageIngestRateLimit('client-2');
    expect(db.query.mock.calls[0][1]).toEqual(['client-2', 120]);
  });
});
