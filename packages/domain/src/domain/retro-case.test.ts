import { describe, expect, it } from 'vitest';
import {
  CASE_PO_SHAPE_RE,
  RETRO_TRIGGER_CATEGORIES,
  decideRetro,
  decideRetroStatus,
  hasUsableRetroKey,
  isJunkRetroKey,
  matchPrincipalByCasePo,
  markerToCaseType,
  normalizeCasePo,
  parseCasePoMarker,
  planRetroReconstruction,
  selectBoxInstructionCandidate,
  type BoxFolderEntry,
} from './retro-case';

/**
 * ADR-0022 — retroactive case reconstruction. The trigger emails cite the
 * provider's external/claim reference and/or a registration, NOT the internal
 * Case/PO (operator decision 2026-07-04); a CE-shaped body_caseref (quoted
 * thread) is an opportunistic strongest key; the Case/PO itself is discovered
 * from the archive folder name and validated here.
 */

describe('RETRO_TRIGGER_CATEGORIES', () => {
  it('is exactly billing/case_update/cancellation/query — digests and unidentified mail never trigger', () => {
    expect(RETRO_TRIGGER_CATEGORIES).toEqual(['billing', 'case_update', 'cancellation', 'query']);
    expect(RETRO_TRIGGER_CATEGORIES).not.toContain('non_actionable');
    expect(RETRO_TRIGGER_CATEGORIES).not.toContain('other');
    expect(RETRO_TRIGGER_CATEGORIES).not.toContain('receiving_work');
  });
});

describe('CASE_PO_SHAPE_RE (anchored mirror of the classifier CASEREF_RE)', () => {
  it.each(['CCPY26050', 'QDOS261253', 'MP26071', 'ALS26066', 'A.PCH261269', 'AP.QDOS261530', 'D.PCH26190'])(
    'accepts the genuine corpus shape %s',
    (token) => {
      expect(CASE_PO_SHAPE_RE.test(token)).toBe(true);
    },
  );

  it.each([
    'RTA135983.001', // solicitor ref — dotted sequence suffix can never full-match
    'AB123456', // 2 letters + 6 digits — the 2-letter arm is exactly 5 trailing digits
    '575689', // bare number (a labelled "Our Ref" catch)
    'SAB/46286/1', // structured client ref
    'CCPY2605', // sequence too short
    'PHA 5013', // space-separated provider ref
  ])('rejects the non-Case/PO shape %s', (token) => {
    expect(CASE_PO_SHAPE_RE.test(token)).toBe(false);
  });

  it('normalizeCasePo uppercases and collapses the tolerated marker-dot space', () => {
    expect(normalizeCasePo(' a. pch261269 ')).toBe('A.PCH261269');
    expect(normalizeCasePo('ccpy26050')).toBe('CCPY26050');
    expect(normalizeCasePo(undefined)).toBe('');
  });
});

describe('decideRetro — trigger eligibility', () => {
  const base = { isReply: false as const };

  it('billing with an external ref attempts, keyed on the ref', () => {
    const d = decideRetro({ ...base, category: 'billing', bodyJobref: '575689' });
    expect(d.attempt).toBe(true);
    expect(d.keys).toEqual({ externalRef: '575689' });
  });

  it('a CE-shaped body_caseref (quoted thread) becomes the strongest key', () => {
    const d = decideRetro({ ...base, category: 'case_update', bodyCaseref: 'ccpy26050', bodyVrm: 'AB12 CDE' });
    expect(d.attempt).toBe(true);
    expect(d.keys.casePo).toBe('CCPY26050');
    expect(d.keys.vrm).toBe('AB12CDE');
  });

  it('a non-CE-shaped subject ref still counts as an external reference', () => {
    const d = decideRetro({ ...base, category: 'query', candidateRef: 'RTA135983.001' });
    expect(d.attempt).toBe(true);
    expect(d.keys.casePo).toBeUndefined();
    expect(d.keys.externalRef).toBe('RTA135983.001');
  });

  it('VRM-only mail attempts (weakest key — downstream rungs corroborate)', () => {
    const d = decideRetro({ ...base, category: 'billing', bodyVrm: 'ka08 xtr' });
    expect(d.attempt).toBe(true);
    expect(d.keys).toEqual({ vrm: 'KA08XTR' });
  });

  it('no usable key -> no attempt (stays in triage exactly as today)', () => {
    const d = decideRetro({ ...base, category: 'billing' });
    expect(d.attempt).toBe(false);
    expect(d.reasons).toContain('no_usable_key');
  });

  it.each(['non_actionable', 'receiving_work'] as const)(
    'category %s never attempts even with keys present',
    (category) => {
      const d = decideRetro({ ...base, category, bodyJobref: '575689', bodyVrm: 'KA08XTR' });
      expect(d.attempt).toBe(false);
      expect(d.reasons[0]).toBe(`category_not_eligible:${category}`);
    },
  );

  // TKT-219 — `other` (unidentified mail) is locate-only eligible: it may enter the ladder
  // with a usable key, and the create seam's blocked-original list still prevents it from
  // ever anchoring a case on itself.
  it("'other' with a usable key attempts (locate-only, TKT-219)", () => {
    const d = decideRetro({ ...base, category: 'other', bodyJobref: '575689' });
    expect(d.attempt).toBe(true);
    expect(d.reasons).toContain('other_locate_eligible');
    expect(d.keys.externalRef).toBe('575689');
  });

  it("'other' with no usable key still never attempts", () => {
    const d = decideRetro({ ...base, category: 'other' });
    expect(d.attempt).toBe(false);
    expect(d.reasons).toContain('no_usable_key');
  });

  it("'other' whose only keys are junk never attempts (guard blocks the search)", () => {
    const d = decideRetro({ ...base, category: 'other', bodyJobref: '768.00', bodyVrm: 'CL500' });
    expect(d.attempt).toBe(false);
    expect(d.reasons).toContain('junk_key_skipped:external_ref');
    expect(d.reasons).toContain('junk_key_skipped:vrm');
    expect(d.reasons).toContain('no_usable_key');
  });

  // TKT-219 — claimant name: forename+surname shape only, weakest key, search-only.
  it('a claimant name from the trigger body becomes the weakest key', () => {
    const d = decideRetro({ ...base, category: 'query', bodyClaimant: '  Jane   Driver ' });
    expect(d.attempt).toBe(true);
    expect(d.keys).toEqual({ claimant: 'JANE DRIVER' });
    expect(d.reasons).toContain('key:claimant');
  });

  it('a single-word or too-short claimant is not a key', () => {
    expect(decideRetro({ ...base, category: 'query', bodyClaimant: 'Jane' }).attempt).toBe(false);
    expect(decideRetro({ ...base, category: 'query', bodyClaimant: 'J D' }).attempt).toBe(false);
  });

  // TKT-119 — the PHA5007 shape: "Re: Our ref: PHA 5007 - Reg: MT25 FXW" classified
  // non_actionable/acknowledgement. An ack cites exactly one matter, so it may LOCATE
  // (link or reconstruct the original) — the ack itself still never mints.
  it('a non_actionable ACKNOWLEDGEMENT with keys attempts (locate-and-link, TKT-119)', () => {
    const d = decideRetro({
      ...base,
      category: 'non_actionable',
      subtype: 'acknowledgement',
      bodyJobref: 'PHA5007',
      bodyVrm: 'MT25 FXW',
    });
    expect(d.attempt).toBe(true);
    expect(d.keys.externalRef).toBe('PHA5007');
    expect(d.keys.vrm).toBe('MT25FXW');
    expect(d.reasons).toContain('ack_subtype_eligible');
  });

  it('a non_actionable acknowledgement with NO keys still never attempts', () => {
    const d = decideRetro({ ...base, category: 'non_actionable', subtype: 'acknowledgement' });
    expect(d.attempt).toBe(false);
    expect(d.reasons).toContain('no_usable_key');
  });

  it('a non_actionable CASE_SUMMARY digest never attempts (cites many refs)', () => {
    const d = decideRetro({
      ...base,
      category: 'non_actionable',
      subtype: 'case_summary',
      bodyJobref: '575689',
    });
    expect(d.attempt).toBe(false);
    expect(d.reasons[0]).toBe('category_not_eligible:non_actionable');
  });

  it('a reply that link-matched ambiguously must NOT fire (>=2 open cases already match)', () => {
    const d = decideRetro({
      category: 'case_update',
      bodyJobref: '575689',
      isReply: true,
      linkReplyOutcome: 'ambiguous',
    });
    expect(d.attempt).toBe(false);
    expect(d.reasons).toContain('reply_outcome_not_no_match:ambiguous');
  });

  it('a reply is eligible only on no_match', () => {
    expect(
      decideRetro({ category: 'billing', bodyJobref: '575689', isReply: true, linkReplyOutcome: 'no_match' })
        .attempt,
    ).toBe(true);
    expect(
      decideRetro({ category: 'billing', bodyJobref: '575689', isReply: true, linkReplyOutcome: 'linked' })
        .attempt,
    ).toBe(false);
  });

  it('a reply with NO link outcome (manual drain — the reply lane never ran) proceeds', () => {
    expect(decideRetro({ category: 'billing', bodyJobref: '575689', isReply: true }).attempt).toBe(true);
  });
});

describe('isJunkRetroKey — the TKT-140 junk-key guard (TKT-219)', () => {
  // The 13 measured junk keys from the TKT-140 dry-run, with their enumerated kinds.
  it.each([
    ['2025/09', 'external_ref'],
    ['768.00', 'external_ref'],
    ['AT850', 'vrm'],
    ['CL500', 'vrm'],
    ['KW20VEH', 'vrm'],
    ['MAY2026', 'vrm'],
    ['ON2', 'vrm'],
    ['ON10', 'vrm'],
    ['ON16', 'vrm'],
    ['ON23', 'vrm'],
    ['ON27', 'vrm'],
    ['ON29', 'vrm'],
    ['RTA2', 'vrm'],
  ] as const)('rejects the measured junk key %s (%s)', (token, kind) => {
    expect(isJunkRetroKey(token, kind)).toBe(true);
  });

  it.each([
    ['PHA5007', 'external_ref'], // letters+digits refs are GENUINE as external refs (TKT-119)
    ['HD4110', 'external_ref'], // ditto (TKT-071 — junk only when sniffed as a VRM)
    ['575689', 'external_ref'],
    ['46458/1', 'external_ref'],
    ['30230-01', 'external_ref'],
    ['DIK/JMO/46440/1', 'external_ref'],
    ['KA08XTR', 'vrm'], // current-format plate
    ['MT25FXW', 'vrm'],
    ['A123BCD', 'vrm'], // prefix-format plate (digits are followed by letters)
  ] as const)('passes the genuine corpus key %s (%s)', (token, kind) => {
    expect(isJunkRetroKey(token, kind)).toBe(false);
  });

  it('the dateless-plate shape is junk ONLY for the VRM key kind', () => {
    expect(isJunkRetroKey('HD4110', 'vrm')).toBe(true);
    expect(isJunkRetroKey('HD4110', 'external_ref')).toBe(false);
  });

  it('tolerates spacing and case', () => {
    expect(isJunkRetroKey('may 2026', 'external_ref')).toBe(true);
    expect(isJunkRetroKey(' on 10 ', 'vrm')).toBe(true);
    expect(isJunkRetroKey(undefined, 'vrm')).toBe(false);
    expect(isJunkRetroKey('', 'external_ref')).toBe(false);
  });
});

describe('hasUsableRetroKey', () => {
  it('any single key qualifies, including the claimant', () => {
    expect(hasUsableRetroKey({})).toBe(false);
    expect(hasUsableRetroKey(undefined)).toBe(false);
    expect(hasUsableRetroKey({ claimant: 'JANE DRIVER' })).toBe(true);
    expect(hasUsableRetroKey({ vrm: 'KA08XTR' })).toBe(true);
  });
});

describe('planRetroReconstruction — the parallel-rung combination matrix (TKT-219)', () => {
  const searched = { skipped: false } as const;

  it('a parseable Box instruction wins regardless of the Outlook result', () => {
    for (const boxInstruction of ['box_eml', 'box_doc'] as const) {
      for (const outlookFound of [true, false]) {
        const d = planRetroReconstruction({
          box: { ...searched, found: true },
          outlook: { ...searched, found: outlookFound },
          boxInstruction,
        });
        expect(d.arm).toBe('box_source');
      }
    }
  });

  it('folder found + nothing parseable + Outlook original -> COMBINED (Box identity, Outlook material)', () => {
    const d = planRetroReconstruction({
      box: { ...searched, found: true },
      outlook: { ...searched, found: true },
      boxInstruction: 'minimal',
    });
    expect(d.arm).toBe('combined');
    expect(d.reasons).toContain('outlook_fills_material');
  });

  it('folder found + nothing parseable anywhere -> minimal anchor (as today)', () => {
    const d = planRetroReconstruction({
      box: { ...searched, found: true },
      outlook: { ...searched, found: false },
      boxInstruction: 'minimal',
    });
    expect(d.arm).toBe('minimal_anchor');
  });

  it('no folder + Outlook original -> outlook_only; the gate-off asymmetries hold', () => {
    expect(
      planRetroReconstruction({ box: { ...searched, found: false }, outlook: { ...searched, found: true } })
        .arm,
    ).toBe('outlook_only');
    expect(
      planRetroReconstruction({ box: { skipped: true, found: false }, outlook: { ...searched, found: true } })
        .arm,
    ).toBe('outlook_only');
    expect(
      planRetroReconstruction({
        box: { ...searched, found: true },
        outlook: { skipped: true, found: false },
        boxInstruction: 'box_eml',
      }).arm,
    ).toBe('box_source');
  });

  it('nothing found anywhere -> none (the failure record)', () => {
    const d = planRetroReconstruction({
      box: { ...searched, found: false },
      outlook: { skipped: true, found: false },
    });
    expect(d.arm).toBe('none');
    expect(d.reasons).toEqual(['box:not_found', 'outlook:skipped']);
  });
});

describe('decideRetroStatus — per-case landing state', () => {
  it('billing + a real recovered source + verified identity -> terminal eva_submitted', () => {
    for (const reconstruction of ['box_eml', 'box_doc', 'outlook'] as const) {
      const d = decideRetroStatus({
        triggerCategory: 'billing',
        reconstruction,
        principalResolved: true,
        casePoKnown: true,
      });
      expect(d.status).toBe('eva_submitted');
      expect(d.onHold).toBe(false);
      expect(d.signals).toContain('retro_billing_implies_submitted');
    }
  });

  it('a billing-triggered minimal anchor is Held, never terminal', () => {
    const d = decideRetroStatus({
      triggerCategory: 'billing',
      reconstruction: 'minimal',
      principalResolved: true,
      casePoKnown: true,
    });
    expect(d.status).toBe('needs_review');
    expect(d.onHold).toBe(true);
    expect(d.actionReason).toBe('needs_review');
  });

  it.each(['case_update', 'query', 'cancellation'] as const)(
    '%s triggers land Held needs_review even fully sourced',
    (triggerCategory) => {
      const d = decideRetroStatus({
        triggerCategory,
        reconstruction: 'box_eml',
        principalResolved: true,
        casePoKnown: true,
      });
      expect(d.status).toBe('needs_review');
      expect(d.onHold).toBe(true);
    },
  );

  it('an unresolved principal always holds — never terminal on an unverified identity', () => {
    const d = decideRetroStatus({
      triggerCategory: 'billing',
      reconstruction: 'box_eml',
      principalResolved: false,
      casePoKnown: true,
    });
    expect(d.status).toBe('needs_review');
    expect(d.onHold).toBe(true);
    expect(d.signals).toContain('retro_principal_unresolved');
  });

  it('no discovered Case/PO (Outlook-only reconstruction) always holds', () => {
    const d = decideRetroStatus({
      triggerCategory: 'billing',
      reconstruction: 'outlook',
      principalResolved: true,
      casePoKnown: false,
    });
    expect(d.status).toBe('needs_review');
    expect(d.onHold).toBe(true);
    expect(d.signals).toContain('retro_case_po_unknown');
  });
});

describe('parseCasePoMarker / matchPrincipalByCasePo / markerToCaseType', () => {
  it('strips markers longest-first — AP. is never half-read as A.', () => {
    expect(parseCasePoMarker('AP.QDOS261530')).toEqual({ marker: 'AP.', body: 'QDOS261530' });
    expect(parseCasePoMarker('A.PCH261269')).toEqual({ marker: 'A.', body: 'PCH261269' });
    expect(parseCasePoMarker('D.PCH26190')).toEqual({ marker: 'D.', body: 'PCH26190' });
    expect(parseCasePoMarker('CCPY26050')).toEqual({ marker: '', body: 'CCPY26050' });
  });

  it('longest-prefix principal match — CC never swallows CCPY26050', () => {
    expect(matchPrincipalByCasePo('CCPY26050', ['CC', 'CCPY'])).toEqual({
      principal: 'CCPY',
      marker: '',
    });
  });

  it('marker POs resolve to the unmarked principal', () => {
    expect(matchPrincipalByCasePo('A.PCH261269', ['PCH', 'QDOS'])).toEqual({
      principal: 'PCH',
      marker: 'A.',
    });
  });

  it('requires the remainder to be year+sequence digits (5–6)', () => {
    expect(matchPrincipalByCasePo('CCPY2605', ['CCPY'])).toBeNull(); // 4 digits
    expect(matchPrincipalByCasePo('CCPY2605001', ['CCPY'])).toBeNull(); // 7 digits
    expect(matchPrincipalByCasePo('CCPY26050X', ['CCPY'])).toBeNull(); // non-digit tail
  });

  it('unknown principal / foreign shaped token -> null (never guess)', () => {
    expect(matchPrincipalByCasePo('XYZ26123', ['CCPY', 'PCH', 'QDOS'])).toBeNull();
    expect(matchPrincipalByCasePo('', ['CCPY'])).toBeNull();
  });

  it('maps markers to case types (inverse of CASE_PO_MARKER)', () => {
    expect(markerToCaseType('')).toBe('standard');
    expect(markerToCaseType('A.')).toBe('audit');
    expect(markerToCaseType('AP.')).toBe('audit_total_loss');
    expect(markerToCaseType('D.')).toBe('diminution');
    expect(markerToCaseType('Z.')).toBe('standard');
  });
});

describe('selectBoxInstructionCandidate', () => {
  const entry = (name: string, createdAt?: string, type = 'file'): BoxFolderEntry => ({
    id: name,
    name,
    type,
    createdAt,
  });

  it('prefers the OLDEST .eml — the original predates every reply in the folder', () => {
    const pick = selectBoxInstructionCandidate([
      entry('RE reply.eml', '2026-03-02T10:00:00Z'),
      entry('New case KA08XTR.eml', '2026-03-01T09:00:00Z'),
      entry('Engineer Report.pdf', '2026-03-05T10:00:00Z'),
    ]);
    expect(pick).toEqual({ entry: entry('New case KA08XTR.eml', '2026-03-01T09:00:00Z'), kind: 'eml' });
  });

  it('accepts .msg as an email source', () => {
    const pick = selectBoxInstructionCandidate([entry('original.msg', '2026-03-01T09:00:00Z')]);
    expect(pick?.kind).toBe('eml');
  });

  it('falls back to a parseable document, excluding report/invoice/fee artefacts', () => {
    const pick = selectBoxInstructionCandidate([
      entry('Engineers Report V2.pdf', '2026-03-01T09:00:00Z'),
      entry('Fee note.pdf', '2026-03-01T09:00:00Z'),
      entry('instruction letter.pdf', '2026-03-03T09:00:00Z'),
      entry('photos.zip', '2026-03-01T09:00:00Z'),
    ]);
    expect(pick).toEqual({
      entry: entry('instruction letter.pdf', '2026-03-03T09:00:00Z'),
      kind: 'doc',
    });
  });

  it('ignores subfolders and returns null when nothing is parseable', () => {
    expect(
      selectBoxInstructionCandidate([
        entry('Photos', undefined, 'folder'),
        entry('IMG_9108.jpeg', '2026-03-01T09:00:00Z'),
      ]),
    ).toBeNull();
    expect(selectBoxInstructionCandidate([])).toBeNull();
  });

  it('entries with no created_at sort last within their tier', () => {
    const pick = selectBoxInstructionCandidate([
      entry('undated.eml', undefined),
      entry('dated.eml', '2026-03-01T09:00:00Z'),
    ]);
    expect(pick?.entry.name).toBe('dated.eml');
  });
});
