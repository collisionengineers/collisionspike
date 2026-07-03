import { describe, expect, it } from 'vitest';
import { coalesceOcrIntoParse, shouldAttemptScannedPdfOcr } from './parse.js';
import type { OcrPdfResult } from '../../lib/functions-client.js';

/** A parse envelope with the 12 EVA keys all empty (the image-only/scanned tell). */
function emptyParse(overrides: Record<string, unknown> = {}) {
  return {
    extraction: {
      work_provider: { value: '' },
      vehicle_model: { value: '' },
      claimant_name: { value: '' },
    },
    vrm: { value: '' },
    reference: { value: '' },
    ...overrides,
  };
}

function ocrResult(overrides: Partial<OcrPdfResult> = {}): OcrPdfResult {
  return {
    extraction: null,
    vrm: null,
    reference: null,
    ocr_text: '',
    page_count: 1,
    ocr_provider: 'tesseract',
    issues: [],
    contract_version: 'ce_ocr_v1',
    ...overrides,
  };
}

describe('shouldAttemptScannedPdfOcr', () => {
  it('is true for a PDF that parsed with every EVA field + vrm/reference empty (image-only tell)', () => {
    expect(shouldAttemptScannedPdfOcr(emptyParse(), 'instruction.pdf')).toBe(true);
  });

  it('is false when the text parse already extracted any field (readable text layer)', () => {
    const parsed = emptyParse({ extraction: { vehicle_model: { value: 'Ford Focus' }, claimant_name: { value: '' } } });
    expect(shouldAttemptScannedPdfOcr(parsed, 'instruction.pdf')).toBe(false);
  });

  it('is false when the parser found a vrm even with empty EVA fields', () => {
    expect(shouldAttemptScannedPdfOcr(emptyParse({ vrm: { value: 'AB12CDE' } }), 'instruction.pdf')).toBe(false);
  });

  it('is false when the parser found a reference even with empty EVA fields', () => {
    expect(shouldAttemptScannedPdfOcr(emptyParse({ reference: { value: 'CCPY26050' } }), 'instruction.pdf')).toBe(false);
  });

  it('is false for a non-PDF attachment (the OCR host only accepts .pdf)', () => {
    expect(shouldAttemptScannedPdfOcr(emptyParse(), 'instruction.docx')).toBe(false);
    expect(shouldAttemptScannedPdfOcr(emptyParse(), 'forwarded.eml')).toBe(false);
  });

  it('is false when the parse was skipped (gate off / no document / unreadable)', () => {
    expect(shouldAttemptScannedPdfOcr({ skipped: true }, 'instruction.pdf')).toBe(false);
  });

  it('matches .pdf case-insensitively', () => {
    expect(shouldAttemptScannedPdfOcr(emptyParse(), 'INSTRUCTION.PDF')).toBe(true);
  });
});

describe('coalesceOcrIntoParse', () => {
  it('fills ONLY the fields the parser left empty (parser value always wins)', () => {
    const parsed = {
      extraction: { work_provider: { value: 'Acme' }, claimant_name: { value: '' } },
      vrm: { value: '' },
      reference: { value: '' },
    };
    const ocr = ocrResult({
      extraction: { work_provider: { value: 'FROM_OCR' }, claimant_name: { value: 'Jane Doe' } },
      vrm: { value: 'AB12CDE' },
    });
    const merged = coalesceOcrIntoParse(parsed, ocr);
    // parser had work_provider — keep it; claimant_name was empty — take OCR's.
    expect(merged.extraction?.work_provider?.value).toBe('Acme');
    expect(merged.extraction?.claimant_name?.value).toBe('Jane Doe');
    expect(merged.vrm?.value).toBe('AB12CDE');
  });

  it('does not overwrite a vrm/reference the parser already found', () => {
    const parsed = { extraction: {}, vrm: { value: 'PARSER1' }, reference: { value: 'REF1' } };
    const ocr = ocrResult({ vrm: { value: 'OCR1' }, reference: { value: 'REF2' } });
    const merged = coalesceOcrIntoParse(parsed, ocr);
    expect(merged.vrm?.value).toBe('PARSER1');
    expect(merged.reference?.value).toBe('REF1');
  });

  it('is a no-op when the OCR result carried no extraction/vrm/reference (engine absent)', () => {
    const parsed = emptyParse();
    const merged = coalesceOcrIntoParse(parsed, ocrResult());
    expect(merged.vrm?.value).toBe('');
    expect(merged.extraction?.work_provider?.value).toBe('');
  });

  it('does not mutate the input envelope', () => {
    const parsed = emptyParse();
    const ocr = ocrResult({ extraction: { work_provider: { value: 'X' } } });
    coalesceOcrIntoParse(parsed, ocr);
    expect(parsed.extraction.work_provider.value).toBe('');
  });

  it('preserves pass-through envelope fields untouched', () => {
    const parsed = { ...emptyParse(), contract_version: 'cedocumentparser_v2.0_eva_json', issues: [{ code: 'x' }] };
    const merged = coalesceOcrIntoParse(parsed, ocrResult({ extraction: { work_provider: { value: 'Y' } } }));
    expect(merged.contract_version).toBe('cedocumentparser_v2.0_eva_json');
    expect(merged.issues).toEqual([{ code: 'x' }]);
    expect(merged.extraction?.work_provider?.value).toBe('Y');
  });
});
