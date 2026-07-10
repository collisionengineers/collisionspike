/**
 * orchestration/src/lib/image-classify.test.ts — pure-function coverage for the live
 * image classifier (TKT-064). No network: the request body, response parsing, and the
 * classification->evidence-fields policy are all pure and unit-testable.
 */
import { describe, it, expect } from 'vitest';
import {
  buildImageRequestBody,
  parseImageResponse,
  classificationToEvidenceFields,
  type ImageClassification,
} from './image-classify.js';

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

  it('non-vehicle "other" -> not accepted, not excluded (direct-attachment lanes keep today\'s semantics)', () => {
    expect(classificationToEvidenceFields({ ...base, role: 'other' })).toMatchObject({ acceptedForEva: false, excluded: false });
  });

  it('TKT-089 extraction lane: "other" + nonVehicleExcluded -> excluded with a domain reason', () => {
    const f = classificationToEvidenceFields({ ...base, role: 'other' }, undefined, { nonVehicleExcluded: true });
    expect(f).toMatchObject({ imageRole: 'other', acceptedForEva: false, excluded: true, personReflection: false });
    expect(f.exclusionReason).toBe('non-vehicle image detected (auto-classified)');
  });

  it('TKT-089 extraction lane: person reflection still takes precedence (its own reason)', () => {
    const f = classificationToEvidenceFields(
      { ...base, role: 'other', personReflection: true },
      undefined,
      { nonVehicleExcluded: true },
    );
    expect(f).toMatchObject({ excluded: true, personReflection: true });
    expect(f.exclusionReason).toBe('person reflection detected (auto-classified)');
  });

  it('TKT-089 recall guard: genuine vehicle roles are NEVER excluded by the extraction-lane option', () => {
    for (const role of ['overview', 'damage_closeup', 'additional'] as const) {
      expect(
        classificationToEvidenceFields({ ...base, role }, undefined, { nonVehicleExcluded: true }),
      ).toMatchObject({ imageRole: role, acceptedForEva: true, excluded: false });
    }
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
