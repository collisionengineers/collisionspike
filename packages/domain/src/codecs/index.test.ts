import { describe, it, expect } from 'vitest';
import { inboundCategoryCodec, inboundSubtypeCodec } from './index';
import { INBOUND_CATEGORIES, INBOUND_SUBTYPES } from '../dto';
// Import the REAL choice-set artifact (the frozen contract source in src/data/choicesets/),
// not a copy — mirrors contracts/case-status.parity.test.ts's own import discipline.
import inboundEmailClassificationChoiceSet from '../data/choicesets/inbound-email-classification.json';

/* ============================================================
   inboundCategoryCodec / inboundSubtypeCodec — round-trip + choice-set parity.

   Round-trip: codec.toName(codec.toInt(name)) === name for every option (the codecs/
   module doc's own stated contract). Parity: the JSON choice-set options reconcile 1:1
   against the InboundCategory/InboundSubtype unions, same discipline as
   contracts/case-status.parity.test.ts — keeps the taxonomy the triage-policy module
   (domain/triage-policy.ts) emits in lockstep with the persisted choice-set contract.
   ============================================================ */

interface ChoiceOption {
  value: number;
  name: string;
  label: string;
}

const bundle = inboundEmailClassificationChoiceSet as { choiceSets: Array<{
  logicalName: string;
  options: ChoiceOption[];
}> };
const categoryOptions = bundle.choiceSets.find((s) => s.logicalName === 'cr1bd_inboundcategory')!.options;
const subtypeOptions = bundle.choiceSets.find((s) => s.logicalName === 'cr1bd_inboundsubtype')!.options;

describe('inboundCategoryCodec — round-trip', () => {
  it('round-trips every known category name, including the Phase-2 additions', () => {
    for (const name of inboundCategoryCodec.names()) {
      const int = inboundCategoryCodec.toInt(name);
      expect(int).toBeDefined();
      expect(inboundCategoryCodec.toName(int)).toBe(name);
    }
  });

  it('mints case_update=100000005 and cancellation=100000006 — the EXACT codes the Phase-2 DDL uses (never renumber)', () => {
    expect(inboundCategoryCodec.toInt('case_update')).toBe(100000005);
    expect(inboundCategoryCodec.toInt('cancellation')).toBe(100000006);
    expect(inboundCategoryCodec.toName(100000005)).toBe('case_update');
    expect(inboundCategoryCodec.toName(100000006)).toBe('cancellation');
  });

  it('the pre-existing codes are unchanged (never-renumber discipline)', () => {
    expect(inboundCategoryCodec.toInt('receiving_work')).toBe(100000000);
    expect(inboundCategoryCodec.toInt('query')).toBe(100000001);
    expect(inboundCategoryCodec.toInt('other')).toBe(100000002);
    expect(inboundCategoryCodec.toInt('billing')).toBe(100000003);
    expect(inboundCategoryCodec.toInt('non_actionable')).toBe(100000004);
  });

  it('unknown value -> undefined (never throws)', () => {
    expect(inboundCategoryCodec.toName(999)).toBeUndefined();
    expect(inboundCategoryCodec.toName(undefined)).toBeUndefined();
    expect(inboundCategoryCodec.toName(null)).toBeUndefined();
  });
});

describe('inboundSubtypeCodec — round-trip', () => {
  it('round-trips every known subtype name, including the Phase-2 additions', () => {
    for (const name of inboundSubtypeCodec.names()) {
      const int = inboundSubtypeCodec.toInt(name);
      expect(int).toBeDefined();
      expect(inboundSubtypeCodec.toName(int)).toBe(name);
    }
  });

  it('mints images_received=100000010, cancellation_notice=100000011, update_general=100000012 — the EXACT codes the Phase-2 DDL uses', () => {
    expect(inboundSubtypeCodec.toInt('images_received')).toBe(100000010);
    expect(inboundSubtypeCodec.toInt('cancellation_notice')).toBe(100000011);
    expect(inboundSubtypeCodec.toInt('update_general')).toBe(100000012);
  });

  it('the pre-existing codes are unchanged (never-renumber discipline)', () => {
    expect(inboundSubtypeCodec.toInt('existing_provider_instruction')).toBe(100000000);
    expect(inboundSubtypeCodec.toInt('existing_provider_diminution')).toBe(100000006);
    expect(inboundSubtypeCodec.toInt('billing_request')).toBe(100000007);
    expect(inboundSubtypeCodec.toInt('case_summary')).toBe(100000008);
    expect(inboundSubtypeCodec.toInt('acknowledgement')).toBe(100000009);
  });

  it('unknown value -> undefined (never throws)', () => {
    expect(inboundSubtypeCodec.toName(999)).toBeUndefined();
  });
});

describe('inbound-email-classification.json <-> InboundCategory/InboundSubtype parity', () => {
  it('targets the cr1bd_inboundcategory / cr1bd_inboundsubtype global choice sets', () => {
    expect(bundle.choiceSets.map((s) => s.logicalName)).toEqual([
      'cr1bd_inboundcategory',
      'cr1bd_inboundsubtype',
    ]);
  });

  it('category option `name`s equal the InboundCategory union as a set (1:1, no extras/omissions)', () => {
    const optionNames = categoryOptions.map((o) => o.name).sort();
    const unionNames = [...INBOUND_CATEGORIES].sort();
    expect(optionNames).toEqual(unionNames);
  });

  it('subtype option `name`s equal the InboundSubtype union as a set (1:1, no extras/omissions)', () => {
    const optionNames = subtypeOptions.map((o) => o.name).sort();
    const unionNames = [...INBOUND_SUBTYPES].sort();
    expect(optionNames).toEqual(unionNames);
  });

  it('every option carries a non-empty label, a stable non-negative integer value, and no duplicate values', () => {
    for (const options of [categoryOptions, subtypeOptions]) {
      const values = new Set<number>();
      for (const opt of options) {
        expect(typeof opt.label).toBe('string');
        expect(opt.label.length).toBeGreaterThan(0);
        expect(Number.isInteger(opt.value)).toBe(true);
        expect(values.has(opt.value)).toBe(false); // no code reused across options
        values.add(opt.value);
      }
    }
  });
});
