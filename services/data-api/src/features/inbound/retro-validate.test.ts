import { describe, expect, it } from 'vitest';
import {
  RETRO_ALLOWED_STATUSES,
  normalizeRetroKeys,
  validateRetroCreate,
  validateRetroResolveExisting,
} from './retro-validate.js';

const trigger = { internetMessageId: '<trigger@example.com>' };
const original = { internetMessageId: '<original@example.com>' };

describe('normalizeRetroKeys', () => {
  it('normalizes each key and drops blanks', () => {
    expect(normalizeRetroKeys({ casePo: ' a. pch261269 ', externalRef: ' 575689 ', vrm: ' ka08 xtr ' })).toEqual({
      casePo: 'A.PCH261269',
      externalRef: '575689',
      vrm: 'KA08XTR',
    });
    expect(normalizeRetroKeys({})).toEqual({});
    expect(normalizeRetroKeys(undefined)).toEqual({});
  });

  it('a present-but-misshapen casePo is an error, never silently reclassified', () => {
    const r = normalizeRetroKeys({ casePo: 'RTA135983.001' });
    expect(r).toMatchObject({ ok: false, code: 'invalid_case_po' });
  });
});

describe('validateRetroResolveExisting', () => {
  it('requires the trigger envelope and at least one key', () => {
    expect(validateRetroResolveExisting({ keys: { vrm: 'KA08XTR' } })).toMatchObject({
      ok: false,
      code: 'missing_trigger',
    });
    expect(validateRetroResolveExisting({ trigger, keys: {} })).toMatchObject({
      ok: false,
      code: 'missing_keys',
    });
    expect(validateRetroResolveExisting({ trigger, keys: { externalRef: '575689' } })).toMatchObject({
      ok: true,
      value: { keys: { externalRef: '575689' } },
    });
  });
});

describe('validateRetroCreate', () => {
  const base = {
    original,
    trigger,
    keys: { externalRef: '575689' },
    statusName: 'needs_review',
    onHold: true,
    actionReason: 'needs_review',
    reconstructionSource: 'box_eml',
  };

  it('accepts a well-formed create and normalizes the discovered casePo', () => {
    const r = validateRetroCreate({ ...base, casePo: 'a. pch261269', statusName: 'eva_submitted', onHold: false, actionReason: '' });
    expect(r).toMatchObject({
      ok: true,
      value: {
        casePo: 'A.PCH261269',
        status: 'eva_submitted',
        onHold: false,
        reconstructionSource: 'box_eml',
      },
    });
  });

  it('whitelists the landing status — retro is never a write-any-status backdoor', () => {
    expect(RETRO_ALLOWED_STATUSES).toEqual(['eva_submitted', 'needs_review']);
    for (const statusName of ['box_synced', 'removed', 'ready_for_eva', 'ingested', '']) {
      expect(validateRetroCreate({ ...base, statusName })).toMatchObject({
        ok: false,
        code: 'invalid_status',
      });
    }
  });

  it('rejects an unknown reconstruction source and a misshapen casePo', () => {
    expect(validateRetroCreate({ ...base, reconstructionSource: 'guess' })).toMatchObject({
      ok: false,
      code: 'invalid_reconstruction_source',
    });
    expect(validateRetroCreate({ ...base, casePo: 'AB123456' })).toMatchObject({
      ok: false,
      code: 'invalid_case_po',
    });
  });

  it('requires both envelopes', () => {
    expect(validateRetroCreate({ ...base, original: {} })).toMatchObject({ ok: false, code: 'missing_original' });
    expect(validateRetroCreate({ ...base, trigger: { internetMessageId: ' ' } })).toMatchObject({
      ok: false,
      code: 'missing_trigger',
    });
  });

  it('rejects a foreign actionReason', () => {
    expect(validateRetroCreate({ ...base, actionReason: 'on_hold' })).toMatchObject({
      ok: false,
      code: 'invalid_action_reason',
    });
  });
});
