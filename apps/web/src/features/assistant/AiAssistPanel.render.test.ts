/**
 * AiAssistPanel.render.test.ts — pins that EVERY AI suggestion kind the app can mint renders in
 * plain case language (a label + a human summary), never a raw enum name or JSON blob (PR46
 * operator/Codex review: the panel only handled the four earlier kinds and fell back to
 * `s.suggestionType` + `JSON.stringify` for the TKT-015/016 kinds).
 */

import { describe, it, expect } from 'vitest';
import { TYPE_LABEL, summariseValue } from './AiAssistPanel';
import type { AiSuggestion } from '../../data';

function sug(suggestionType: string, suggestedValue: unknown): AiSuggestion {
  return {
    id: 's1',
    suggestionType: suggestionType as AiSuggestion['suggestionType'],
    suggestedValue,
    reviewState: 'pending',
    createdAt: '2026-07-09T00:00:00Z',
  } as AiSuggestion;
}

const ALL_KINDS = [
  'image_role',
  'registration',
  'inspection_address',
  'triage_category',
  'damage_area',
  'damage_severity',
  'accident_summary',
  'vehicle_present',
  'same_vehicle',
  'background_text',
  'location_hint',
  'address_suggestion',
];

describe('TYPE_LABEL — a plain label for every kind (no raw enum names)', () => {
  it('every kind the app mints has a human label with no underscores', () => {
    for (const k of ALL_KINDS) {
      expect(TYPE_LABEL[k], k).toBeTruthy();
      expect(TYPE_LABEL[k]).not.toMatch(/_/);
    }
  });
});

describe('summariseValue — human summary for every kind (never JSON)', () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ['damage_area', { area: 'front nearside' }, /front nearside/],
    ['damage_severity', { severity: 'moderate' }, /moderate/],
    ['damage_severity', { severity: 'unknown' }, /hard to judge/],
    ['accident_summary', { summary: 'Rear-end shunt at lights.' }, /Rear-end shunt/],
    ['vehicle_present', { present: true, descriptor: 'silver Ford Focus', personReflection: false }, /silver Ford Focus/],
    ['vehicle_present', { present: false }, /does not show a vehicle/],
    ['vehicle_present', { present: true, personReflection: true }, /reflection/],
    ['same_vehicle', { sameVehicle: true }, /same vehicle/i],
    ['same_vehicle', { sameVehicle: false }, /more than one vehicle/i],
    ['background_text', { items: [{ text: 'ACME MOTORS', kind: 'business' }] }, /ACME MOTORS/],
    ['location_hint', { hints: [{ detail: 'High Street', kind: 'road_name' }] }, /High Street/],
    ['address_suggestion', { best: { label: 'Cariocca Business Park' } }, /Cariocca Business Park/],
    ['registration', { detectedVrm: 'YT13UTV', matchesCaseVrm: true, visible: true }, /YT13UTV.*matches/],
    ['registration', { visibility: 'visible_unreadable', visible: false }, /not readable/],
  ];

  it.each(cases)('%s → plain language', (type, value, re) => {
    const out = summariseValue(sug(type, value));
    expect(out).toMatch(re);
    expect(out).not.toMatch(/[{}]/); // never a JSON blob
  });

  it('a genuinely unknown shape still degrades safely (no throw)', () => {
    expect(() => summariseValue(sug('address_suggestion', {}))).not.toThrow();
    expect(summariseValue(sug('address_suggestion', {}))).toMatch(/inspection address/i);
  });
});
