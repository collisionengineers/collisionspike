import { describe, expect, it } from 'vitest';
import type { Case, Chaser, Evidence } from '../../data';
import { cases } from '../../__fixtures__/cases';
import {
  chaserTemplatesForCase,
  guidedPhotoRequestBody,
  messageWithUploadLink,
  overviewChaserForPanel,
  overviewChaserStatusText,
} from './ChaserPanel';

let evidenceSequence = 0;

function image(overrides: Partial<Evidence> = {}): Evidence {
  evidenceSequence += 1;
  return {
    id: `image-${evidenceSequence}`,
    fileName: `image-${evidenceSequence}.jpg`,
    kind: 'image',
    imageRole: 'additional',
    registrationVisible: false,
    acceptedForEva: true,
    excluded: false,
    sourceLabel: 'Test upload',
    ...overrides,
  };
}

function instruction(): Evidence {
  evidenceSequence += 1;
  return {
    id: `instruction-${evidenceSequence}`,
    fileName: 'instruction.pdf',
    kind: 'instruction',
    imageRole: 'unknown',
    registrationVisible: false,
    acceptedForEva: false,
    sourceLabel: 'Test instruction',
  };
}

function caseWith(
  evidence: Evidence[],
  overrides: Partial<Case> = {},
): Case {
  return {
    ...cases[0],
    chasers: [],
    evidence,
    ...overrides,
  };
}

function templateKeys(c: Case): string[] {
  return chaserTemplatesForCase(c).map((template) => template.key);
}

function chaser(overrides: Partial<Chaser> = {}): Chaser {
  return {
    id: 'ch-1',
    targetType: 'work_provider',
    targetName: 'Provider',
    channel: 'email',
    templateUsed: 'Overview photo request',
    status: 'drafted',
    summary: 'Ask for a whole-vehicle photo',
    createdAt: '11/07/2026',
    ...overrides,
  };
}

describe('overview-photo chase visibility', () => {
  it('keeps an eligible backend draft visible even when ordinary missing-item templates are inapplicable', () => {
    const existing = overviewChaserForPanel([chaser()]);
    expect(existing?.templateUsed).toBe('Overview photo request');
    expect(overviewChaserStatusText(existing!)).toBe(
      'Drafted overview photo request — ready to copy and send.',
    );
  });

  it('preserves truthful sent wording', () => {
    expect(overviewChaserStatusText(chaser({ status: 'sent', sentAt: '11/07/2026 14:30' })))
      .toBe('Overview photo request sent on 11/07/2026 14:30.');
  });

  it('does not revive a responded overview request', () => {
    expect(overviewChaserForPanel([chaser({ status: 'responded' })])).toBeUndefined();
  });
});

describe('image chaser copy', () => {
  it('appends exactly one active link and replaces a stale link on retry', () => {
    const first = messageWithUploadLink('Please send photos.', 'https://app.box.com/f/first');
    const repaired = messageWithUploadLink(first, 'https://app.box.com/f/repaired');
    expect(repaired).toContain('Upload your photos here:\nhttps://app.box.com/f/repaired');
    expect(repaired).not.toContain('/first');
    expect(repaired.match(/Upload your photos here:/g)).toHaveLength(1);
  });
});

describe('canonical image-gap chaser eligibility', () => {
  const overview = () => image({ imageRole: 'overview', registrationVisible: true });
  const closeup = () => image({ imageRole: 'damage_closeup' });

  it('offers every applicable image request when no accepted image exists', () => {
    expect(templateKeys(caseWith([instruction()]))).toEqual([
      'image_request',
      'overview_photo_request',
      'damage_closeup_request',
    ]);
  });

  it('treats an all-excluded raw set exactly like zero accepted images', () => {
    expect(templateKeys(caseWith([
      image({ imageRole: 'overview', registrationVisible: true, excluded: true }),
      image({ imageRole: 'damage_closeup', excluded: true }),
      instruction(),
    ]))).toEqual([
      'image_request',
      'overview_photo_request',
      'damage_closeup_request',
    ]);
  });

  it('offers only role-specific gaps when the accepted count already passes', () => {
    expect(templateKeys(caseWith([image(), image(), instruction()]))).toEqual([
      'overview_photo_request',
      'damage_closeup_request',
    ]);
  });

  it('keeps the overview request available when registration is not visible', () => {
    expect(templateKeys(caseWith([
      image({ imageRole: 'overview', registrationVisible: false }),
      closeup(),
      instruction(),
    ]))).toEqual(['overview_photo_request']);
  });

  it('keeps the close-up request available when only that role is missing', () => {
    expect(templateKeys(caseWith([overview(), image(), instruction()])))
      .toEqual(['damage_closeup_request']);
  });

  it('offers a replacement request for an unresolved image decision', () => {
    expect(templateKeys(caseWith([
      overview(),
      closeup(),
      image({ excluded: true, reviewRequired: true }),
      instruction(),
    ]))).toEqual(['replacement_photo_request']);
  });

  it('does not turn a reflection-only observation on Image Based Assessment into a gap', () => {
    expect(templateKeys(caseWith([
      image({ imageRole: 'overview', registrationVisible: true, personReflection: true }),
      closeup(),
      instruction(),
    ], {
      inspectionDecision: 'image_based',
      evaFields: {
        ...cases[0].evaFields,
        inspectionAddress: {
          ...cases[0].evaFields.inspectionAddress,
          value: 'Image Based Assessment',
        },
      },
    }))).toEqual([]);
  });

  it('suppresses image chasers only for a fully valid accepted set', () => {
    expect(templateKeys(caseWith([overview(), closeup(), instruction()]))).toEqual([]);
  });

  it('keeps instruction eligibility independent of image completeness', () => {
    expect(templateKeys(caseWith([overview(), closeup()])))
      .toEqual(['instruction_request']);
    const emptyCaseTemplates = chaserTemplatesForCase(caseWith([]));
    expect(emptyCaseTemplates.map((template) => template.key)).toEqual([
      'image_request',
      'overview_photo_request',
      'damage_closeup_request',
      'instruction_request',
    ]);
    const instructionDraft = emptyCaseTemplates[emptyCaseTemplates.length - 1]?.body;
    expect(instructionDraft).toContain('do not yet have the instruction');
    expect(instructionDraft).not.toContain('received images');
  });

  it('reuses an active overview draft only while the canonical overview gap remains', () => {
    const active = chaser();
    expect(templateKeys(caseWith([closeup(), image(), instruction()], { chasers: [active] })))
      .toContain('existing_overview_photo_request');
    expect(templateKeys(caseWith([overview(), closeup(), instruction()], { chasers: [active] })))
      .not.toContain('existing_overview_photo_request');
  });

  it('keeps a draft on its original channel without hiding other channel options', () => {
    const active = chaser({ channel: 'whatsapp' });
    const templates = chaserTemplatesForCase(caseWith(
      [image({ imageRole: 'damage_closeup' }), image()],
      { chasers: [active] },
    ));

    expect(templates.map((template) => [template.key, template.channels])).toEqual([
      ['existing_overview_photo_request', ['whatsapp']],
      ['instruction_request', ['email']],
    ]);
  });
});

describe('guided photo request draft', () => {
  it('puts the one-time link into a plain-language editable message', () => {
    const body = guidedPhotoRequestBody(
      { vrm: 'AB12 CDE', vehicleModel: 'Ford Focus' } as Case,
      {
        sessionId: 'session-1',
        captureUrl: 'https://capture.collisionengineers.co.uk/#capture=secret',
        shotPlanLabel: 'Essential photos',
        expiresAt: '2026-07-16T12:00:00.000Z',
      },
    );

    expect(body).toContain('AB12 CDE');
    expect(body).toContain('https://capture.collisionengineers.co.uk/#capture=secret');
    expect(body).toContain('No account is needed.');
    expect(body).not.toMatch(/token|session|endpoint|Azure|API/i);
  });
});
