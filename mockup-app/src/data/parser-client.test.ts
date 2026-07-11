import { describe, it, expect } from 'vitest';
import {
  adaptParserResponse,
  parseDocument,
  parserSourceToType,
  parserErrors,
  parserFieldToEvaField,
  type ParserResponse,
  type ParserTransport,
} from './parser-client';
import { EVA_FIELD_ORDER } from '@cs/domain';

/* A representative parser response (contract_version
   cedocumentparser_v2.0_eva_json) — keeps this test offline while exercising
   the wire shape (12 keys plus separate identity fields). */
const LIVE_SUCCESS: ParserResponse = {
  extraction: {
    work_provider: { value: 'UNKNOWN', confidence: null, source: 'pdf_extraction' },
    vehicle_model: { value: 'Ford Focus Zetec', confidence: 0.78, source: 'fallback_vehicle_model_exact_vehicle' },
    claimant_name: { value: '', confidence: null, source: 'pdf_extraction', warnings: ["Required field 'claimant_name' is empty."] },
    claimant_telephone: { value: '', confidence: null, source: 'absent' },
    claimant_email: { value: '', confidence: null, source: 'absent' },
    date_of_loss: { value: '01/03/2026', confidence: 0.7, source: 'fallback_incident_date_context' },
    date_of_instruction: { value: '05/03/2026', confidence: 0.7, source: 'fallback_instruction_date_context' },
    accident_circumstances: { value: '', confidence: null, source: 'pdf_extraction' },
    inspection_address: { value: '12 Example Street\nLeeds\n\n\n\nLS1 1AA', confidence: 0.8, source: 'fallback_inspection_address' },
    vat_status: { value: 'Yes', confidence: 0.55, source: 'fallback_vat_positive' },
    mileage: { value: '', confidence: null, source: 'pdf_extraction' },
    mileage_unit: { value: 'Miles', confidence: 0.6, source: 'fallback_mileage_unit' },
  },
  vrm: { value: 'AB12CDE', confidence: 0.72, source: 'fallback_vrm_label' },
  reference: { value: '', confidence: null, source: 'pdf_extraction' },
  vin: { value: 'WVGZZZ1TZFW030347', confidence: 0.99, source: 'tractable_vin' },
  issues: [],
  contract_version: 'cedocumentparser_v2.0_eva_json',
};

const LIVE_FAILURE: ParserResponse = {
  extraction: null,
  vrm: null,
  reference: null,
  vin: null,
  issues: [
    {
      field: '(request)',
      severity: 'error',
      code: 'unsupported_document',
      message: "unsupported document type '.txt'; supported: .pdf, .docx, .doc, .eml, .msg",
    },
  ],
  contract_version: 'cedocumentparser_v2.0_eva_json',
};

describe('parserSourceToType', () => {
  it('maps document extraction to pdf_extraction (PDF badge)', () => {
    expect(parserSourceToType('pdf_extraction')).toBe('pdf_extraction');
    expect(parserSourceToType('document_ai')).toBe('pdf_extraction');
  });
  it('maps any fallback_* heuristic to ai (AI badge)', () => {
    expect(parserSourceToType('fallback_vat_positive')).toBe('ai');
    expect(parserSourceToType('fallback_vrm_label')).toBe('ai');
  });
  it('maps absent/empty to manual_upload (Manual badge — needs entry)', () => {
    expect(parserSourceToType('absent')).toBe('manual_upload');
    expect(parserSourceToType('')).toBe('manual_upload');
    expect(parserSourceToType(null)).toBe('manual_upload');
  });
});

describe('parserFieldToEvaField', () => {
  it('carries confidence onto provenance and marks the field needs_review', () => {
    const f = parserFieldToEvaField({ value: 'Ford Focus', confidence: 0.78, source: 'fallback_x' });
    expect(f.value).toBe('Ford Focus');
    expect(f.provenance.sourceType).toBe('ai');
    expect(f.provenance.confidence).toBe(0.78);
    expect(f.reviewState).toBe('needs_review');
  });
  it('treats the UNKNOWN work_provider sentinel as empty', () => {
    const f = parserFieldToEvaField({ value: 'UNKNOWN', confidence: null, source: 'pdf_extraction' });
    expect(f.value).toBe('');
  });
  it('omits confidence when null (deterministic/absent sources)', () => {
    const f = parserFieldToEvaField({ value: '', confidence: null, source: 'absent' });
    expect(f.provenance.confidence).toBeUndefined();
  });
});

describe('adaptParserResponse', () => {
  it('produces all 12 EVA fields in contract order', () => {
    const r = adaptParserResponse(LIVE_SUCCESS);
    for (const desc of EVA_FIELD_ORDER) {
      expect(r.evaFields[desc.key]).toBeDefined();
      expect(typeof r.evaFields[desc.key].value).toBe('string');
    }
  });
  it('extracts vrm and reference as Case-identity values', () => {
    const r = adaptParserResponse(LIVE_SUCCESS);
    expect(r.vrm).toBe('AB12CDE');
    expect(r.reference).toBe('');
  });
  it('preserves VIN outside the 12 EVA fields', () => {
    const r = adaptParserResponse(LIVE_SUCCESS);
    expect(r.vin).toBe('WVGZZZ1TZFW030347');
    expect(r.vinField?.source).toBe('tractable_vin');
    expect('vin' in r.evaFields).toBe(false);
  });
  it('narrows the vat/mileage-unit enum-valued fields', () => {
    const r = adaptParserResponse(LIVE_SUCCESS);
    expect(r.evaFields.vatStatus.value).toBe('Yes');
    expect(r.evaFields.mileageUnit.value).toBe('Miles');
  });
  it('keeps the multi-line inspection address verbatim', () => {
    const r = adaptParserResponse(LIVE_SUCCESS);
    expect(r.evaFields.inspectionAddress.value).toContain('\n');
    expect(r.evaFields.inspectionAddress.value).toContain('LS1 1AA');
  });
});

describe('parserErrors', () => {
  it('returns error-severity issues only', () => {
    expect(parserErrors(LIVE_FAILURE)).toHaveLength(1);
    expect(parserErrors(LIVE_SUCCESS)).toHaveLength(0);
  });
});

describe('parseDocument', () => {
  it('adapts a response via an injected transport (no network)', async () => {
    const transport: ParserTransport = async (req) => {
      expect(req.filename).toBe('instruction.docx');
      expect(req.document).toBe('BASE64');
      return LIVE_SUCCESS;
    };
    const r = await parseDocument({ document: 'BASE64', filename: 'instruction.docx' }, transport);
    expect(r.vrm).toBe('AB12CDE');
    expect(r.evaFields.vehicleModel.value).toBe('Ford Focus Zetec');
    expect(r.issues).toHaveLength(0);
  });
});
