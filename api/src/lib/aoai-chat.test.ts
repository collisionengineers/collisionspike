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
    const res = await runChat('https://ep', 'gpt-5', base, TOOLS, exec, 4, complete as never);
    expect(res.reply).toBe('I could not look that up.');
    const toolMsg = (complete.mock.calls[1][2] as ChatMessage[]).find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('db down');
  });
});
