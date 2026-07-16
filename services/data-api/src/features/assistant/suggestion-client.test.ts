/**
 * services/data-api/src/features/assistant/suggestion-client.test.ts — OFFLINE proof for the TKT-015 case/damage-assessment
 * model call. No network, no Postgres, no Azure SDK: the request/schema/parse are pure and the
 * caller takes an injected fetch + token mint. Proves the strict-JSON contract, the gpt-5
 * reasoning-model request shape (keyless), the map to DraftSuggestion carrying model_version +
 * confidence, and the hard-fail-THROWS / clean-empty-RESOLVES failure posture.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildSuggestionsRequestBody,
  buildSuggestionsResponseSchema,
  buildSuggestionsUserPrompt,
  parseSuggestionsResponse,
  callSuggestionModel,
  CASE_ASSESSMENT_SUGGESTION_TYPES as T,
  type SuggestionModelInput,
} from './suggestion-client.js';

const INPUT: SuggestionModelInput = {
  caseId: 'case-1',
  vrm: 'WN14XPZ',
  scrubbedText: 'Insured stationary at lights, struck from behind by third party. Rear bumper and boot damaged.',
};

/** Build a real Response (Node 20 global) with a strict-JSON assessment content string. */
function aoaiResponse(
  suggestions: unknown[],
  { status = 200, model = 'gpt-5-2025-08-07', finishReason = 'stop' as string | undefined, rawContent }: {
    status?: number;
    model?: string;
    finishReason?: string;
    rawContent?: string;
  } = {},
): Response {
  const body = {
    model,
    choices: [
      {
        finish_reason: finishReason,
        message: { content: rawContent ?? JSON.stringify({ suggestions }) },
      },
    ],
  };
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('buildSuggestions* — strict-JSON structured-output request (reasoning-model shape)', () => {
  it('the response schema is strict at every level and locks the type enum', () => {
    const s = buildSuggestionsResponseSchema() as {
      additionalProperties: boolean;
      required: string[];
      properties: { suggestions: { items: { additionalProperties: boolean; required: string[]; properties: { type: { enum: string[] } } } } };
    };
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(['suggestions']);
    const item = s.properties.suggestions.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(expect.arrayContaining(['type', 'value', 'confidence', 'rationale']));
    expect(item.properties.type.enum).toEqual(
      expect.arrayContaining([T.damageArea, T.damageSeverity, T.accidentSummary]),
    );
  });

  it('the request body carries json_schema strict-mode + reasoning-model params, and NO forbidden params', () => {
    const body = buildSuggestionsRequestBody(INPUT, 'gpt-5') as Record<string, unknown>;
    expect(body.model).toBe('gpt-5');
    expect(body.max_completion_tokens).toBeTypeOf('number');
    expect(body.reasoning_effort).toBe('low');
    // gpt-5 is a reasoning model — these are rejected by the service, must be absent.
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('max_tokens');
    const rf = body.response_format as { type: string; json_schema: { strict: boolean } };
    expect(rf.type).toBe('json_schema');
    expect(rf.json_schema.strict).toBe(true);
  });

  it('the user prompt carries the VRM + the (scrubbed) notes, and is honest about absence', () => {
    expect(buildSuggestionsUserPrompt(INPUT)).toContain('WN14XPZ');
    expect(buildSuggestionsUserPrompt(INPUT)).toContain('struck from behind');
    const empty = buildSuggestionsUserPrompt({ caseId: 'c', vrm: '', scrubbedText: '' });
    expect(empty).toContain('(unknown)');
    expect(empty).toContain('(none)');
  });
});

describe('parseSuggestionsResponse — map strict-JSON to DraftSuggestion[]', () => {
  it('maps a well-formed body to drafts carrying model_version + clamped confidence + per-type value', () => {
    const body = {
      model: 'gpt-5-2025-08-07',
      choices: [{ message: { content: JSON.stringify({ suggestions: [
        { type: T.accidentSummary, value: 'The insured car was hit from behind while stopped.', confidence: 0.9, rationale: 'The notes say it was struck from behind at lights.' },
        { type: T.damageArea, value: 'rear', confidence: 1.4, rationale: 'The rear bumper and boot are described as damaged.' },
        { type: T.damageSeverity, value: 'Moderate', confidence: 0.6, rationale: 'Bumper and boot damage described.' },
      ] }) } }],
    };
    const drafts = parseSuggestionsResponse(body, 'gpt-5')!;
    expect(drafts).toHaveLength(3);
    // model_version stamp = <deployment>:<response-model>
    expect(drafts.every((d) => d.modelVersion === 'gpt-5:gpt-5-2025-08-07')).toBe(true);
    const summary = drafts.find((d) => d.suggestionType === T.accidentSummary)!;
    expect(summary.suggestedValue).toEqual({ summary: 'The insured car was hit from behind while stopped.' });
    expect(summary.confidence).toBe(0.9);
    const area = drafts.find((d) => d.suggestionType === T.damageArea)!;
    expect(area.suggestedValue).toEqual({ area: 'rear' });
    expect(area.confidence).toBe(1); // clamped
    const sev = drafts.find((d) => d.suggestionType === T.damageSeverity)!;
    expect(sev.suggestedValue).toEqual({ severity: 'moderate' }); // lower-cased + validated band
  });

  it('normalises an off-list severity to "unknown" and drops an unknown suggestion type', () => {
    const body = { choices: [{ message: { content: JSON.stringify({ suggestions: [
      { type: T.damageSeverity, value: 'catastrophic', confidence: 0.5, rationale: 'x' },
      { type: 'totally_made_up_kind', value: 'boom', confidence: 0.9, rationale: 'x' },
    ] }) } }] };
    const drafts = parseSuggestionsResponse(body, 'gpt-5')!;
    expect(drafts).toHaveLength(1); // the made-up kind is filtered out
    expect(drafts[0].suggestedValue).toEqual({ severity: 'unknown' });
  });

  it('a well-formed but EMPTY suggestions list resolves to [] (a clean "nothing to suggest")', () => {
    const body = { choices: [{ message: { content: JSON.stringify({ suggestions: [] }) } }] };
    expect(parseSuggestionsResponse(body, 'gpt-5')).toEqual([]);
  });

  it('returns NULL (hard-fail signal) for content_filter, empty content, garbled JSON, or no suggestions array', () => {
    expect(parseSuggestionsResponse({ choices: [{ finish_reason: 'content_filter' }] }, 'gpt-5')).toBeNull();
    expect(parseSuggestionsResponse({ choices: [{ message: { content: '' } }] }, 'gpt-5')).toBeNull();
    expect(parseSuggestionsResponse({ choices: [{ message: { content: 'not json at all' } }] }, 'gpt-5')).toBeNull();
    expect(parseSuggestionsResponse({ choices: [{ message: { content: JSON.stringify({ nope: 1 }) } }] }, 'gpt-5')).toBeNull();
    expect(parseSuggestionsResponse({}, 'gpt-5')).toBeNull();
  });
});

describe('callSuggestionModel — keyless caller, injected fetch + token', () => {
  const okDraft = [{ type: T.accidentSummary, value: 'Rear-end shunt at lights.', confidence: 0.8, rationale: 'Struck from behind while stationary.' }];

  it('returns [] WITHOUT any network call or token mint when no endpoint/deployment is configured', async () => {
    const fetchImpl = vi.fn();
    const mintToken = vi.fn();
    const out = await callSuggestionModel(INPUT, { fetchImpl: fetchImpl as never, mintToken, endpoint: '', deployment: '' });
    expect(out).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mintToken).not.toHaveBeenCalled();
  });

  it('on a 200 strict-JSON response maps to drafts, calling the GA v1 endpoint with a Bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(aoaiResponse(okDraft));
    const mintToken = vi.fn().mockResolvedValue('tok-123');
    const out = await callSuggestionModel(INPUT, {
      fetchImpl: fetchImpl as never,
      mintToken,
      endpoint: 'https://digital-3339-resource.openai.azure.com/',
      deployment: 'gpt-5',
    });
    expect(out).toHaveLength(1);
    expect(out[0].suggestionType).toBe(T.accidentSummary);
    expect(out[0].confidence).toBe(0.8);
    expect(out[0].modelVersion).toBe('gpt-5:gpt-5-2025-08-07');
    // GA v1 chat/completions surface + keyless bearer header.
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://digital-3339-resource.openai.azure.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  it('THROWS on a non-2xx model response (→ route degrades to reason:error, no partial write)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(aoaiResponse([], { status: 500 }));
    await expect(
      callSuggestionModel(INPUT, { fetchImpl: fetchImpl as never, mintToken: async () => 't', endpoint: 'https://ep', deployment: 'gpt-5' }),
    ).rejects.toThrow(/AOAI suggestions 500/);
  });

  it('THROWS on a transport/network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    await expect(
      callSuggestionModel(INPUT, { fetchImpl: fetchImpl as never, mintToken: async () => 't', endpoint: 'https://ep', deployment: 'gpt-5' }),
    ).rejects.toThrow(/ENOTFOUND/);
  });

  it('THROWS on a 2xx but unparsable/blocked body (malformed model response)', async () => {
    const filtered = new Response(JSON.stringify({ choices: [{ finish_reason: 'content_filter' }] }), { status: 200 });
    await expect(
      callSuggestionModel(INPUT, { fetchImpl: (async () => filtered) as never, mintToken: async () => 't', endpoint: 'https://ep', deployment: 'gpt-5' }),
    ).rejects.toThrow(/unparsable or blocked/);
  });

  it('resolves [] when the model runs cleanly but has nothing to suggest', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(aoaiResponse([]));
    const out = await callSuggestionModel(INPUT, {
      fetchImpl: fetchImpl as never,
      mintToken: async () => 't',
      endpoint: 'https://ep',
      deployment: 'gpt-5',
    });
    expect(out).toEqual([]);
  });
});
