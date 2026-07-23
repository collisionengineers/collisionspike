/** * image classifier (TKT-064). No network: the request body, response parsing, and the
 * classification->evidence-fields policy are all pure and unit-testable.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('../adapters/aoai.js', () => ({ mintCognitiveToken: vi.fn(async () => 'test-token') }));
import {
  buildImageRequestBody,
  classifyImageWithOutcome,
  parseImageResponse,
  imageClassificationOutcomeFromResponse,
  classificationToEvidenceFields,
  NON_VEHICLE_AUTO_EXCLUDE_MIN_CONFIDENCE,
  type ImageClassification,
} from './image-classify.js';
import {
  ADVERSARIAL_IMAGE_TEXT,
  ADVERSARIAL_IMAGE_CONTENT_TYPE,
  ADVERSARIAL_IMAGE_TEXT_BASE64,
} from './fixtures/adversarial-image-text.js';

const savedEndpoint = process.env.AI_MODEL_ENDPOINT;
const savedDeployment = process.env.AI_MODEL_DEPLOYMENT;
afterEach(() => {
  if (savedEndpoint === undefined) delete process.env.AI_MODEL_ENDPOINT;
  else process.env.AI_MODEL_ENDPOINT = savedEndpoint;
  if (savedDeployment === undefined) delete process.env.AI_MODEL_DEPLOYMENT;
  else process.env.AI_MODEL_DEPLOYMENT = savedDeployment;
  vi.unstubAllGlobals();
});

describe('buildImageRequestBody', () => {
  it('is a gpt-5 reasoning request: max_completion_tokens + reasoning_effort, NO temperature/max_tokens', () => {
    const body = buildImageRequestBody('aGVsbG8=', 'image/png', 'gpt-5') as Record<string, unknown>;
    expect(body.model).toBe('gpt-5');
    expect(body.max_completion_tokens).toBeTypeOf('number');
    expect(body.reasoning_effort).toBe('low');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('max_tokens');
    expect(body.response_format).toMatchObject({ type: 'json_schema' });
  });

  it('embeds the image as a data URL and honours a VRM hint', () => {
    const body = buildImageRequestBody('Ynl0ZXM=', 'image/jpeg', 'gpt-5', 'AB12CDE') as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const user = body.messages.find((m) => m.role === 'user')!;
    const parts = user.content as Array<Record<string, unknown>>;
    const img = parts.find((p) => p.type === 'image_url') as { image_url: { url: string } };
    expect(img.image_url.url).toBe('data:image/jpeg;base64,Ynl0ZXM=');
    const text = parts.find((p) => p.type === 'text') as { text: string };
    expect(text.text).toContain('AB12CDE');
  });

  it('defaults a non-image content type to image/jpeg', () => {
    const body = buildImageRequestBody('eA==', 'application/octet-stream', 'gpt-5') as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const parts = (body.messages[1].content as Array<Record<string, unknown>>);
    const img = parts.find((p) => p.type === 'image_url') as { image_url: { url: string } };
    expect(img.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('treats instructions visible inside an image as untrusted evidence', () => {
    const body = buildImageRequestBody(
      ADVERSARIAL_IMAGE_TEXT_BASE64,
      ADVERSARIAL_IMAGE_CONTENT_TYPE,
      'gpt-5',
    ) as { messages: Array<{ role: string; content: unknown }> };
    const system = String(body.messages.find((message) => message.role === 'system')?.content ?? '');
    const user = JSON.stringify(body.messages.find((message) => message.role === 'user')?.content ?? '');

    expect(system).toMatch(/untrusted evidence/i);
    expect(system).toMatch(/never follow/i);
    expect(user).not.toContain(ADVERSARIAL_IMAGE_TEXT);
    expect(user).toContain(ADVERSARIAL_IMAGE_TEXT_BASE64);
    expect(Buffer.from(ADVERSARIAL_IMAGE_TEXT_BASE64, 'base64').subarray(0, 8))
      .toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  // PR #73 / TKT-154 Lane B: the injection-hardening sentence rides the single shared
  // SYSTEM_PROMPT used for ALL image classification, and the SAME classifier must still read
  // the number plate. This locks the wording so a future edit cannot silently suppress plate
  // OCR (the do-not-obey clause must stay scoped to instruction-like text, and the factual
  // plate-transcription mandate must survive).
  it('keeps the plate-reading mandate while scoping the do-not-obey clause to instruction text', () => {
    const body = buildImageRequestBody('aGVsbG8=', 'image/png', 'gpt-5') as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const system = String(body.messages.find((m) => m.role === 'system')?.content ?? '');

    // Plate OCR is still mandated by the prompt.
    expect(system).toMatch(/plate_text/);
    expect(system).toMatch(/registration_visible/);
    expect(system).toMatch(/transcribe any legible number plate/i);
    // Explicit carve-out that factual vehicle-identifier transcription is NOT restricted.
    expect(system).toMatch(/does not restrict reading factual vehicle identifiers/i);
    // The untrusted-input defence is intact AND scoped to instruction/command/request text,
    // not to all text in the image (so it cannot swallow the plate).
    expect(system).toMatch(/untrusted evidence/i);
    expect(system).toMatch(/never follow[^.]*\b(instruction|command|request)\b/i);
  });

  it('carries the accepted adversarial PNG through the classifier seam without obeying its text', async () => {
    process.env.AI_MODEL_ENDPOINT = 'https://model.example';
    process.env.AI_MODEL_DEPLOYMENT = 'gpt-5';
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => ({
      status: 200,
      json: async () => ({
        choices: [{
          finish_reason: 'stop',
          message: { content: JSON.stringify({
            role: 'other',
            registration_visible: false,
            plate_text: '',
            person_reflection: false,
            confidence: 0.98,
          }) },
        }],
      }),
      requestBody: init.body,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await classifyImageWithOutcome({
      imageBase64: ADVERSARIAL_IMAGE_TEXT_BASE64,
      contentType: ADVERSARIAL_IMAGE_CONTENT_TYPE,
    });
    expect(outcome).toMatchObject({
      ok: true,
      classification: { role: 'other', confidence: 0.98 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(String(request.messages[0].content)).toMatch(/never follow/i);
    expect(JSON.stringify(request.messages[1].content)).toContain('data:image/png;base64,');
    expect(JSON.stringify(request.messages[1].content)).not.toContain(ADVERSARIAL_IMAGE_TEXT);
  });

  // PR #73 / TKT-154 Lane B: prove plate extraction still works under the hardened prompt.
  // A clean-plate model reply must map end-to-end (fetch seam -> parseImageResponse ->
  // classificationToEvidenceFields) to registrationVisible: true with the correct plate,
  // and the hardened injection-defence prompt is what actually goes over the wire.
  it('carries a clean-plate model reply through the seam to registrationVisible + the correct plateText', async () => {
    process.env.AI_MODEL_ENDPOINT = 'https://model.example';
    process.env.AI_MODEL_DEPLOYMENT = 'gpt-5';
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      status: 200,
      json: async () => ({
        choices: [{
          finish_reason: 'stop',
          message: { content: JSON.stringify({
            role: 'overview',
            registration_visible: true,
            plate_text: 'AB12CDE',
            person_reflection: false,
            confidence: 0.95,
          }) },
        }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await classifyImageWithOutcome({
      imageBase64: 'aGVsbG8=',
      contentType: 'image/jpeg',
      caseVrm: 'AB12 CDE',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected a successful classification outcome');

    // parseImageResponse preserved the plate text.
    expect(outcome.classification).toMatchObject({
      role: 'overview',
      registrationVisible: true,
      plateText: 'AB12CDE',
    });

    // The prompt that went over the wire still both hardens against injection AND mandates
    // plate reading — the hardening did not silently strip plate OCR.
    const sentSystem = String(
      JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages[0].content,
    );
    expect(sentSystem).toMatch(/never follow/i);
    expect(sentSystem).toMatch(/plate_text/);

    // End-to-end into the persisted evidence fields: the case plate is honoured.
    const fields = classificationToEvidenceFields(outcome.classification, 'AB12 CDE');
    expect(fields).toMatchObject({
      imageRole: 'overview',
      registrationVisible: true,
      acceptedForEva: true,
      excluded: false,
    });
  });
});

describe('parseImageResponse', () => {
  const wrap = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });

  it('parses a valid classification', () => {
    const res = parseImageResponse(
      wrap({ role: 'overview', registration_visible: true, plate_text: 'ab12cde', person_reflection: false, confidence: 0.9 }),
    );
    expect(res).toEqual({ role: 'overview', registrationVisible: true, plateText: 'ab12cde', personReflection: false, confidence: 0.9 });
  });

  it('returns null on content_filter, empty, bad JSON, or an unknown role', () => {
    expect(parseImageResponse({ choices: [{ finish_reason: 'content_filter', message: { content: '{}' } }] })).toBeNull();
    expect(parseImageResponse({ choices: [{ message: { content: '' } }] })).toBeNull();
    expect(parseImageResponse({ choices: [{ message: { content: 'not json' } }] })).toBeNull();
    expect(parseImageResponse(wrap({ role: 'banana', registration_visible: false, plate_text: '', person_reflection: false, confidence: 1 }))).toBeNull();
    expect(parseImageResponse(undefined)).toBeNull();
  });

  it('clamps confidence and coerces booleans defensively', () => {
    const res = parseImageResponse(wrap({ role: 'additional', registration_visible: 'yes', plate_text: 123, person_reflection: 1, confidence: 5 }));
    expect(res).toMatchObject({ role: 'additional', registrationVisible: false, plateText: '', personReflection: false, confidence: 1 });
  });
});

describe('imageClassificationOutcomeFromResponse', () => {
  const valid = {
    choices: [{
      finish_reason: 'stop',
      message: {
        content: JSON.stringify({
          role: 'overview',
          registration_visible: true,
          plate_text: 'AB12CDE',
          person_reflection: false,
          confidence: 0.9,
        }),
      },
    }],
  };

  it('returns a successful parsed classification', () => {
    expect(imageClassificationOutcomeFromResponse(200, valid)).toMatchObject({
      ok: true,
      classification: { role: 'overview', registrationVisible: true },
    });
  });

  it('treats an explicit content-filter result as terminal for these bytes', () => {
    expect(imageClassificationOutcomeFromResponse(200, {
      choices: [{ finish_reason: 'content_filter', message: { content: '' } }],
    })).toEqual({
      ok: false,
      failure: { disposition: 'terminal', code: 'model_content_filter' },
    });
  });

  it('treats payload-too-large as terminal but auth/rate-limit/server faults as transient', () => {
    expect(imageClassificationOutcomeFromResponse(413, {})).toEqual({
      ok: false,
      failure: { disposition: 'terminal', code: 'model_payload_too_large' },
    });
    for (const status of [401, 403, 404, 429, 500, 503]) {
      expect(imageClassificationOutcomeFromResponse(status, {})).toEqual({
        ok: false,
        failure: { disposition: 'transient', code: `model_http_${status}` },
      });
    }
  });

  it('keeps malformed success payloads transient because a later model response may recover', () => {
    expect(imageClassificationOutcomeFromResponse(200, { choices: [] })).toEqual({
      ok: false,
      failure: { disposition: 'transient', code: 'model_malformed_response' },
    });
  });

  it('TKT-306 regression: a healthy 200 under RAI policy Microsoft.DefaultV2 is NOT misread as a content-filter block', () => {
    // Every successful response under this policy carries content_filter_results /
    // prompt_filter_results with every category "safe" — a body-text scan for the phrase
    // "content filter" false-positives on this exact shape and discarded 100% of prod traffic.
    const raiAnnotatedSuccess = {
      choices: [{
        finish_reason: 'stop',
        content_filter_results: {
          hate: { filtered: false, severity: 'safe' },
          self_harm: { filtered: false, severity: 'safe' },
          sexual: { filtered: false, severity: 'safe' },
          violence: { filtered: false, severity: 'safe' },
        },
        message: {
          content: JSON.stringify({
            role: 'overview',
            registration_visible: true,
            plate_text: 'AB12CDE',
            person_reflection: false,
            confidence: 0.9,
          }),
        },
      }],
      prompt_filter_results: [{ prompt_index: 0, content_filter_results: { jailbreak: { filtered: false, detected: false } } }],
    };
    expect(imageClassificationOutcomeFromResponse(200, raiAnnotatedSuccess)).toMatchObject({
      ok: true,
      classification: { role: 'overview', registrationVisible: true },
    });
  });
});

describe('classificationToEvidenceFields', () => {
  const base: ImageClassification = { role: 'overview', registrationVisible: true, plateText: 'AB12CDE', personReflection: false, confidence: 0.9 };

  it('person reflection -> excluded + not accepted (domain rule)', () => {
    const f = classificationToEvidenceFields({ ...base, role: 'damage_closeup', personReflection: true });
    expect(f).toMatchObject({ excluded: true, acceptedForEva: false });
    expect(f.exclusionReason).toBeTruthy();
  });

  it('person reflection is ALSO stamped as the advisory flag (TKT-123 — additive to exclusion)', () => {
    expect(
      classificationToEvidenceFields({ ...base, personReflection: true }),
    ).toMatchObject({ personReflection: true, excluded: true });
    expect(classificationToEvidenceFields(base)).toMatchObject({ personReflection: false });
  });

  it('low-confidence non-vehicle stays reviewable and not accepted', () => {
    expect(classificationToEvidenceFields({ ...base, role: 'other', confidence: 0.89 })).toMatchObject({ acceptedForEva: false, excluded: false });
  });

  it('high-confidence non-vehicle with no readable registration is excluded', () => {
    const f = classificationToEvidenceFields({ ...base, role: 'other', registrationVisible: false, plateText: '', confidence: 0.9 });
    expect(f).toMatchObject({ imageRole: 'other', acceptedForEva: false, excluded: true, personReflection: false });
    expect(f.exclusionReason).toBe('This image may not show the vehicle');
    expect(NON_VEHICLE_AUTO_EXCLUDE_MIN_CONFIDENCE).toBe(0.9);
  });

  it('person reflection still takes precedence with its own reason', () => {
    const f = classificationToEvidenceFields(
      { ...base, role: 'other', personReflection: true },
      undefined,
    );
    expect(f).toMatchObject({ excluded: true, personReflection: true });
    expect(f.exclusionReason).toBe('A person’s reflection may be visible');
  });

  it('genuine vehicle roles are never excluded', () => {
    for (const role of ['overview', 'damage_closeup', 'additional'] as const) {
      expect(
        classificationToEvidenceFields({ ...base, role }),
      ).toMatchObject({ imageRole: role, acceptedForEva: true, excluded: false });
    }
  });

  it('a readable registration signal prevents non-vehicle auto-exclusion', () => {
    expect(
      classificationToEvidenceFields({ ...base, role: 'other', confidence: 1, registrationVisible: true }),
    ).toMatchObject({ acceptedForEva: false, excluded: false });
    expect(
      classificationToEvidenceFields({ ...base, role: 'other', confidence: 1, registrationVisible: false, plateText: 'ZZ99 ZZZ' }),
    ).toMatchObject({ acceptedForEva: false, excluded: false });
  });

  it('a genuine vehicle photo -> accepted for EVA', () => {
    expect(classificationToEvidenceFields(base)).toMatchObject({ imageRole: 'overview', registrationVisible: true, acceptedForEva: true, excluded: false });
  });

  it('with NO case VRM, registrationVisible falls back to any legible plate', () => {
    expect(classificationToEvidenceFields(base)).toMatchObject({ registrationVisible: true });
    expect(classificationToEvidenceFields(base, undefined)).toMatchObject({ registrationVisible: true });
  });

  it('with a matching case VRM (space/case-insensitive), registrationVisible stays true', () => {
    expect(classificationToEvidenceFields({ ...base, plateText: 'AB12CDE' }, 'ab12 cde')).toMatchObject({ registrationVisible: true });
  });

  it('with a NON-matching case VRM, registrationVisible is forced false (wrong-vehicle plate)', () => {
    // an audit report photo of a THIRD-PARTY car with a readable plate must not clear the
    // case's overview rule — the domain contract's registrationVisible = the CASE plate.
    const f = classificationToEvidenceFields({ ...base, plateText: 'ZZ99ZZZ' }, 'AB12CDE');
    expect(f).toMatchObject({ imageRole: 'overview', registrationVisible: false, acceptedForEva: true });
  });

  it('the classifier reading no plate stays false even with a case VRM', () => {
    expect(classificationToEvidenceFields({ ...base, registrationVisible: false, plateText: '' }, 'AB12CDE'))
      .toMatchObject({ registrationVisible: false });
  });
});
