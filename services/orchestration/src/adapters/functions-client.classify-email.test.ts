import { describe, expect, it, vi, beforeEach } from 'vitest';

const focusedFnRequestMock = vi.fn();

vi.mock('@cs/server-runtime/focused-function-client', () => ({
  focusedFnRequest: (...args: unknown[]) => focusedFnRequestMock(...args),
}));
vi.mock('@cs/server-runtime', () => ({
  safeErrorText: () => '',
}));

describe('callClassifyEmail — PLAN-014 D1/D4 request wiring', () => {
  beforeEach(() => {
    focusedFnRequestMock.mockReset();
    focusedFnRequestMock.mockResolvedValue({ category: 'other', subtype: 'other' });
    process.env.PARSER_FN_URL = 'https://parser.example';
    process.env.PARSER_FN_KEY = 'test-key';
  });

  it('defaults open_case_ref_match and attachment_content_typings to empty when omitted (byte-identical legacy request)', async () => {
    const { callClassifyEmail } = await import('./functions-client.js');
    await callClassifyEmail({ subject: 'hello' });
    const call = focusedFnRequestMock.mock.calls[0][0] as { body: Record<string, unknown> };
    expect(call.body.open_case_ref_match).toBe('');
    expect(call.body.attachment_content_typings).toEqual([]);
  });

  it('maps openCaseRefMatch and attachmentContentTypings (camelCase -> snake_case) when provided', async () => {
    const { callClassifyEmail } = await import('./functions-client.js');
    await callClassifyEmail({
      subject: 'hello',
      openCaseRefMatch: 'one',
      attachmentContentTypings: [{ filename: 'scan0091.pdf', docType: 'report' }],
    });
    const call = focusedFnRequestMock.mock.calls[0][0] as { body: Record<string, unknown> };
    expect(call.body.open_case_ref_match).toBe('one');
    expect(call.body.attachment_content_typings).toEqual([
      { filename: 'scan0091.pdf', doc_type: 'report' },
    ]);
  });
});
