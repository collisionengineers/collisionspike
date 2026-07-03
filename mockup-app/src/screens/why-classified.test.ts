import { describe, it, expect } from 'vitest';
import { whyClassifiedReasons } from './why-classified';

/* ============================================================
   why-classified — the inbox "Why this label?" mapping (rules-engine-v2
   Phase 5). Raw tokens in -> handler-language strings out; every branch
   (mapped, aliased, dropped, capped, deduped) gets its own assertion, plus a
   blanket sweep asserting no banned word or raw token ever leaks through.
   ============================================================ */

describe('whyClassifiedReasons — absent/empty input', () => {
  it('returns [] for undefined, null, and empty signals', () => {
    expect(whyClassifiedReasons(undefined)).toEqual([]);
    expect(whyClassifiedReasons(null)).toEqual([]);
    expect(whyClassifiedReasons([])).toEqual([]);
  });
});

describe('whyClassifiedReasons — one token in, one phrase out', () => {
  it.each<[string[], string]>([
    [['work_keywords:please inspect'], 'Mentions instruction wording (“please inspect”)'],
    [['query_keywords:any update'], 'Asks about existing work (“any update”)'],
    [['billing_keywords:send the invoice'], 'Asks about an invoice or fee (“send the invoice”)'],
    [['billing_phrases:send the invoice'], 'Asks about an invoice or fee (“send the invoice”)'],
    [['chase_keywords:chase the report'], 'Chases something already underway (“chase the report”)'],
    [['chase_phrases:chase the report'], 'Chases something already underway (“chase the report”)'],
    [['report_attachment'], 'Has a report attached'],
    [['attachment:instruction'], 'Has instruction paperwork attached'],
    [['attachment_kinds:instruction'], 'Has instruction paperwork attached'],
    [['attachment_kinds:instruction_doc'], 'Has instruction paperwork attached'],
    [['attachment_kinds:claim_form'], 'Has instruction paperwork attached'],
    [['attachment_kinds:image,instruction'], 'Has instruction paperwork attached'],
    [['body_caseref:CCPY26050'], 'Quotes case reference CCPY26050'],
    [['body_jobref:576299'], 'Quotes reference 576299'],
    [['body_vrm:LR19KXM'], 'Mentions vehicle LR19KXM'],
    [['reply'], 'Part of an ongoing email conversation'],
    [['is_reply'], 'Part of an ongoing email conversation'],
    [['auto_reply'], 'Looks like an automatic reply'],
    [['auto_reply:out of office'], 'Looks like an automatic reply'],
    [['summary_markers:summary of the instructions'], 'Reads like a summary of several cases'],
    [['provider:one'], 'From a company we recognise'],
    [['provider:matched'], 'From a company we recognise'],
    [['provider_match_state:one'], 'From a company we recognise'],
    [
      ['cancellation_keywords:claim cancelled'],
      'Says the claim or booking is cancelled (“claim cancelled”)',
    ],
    [
      ['cancellation_phrases:claim cancelled'],
      'Says the claim or booking is cancelled (“claim cancelled”)',
    ],
  ])('%j -> %j', (signals, expected) => {
    expect(whyClassifiedReasons(signals)).toEqual([expected]);
  });

  it('shows only the FIRST comma-separated matched phrase', () => {
    expect(whyClassifiedReasons(['work_keywords:engineers report,please inspect'])).toEqual([
      'Mentions instruction wording (“engineers report”)',
    ]);
  });

  it('drops the parenthetical entirely when a keyword token carries no value', () => {
    expect(whyClassifiedReasons(['work_keywords:'])).toEqual(['Mentions instruction wording']);
  });
});

describe('whyClassifiedReasons — tokens with nothing positive to say are DROPPED', () => {
  it.each<[string, string[]]>([
    ['an internal negation guard', ['cancellation_negated']],
    ['no company recognised (legacy spelling)', ['provider:none']],
    ['no company recognised (engine spelling)', ['provider_match_state:none']],
    ['an ambiguous provider match', ['provider_match_state:ambiguous']],
    ['a bare rule id', ['rule:reply_with_reference']],
    ['a digest marker', ['digest_multiple_refs:CCPY26050,CCPY26051,CCPY26052']],
    ['an uncorroborated-doc flag', ['uncorroborated_instruction_doc']],
    ['an uncorroborated-image flag', ['uncorroborated_provider_image']],
    ['an informal-keyword flag (not requested)', ['informal_keywords:can you look at']],
    ['an audit-phrase flag (not requested)', ['audit_phrases:audit re-inspection']],
    ['a non-instruction attachment kind', ['attachment_kinds:image']],
    ['a blank body_caseref value', ['body_caseref:']],
    ['a blank body_jobref value', ['body_jobref:']],
    ['a blank body_vrm value', ['body_vrm:']],
    ['a completely unknown token', ['some_future_signal:whatever']],
    ['a bare unknown flag', ['mystery_flag']],
  ])('%s -> []', (_label, signals) => {
    expect(whyClassifiedReasons(signals)).toEqual([]);
  });

  it('drops only the unrecognised tokens, keeping the mapped ones from the same row', () => {
    expect(
      whyClassifiedReasons([
        'work_keywords:please inspect',
        'rule:instruction_doc_existing_provider',
        'provider_match_state:one',
        'cancellation_negated',
      ]),
    ).toEqual(['Mentions instruction wording (“please inspect”)', 'From a company we recognise']);
  });
});

describe('whyClassifiedReasons — priority order + the 4-reason cap', () => {
  it('returns the top 4 categories, highest-priority first, when many are present', () => {
    const signals = [
      // Listed in a DELIBERATELY scrambled order — priority must come from
      // the module's own ranking, not array position.
      'provider_match_state:one',
      'summary_markers:summary of the instructions',
      'auto_reply:out of office',
      'reply',
      'body_vrm:LR19KXM',
      'body_jobref:576299',
      'body_caseref:CCPY26050',
      'attachment:instruction',
      'report_attachment',
      'chase_keywords:chase the report',
      'billing_keywords:send the invoice',
      'query_keywords:any update',
      'work_keywords:please inspect',
      'cancellation_keywords:claim cancelled',
    ];
    expect(whyClassifiedReasons(signals)).toEqual([
      'Says the claim or booking is cancelled (“claim cancelled”)',
      'Mentions instruction wording (“please inspect”)',
      'Asks about existing work (“any update”)',
      'Asks about an invoice or fee (“send the invoice”)',
    ]);
  });

  it('never returns more than 4 reasons even with every category present', () => {
    const everyCategory = [
      'cancellation_keywords:claim cancelled',
      'work_keywords:please inspect',
      'query_keywords:any update',
      'billing_keywords:send the invoice',
      'chase_keywords:chase the report',
      'report_attachment',
      'attachment:instruction',
      'body_caseref:CCPY26050',
      'body_jobref:576299',
      'body_vrm:LR19KXM',
      'reply',
      'auto_reply',
      'summary_markers:summary of the instructions',
      'provider:one',
    ];
    expect(whyClassifiedReasons(everyCategory)).toHaveLength(4);
  });

  it('falls back to lower-priority reasons once the higher ones are absent', () => {
    // No cancellation/work/query/billing/chase/report/attachment signals here —
    // the cap is never hit, so all THREE remaining reasons show.
    expect(whyClassifiedReasons(['body_caseref:CCPY26050', 'reply', 'provider:one'])).toEqual([
      'Quotes case reference CCPY26050',
      'Part of an ongoing email conversation',
      'From a company we recognise',
    ]);
  });
});

describe('whyClassifiedReasons — de-duplication', () => {
  it('never repeats the identical reason text twice', () => {
    expect(whyClassifiedReasons(['attachment:instruction', 'attachment_kinds:instruction'])).toEqual([
      'Has instruction paperwork attached',
    ]);
  });
});

describe('whyClassifiedReasons — realistic rows (mirrors mock-source.ts fixtures)', () => {
  it('an existing-provider instruction row', () => {
    expect(
      whyClassifiedReasons([
        'work_keywords:instruction to inspect,new instruction',
        'body_caseref:CCPY26050',
        'body_vrm:LR19KXM',
        'provider_match_state:one',
        'attachment_kinds:instruction',
        'rule:instruction_doc_existing_provider',
      ]),
    ).toEqual([
      'Mentions instruction wording (“instruction to inspect”)',
      'Has instruction paperwork attached',
      'Quotes case reference CCPY26050',
      'Mentions vehicle LR19KXM',
      // "From a company we recognise" exists but is capped out at 4.
    ]);
  });

  it('a case-query chase row', () => {
    expect(
      whyClassifiedReasons([
        'query_keywords:any update',
        'body_caseref:CCPY26031',
        'body_vrm:AB12CDE',
        'provider_match_state:one',
        'rule:query_with_reference',
      ]),
    ).toEqual([
      'Asks about existing work (“any update”)',
      'Quotes case reference CCPY26031',
      'Mentions vehicle AB12CDE',
      'From a company we recognise',
    ]);
  });

  it('an out-of-office auto-reply row', () => {
    expect(
      whyClassifiedReasons(['auto_reply:automatic reply,i am out of the office', 'rule:auto_reply_marker']),
    ).toEqual(['Looks like an automatic reply']);
  });

  it('a genuinely unexplainable row (e.g. an unmatched newsletter) is an honest empty list', () => {
    expect(whyClassifiedReasons(['provider_match_state:none', 'rule:abstain_to_other'])).toEqual([]);
  });
});

describe('whyClassifiedReasons — never leaks engineering language or a raw token', () => {
  // A representative + adversarial sweep of tokens, including every "drop"
  // case above plus every mapped case, run together so nothing in the
  // combined output can smuggle a colon or a banned word through.
  const KITCHEN_SINK = [
    'work_keywords:engineer instruction,please inspect',
    'query_keywords:please advise',
    'billing_keywords:raise an invoice',
    'billing_phrases:raise an invoice',
    'chase_keywords:heard nothing further',
    'chase_phrases:heard nothing further',
    'cancellation_keywords:no longer required',
    'cancellation_phrases:no longer required',
    'cancellation_negated',
    'summary_markers:summary of the cases',
    'audit_phrases:audit re-inspection',
    'informal_keywords:can you look at',
    'auto_reply:out of office,undeliverable',
    'reply',
    'is_reply',
    'report_attachment',
    'attachment:instruction',
    'attachment_kinds:image,instruction,claim_form',
    'body_caseref:CCPY26050',
    'body_jobref:SAB/46286/1',
    'body_vrm:AP70WAA',
    'digest_multiple_refs:CCPY26050,CCPY26051',
    'provider_match_state:one',
    'provider_match_state:none',
    'provider_match_state:ambiguous',
    'provider:one',
    'provider:matched',
    'provider:none',
    'uncorroborated_instruction_doc',
    'uncorroborated_provider_image',
    'rule:instruction_doc_existing_provider',
    'rule:cancellation_notice',
    'rule:abstain_to_other',
    'some_future_engine_signal:mystery_value',
  ];

  // AGENTS.md "Banned in rendered strings" — the terms most likely to leak
  // from a raw token straight onto the screen if a matcher were ever wrong.
  const BANNED_WORDS = [
    'azure',
    'postgres',
    'dataverse',
    'connector',
    'function app',
    'sdk',
    'power automate',
    'key vault',
    'document intelligence',
    'webhook',
    'csp',
    'json',
    'operator',
    'gated',
    'deploy',
    'provisioned',
    'mock',
    'seeded',
    'schema',
    'payload',
    '12-field',
    'provenance',
    'adr-',
    'milestone',
    'correlation key',
    'signal',
    'classifier',
    'rule-id',
  ];

  it('produces only mapped phrases for the full kitchen-sink array (documents the exact set)', () => {
    expect(whyClassifiedReasons(KITCHEN_SINK)).toEqual([
      'Says the claim or booking is cancelled (“no longer required”)',
      'Mentions instruction wording (“engineer instruction”)',
      'Asks about existing work (“please advise”)',
      'Asks about an invoice or fee (“raise an invoice”)',
    ]);
  });

  it('never contains a raw token (no bare colon) or a banned word, across every drop/mapped case', () => {
    const allOutputs = [
      ...whyClassifiedReasons(KITCHEN_SINK),
      // Also sweep every token ONE AT A TIME, so a reason that only shows up
      // once the higher-priority ones are absent still gets checked.
      ...KITCHEN_SINK.flatMap((token) => whyClassifiedReasons([token])),
    ];
    expect(allOutputs.length).toBeGreaterThan(0);
    for (const reason of allOutputs) {
      expect(reason).not.toContain(':');
      const lower = reason.toLowerCase();
      for (const banned of BANNED_WORDS) {
        expect(lower).not.toContain(banned);
      }
    }
  });
});
