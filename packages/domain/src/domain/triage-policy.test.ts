import { describe, it, expect } from 'vitest';
import {
  decideTriage,
  type TriagePolicyClassification,
  type TriagePolicyContext,
  type TriagePolicyGates,
  type OpenCaseRefMatch,
} from './triage-policy';

/* ----------  Fixtures  ---------- */

function classification(
  over: Partial<TriagePolicyClassification> = {},
): TriagePolicyClassification {
  return {
    category: 'receiving_work',
    subtype: 'existing_provider_instruction',
    confidence: 0.95,
    ...over,
  };
}

function context(over: Partial<TriagePolicyContext> = {}): TriagePolicyContext {
  return {
    openCaseMatches: [],
    duplicateInternetMessageId: false,
    conversationSiblingCaseIds: [],
    providerMatchState: 'matched',
    hasAttachments: false,
    attachmentKinds: [],
    imagesOnly: false,
    ...over,
  };
}

function match(over: Partial<OpenCaseRefMatch> = {}): OpenCaseRefMatch {
  return {
    caseId: 'case-100',
    casePo: 'QDOS26001',
    matchedOn: 'case_po',
    status: 'needs_review',
    ...over,
  };
}

const GATES_ALL_OFF: TriagePolicyGates = {
  refGate: false,
  cancellation: false,
  imagesRouting: false,
  caseUpdate: false,
  autoAttach: false,
};

const GATES_ALL_ON: TriagePolicyGates = {
  refGate: true,
  cancellation: true,
  imagesRouting: true,
  caseUpdate: true,
  autoAttach: true,
};

function gates(over: Partial<TriagePolicyGates> = {}): TriagePolicyGates {
  return { ...GATES_ALL_OFF, ...over };
}

/* ----------  Kill-switch invariant  ---------- */

describe('decideTriage — kill-switch invariant (ADR-0019 §4)', () => {
  const scenarios: Array<{
    name: string;
    c: TriagePolicyClassification;
    ctx: TriagePolicyContext;
  }> = [
    {
      name: 'plain receiving_work, no context',
      c: classification(),
      ctx: context(),
    },
    {
      name: 'a duplicate delivery (would drop_duplicate if refGate were on)',
      c: classification(),
      ctx: context({ duplicateInternetMessageId: true }),
    },
    {
      name: 'cancellation + an open-case ref match (would propose_cancellation if the gate were on)',
      c: classification({
        category: 'cancellation',
        subtype: 'cancellation_notice',
        bodyCaseref: 'QDOS26001',
      }),
      ctx: context({ openCaseMatches: [match({ matchedOn: 'case_po' })] }),
    },
    {
      name: 'an exact case_po ref match (would suggest_attach if refGate were on)',
      c: classification({ bodyCaseref: 'QDOS26001' }),
      ctx: context({ openCaseMatches: [match({ matchedOn: 'case_po' })] }),
    },
    {
      name: 'ref match + attachments (would relabel to case_update if caseUpdate were on)',
      c: classification({ bodyCaseref: 'QDOS26001' }),
      ctx: context({
        openCaseMatches: [match({ matchedOn: 'case_po' })],
        hasAttachments: true,
        imagesOnly: true,
      }),
    },
    {
      name: 'unmatched images with a registration (would route_images_unmatched if imagesRouting were on)',
      c: classification({ bodyVrm: 'AB12CDE' }),
      ctx: context({ imagesOnly: true, hasAttachments: true, attachmentKinds: ['image'] }),
    },
  ];

  for (const s of scenarios) {
    it(`${s.name} -> proceed_default, category/subtype UNCHANGED, no target`, () => {
      const out = decideTriage(s.c, s.ctx, GATES_ALL_OFF);
      expect(out.action).toBe('proceed_default');
      expect(out.finalCategory).toBe(s.c.category);
      expect(out.finalSubtype).toBe(s.c.subtype);
      expect(out.targetCaseId).toBeUndefined();
      expect(out.policyVersion).toBe('triage-policy-v2');
    });
  }
});

/* ----------  Rung 1: pre-mint duplicate delivery  ---------- */

describe('decideTriage — pre-mint duplicate delivery (rung 1)', () => {
  it('duplicateInternetMessageId + refGate -> drop_duplicate', () => {
    const out = decideTriage(
      classification(),
      context({ duplicateInternetMessageId: true }),
      gates({ refGate: true }),
    );
    expect(out.action).toBe('drop_duplicate');
    expect(out.targetCaseId).toBeUndefined();
  });

  it("duplicateInternetMessageId WITHOUT refGate -> does not drop (resolveCase's own rung 1 is the guard today)", () => {
    const out = decideTriage(
      classification(),
      context({ duplicateInternetMessageId: true }),
      gates({ refGate: false }),
    );
    expect(out.action).not.toBe('drop_duplicate');
  });

  it('wins over cancellation/ref-gate even when both would otherwise fire', () => {
    const out = decideTriage(
      classification({
        category: 'cancellation',
        subtype: 'cancellation_notice',
        bodyCaseref: 'QDOS26001',
      }),
      context({ duplicateInternetMessageId: true, openCaseMatches: [match()] }),
      GATES_ALL_ON,
    );
    expect(out.action).toBe('drop_duplicate');
  });
});

describe('decideTriage — website enquiries never enter an existing-case lane', () => {
  it('ignores open-case references, attachments and every promotion gate', () => {
    const out = decideTriage(
      classification({
        category: 'website_enquiry',
        subtype: 'website_general_enquiry',
        bodyCaseref: 'QDOS26079',
        bodyVrm: 'AB12CDE',
      }),
      context({
        openCaseMatches: [match()],
        hasAttachments: true,
        imagesOnly: true,
        attachmentKinds: ['image'],
      }),
      GATES_ALL_ON,
    );
    expect(out).toMatchObject({
      action: 'proceed_default',
      finalCategory: 'website_enquiry',
      finalSubtype: 'website_general_enquiry',
      decisionInputs: { rung: 'website_enquiry', openCaseMatchCount: 1, ignoredCaseSignals: true },
    });
    expect(out.targetCaseId).toBeUndefined();
  });
});

/* ----------  Rung 2: cancellation precedence  ---------- */

describe('decideTriage — cancellation precedence (rung 2)', () => {
  it('trumps an instruction-doc classification when an open case matches (tkt041-07: a forwarded cancellation notice must NOT mint a new instruction)', () => {
    // baseline-v1.json id tkt041-07-forward-cancel-instructions: the v1 engine
    // mis-promoted a forwarded cancellation notice to receiving_work/
    // existing_provider_instruction at 0.95 confidence. Once Stage A's v2 tag tags it
    // 'cancellation', Stage B must win outright — it never falls through to a mint.
    const out = decideTriage(
      classification({
        category: 'cancellation',
        subtype: 'cancellation_notice',
        bodyCaseref: 'SBL26149',
      }),
      context({
        openCaseMatches: [match({ caseId: 'case-sbl', casePo: 'SBL26149', matchedOn: 'case_po' })],
      }),
      gates({ cancellation: true }),
    );
    expect(out.action).toBe('propose_cancellation');
    expect(out.finalCategory).toBe('cancellation');
    expect(out.targetCaseId).toBe('case-sbl');
    expect(out.suggestionType).toBe('cancellation');
    expect(out.rationale).toContain('SBL26149');
  });

  it('NEVER auto-closes — always a proposal, even with an exact single match', () => {
    const out = decideTriage(
      classification({ category: 'cancellation', subtype: 'cancellation_notice' }),
      context({ openCaseMatches: [match()] }),
      gates({ cancellation: true }),
    );
    expect(out.action).toBe('propose_cancellation');
  });

  it('with NO open-case match still proposes (never silently mints/proceeds as the raw category)', () => {
    const out = decideTriage(
      classification({ category: 'cancellation', subtype: 'cancellation_notice' }),
      context({ openCaseMatches: [] }),
      gates({ cancellation: true }),
    );
    expect(out.action).toBe('propose_cancellation');
    expect(out.targetCaseId).toBeUndefined();
  });

  it('a VRM-ONLY match is NEVER trusted as a cancellation target (ADR-0010 no-ref rung)', () => {
    const out = decideTriage(
      classification({
        category: 'cancellation',
        subtype: 'cancellation_notice',
        bodyVrm: 'AB12CDE',
      }),
      context({ openCaseMatches: [match({ matchedOn: 'vrm' })] }),
      gates({ cancellation: true }),
    );
    expect(out.action).toBe('propose_cancellation');
    expect(out.targetCaseId).toBeUndefined();
  });

  it('multiple case_po/job_ref matches -> proposes without a target', () => {
    const out = decideTriage(
      classification({ category: 'cancellation', subtype: 'cancellation_notice' }),
      context({
        openCaseMatches: [
          match({ caseId: 'case-1', matchedOn: 'case_po' }),
          match({ caseId: 'case-2', matchedOn: 'job_ref' }),
        ],
      }),
      gates({ cancellation: true }),
    );
    expect(out.action).toBe('propose_cancellation');
    expect(out.targetCaseId).toBeUndefined();
  });

  it('a case_po/job_ref match co-existing with an UNRELATED vrm match to a different case does not confuse the target', () => {
    const out = decideTriage(
      classification({ category: 'cancellation', subtype: 'cancellation_notice' }),
      context({
        openCaseMatches: [
          match({ caseId: 'case-po', matchedOn: 'case_po' }),
          match({ caseId: 'case-other', matchedOn: 'vrm' }),
        ],
      }),
      gates({ cancellation: true }),
    );
    expect(out.action).toBe('propose_cancellation');
    expect(out.targetCaseId).toBe('case-po');
  });

  it('gate off -> no cancellation proposal even when the engine says cancellation', () => {
    const out = decideTriage(
      classification({ category: 'cancellation', subtype: 'cancellation_notice' }),
      context({ openCaseMatches: [match()] }),
      gates({ cancellation: false }),
    );
    expect(out.action).not.toBe('propose_cancellation');
    expect(out.action).toBe('proceed_default');
  });
});

/* ----------  Rung 3: ref-gate  ---------- */

describe('decideTriage — ref-gate (rung 3)', () => {
  it('exact case_po match -> suggest_attach with a targetCaseId', () => {
    const out = decideTriage(
      classification({
        category: 'query',
        subtype: 'query_existing_work',
        bodyCaseref: 'QDOS26001',
      }),
      context({ openCaseMatches: [match({ matchedOn: 'case_po' })] }),
      gates({ refGate: true }),
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.targetCaseId).toBe('case-100');
    expect(out.suggestionType).toBe('case_link');
    expect(out.rationale).toContain('QDOS26001');
  });

  it('runs PRE-MINT on receiving_work too (tkt023: closes the leak where a job-ref follow-up minted a new case instead of attaching)', () => {
    // baseline-v1.json id tkt023-original-reply: expected query/query_existing_work,
    // the v1 engine got receiving_work/existing_provider_instruction at 0.95 for a
    // follow-up carrying "Our ref: 576299" that should have attached to the open case.
    const out = decideTriage(
      classification({
        category: 'receiving_work',
        subtype: 'existing_provider_instruction',
        bodyJobref: '576299',
        isReply: true,
      }),
      context({
        openCaseMatches: [
          match({ caseId: 'case-576299', casePo: 'ALS26066', matchedOn: 'job_ref' }),
        ],
      }),
      gates({ refGate: true }), // caseUpdate deliberately OFF — proves refGate ALONE fixes the leak
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.targetCaseId).toBe('case-576299');
    // caseUpdate is off, so the category is not relabelled — the ACTION change alone
    // (suggest instead of silently minting) is what stops the leak.
    expect(out.finalCategory).toBe('receiving_work');
  });

  it('case_po beats job_ref beats vrm when several tiers are present', () => {
    const out = decideTriage(
      classification({ bodyCaseref: 'QDOS26001', bodyJobref: '999', bodyVrm: 'AB12CDE' }),
      context({
        openCaseMatches: [
          match({ caseId: 'case-vrm', matchedOn: 'vrm' }),
          match({ caseId: 'case-jobref', matchedOn: 'job_ref' }),
          match({ caseId: 'case-po', matchedOn: 'case_po' }),
        ],
      }),
      gates({ refGate: true }),
    );
    expect(out.targetCaseId).toBe('case-po');
  });

  it('multiple matches in the winning tier -> suggest_attach with NO targetCaseId, all matches recorded', () => {
    const out = decideTriage(
      classification({ bodyCaseref: 'AMBIG' }),
      context({
        openCaseMatches: [
          match({ caseId: 'case-1', matchedOn: 'case_po' }),
          match({ caseId: 'case-2', matchedOn: 'case_po' }),
        ],
      }),
      gates({ refGate: true }),
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.targetCaseId).toBeUndefined();
    expect(out.decisionInputs.matchCount).toBe(2);
  });

  it('the SAME case matched twice (e.g. by both Case/PO and registration) counts as ONE match, not an ambiguity', () => {
    const out = decideTriage(
      classification({ bodyCaseref: 'QDOS26001', bodyVrm: 'AB12CDE' }),
      context({
        openCaseMatches: [
          match({ caseId: 'case-100', matchedOn: 'case_po' }),
          match({ caseId: 'case-100', matchedOn: 'vrm' }),
        ],
      }),
      gates({ refGate: true }),
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.targetCaseId).toBe('case-100');
  });

  it('gate off -> no suggestion even with an exact match', () => {
    const out = decideTriage(
      classification({ bodyCaseref: 'QDOS26001' }),
      context({ openCaseMatches: [match()] }),
      gates({ refGate: false }),
    );
    expect(out.action).toBe('proceed_default');
  });

  it('an open-case match with NO corresponding reference field on the classification does not fire (defensive re-assertion)', () => {
    const out = decideTriage(
      classification(), // no bodyCaseref/bodyJobref/bodyVrm at all
      context({ openCaseMatches: [match()] }),
      gates({ refGate: true }),
    );
    expect(out.action).toBe('proceed_default');
  });
});

/* ----------  VRM-only is a PERMANENT suggest-only invariant  ---------- */

describe('decideTriage — auto-attach promotion (rung 3, TKT-093, gated `autoAttach`, ships DARK)', () => {
  const casePoQuery = () =>
    classification({ category: 'query', subtype: 'query_existing_work', bodyCaseref: 'QDOS26001' });

  it('gate ON + EXACT single case_po match -> attach_case (with target + case_link suggestion)', () => {
    const out = decideTriage(
      casePoQuery(),
      context({ openCaseMatches: [match({ matchedOn: 'case_po' })] }),
      gates({ refGate: true, autoAttach: true }),
    );
    expect(out.action).toBe('attach_case');
    expect(out.targetCaseId).toBe('case-100');
    expect(out.suggestionType).toBe('case_link');
    expect(out.decisionInputs.autoAttachApplied).toBe(true);
    expect(out.rationale).toContain('automatically');
  });

  it('gate ON + EXACT single job_ref match -> attach_case', () => {
    const out = decideTriage(
      classification({ category: 'query', subtype: 'query_existing_work', bodyJobref: '576299' }),
      context({ openCaseMatches: [match({ matchedOn: 'job_ref' })] }),
      gates({ refGate: true, autoAttach: true }),
    );
    expect(out.action).toBe('attach_case');
    expect(out.targetCaseId).toBe('case-100');
  });

  it('gate ON but VRM-ONLY match -> stays suggest_attach (the permanent inviolable rule)', () => {
    const out = decideTriage(
      classification({ category: 'query', subtype: 'query_existing_work', bodyVrm: 'AB12CDE' }),
      context({ openCaseMatches: [match({ matchedOn: 'vrm' })] }),
      gates({ refGate: true, autoAttach: true }),
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.decisionInputs.autoAttachApplied).toBe(false);
  });

  it('gate ON but AMBIGUOUS (>1 open case) -> stays suggest_attach (a person picks)', () => {
    const out = decideTriage(
      casePoQuery(),
      context({
        openCaseMatches: [
          match({ caseId: 'case-A', matchedOn: 'case_po' }),
          match({ caseId: 'case-B', casePo: 'QDOS26002', matchedOn: 'case_po' }),
        ],
      }),
      gates({ refGate: true, autoAttach: true }),
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.targetCaseId).toBeUndefined();
  });

  it('gate OFF (default) — an exact case_po single match stays suggest_attach (DARK: today unchanged)', () => {
    const out = decideTriage(
      casePoQuery(),
      context({ openCaseMatches: [match({ matchedOn: 'case_po' })] }),
      gates({ refGate: true }), // autoAttach defaults false
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.decisionInputs.autoAttachApplied).toBe(false);
  });

  it('autoAttach on but refGate OFF -> no rung-3 action at all (a modifier requires refGate)', () => {
    const out = decideTriage(
      casePoQuery(),
      context({ openCaseMatches: [match({ matchedOn: 'case_po' })] }),
      gates({ autoAttach: true }), // refGate off
    );
    expect(out.action).toBe('proceed_default');
  });

  it('case_update refinement still applies under auto-attach (attachments -> case_update, action attach_case)', () => {
    const out = decideTriage(
      casePoQuery(),
      context({ openCaseMatches: [match({ matchedOn: 'case_po' })], hasAttachments: true, imagesOnly: false }),
      gates({ refGate: true, caseUpdate: true, autoAttach: true }),
    );
    expect(out.action).toBe('attach_case');
    expect(out.finalCategory).toBe('case_update');
    expect(out.finalSubtype).toBe('update_general');
  });
});

describe('decideTriage — VRM-only matches are NEVER promoted past suggestion (ADR-0010 permanent invariant)', () => {
  it('a vrm-only ref-gate match is suggest_attach with a target — never an action outside the suggestion vocabulary', () => {
    const out = decideTriage(
      classification({ bodyVrm: 'AB12CDE' }),
      context({ openCaseMatches: [match({ matchedOn: 'vrm' })] }),
      gates({ refGate: true, caseUpdate: true }),
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.suggestionType).toBe('case_link');
    // A target IS allowed for an exact single vrm-only ref-gate match (suggestion-only —
    // see the module doc's promotion seam); what must NEVER happen is auto-attach, which
    // this action vocabulary makes structurally impossible (no 'attach_case' token exists).
    expect(out.targetCaseId).toBe('case-100');
  });

  it('property check across gate combinations: a vrm-only match never yields an action outside {suggest_attach, propose_cancellation}, and a cancellation proposal never takes a vrm-only target', () => {
    const gateCombos: TriagePolicyGates[] = [
      gates({ refGate: true }),
      gates({ refGate: true, caseUpdate: true }),
      gates({ refGate: true, cancellation: true }),
      GATES_ALL_ON,
    ];
    for (const g of gateCombos) {
      const out = decideTriage(
        classification({
          category: 'cancellation',
          subtype: 'cancellation_notice',
          bodyVrm: 'AB12CDE',
        }),
        context({ openCaseMatches: [match({ matchedOn: 'vrm' })] }),
        g,
      );
      if (g.cancellation) {
        expect(out.action).toBe('propose_cancellation');
        expect(out.targetCaseId).toBeUndefined(); // vrm-only is NEVER a cancellation target
      } else {
        expect(out.action).toBe('suggest_attach'); // falls through to the ref-gate instead
      }
    }
  });
});

/* ----------  case_update vs query precedence  ---------- */

describe('decideTriage — case_update vs query precedence (rung 3 refinement)', () => {
  it('open-case match + new evidence (attachments, not images-only) -> finalCategory case_update, subtype update_general', () => {
    const out = decideTriage(
      classification({
        category: 'receiving_work',
        subtype: 'existing_provider_instruction',
        bodyCaseref: 'QDOS26001',
      }),
      context({
        openCaseMatches: [match({ matchedOn: 'case_po' })],
        hasAttachments: true,
        attachmentKinds: ['instruction'],
        imagesOnly: false,
      }),
      gates({ refGate: true, caseUpdate: true }),
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.finalCategory).toBe('case_update');
    expect(out.finalSubtype).toBe('update_general');
  });

  it('open-case match + new evidence that is ALL images -> subtype images_received (tkt043: images sent as a follow-up must attach to the open case, not mint a new one)', () => {
    // baseline-v1.json id tkt043-images-existing-case: expected query/query_existing_work,
    // the v1 engine got receiving_work/existing_provider_instruction at 0.95 for photos
    // sent as a follow-up to an existing case, misread as a fresh instruction.
    const out = decideTriage(
      classification({
        category: 'receiving_work',
        subtype: 'existing_provider_instruction',
        bodyCaseref: 'SBL26149',
      }),
      context({
        openCaseMatches: [match({ caseId: 'case-sbl', casePo: 'SBL26149', matchedOn: 'case_po' })],
        hasAttachments: true,
        attachmentKinds: ['image', 'image'],
        imagesOnly: true,
      }),
      gates({ refGate: true, caseUpdate: true }),
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.targetCaseId).toBe('case-sbl');
    expect(out.finalCategory).toBe('case_update');
    expect(out.finalSubtype).toBe('images_received');
  });

  it('tkt043 real sample (open-case job-ref match + images-PDF, auto-attach ON) -> attach_case / case_update / images_received (the full TKT-093 attach lane)', () => {
    // The live shape of the TKT-043 chaser: Stage A returns receiving_work/
    // existing_provider_instruction (the body is genuinely work-shaped — "engineers
    // report is required on the following case … 160404" + an instruction-kind PDF), the
    // triage activity resolves the job-ref 160404 to ONE open case, and derives
    // imagesOnly=true for the photos-in-a-PDF ("images - cvd.pdf"). With the LIVE gates
    // (refGate + caseUpdate + autoAttach), Stage B relabels to case_update/images_received
    // AND promotes to attach_case on the strong single job-ref match — the TKT-093
    // self-accept -> reversible inbound_linked attach. No new case is minted (case_update
    // is a non-minting category; belt-and-braces CASE_MINTING_CATEGORIES = [receiving_work]).
    const out = decideTriage(
      classification({
        category: 'receiving_work',
        subtype: 'existing_provider_instruction',
        bodyJobref: '160404',
        isReply: true,
      }),
      context({
        openCaseMatches: [match({ caseId: 'case-als-160404', casePo: 'ALS26066', matchedOn: 'job_ref' })],
        hasAttachments: true,
        attachmentKinds: ['image'],
        imagesOnly: true,
      }),
      gates({ refGate: true, caseUpdate: true, autoAttach: true }),
    );
    expect(out.action).toBe('attach_case');
    expect(out.finalCategory).toBe('case_update');
    expect(out.finalSubtype).toBe('images_received');
    expect(out.targetCaseId).toBe('case-als-160404');
    expect(out.suggestionType).toBe('case_link');
    expect(out.decisionInputs.autoAttachApplied).toBe(true);
  });

  it('tkt043 with auto-attach OFF (DARK default) still relabels to case_update/images_received but stays a suggestion (suggest-first)', () => {
    const out = decideTriage(
      classification({
        category: 'receiving_work',
        subtype: 'existing_provider_instruction',
        bodyJobref: '160404',
        isReply: true,
      }),
      context({
        openCaseMatches: [match({ caseId: 'case-als-160404', casePo: 'ALS26066', matchedOn: 'job_ref' })],
        hasAttachments: true,
        attachmentKinds: ['image'],
        imagesOnly: true,
      }),
      gates({ refGate: true, caseUpdate: true }), // autoAttach off
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.finalCategory).toBe('case_update');
    expect(out.finalSubtype).toBe('images_received');
    expect(out.targetCaseId).toBe('case-als-160404');
    expect(out.suggestionType).toBe('case_link');
  });

  it('ref-match + question-only (no attachments) -> STAYS in the query lane, category/subtype untouched', () => {
    const out = decideTriage(
      classification({
        category: 'query',
        subtype: 'query_existing_work',
        bodyCaseref: 'QDOS26001',
      }),
      context({
        openCaseMatches: [match({ matchedOn: 'case_po' })],
        hasAttachments: false,
        attachmentKinds: [],
        imagesOnly: false,
      }),
      gates({ refGate: true, caseUpdate: true }),
    );
    // Still suggested for attach (for staff context), but NOT relabelled to case_update.
    expect(out.action).toBe('suggest_attach');
    expect(out.finalCategory).toBe('query');
    expect(out.finalSubtype).toBe('query_existing_work');
  });

  it('caseUpdate gate off -> ref-gate still suggests, but never relabels the category (caseUpdate has no independent trigger path)', () => {
    const out = decideTriage(
      classification({
        category: 'receiving_work',
        subtype: 'existing_provider_instruction',
        bodyCaseref: 'QDOS26001',
      }),
      context({
        openCaseMatches: [match({ matchedOn: 'case_po' })],
        hasAttachments: true,
        imagesOnly: true,
      }),
      gates({ refGate: true, caseUpdate: false }),
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.finalCategory).toBe('receiving_work');
    expect(out.finalSubtype).toBe('existing_provider_instruction');
  });

  it('caseUpdate ON but refGate OFF -> no relabelling at all (case_update depends on the ref-gate having found the match)', () => {
    const out = decideTriage(
      classification({
        category: 'receiving_work',
        subtype: 'existing_provider_instruction',
        bodyCaseref: 'QDOS26001',
      }),
      context({
        openCaseMatches: [match({ matchedOn: 'case_po' })],
        hasAttachments: true,
        imagesOnly: true,
      }),
      gates({ refGate: false, caseUpdate: true }),
    );
    expect(out.action).toBe('proceed_default');
    expect(out.finalCategory).toBe('receiving_work');
  });

  it('cancellation trumps case_update even when new evidence is attached', () => {
    const out = decideTriage(
      classification({
        category: 'cancellation',
        subtype: 'cancellation_notice',
        bodyCaseref: 'QDOS26001',
      }),
      context({
        openCaseMatches: [match({ matchedOn: 'case_po' })],
        hasAttachments: true,
        imagesOnly: false,
      }),
      GATES_ALL_ON,
    );
    expect(out.action).toBe('propose_cancellation');
    expect(out.finalCategory).toBe('cancellation');
  });
});

/* ----------  Rung 4: unmatched images routing  ---------- */

describe('decideTriage — unmatched images routing (rung 4, ADR-0015 §5)', () => {
  it('imagesOnly + no open-case match + bodyVrm -> route_images_unmatched', () => {
    const out = decideTriage(
      classification({
        category: 'receiving_work',
        subtype: 'existing_provider_instruction',
        bodyVrm: 'AB12CDE',
      }),
      context({ openCaseMatches: [], hasAttachments: true, attachmentKinds: ['image'], imagesOnly: true }),
      gates({ imagesRouting: true }),
    );
    expect(out.action).toBe('route_images_unmatched');
    expect(out.finalSubtype).toBe('images_received');
    expect(out.targetCaseId).toBeUndefined();
    expect(out.rationale).toContain('AB12CDE');
  });

  it('no bodyVrm -> does not route (nothing to key the unmatched-photos folder on)', () => {
    const out = decideTriage(
      classification(),
      context({ openCaseMatches: [], hasAttachments: true, imagesOnly: true }),
      gates({ imagesRouting: true }),
    );
    expect(out.action).not.toBe('route_images_unmatched');
  });

  it('an open-case match takes the ref-gate/case_update path instead, never this rung', () => {
    const out = decideTriage(
      classification({ bodyVrm: 'AB12CDE' }),
      context({
        openCaseMatches: [match({ matchedOn: 'vrm' })],
        hasAttachments: true,
        imagesOnly: true,
      }),
      gates({ refGate: true, imagesRouting: true }),
    );
    expect(out.action).toBe('suggest_attach');
  });

  it('gate off -> no routing even when unmatched', () => {
    const out = decideTriage(
      classification({ bodyVrm: 'AB12CDE' }),
      context({ openCaseMatches: [], hasAttachments: true, imagesOnly: true }),
      gates({ imagesRouting: false }),
    );
    expect(out.action).toBe('proceed_default');
  });
});

/* ----------  conversationSiblingCaseIds is SECONDARY ONLY  ---------- */

describe('decideTriage — conversationSiblingCaseIds is SECONDARY ONLY (never matches alone)', () => {
  it('siblings present but no ref/vrm/jobref signal -> proceed_default, never a match', () => {
    const out = decideTriage(
      classification(), // no bodyCaseref/bodyJobref/bodyVrm
      context({ conversationSiblingCaseIds: ['case-sibling-1'], openCaseMatches: [] }),
      GATES_ALL_ON,
    );
    expect(out.action).toBe('proceed_default');
    expect(out.targetCaseId).toBeUndefined();
  });

  it('siblings alone (no openCaseMatches) never manufacture a match even with refGate on', () => {
    const out = decideTriage(
      classification({ bodyCaseref: 'SOMETHING-UNMATCHED' }),
      context({
        conversationSiblingCaseIds: ['case-sibling-1', 'case-sibling-2'],
        openCaseMatches: [],
      }),
      gates({ refGate: true }),
    );
    expect(out.action).toBe('proceed_default');
  });

  it('siblings are carried into decisionInputs when a REAL match also fires (richer telemetry only — not the cause of the match)', () => {
    const out = decideTriage(
      classification({ bodyCaseref: 'QDOS26001' }),
      context({
        conversationSiblingCaseIds: ['case-100'],
        openCaseMatches: [match({ caseId: 'case-100' })],
      }),
      gates({ refGate: true }),
    );
    expect(out.action).toBe('suggest_attach');
    expect(out.targetCaseId).toBe('case-100'); // driven by the REAL match, not the sibling list
    expect(out.decisionInputs.conversationSiblingCaseIds).toEqual(['case-100']);
  });
});

/* ----------  Baseline-corpus-inspired scenarios (scripts/evaluation/email/baseline-v1.json)  ---------- */

describe('decideTriage — eval-corpus baseline misses, policy-addressable subset', () => {
  // Of the 10 category-incorrect rows in the v1 baseline, 5 are POLICY-addressable
  // (Stage B can fix them once the v2 engine tag + these gates are live) — exercised
  // above/below by id. The other 5 are STAGE-A text-classification misses with no
  // live-context signal to hang a policy rung on, or are explicitly blocked/operator
  // items per the rules-engine-v2 plan's own ticket coverage, so they are NOT
  // re-exercised here:
  //   - tkt023-outbound-request  (other expected, got query)             — Stage-A miss
  //   - tkt032-audatex-request   (query expected, got other)             — TKT-032 blocked/operator (routing decision)
  //   - tkt032-pcd-diminution    (query expected, got receiving_work)    — TKT-032 blocked/operator
  //   - KERR26028                (receiving_work expected, got query)   — Stage-A miss (no open case exists yet to match against a BRAND NEW instruction)
  //   - tkt041-06-hold-request   (query expected, got other)             — a "hold" request; covered generically by the
  //     case_update-vs-query precedence tests above (no dedicated "hold" outcome exists this release)
  // Policy-addressable:
  //   - tkt023-original-reply                 -> the ref-gate describe block above
  //   - tkt041-07-forward-cancel-instructions -> the cancellation precedence describe block above
  //   - tkt043-images-existing-case           -> the case_update describe block above
  //   - tkt041-10 / tkt041-13 (reply-cancel variants) -> exercised below

  it('tkt041-10-reply-cancel-instructions: a reply mentioning cancelling instructions, ref-matched -> propose_cancellation (never silently abstains to other)', () => {
    const out = decideTriage(
      classification({
        category: 'cancellation',
        subtype: 'cancellation_notice',
        bodyCaseref: 'QDOS261253',
        isReply: true,
      }),
      context({
        openCaseMatches: [
          match({ caseId: 'case-qdos-1253', casePo: 'QDOS261253', matchedOn: 'case_po' }),
        ],
      }),
      gates({ cancellation: true }),
    );
    expect(out.action).toBe('propose_cancellation');
    expect(out.targetCaseId).toBe('case-qdos-1253');
  });

  it('tkt041-13-reply-cancel-inspection: a reply cancelling an inspection specifically, ref-matched -> propose_cancellation', () => {
    const out = decideTriage(
      classification({
        category: 'cancellation',
        subtype: 'cancellation_notice',
        bodyCaseref: 'QDOS261530',
        isReply: true,
      }),
      context({
        openCaseMatches: [
          match({ caseId: 'case-qdos-1530', casePo: 'QDOS261530', matchedOn: 'case_po' }),
        ],
      }),
      gates({ cancellation: true }),
    );
    expect(out.action).toBe('propose_cancellation');
    expect(out.targetCaseId).toBe('case-qdos-1530');
  });
});

/* ----------  Determinism  ---------- */

describe('decideTriage — determinism', () => {
  it('same input -> same output', () => {
    const c = classification({ bodyCaseref: 'QDOS26001' });
    const ctx = context({ openCaseMatches: [match()] });
    const g = gates({ refGate: true });
    expect(decideTriage(c, ctx, g)).toEqual(decideTriage(c, ctx, g));
  });
});
