import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INBOUND_CATEGORIES, INBOUND_SUBTYPES } from '@cs/domain';

function baseInput() {
  return {
    subjectScrubbed: 'New instruction — [VRM redacted not applicable here]',
    bodyScrubbed: 'Please inspect this vehicle. Contact [EMAIL] for details.',
    senderDomain: 'provider.example',
    attachmentFilenames: ['instruction.pdf'],
    deterministicCategory: 'other',
    deterministicSubtype: 'other',
    deterministicSignals: ['uncorroborated_instruction_doc'],
  };
}

describe('resourceFromScope', () => {
  it('strips a trailing /.default suffix', async () => {
    const { resourceFromScope } = await import('./aoai.js');
    expect(resourceFromScope('https://cognitiveservices.azure.com/.default')).toBe(
      'https://cognitiveservices.azure.com',
    );
  });

  it('leaves a bare resource URI untouched', async () => {
    const { resourceFromScope } = await import('./aoai.js');
    expect(resourceFromScope('https://cognitiveservices.azure.com')).toBe('https://cognitiveservices.azure.com');
  });
});

describe('buildSystemPrompt', () => {
  it('mentions every live category and subtype (never silently drops a taxonomy entry)', async () => {
    const { buildSystemPrompt } = await import('./aoai.js');
    const prompt = buildSystemPrompt();
    for (const c of INBOUND_CATEGORIES) expect(prompt).toContain(c);
    for (const s of INBOUND_SUBTYPES) expect(prompt).toContain(s);
  });

  it('instructs handler-language rationale (no engineering jargon)', async () => {
    const { buildSystemPrompt } = await import('./aoai.js');
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/rationale/i);
    expect(prompt).toMatch(/never invent/i);
  });
});

describe('buildTriageResponseSchema', () => {
  it('is a strict object schema with enums locked to the live taxonomy', async () => {
    const { buildTriageResponseSchema } = await import('./aoai.js');
    const schema = buildTriageResponseSchema() as {
      type: string;
      additionalProperties: boolean;
      required: string[];
      properties: {
        category: { enum: string[] };
        subtype: { enum: string[] };
        confidence: { type: string; minimum: number; maximum: number };
        rationale: { type: string };
      };
    };
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required.sort()).toEqual(['category', 'confidence', 'rationale', 'subtype'].sort());
    expect(schema.properties.category.enum).toEqual([...INBOUND_CATEGORIES]);
    expect(schema.properties.subtype.enum).toEqual([...INBOUND_SUBTYPES]);
    expect(schema.properties.confidence).toEqual({ type: 'number', minimum: 0, maximum: 1 });
  });
});

describe('buildTriageRequestBody', () => {
  it('assembles the AOAI GA v1 request shape (no temperature/top_p/penalties/max_tokens)', async () => {
    const { buildTriageRequestBody } = await import('./aoai.js');
    const body = buildTriageRequestBody(baseInput(), 'gpt-5') as Record<string, unknown>;

    expect(body.model).toBe('gpt-5');
    expect(body.max_completion_tokens).toBe(2000);
    expect(body.reasoning_effort).toBe('low');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('presence_penalty');
    expect(body).not.toHaveProperty('frequency_penalty');
    expect(body).not.toHaveProperty('max_tokens');

    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('provider.example');
    expect(messages[1].content).toContain('instruction.pdf');
    expect(messages[1].content).toContain('uncorroborated_instruction_doc');

    const responseFormat = body.response_format as { type: string; json_schema: { name: string; strict: boolean } };
    expect(responseFormat.type).toBe('json_schema');
    expect(responseFormat.json_schema.strict).toBe(true);
    expect(responseFormat.json_schema.name).toBe('triage_classification');
  });

  it('never leaks unscrubbed input verbatim beyond what the caller supplied (pass-through only)', async () => {
    const { buildTriageRequestBody } = await import('./aoai.js');
    const input = baseInput();
    const body = buildTriageRequestBody(input, 'gpt-5') as Record<string, unknown>;
    const messages = body.messages as Array<{ content: string }>;
    // The scrubbed text is carried through verbatim (scrubbing itself is the caller's job —
    // see the module doc); this just proves the assembly doesn't re-introduce the raw body.
    expect(messages[1].content).toContain(input.bodyScrubbed);
  });
});

describe('abstainForErrorResponse', () => {
  it('maps a content_filter error code to the distinct content_filter reason', async () => {
    const { abstainForErrorResponse } = await import('./aoai.js');
    const result = abstainForErrorResponse(400, { error: { code: 'content_filter', message: 'blocked' } });
    expect(result).toEqual({ abstain: true, reason: 'content_filter' });
  });

  it('maps a generic 400 (no error code) to an http_400 reason', async () => {
    const { abstainForErrorResponse } = await import('./aoai.js');
    expect(abstainForErrorResponse(400, undefined)).toEqual({ abstain: true, reason: 'http_400' });
  });

  it('includes the error code in the reason when present but not content_filter', async () => {
    const { abstainForErrorResponse } = await import('./aoai.js');
    const result = abstainForErrorResponse(429, { error: { code: 'rate_limited' } });
    expect(result).toEqual({ abstain: true, reason: 'http_429_rate_limited' });
  });
});

describe('parseTriageModelResponse', () => {
  function chatResponse(content: unknown, overrides: Record<string, unknown> = {}) {
    return {
      model: 'gpt-5-2025-08-07',
      system_fingerprint: 'fp_abc123',
      choices: [{ finish_reason: 'stop', message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }],
      ...overrides,
    };
  }

  it('parses a well-formed structured-output response into a suggestion', async () => {
    const { parseTriageModelResponse } = await import('./aoai.js');
    const result = parseTriageModelResponse(
      chatResponse({ category: 'case_update', subtype: 'update_general', confidence: 0.82, rationale: 'This is a follow-up with new photographs for an open case.' }),
    );
    expect(result).toEqual({
      category: 'case_update',
      subtype: 'update_general',
      confidence: 0.82,
      rationale: 'This is a follow-up with new photographs for an open case.',
      responseModel: 'gpt-5-2025-08-07',
      systemFingerprint: 'fp_abc123',
    });
  });

  it('treats a completion-side content_filter finish_reason as abstain (defensive, beyond the 400-only spec)', async () => {
    const { parseTriageModelResponse } = await import('./aoai.js');
    const result = parseTriageModelResponse(
      chatResponse('', { choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }),
    );
    expect(result).toEqual({ abstain: true, reason: 'content_filter' });
  });

  it('abstains on an empty choices array', async () => {
    const { parseTriageModelResponse } = await import('./aoai.js');
    expect(parseTriageModelResponse({ choices: [] })).toEqual({ abstain: true, reason: 'empty_response' });
  });

  it('abstains on unparsable JSON content', async () => {
    const { parseTriageModelResponse } = await import('./aoai.js');
    const result = parseTriageModelResponse(chatResponse('not json {'));
    expect(result).toEqual({ abstain: true, reason: 'parse_error' });
  });

  it('abstains on a category/subtype outside the live taxonomy (never trusts strict mode blindly)', async () => {
    const { parseTriageModelResponse } = await import('./aoai.js');
    const result = parseTriageModelResponse(
      chatResponse({ category: 'not_a_real_category', subtype: 'other', confidence: 0.5, rationale: 'x' }),
    );
    expect(result).toEqual({ abstain: true, reason: 'invalid_taxonomy' });
  });

  it('abstains on a missing/empty rationale', async () => {
    const { parseTriageModelResponse } = await import('./aoai.js');
    const result = parseTriageModelResponse(
      chatResponse({ category: 'other', subtype: 'other', confidence: 0.5, rationale: '  ' }),
    );
    expect(result).toEqual({ abstain: true, reason: 'empty_rationale' });
  });

  it('clamps an out-of-range confidence into [0,1]', async () => {
    const { parseTriageModelResponse } = await import('./aoai.js');
    const result = parseTriageModelResponse(
      chatResponse({ category: 'other', subtype: 'other', confidence: 1.7, rationale: 'x' }),
    );
    expect((result as { confidence: number }).confidence).toBe(1);
  });
});

describe('callTriageModel (fetch mocked)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env.AI_MODEL_ENDPOINT = 'https://digital-3339-resource.openai.azure.com';
    process.env.AI_MODEL_DEPLOYMENT = 'gpt-5';
    process.env.IDENTITY_ENDPOINT = 'http://169.254.1.1/msi/token';
    process.env.IDENTITY_HEADER = 'test-identity-header';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it('abstains honestly when the model endpoint/deployment are not configured', async () => {
    process.env.AI_MODEL_ENDPOINT = '';
    process.env.AI_MODEL_DEPLOYMENT = '';
    const { callTriageModel } = await import('./aoai.js');
    const result = await callTriageModel(baseInput());
    expect(result).toEqual({ abstain: true, reason: 'model_not_configured' });
  });

  it('returns a suggestion on a well-formed 200 (MSI token mint + chat completion both mocked)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/msi/token')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_on: String(Math.floor(Date.now() / 1000) + 3600) }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          model: 'gpt-5-2025-08-07',
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify({ category: 'other', subtype: 'other', confidence: 0.4, rationale: 'A short message with no clear action needed.' }) },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { callTriageModel } = await import('./aoai.js');
    const result = await callTriageModel(baseInput());
    expect(result).toEqual({
      category: 'other',
      subtype: 'other',
      confidence: 0.4,
      rationale: 'A short message with no clear action needed.',
      responseModel: 'gpt-5-2025-08-07',
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('abstains with reason content_filter on an HTTP 400 content_filter block', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/msi/token')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_on: String(Math.floor(Date.now() / 1000) + 3600) }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ error: { code: 'content_filter', message: 'blocked' } }), { status: 400 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { callTriageModel } = await import('./aoai.js');
    const result = await callTriageModel(baseInput());
    expect(result).toEqual({ abstain: true, reason: 'content_filter' });
  });

  it('abstains with reason timeout when the request aborts', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/msi/token')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_on: String(Math.floor(Date.now() / 1000) + 3600) }), {
          status: 200,
        });
      }
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { callTriageModel } = await import('./aoai.js');
    const result = await callTriageModel(baseInput());
    expect(result).toEqual({ abstain: true, reason: 'timeout' });
  });

  it('abstains with reason request_failed on a network error', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/msi/token')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_on: String(Math.floor(Date.now() / 1000) + 3600) }), {
          status: 200,
        });
      }
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { callTriageModel } = await import('./aoai.js');
    const result = await callTriageModel(baseInput());
    expect(result).toEqual({ abstain: true, reason: 'request_failed' });
  });

  it('abstains (never throws) when the MSI token mint itself fails', async () => {
    delete process.env.IDENTITY_ENDPOINT;
    delete process.env.IDENTITY_HEADER;
    const fetchMock = vi.fn(async () => new Response('should not be called', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { callTriageModel } = await import('./aoai.js');
    const result = await callTriageModel(baseInput());
    expect(result).toEqual({ abstain: true, reason: 'request_failed' });
  });
});
