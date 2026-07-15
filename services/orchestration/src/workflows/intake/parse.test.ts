import { describe, expect, it } from 'vitest';
import {
  MAX_PARSE_DOCS,
  coalesceOcrIntoParse,
  orderParseCandidates,
  resolveWorkProviderAcrossDocs,
  selectInstructionIndex,
  shouldAttemptScannedPdfOcr,
} from './parse.js';
import type { OcrPdfResult } from '../../adapters/functions-client.js';

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
    const parsed = {
      ...emptyParse(),
      vin: { value: 'WVGZZZ1TZFW030347' },
      contract_version: 'cedocumentparser_v2.0_eva_json',
      issues: [{ code: 'x' }],
    };
    const merged = coalesceOcrIntoParse(parsed, ocrResult({ extraction: { work_provider: { value: 'Y' } } }));
    expect(merged.contract_version).toBe('cedocumentparser_v2.0_eva_json');
    expect(merged.issues).toEqual([{ code: 'x' }]);
    expect(merged.vin?.value).toBe('WVGZZZ1TZFW030347');
    expect(merged.extraction?.work_provider?.value).toBe('Y');
  });
});

/* ----------  Multi-doc candidate ordering + instruction selection (TKT-051/ADR-0021) ---------- */

function att(filename: string, contentType = ''): { filename: string; contentType: string; blobPath: string; size: number } {
  return { filename, contentType, blobPath: `msg-1/${filename}`, size: 100 };
}

describe('orderParseCandidates', () => {
  it('returns [] when nothing document-shaped attached (images only)', () => {
    expect(orderParseCandidates([att('IMG_0421.jpg', 'image/jpeg'), att('photo.png')])).toEqual([]);
  });

  it('puts Word/RTF documents BEFORE PDFs (the real audit corpus: instruction .DOC + report PDFs)', () => {
    const ordered = orderParseCandidates([
      att('_EHR102814_Plus_Report_.pdf', 'application/pdf'),
      att('Inspection Request - Audit Report.DOC', 'application/msword'),
      att('_EHR102814_Plus_.pdf', 'application/pdf'),
    ]);
    expect(ordered.map((a) => a.filename)).toEqual([
      'Inspection Request - Audit Report.DOC',
      '_EHR102814_Plus_Report_.pdf',
      '_EHR102814_Plus_.pdf',
    ]);
  });

  it('keeps the original attachment order within each tier (stable)', () => {
    const ordered = orderParseCandidates([
      att('b.pdf'), att('a.docx'), att('c.pdf'), att('d.doc'),
    ]);
    expect(ordered.map((a) => a.filename)).toEqual(['a.docx', 'd.doc', 'b.pdf', 'c.pdf']);
  });

  it('email FILES (.eml/.msg) are a pool of last resort — excluded when any real doc exists', () => {
    const withDoc = orderParseCandidates([att('forwarded.eml', 'message/rfc822'), att('instruction.pdf')]);
    expect(withDoc.map((a) => a.filename)).toEqual(['instruction.pdf']);
    const onlyEmail = orderParseCandidates([att('forwarded.eml', 'message/rfc822')]);
    expect(onlyEmail.map((a) => a.filename)).toEqual(['forwarded.eml']);
  });

  it('single-doc email yields exactly one candidate (behaviour unchanged vs the old picker)', () => {
    expect(orderParseCandidates([att('instruction.pdf'), att('IMG_1.jpg', 'image/jpeg')]).length).toBe(1);
  });
});

describe('selectInstructionIndex', () => {
  const envelope = (docType?: string, providerName: string | null = null, workProvider = '') => ({
    ...(workProvider ? { extraction: { work_provider: { value: workProvider } } } : {}),
    ...(docType === undefined
      ? {}
      : { content_typing: { doc_type: docType, provider_name: providerName, markers: [] } }),
  });

  it('REAL CORPUS (TKT-051): the audit .DOC wins on its extracted work_provider even though it content-types as report and the EVA PDF types as instruction', () => {
    // Probed 2026-07-03: the PCH audit instruction .DOC types `report` (title: "Audit
    // Report"); the attached EVA report PDF types `instruction`. The honest signal is the
    // extraction: the .DOC yields work_provider 'PCH'; the EVA layout yields '' by design.
    const parsed = [
      { att: att('Inspection Request - Audit Report.DOC'), envelope: envelope('report', 'PCH (Performance)', 'PCH') },
      { att: att('_EHR102814_Plus_Report_.pdf'), envelope: envelope('instruction', 'EVA (Engineers)') },
    ];
    expect(selectInstructionIndex(parsed)).toBe(0);
  });

  it('a doc typed instruction by an ENGINEER-REPORT layout (EVA/CNX) never wins rule 2', () => {
    const parsed = [
      { att: att('_EHR102814_Plus_Report_.pdf'), envelope: envelope('instruction', 'EVA (Engineers)') },
      { att: att('letter.docx'), envelope: envelope('instruction', null) },
    ];
    expect(selectInstructionIndex(parsed)).toBe(1);
  });

  it('an UNKNOWN work_provider does not win rule 1 (falls through to the typing)', () => {
    const parsed = [
      { att: att('mystery.pdf'), envelope: envelope('unknown', null, 'UNKNOWN') },
      { att: att('instruction.docx'), envelope: envelope('instruction', null) },
    ];
    expect(selectInstructionIndex(parsed)).toBe(1);
  });

  it('picks the first envelope content-typed as instruction when no extraction signal exists', () => {
    const parsed = [
      { att: att('report.pdf'), envelope: envelope('report') },
      { att: att('Inspection Request - Audit Report.DOC'), envelope: envelope('instruction') },
    ];
    expect(selectInstructionIndex(parsed)).toBe(1);
  });

  it('falls back to the OLD preference (PDF first) when nothing types as instruction', () => {
    const parsed = [
      { att: att('letter.docx'), envelope: envelope('unknown') },
      { att: att('scan.pdf'), envelope: envelope('unknown') },
    ];
    expect(selectInstructionIndex(parsed)).toBe(1);
  });

  it('1b: in the PDF-first fallback, an engineer-report PDF (EVA) is NEVER chosen over a non-engineer doc', () => {
    // Neither doc carries a work_provider or an instruction typing, so selection reaches the
    // fallback. The old PDF-first pick would grab the EVA report — precisely the misselection
    // that blanks the provider. It must pick the non-engineer .docx instead.
    const parsed = [
      { att: att('letter.docx'), envelope: envelope('unknown', null) },
      { att: att('_EVA_Report.pdf'), envelope: envelope('report', 'EVA (Engineers)') },
    ];
    expect(selectInstructionIndex(parsed)).toBe(0);
  });

  it('1b: still picks a non-engineer PDF first when the other candidate is also non-engineer', () => {
    const parsed = [
      { att: att('note.docx'), envelope: envelope('unknown', null) },
      { att: att('instruction.pdf'), envelope: envelope('unknown', 'PCH (Performance)') },
    ];
    expect(selectInstructionIndex(parsed)).toBe(1);
  });

  it('1b: only when EVERY candidate is an engineer-report layout does it fall back to PDF-first', () => {
    const parsed = [
      { att: att('cnx_letter.docx'), envelope: envelope('report', 'CNX (Engineers)') },
      { att: att('eva_report.pdf'), envelope: envelope('report', 'EVA (Engineers)') },
    ];
    expect(selectInstructionIndex(parsed)).toBe(1);
  });

  it('falls back to index 0 when nothing types as instruction and no PDF parsed', () => {
    const parsed = [
      { att: att('letter.docx'), envelope: envelope('junk') },
      { att: att('note.rtf'), envelope: envelope() },
    ];
    expect(selectInstructionIndex(parsed)).toBe(0);
  });

  it('a lone document is always chosen regardless of its typing', () => {
    expect(selectInstructionIndex([{ att: att('anything.pdf'), envelope: envelope('report') }])).toBe(0);
  });
});

describe('resolveWorkProviderAcrossDocs', () => {
  const doc = (workProvider = '') => ({
    envelope: workProvider ? { extraction: { work_provider: { value: workProvider } } } : {},
  });

  it('returns the real provider from ANY candidate even when the EVA report is the selected envelope', () => {
    // The audit shape: the EVA report (chosen for field extraction) yields '' by engine-v2.6,
    // the PCH instruction .DOC carries the real provider. It must still be resolved.
    const parsed = [doc('PCH'), doc('')];
    expect(resolveWorkProviderAcrossDocs(parsed)).toBe('PCH');
  });

  it('resolves the provider regardless of candidate order (EVA report first)', () => {
    const parsed = [doc(''), doc('QDOS')];
    expect(resolveWorkProviderAcrossDocs(parsed)).toBe('QDOS');
  });

  it('skips UNKNOWN and empty and engineer-report layout names', () => {
    const parsed = [
      { envelope: { extraction: { work_provider: { value: 'UNKNOWN' } } } },
      { envelope: { extraction: { work_provider: { value: 'EVA (Engineers)' } } } },
      { envelope: { extraction: { work_provider: { value: '  ' } } } },
      { envelope: { extraction: { work_provider: { value: 'SBL' } } } },
    ];
    expect(resolveWorkProviderAcrossDocs(parsed)).toBe('SBL');
  });

  it('returns "" when no candidate carries a usable provider (blank on a report-only audit email)', () => {
    const parsed = [
      { envelope: { extraction: { work_provider: { value: 'EVA (Engineers)' } } } },
      { envelope: {} },
    ];
    expect(resolveWorkProviderAcrossDocs(parsed)).toBe('');
  });

  it('single-doc email: returns that doc\'s provider (behaviour unchanged)', () => {
    expect(resolveWorkProviderAcrossDocs([doc('CCPY')])).toBe('CCPY');
  });
});

describe('MAX_PARSE_DOCS', () => {
  it('bounds the per-email parser cost at 3 documents', () => {
    expect(MAX_PARSE_DOCS).toBe(3);
  });
});
