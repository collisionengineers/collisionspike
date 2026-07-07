import { describe, it, expect, vi } from 'vitest';
import { runChat, type ChatMessage, type ToolDef } from './aoai-chat.js';

const TOOLS: ToolDef[] = [
  { type: 'function', function: { name: 'lookup_case', description: 'x', parameters: { type: 'object', properties: {} } } },
];
const base: ChatMessage[] = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'where is case CCPY26050?' },
];

describe('runChat tool loop', () => {
  it('executes a requested tool then returns the final text answer', async () => {
    const complete = vi
      .fn<typeof import('./aoai-chat.js').chatCompletion>()
      // round 1: the model asks to call lookup_case
      .mockResolvedValueOnce({
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'lookup_case', arguments: '{"query":"CCPY26050"}' } }],
      })
      // round 2: with the tool result in context, it answers
      .mockResolvedValueOnce({ role: 'assistant', content: 'Case CCPY26050 is ready for EVA.' });

    const exec = vi.fn().mockResolvedValue({ matches: [{ casePo: 'CCPY26050', status: 'ready_for_eva' }] });

    const res = await runChat('https://ep', 'gpt-5', base, TOOLS, exec, 4, complete);

    expect(exec).toHaveBeenCalledWith('lookup_case', { query: 'CCPY26050' });
    expect(res.toolsUsed).toEqual(['lookup_case']);
    expect(res.reply).toBe('Case CCPY26050 is ready for EVA.');
    expect(res.rounds).toBe(2);
    // the tool result must have been fed back as a role:'tool' message tied to the call id
    const secondCallConvo = complete.mock.calls[1][2];
    const toolMsg = secondCallConvo.find((m) => m.role === 'tool');
    expect(toolMsg?.tool_call_id).toBe('c1');
  });

  it('returns the answer immediately when the model uses no tools', async () => {
    const complete = vi.fn().mockResolvedValue({ role: 'assistant', content: 'Held means the case is parked.' });
    const exec = vi.fn();
    const res = await runChat('https://ep', 'gpt-5', base, TOOLS, exec, 4, complete as never);
    expect(exec).not.toHaveBeenCalled();
    expect(res.reply).toBe('Held means the case is parked.');
    expect(res.rounds).toBe(1);
  });

  it('a tool that throws is reported back to the model, not thrown out of runChat', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'lookup_case', arguments: '{}' } }],
      })
      .mockResolvedValueOnce({ role: 'assistant', content: 'I could not look that up.' });
    const exec = vi.fn().mockRejectedValue(new Error('db down'));
    const logger = { warn: vi.fn() };
    const res = await runChat('https://ep', 'gpt-5', base, TOOLS, exec, 4, complete as never, logger);
    expect(res.reply).toBe('I could not look that up.');
    const toolMsg = (complete.mock.calls[1][2] as ChatMessage[]).find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('db down');
    // TKT-066: a persistently-failing tool is retried once (2 exec calls), counted, and logged.
    expect(exec).toHaveBeenCalledTimes(2);
    expect(res.toolErrors).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith('[assistant] tool lookup_case failed: db down');
  });

  it('retries a transient tool failure once and succeeds with no user-visible error (TKT-066)', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'lookup_case', arguments: '{"query":"X"}' } }],
      })
      .mockResolvedValueOnce({ role: 'assistant', content: 'Found it.' });
    const exec = vi
      .fn()
      .mockRejectedValueOnce(new Error('cold connect'))
      .mockResolvedValueOnce({ matches: [{ casePo: 'CCPY26050' }] });
    const logger = { warn: vi.fn() };
    const res = await runChat('https://ep', 'gpt-5', base, TOOLS, exec, 4, complete as never, logger);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(res.toolErrors).toBe(0); // the retry cleared it — not counted, not logged
    expect(logger.warn).not.toHaveBeenCalled();
    expect(res.reply).toBe('Found it.');
    const toolMsg = (complete.mock.calls[1][2] as ChatMessage[]).find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('CCPY26050');
  });

  it('a clean run reports zero toolErrors', async () => {
    const complete = vi.fn().mockResolvedValue({ role: 'assistant', content: 'hi' });
    const res = await runChat('https://ep', 'gpt-5', base, TOOLS, vi.fn(), 4, complete as never);
    expect(res.toolErrors).toBe(0);
  });

  it('accumulates token usage from every round for the capacity ledger (TKT-113)', async () => {
    // A completion double that reports usage via the onUsage callback (5th arg).
    const complete = vi
      .fn()
      .mockImplementationOnce((_ep, _dep, _convo, _tools, onUsage) => {
        onUsage?.({ promptTokens: 100, completionTokens: 20 });
        return Promise.resolve({
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'c1', type: 'function', function: { name: 'lookup_case', arguments: '{}' } }],
        });
      })
      .mockImplementationOnce((_ep, _dep, _convo, _tools, onUsage) => {
        onUsage?.({ promptTokens: 150, completionTokens: 30 });
        return Promise.resolve({ role: 'assistant', content: 'done' });
      });
    const res = await runChat('https://ep', 'gpt-5', base, TOOLS, vi.fn().mockResolvedValue({}), 4, complete as never);
    expect(res.usage).toEqual({ promptTokens: 250, completionTokens: 50 });
  });

  it('reports zero usage when the model response carries none (e.g. a test double)', async () => {
    const complete = vi.fn().mockResolvedValue({ role: 'assistant', content: 'hi' });
    const res = await runChat('https://ep', 'gpt-5', base, TOOLS, vi.fn(), 4, complete as never);
    expect(res.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
  });
});
