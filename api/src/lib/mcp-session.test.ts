import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('./db.js', () => ({ query: db.query }));

const {
  createMcpSession,
  markMcpSessionInitialized,
  touchReadyMcpSession,
} = await import('./mcp-session.js');

beforeEach(() => {
  db.query.mockReset();
  delete process.env.MCP_SESSION_LIFETIME_MINUTES;
});

describe('durable MCP lifecycle sessions', () => {
  it('mints an opaque session in initializing phase', async () => {
    db.query.mockResolvedValue([]);
    const sessionId = await createMcpSession('client-1', '2025-06-18');
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(db.query.mock.calls[0][0]).toContain("'initializing'");
    expect(db.query.mock.calls[0][1]).toEqual([sessionId, 'client-1', '2025-06-18', 60]);
  });

  it('moves only the matching initializing session to ready and binds protocol version', async () => {
    db.query.mockResolvedValueOnce([{ session_id: 'session' }]).mockResolvedValueOnce([]);
    await expect(markMcpSessionInitialized(
      '11111111-1111-4111-8111-111111111111',
      'client-1',
      '2025-06-18',
    )).resolves.toBe(true);
    await expect(markMcpSessionInitialized(
      '11111111-1111-4111-8111-111111111111',
      'client-1',
      '2025-03-26',
    )).resolves.toBe(false);
    expect(db.query.mock.calls[0][0]).toContain("phase = 'initializing'");
    expect(db.query.mock.calls[0][1]).toContain('2025-06-18');
  });

  it('accepts later requests only for a ready, unexpired matching session', async () => {
    db.query.mockResolvedValueOnce([{ session_id: 'session' }]).mockResolvedValueOnce([]);
    await expect(touchReadyMcpSession(
      '11111111-1111-4111-8111-111111111111',
      'client-1',
      '2025-06-18',
    )).resolves.toBe(true);
    await expect(touchReadyMcpSession(
      '11111111-1111-4111-8111-111111111111',
      'other-client',
      '2025-06-18',
    )).resolves.toBe(false);
    expect(db.query.mock.calls[0][0]).toContain("phase = 'ready'");
  });
});
