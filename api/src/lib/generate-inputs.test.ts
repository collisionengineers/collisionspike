/**
 * api/src/lib/generate-inputs.test.ts — TKT-132 OFFLINE proof for the widened generate-input
 * assembly. Pure module (no mocks needed; the REAL @cs/domain scrubPii runs). Pins:
 *   - each input class renders as its labelled section; absent classes render nothing;
 *   - the honest no_input path: empty-everything (and VRM-only) → hasInput false;
 *   - free text is PII-scrubbed (emails/phones/titled names redacted; VRM KEPT);
 *   - the per-section cap (boundary: at-cap unchanged, over-cap head-truncated + marked);
 *   - the TOTAL cap bounds the assembled whole;
 *   - photo stamps summarise to compact value-free counts.
 */

import { describe, it, expect } from 'vitest';
import {
  buildGenerateInputs,
  capText,
  SECTION_CHAR_CAP,
  TOTAL_INPUT_CHAR_CAP,
  TRUNCATION_MARKER,
} from './generate-inputs.js';

const FULL_CASE = {
  vrm: 'WN14XPZ',
  case_po: 'CCPY26050',
  eva_accident_circumstances: 'Struck from behind at lights. Rear bumper damaged.',
  eva_claimant_address: '12 High Street, Manchester M1 4WB',
  eva_work_provider: 'Crashline Claims',
  eva_vehicle_model: 'Ford Focus 1.0 EcoBoost',
  eva_date_of_loss: '01/06/2026',
  eva_date_of_instruction: '05/06/2026',
  eva_mileage: '45000',
  eva_mileage_unit: 'Miles',
  ov_claim_type: 'Non-fault',
  ov_insurer_name: 'Acme Insurance Ltd',
  ov_repairer_name: 'Smart Repairs',
};

describe('buildGenerateInputs — sections present/absent', () => {
  it('renders every input class as its labelled section (full case + extras)', () => {
    const out = buildGenerateInputs(FULL_CASE, {
      instructionEmails: [
        { subject: 'New instruction WN14XPZ', bodyPreview: 'Please inspect the vehicle at your earliest convenience.' },
      ],
      images: [
        { role: 'overview', registrationVisible: true },
        { role: 'damage_closeup' },
        { role: 'unknown' },
      ],
    });
    expect(out.hasInput).toBe(true);
    expect(out.sections).toEqual([
      'circumstances',
      'claimant_address',
      'instruction_email',
      'overview',
      'vehicle',
      'images',
    ]);
    expect(out.text).toContain('Accident circumstances:');
    expect(out.text).toContain('Struck from behind at lights.');
    expect(out.text).toContain('Claimant address (personal details removed):');
    expect(out.text).toContain('Instruction email text (personal details removed):');
    expect(out.text).toContain('Subject: New instruction WN14XPZ');
    expect(out.text).toContain('Please inspect the vehicle');
    expect(out.text).toContain('Case overview facts:');
    expect(out.text).toContain('- Case reference: CCPY26050');
    expect(out.text).toContain('- Work provider: Crashline Claims');
    expect(out.text).toContain('- Insurer: Acme Insurance Ltd');
    expect(out.text).toContain('- Date of loss: 01/06/2026');
    expect(out.text).toContain('Vehicle:');
    expect(out.text).toContain('- Model: Ford Focus 1.0 EcoBoost');
    expect(out.text).toContain('- Mileage: 45000 Miles');
    expect(out.text).toContain('Photo analysis:');
  });

  it('the TICKET acceptance shape: parsed instructions but EMPTY circumstances still yields input', () => {
    const out = buildGenerateInputs(
      { vrm: 'WN14XPZ', eva_accident_circumstances: '  ', eva_claimant_address: null },
      { instructionEmails: [{ subject: 'Instruction', bodyPreview: 'Rear-end collision, please assess.' }] },
    );
    expect(out.hasInput).toBe(true);
    expect(out.sections).toEqual(['instruction_email']);
    expect(out.text).toContain('Rear-end collision');
  });

  it('absent classes render nothing (no empty labels)', () => {
    const out = buildGenerateInputs({ eva_accident_circumstances: 'Side impact.' });
    expect(out.sections).toEqual(['circumstances']);
    expect(out.text).not.toContain('Instruction email text');
    expect(out.text).not.toContain('Case overview facts:');
    expect(out.text).not.toContain('Vehicle:');
    expect(out.text).not.toContain('Photo analysis:');
  });

  it('empty-everything → the honest no_input signal', () => {
    const out = buildGenerateInputs({});
    expect(out).toEqual({ text: '', hasInput: false, sections: [] });
  });

  it('a VRM alone is NOT input (it rides the caller prompt line, not a section)', () => {
    const out = buildGenerateInputs({ vrm: 'WN14XPZ' });
    expect(out.hasInput).toBe(false);
  });

  it('blank/whitespace emails and empty image lists render nothing', () => {
    const out = buildGenerateInputs({}, { instructionEmails: [{ subject: '  ', bodyPreview: '' }], images: [] });
    expect(out.hasInput).toBe(false);
  });
});

describe('buildGenerateInputs — PII scrub on free text (VRM kept)', () => {
  it('redacts email/phone/titled-name in the instruction email body; the VRM survives', () => {
    const out = buildGenerateInputs(
      {},
      {
        instructionEmails: [
          {
            subject: 'Instruction for WN14 XPZ',
            bodyPreview:
              'Mr John Smith (john.smith@example.com, 07700 900123) reports rear damage to WN14 XPZ.',
          },
        ],
      },
    );
    expect(out.text).toContain('[NAME]');
    expect(out.text).toContain('[EMAIL]');
    expect(out.text).toContain('[PHONE]');
    expect(out.text).not.toContain('john.smith@example.com');
    expect(out.text).not.toContain('07700 900123');
    expect(out.text).not.toContain('John Smith');
    expect(out.text).toContain('WN14 XPZ'); // redactVrm:false — the domain key stays
  });

  it('scrubs the circumstances + claimant address exactly like the pre-TKT-132 route', () => {
    const out = buildGenerateInputs({
      eva_accident_circumstances: 'Contact me on 07700 900123 about the shunt.',
      eva_claimant_address: '12 High Street, Manchester M1 4WB',
    });
    expect(out.text).toContain('[PHONE]');
    expect(out.text).not.toContain('07700 900123');
    expect(out.text).toContain('[ADDRESS]'); // the street line is redacted
    expect(out.text).not.toContain('M1 4WB'); // postcode redacted
  });
});

describe('caps — per-section + total, head-truncation with a marker', () => {
  it('capText boundary: at-cap unchanged; over-cap → exactly cap chars ending in the marker', () => {
    const atCap = 'x'.repeat(SECTION_CHAR_CAP);
    expect(capText(atCap, SECTION_CHAR_CAP)).toBe(atCap);
    const overCap = 'x'.repeat(SECTION_CHAR_CAP + 1);
    const capped = capText(overCap, SECTION_CHAR_CAP);
    expect(capped).toHaveLength(SECTION_CHAR_CAP);
    expect(capped.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(capped.startsWith('xxx')).toBe(true); // head kept, tail cut
  });

  it('a section body longer than SECTION_CHAR_CAP is truncated inside the assembled text', () => {
    const long = 'damage '.repeat(1000); // 7000 chars
    const out = buildGenerateInputs({ eva_accident_circumstances: long });
    const body = out.text.replace('Accident circumstances:\n', '');
    expect(body).toHaveLength(SECTION_CHAR_CAP);
    expect(body.endsWith(TRUNCATION_MARKER)).toBe(true);
  });

  it('the assembled whole never exceeds TOTAL_INPUT_CHAR_CAP', () => {
    const long = 'notes '.repeat(1000); // ~6000 chars per free-text source
    const out = buildGenerateInputs(
      { eva_accident_circumstances: long, eva_claimant_address: long },
      {
        instructionEmails: [
          { subject: 'S', bodyPreview: long },
          { subject: 'S2', bodyPreview: long },
        ],
      },
    );
    expect(out.text.length).toBeLessThanOrEqual(TOTAL_INPUT_CHAR_CAP);
    expect(out.text.endsWith(TRUNCATION_MARKER)).toBe(true);
  });
});

describe('photo-analysis summary — compact, value-free counts', () => {
  it('summarises roles, visible registration, exclusions and reflections', () => {
    const out = buildGenerateInputs(
      {},
      {
        images: [
          { role: 'overview', registrationVisible: true },
          { role: 'damage_closeup' },
          { role: 'damage_closeup' },
          { role: 'unknown', excluded: true },
          { role: 'unknown', personReflection: true },
          { role: 'unknown' },
        ],
      },
    );
    expect(out.sections).toEqual(['images']);
    expect(out.text).toContain('6 photos on file');
    expect(out.text).toContain('1 overview (1 with visible registration)');
    expect(out.text).toContain('2 damage close-ups');
    expect(out.text).toContain('1 excluded');
    expect(out.text).toContain("1 flagged for a person's reflection");
  });
});
