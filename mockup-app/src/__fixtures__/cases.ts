/* ============================================================
   TEST FIXTURES — fabricated case data. NOT shipped.

   These fabricated rows live under src/__fixtures__ and are imported ONLY by
   unit tests (src/data/adapter.test.ts). Nothing in the production import graph
   (main.tsx → App → screens → data seam) references this file, so Vite/Rollup
   tree-shakes it out of `dist`. The deployed app renders ONLY real Dataverse
   rows (the seam's default source returns empty until configureDataAccess()
   injects the generated services — see src/data/mock-source.ts).

   Do NOT import these from any production module.
   ============================================================ */
import type {
  Case,
  EvaField,
  EvaFields,
  FieldProvenance,
  MileageUnit,
  ReviewState,
  VatStatus,
} from '@cs/domain';

/* ------------------------------------------------------------
   Helpers to build EVA fields tersely.
   ------------------------------------------------------------ */
function f(
  value: string,
  provenance: FieldProvenance,
  reviewState: ReviewState = 'reviewed',
): EvaField {
  return { value, provenance, reviewState };
}

// Common provenance shortcuts.
const pPdf = (label: string, confidence?: number): FieldProvenance => ({
  sourceType: 'pdf_extraction',
  sourceLabel: label,
  confidence,
});
const pCorpus = (label: string): FieldProvenance => ({ sourceType: 'corpus', sourceLabel: label });
const pStaff = (label = 'Staff entry'): FieldProvenance => ({ sourceType: 'staff', sourceLabel: label });
const pEmail = (label: string): FieldProvenance => ({ sourceType: 'email_text', sourceLabel: label });
const pAi = (label: string, confidence?: number): FieldProvenance => ({
  sourceType: 'ai',
  sourceLabel: label,
  confidence,
});
const pDvsa = (label: string): FieldProvenance => ({ sourceType: 'dvla_dvsa', sourceLabel: label });

const IMAGE_BASED = 'Image Based Assessment';

/** Build a complete, valid 12-field set then let callers override specifics. */
function baseEvaFields(over: Partial<EvaFields> = {}): EvaFields {
  const vat: VatStatus = 'No';
  const unit: MileageUnit = 'Miles';
  return {
    workProvider: f('CarCompany Solicitors', pCorpus('Principals corpus')),
    vehicleModel: f('Volkswagen Golf 1.6 TDI', pPdf('Instruction PDF p.1', 0.97)),
    claimantName: f('Mr A. Driver', pPdf('Instruction PDF p.1', 0.95)),
    claimantTelephone: f('07700 900123', pPdf('Instruction PDF p.1', 0.9)),
    claimantEmail: f('a.driver@example.com', pPdf('Instruction PDF p.2', 0.88)),
    dateOfLoss: f('14/05/2026', pPdf('Instruction PDF p.1', 0.99)),
    dateOfInstruction: f('02/06/2026', pPdf('Instruction PDF p.1', 0.99)),
    accidentCircumstances: f(
      'Third party failed to stop at a junction and collided with the nearside of the insured vehicle.',
      pPdf('Instruction PDF p.2', 0.84),
    ),
    inspectionAddress: f(
      ['Northgate Bodyshop', 'Unit 7 Northgate Estate', 'Wakefield Road', 'Leeds', 'West Yorkshire', 'LS9 7DT'].join('\n'),
      pCorpus('Garages corpus → Northgate Bodyshop'),
    ),
    vatStatus: { ...f(vat, pPdf('Instruction PDF p.2', 0.8)), value: vat },
    mileage: f('48,250', pPdf('Instruction PDF p.2', 0.7)),
    mileageUnit: { ...f(unit, pStaff()), value: unit },
    ...over,
  };
}

/* ------------------------------------------------------------
   Five+ cases spanning the full status range.
   ------------------------------------------------------------ */
export const cases: Case[] = [
  /* 1 — READY FOR EVA (everything satisfied) */
  {
    id: 'case-001',
    vrm: 'AB12 CDE',
    provider: 'CarCompany Solicitors',
    providerCode: 'CCPY',
    vehicleModel: 'Volkswagen Golf 1.6 TDI',
    vehicleYear: 2019,
    evaFields: baseEvaFields(),
    evidence: [
      {
        id: 'ev-001-a',
        fileName: 'IMG_overview.jpg',
        kind: 'image',
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        thumbColor: '#3b5161',
        sourceLabel: 'Email — carcompany.co.uk',
      },
      {
        id: 'ev-001-b',
        fileName: 'IMG_damage.jpg',
        kind: 'image',
        imageRole: 'damage_closeup',
        registrationVisible: false,
        acceptedForEva: true,
        thumbColor: '#6b3b3b',
        sourceLabel: 'Email — carcompany.co.uk',
      },
      {
        id: 'ev-001-c',
        fileName: 'IMG_nearside.jpg',
        kind: 'image',
        imageRole: 'additional',
        registrationVisible: false,
        acceptedForEva: true,
        thumbColor: '#4a4a52',
        sourceLabel: 'Email — carcompany.co.uk',
      },
      {
        id: 'ev-001-d',
        fileName: 'Instruction.pdf',
        kind: 'instruction',
        imageRole: 'unknown',
        registrationVisible: false,
        acceptedForEva: false,
        sourceLabel: 'Email — carcompany.co.uk',
      },
    ],
    notes: [
      {
        id: 'note-001-a',
        author: 'J. Mercer',
        timestamp: '03/06/2026 09:14',
        text: 'All fields parsed cleanly. Repairer address confirmed against corpus.',
      },
    ],
    chasers: [],
    overviewFacts: {
      insuredName: 'Mr A. Driver',
      claimantName: 'Mr A. Driver',
      claimNumber: 'CC-2026-0481',
      insurerName: 'Northern Mutual',
      repairerName: 'Northgate Bodyshop',
      incidentDate: '14/05/2026',
      claimType: 'Non-fault RTC',
    },
    status: 'ready_for_eva',
    missing: [],
    channel: { kind: 'email', mode: 'auto', sourceMailbox: 'instructions@collisionengineers.co.uk' },
    ageDays: 2,
    inspectionDecision: 'confirmed_physical',
    createdAt: '02/06/2026',
    dateDue: '16/06/2026',
  },

  /* 2 — MISSING IMAGES (instruction in, no usable images) */
  {
    id: 'case-002',
    vrm: 'XY68 RTQ',
    provider: 'Test Legal Group',
    providerCode: 'TEST',
    vehicleModel: 'Ford Focus 1.0 EcoBoost',
    vehicleYear: 2021,
    evaFields: baseEvaFields({
      workProvider: f('Test Legal Group', pCorpus('Principals corpus')),
      vehicleModel: f('Ford Focus 1.0 EcoBoost', pPdf('Instruction PDF p.1', 0.96)),
      claimantName: f('Ms B. Lawson', pPdf('Instruction PDF p.1', 0.94)),
      claimantTelephone: f('07700 900456', pPdf('Instruction PDF p.1', 0.85)),
      claimantEmail: f('b.lawson@example.com', pEmail('Sender email body')),
      dateOfLoss: f('21/05/2026', pPdf('Instruction PDF p.1', 0.98)),
      dateOfInstruction: f('05/06/2026', pPdf('Instruction PDF p.1', 0.98)),
      inspectionAddress: f(
        ['Eastside Motors', 'Crcompton Way', 'Manchester', 'Greater Manchester', '', 'M40 2WX'].join('\n'),
        pCorpus('Garages corpus → Eastside Motors'),
      ),
      mileage: f('', pStaff('Not supplied'), 'needs_review'),
      mileageUnit: { ...f('', pStaff()), value: '' as MileageUnit },
    }),
    evidence: [
      {
        id: 'ev-002-a',
        fileName: 'Instruction.pdf',
        kind: 'instruction',
        imageRole: 'unknown',
        registrationVisible: false,
        acceptedForEva: false,
        sourceLabel: 'Email — testlegal.co.uk',
      },
    ],
    notes: [],
    chasers: [
      {
        id: 'ch-002-a',
        targetType: 'repairer',
        targetName: 'Eastside Motors',
        channel: 'email',
        templateUsed: 'Image request (repairer)',
        status: 'drafted',
        summary: 'Awaiting damage photos incl. overview with registration.',
        createdAt: '06/06/2026',
      },
    ],
    overviewFacts: {
      claimantName: 'Ms B. Lawson',
      claimNumber: 'TL-2026-1190',
      insurerName: 'Citywide Insurance',
      incidentDate: '21/05/2026',
    },
    status: 'missing_images',
    actionReason: 'missing_images',
    missing: [
      { kind: 'image_rule', label: 'No EVA images yet — need ≥2 (overview + damage closeup)' },
      { kind: 'image_rule', label: 'No overview photo with registration visible' },
      { kind: 'required_field', label: 'Mileage not supplied (DVSA estimate pending)' },
    ],
    channel: { kind: 'email', mode: 'auto', sourceMailbox: 'instructions@collisionengineers.co.uk' },
    ageDays: 12,
    inspectionDecision: 'confirmed_physical',
    createdAt: '05/06/2026',
    dateDue: '12/06/2026',
  },

  /* 3 — DUPLICATE RISK (two open candidates by VRM) */
  {
    id: 'case-003',
    vrm: 'LD19 MNO',
    provider: 'Bridgen Claims',
    providerCode: 'BRDN',
    vehicleModel: 'BMW 320d M Sport',
    vehicleYear: 2019,
    evaFields: baseEvaFields({
      workProvider: f('Bridgen Claims', pCorpus('Principals corpus')),
      vehicleModel: f('BMW 320d M Sport', pPdf('Instruction PDF p.1', 0.93)),
      claimantName: f('Mr C. Okafor', pPdf('Instruction PDF p.1', 0.9)),
      claimantTelephone: f('07700 900789', pAi('OCR from email image', 0.61)),
      dateOfLoss: f('28/05/2026', pPdf('Instruction PDF p.1', 0.97)),
      dateOfInstruction: f('09/06/2026', pPdf('Instruction PDF p.1', 0.97)),
      accidentCircumstances: f(
        'Rear-end shunt in stationary traffic on the M62.',
        pPdf('Instruction PDF p.2', 0.79),
      ),
      mileage: f('62,800', pDvsa('DVSA current_mileage_estimate')),
    }),
    evidence: [
      {
        id: 'ev-003-a',
        fileName: 'overview.jpg',
        kind: 'image',
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        thumbColor: '#2f4858',
        sourceLabel: 'WhatsApp — Bridgen group',
      },
      {
        id: 'ev-003-b',
        fileName: 'rear_damage.jpg',
        kind: 'image',
        imageRole: 'damage_closeup',
        registrationVisible: false,
        acceptedForEva: true,
        thumbColor: '#5a3a3a',
        sourceLabel: 'WhatsApp — Bridgen group',
      },
    ],
    notes: [
      {
        id: 'note-003-a',
        author: 'System',
        timestamp: '09/06/2026 11:02',
        text: 'Two open cases share VRM LD19 MNO with differing claim references. Held for human disambiguation — never auto-merged.',
      },
    ],
    chasers: [],
    overviewFacts: {
      claimantName: 'Mr C. Okafor',
      claimNumber: 'BR-2026-3320',
      policyReference: 'POL-88241',
      insurerName: 'Pennine Assurance',
      incidentDate: '28/05/2026',
    },
    status: 'duplicate_risk',
    actionReason: 'duplicate',
    missing: [
      { kind: 'conflict', label: 'Possible duplicate: 2 open cases for VRM LD19 MNO — confirm claim reference' },
    ],
    channel: { kind: 'whatsapp', mode: 'manual', sourceMailbox: 'Bridgen WhatsApp group' },
    ageDays: 8,
    inspectionDecision: 'manual',
    createdAt: '09/06/2026',
    dateDue: '16/06/2026',
  },

  /* 4 — NEEDS REVIEW (image-based provider, a conflict + low-confidence field) */
  {
    id: 'case-004',
    vrm: 'GH15 PRS',
    provider: 'Amber Legal Services',
    providerCode: 'AMLS',
    vehicleModel: 'Vauxhall Astra 1.4T',
    vehicleYear: 2016,
    evaFields: baseEvaFields({
      workProvider: f('Amber Legal Services', pCorpus('Principals corpus')),
      vehicleModel: f('Vauxhall Astra 1.4T', pPdf('Instruction PDF p.1', 0.82)),
      claimantName: f('Mrs D. Patel', pPdf('Instruction PDF p.1', 0.6), 'conflict'),
      claimantTelephone: f('07700 900222', pEmail('Sender email body')),
      claimantEmail: f('d.patel@example.com', pEmail('Sender email body')),
      dateOfLoss: f('30/05/2026', pPdf('Instruction PDF p.1', 0.95)),
      dateOfInstruction: f('10/06/2026', pPdf('Instruction PDF p.1', 0.95)),
      accidentCircumstances: f(
        'Parked and unattended; damage to offside front wing reported by claimant.',
        pAi('Summarised from email thread', 0.66),
        'needs_review',
      ),
      inspectionAddress: f(IMAGE_BASED, {
        sourceType: 'staff',
        sourceLabel: 'Image-based override — no physical inspection',
      }),
      vatStatus: { ...f('', pStaff('Not stated'), 'needs_review'), value: '' as VatStatus },
    }),
    evidence: [
      {
        id: 'ev-004-a',
        fileName: 'front_overview.jpg',
        kind: 'image',
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        thumbColor: '#3a4a3a',
        sourceLabel: 'Email — amberlegal.co.uk',
      },
      {
        id: 'ev-004-b',
        fileName: 'wing_closeup.jpg',
        kind: 'image',
        imageRole: 'damage_closeup',
        registrationVisible: false,
        acceptedForEva: true,
        thumbColor: '#6b5a3b',
        sourceLabel: 'Email — amberlegal.co.uk',
      },
      {
        id: 'ev-004-c',
        fileName: 'selfie_reflection.jpg',
        kind: 'image',
        imageRole: 'additional',
        registrationVisible: false,
        acceptedForEva: false,
        excluded: true,
        exclusionReason: "Person's reflection visible — unusable",
        thumbColor: '#555',
        sourceLabel: 'Email — amberlegal.co.uk',
      },
    ],
    notes: [
      {
        id: 'note-004-a',
        author: 'System',
        timestamp: '10/06/2026 14:31',
        text: 'Claimant name differs between instruction PDF ("Mrs D. Patel") and email signature ("D Patel-Shah"). Flagged conflict.',
      },
    ],
    chasers: [],
    overviewFacts: {
      claimantName: 'Mrs D. Patel',
      thirdPartyName: 'Unknown',
      claimNumber: 'AM-2026-0742',
      insurerName: 'Sunrise Insurance',
      incidentDate: '30/05/2026',
      claimType: 'Image-based assessment',
    },
    status: 'needs_review',
    actionReason: 'conflict',
    missing: [
      { kind: 'conflict', label: 'Claimant name conflict (PDF vs email) — resolve before submit' },
      { kind: 'required_field', label: 'Accident circumstances need review (AI-summarised, low confidence)' },
    ],
    channel: { kind: 'email', mode: 'auto', sourceMailbox: 'images@collisionengineers.co.uk' },
    ageDays: 7,
    inspectionDecision: 'image_based',
    createdAt: '10/06/2026',
    dateDue: '17/06/2026',
  },

  /* 5 — EVA SUBMITTED (terminal-ish, Case/PO assigned) */
  {
    id: 'case-005',
    vrm: 'KP20 TUV',
    casePo: 'ccpy26050',
    provider: 'CarCompany Solicitors',
    providerCode: 'CCPY',
    vehicleModel: 'Audi A4 Avant 2.0 TDI',
    vehicleYear: 2020,
    evaFields: baseEvaFields({
      vehicleModel: f('Audi A4 Avant 2.0 TDI', pPdf('Instruction PDF p.1', 0.98)),
      claimantName: f('Mr E. Hughes', pPdf('Instruction PDF p.1', 0.96)),
      dateOfLoss: f('02/05/2026', pPdf('Instruction PDF p.1', 0.99)),
      dateOfInstruction: f('20/05/2026', pPdf('Instruction PDF p.1', 0.99)),
      mileage: f('33,410', pPdf('Instruction PDF p.2', 0.91)),
    }),
    evidence: [
      {
        id: 'ev-005-a',
        fileName: 'overview.jpg',
        kind: 'image',
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        thumbColor: '#33485a',
        sourceLabel: 'Email — carcompany.co.uk',
      },
      {
        id: 'ev-005-b',
        fileName: 'damage.jpg',
        kind: 'image',
        imageRole: 'damage_closeup',
        registrationVisible: false,
        acceptedForEva: true,
        thumbColor: '#5a3636',
        sourceLabel: 'Email — carcompany.co.uk',
      },
      {
        id: 'ev-005-c',
        fileName: 'eva_payload.json',
        kind: 'eva_payload',
        imageRole: 'unknown',
        registrationVisible: false,
        acceptedForEva: false,
        sourceLabel: 'Generated at submit',
      },
    ],
    notes: [
      {
        id: 'note-005-a',
        author: 'J. Mercer',
        timestamp: '21/05/2026 16:48',
        text: 'Submitted to EVA test environment. Case/PO ccpy26050 assigned.',
      },
    ],
    chasers: [],
    overviewFacts: {
      claimantName: 'Mr E. Hughes',
      claimNumber: 'CC-2026-0455',
      insurerName: 'Northern Mutual',
      repairerName: 'Northgate Bodyshop',
      incidentDate: '02/05/2026',
    },
    status: 'eva_submitted',
    missing: [],
    channel: { kind: 'email', mode: 'auto', sourceMailbox: 'instructions@collisionengineers.co.uk' },
    ageDays: 28,
    inspectionDecision: 'confirmed_physical',
    createdAt: '20/05/2026',
    dateDue: '18/06/2026',
    submittedAt: '17/06/2026',
  },

  /* 6 — BOX SYNCED (fully done; UPPERCASE Box folder) */
  {
    id: 'case-006',
    vrm: 'MN17 WXY',
    casePo: 'test26012',
    provider: 'Test Legal Group',
    providerCode: 'TEST',
    vehicleModel: 'Toyota Corolla 1.8 Hybrid',
    vehicleYear: 2018,
    evaFields: baseEvaFields({
      workProvider: f('Test Legal Group', pCorpus('Principals corpus')),
      vehicleModel: f('Toyota Corolla 1.8 Hybrid', pPdf('Instruction PDF p.1', 0.97)),
      claimantName: f('Ms F. Reilly', pPdf('Instruction PDF p.1', 0.95)),
      dateOfLoss: f('18/04/2026', pPdf('Instruction PDF p.1', 0.99)),
      dateOfInstruction: f('29/04/2026', pPdf('Instruction PDF p.1', 0.99)),
      inspectionAddress: f(
        ['Eastside Motors', 'Crompton Way', 'Manchester', 'Greater Manchester', '', 'M40 2WX'].join('\n'),
        pCorpus('Garages corpus → Eastside Motors'),
      ),
      mileage: f('51,005', pPdf('Instruction PDF p.2', 0.93)),
    }),
    evidence: [
      {
        id: 'ev-006-a',
        fileName: 'overview.jpg',
        kind: 'image',
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        thumbColor: '#2f4a4a',
        sourceLabel: 'Email — testlegal.co.uk',
      },
      {
        id: 'ev-006-b',
        fileName: 'damage.jpg',
        kind: 'image',
        imageRole: 'damage_closeup',
        registrationVisible: false,
        acceptedForEva: true,
        thumbColor: '#5a4036',
        sourceLabel: 'Email — testlegal.co.uk',
      },
    ],
    notes: [
      {
        id: 'note-006-a',
        author: 'System',
        timestamp: '30/04/2026 10:05',
        text: 'Archived to Box folder TEST26012 (uppercase). EVA + Box in unison.',
      },
    ],
    chasers: [],
    overviewFacts: {
      claimantName: 'Ms F. Reilly',
      claimNumber: 'TL-2026-1004',
      insurerName: 'Citywide Insurance',
      repairerName: 'Eastside Motors',
      incidentDate: '18/04/2026',
    },
    status: 'box_synced',
    missing: [],
    channel: { kind: 'email', mode: 'auto', sourceMailbox: 'instructions@collisionengineers.co.uk' },
    ageDays: 49,
    inspectionDecision: 'confirmed_physical',
    createdAt: '29/04/2026',
    dateDue: '13/05/2026',
    submittedAt: '17/06/2026',
  },

  /* 7 — NEW EMAIL (just landed, not yet parsed) */
  {
    id: 'case-007',
    vrm: 'RT22 ZAB',
    provider: 'Bridgen Claims',
    providerCode: 'BRDN',
    vehicleModel: '(unparsed)',
    evaFields: baseEvaFields({
      workProvider: f('Bridgen Claims', pCorpus('Principals corpus')),
      vehicleModel: f('', pStaff('Not yet parsed'), 'needs_review'),
      claimantName: f('', pStaff('Not yet parsed'), 'needs_review'),
      claimantTelephone: f('', pStaff(), 'not_required'),
      claimantEmail: f('', pStaff(), 'not_required'),
      dateOfLoss: f('', pStaff('Not yet parsed'), 'needs_review'),
      dateOfInstruction: f('', pStaff('Not yet parsed'), 'needs_review'),
      accidentCircumstances: f('', pStaff('Not yet parsed'), 'needs_review'),
      inspectionAddress: f('', pStaff('Not yet decided'), 'needs_review'),
      vatStatus: { ...f('', pStaff(), 'not_required'), value: '' as VatStatus },
      mileage: f('', pStaff(), 'not_required'),
      mileageUnit: { ...f('', pStaff(), 'not_required'), value: '' as MileageUnit },
    }),
    evidence: [
      {
        id: 'ev-007-a',
        fileName: 'inbound_email.eml',
        kind: 'email',
        imageRole: 'unknown',
        registrationVisible: false,
        acceptedForEva: false,
        sourceLabel: 'Email — bridgenclaims.com',
      },
    ],
    notes: [],
    chasers: [],
    overviewFacts: {},
    status: 'new_email',
    missing: [
      { kind: 'required_field', label: 'Awaiting parse — fields not yet extracted' },
    ],
    channel: { kind: 'email', mode: 'auto', sourceMailbox: 'claims@collisionengineers.co.uk' },
    ageDays: 0,
    inspectionDecision: 'unknown',
    createdAt: '17/06/2026',
  },

  /* 8 — MISSING INSTRUCTIONS (images arrived, no instruction PDF yet) */
  {
    id: 'case-008',
    vrm: 'WV66 KLM',
    provider: 'Amber Legal Services',
    providerCode: 'AMLS',
    vehicleModel: 'Nissan Qashqai 1.5 dCi',
    vehicleYear: 2016,
    evaFields: baseEvaFields({
      workProvider: f('Amber Legal Services', pCorpus('Principals corpus')),
      vehicleModel: f('Nissan Qashqai 1.5 dCi', pAi('OCR from overview plate', 0.71), 'needs_review'),
      claimantName: f('', pStaff('Awaiting instruction PDF'), 'needs_review'),
      claimantTelephone: f('', pStaff(), 'not_required'),
      claimantEmail: f('', pStaff(), 'not_required'),
      dateOfLoss: f('', pStaff('Awaiting instruction PDF'), 'needs_review'),
      dateOfInstruction: f('', pStaff('Awaiting instruction PDF'), 'needs_review'),
      accidentCircumstances: f('', pStaff('Awaiting instruction PDF'), 'needs_review'),
      inspectionAddress: f('', pStaff('Not yet decided'), 'needs_review'),
      vatStatus: { ...f('', pStaff(), 'not_required'), value: '' as VatStatus },
      mileage: f('', pStaff(), 'not_required'),
      mileageUnit: { ...f('', pStaff(), 'not_required'), value: '' as MileageUnit },
    }),
    evidence: [
      {
        id: 'ev-008-a',
        fileName: 'overview.jpg',
        kind: 'image',
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        thumbColor: '#34495a',
        sourceLabel: 'WhatsApp — Amber group',
      },
      {
        id: 'ev-008-b',
        fileName: 'damage.jpg',
        kind: 'image',
        imageRole: 'damage_closeup',
        registrationVisible: false,
        acceptedForEva: true,
        thumbColor: '#5a3a3a',
        sourceLabel: 'WhatsApp — Amber group',
      },
    ],
    notes: [
      {
        id: 'note-008-a',
        author: 'System',
        timestamp: '15/06/2026 09:12',
        text: 'Images arrived without an instruction. Held until the instruction PDF lands. Chaser drafted to provider.',
      },
    ],
    chasers: [
      {
        id: 'ch-008-a',
        targetType: 'work_provider',
        targetName: 'Amber Legal Services',
        channel: 'email',
        templateUsed: 'Instruction request (provider)',
        status: 'sent',
        summary: 'Awaiting instruction PDF to accompany supplied photos.',
        createdAt: '15/06/2026',
        sentBy: 'J. Mercer',
        sentAt: '15/06/2026',
      },
    ],
    overviewFacts: {
      claimNumber: 'AM-2026-0810',
      insurerName: 'Sunrise Insurance',
    },
    status: 'missing_required_fields',
    actionReason: 'missing_instructions',
    missing: [
      { kind: 'required_field', label: 'No instruction PDF — claimant, dates & circumstances missing' },
    ],
    channel: { kind: 'whatsapp', mode: 'manual', sourceMailbox: 'Amber WhatsApp group' },
    ageDays: 2,
    inspectionDecision: 'unknown',
    createdAt: '15/06/2026',
    dateDue: '15/06/2026',
  },

  /* 9 — INGESTED (parsed in flight; SYSTEM owns it — in-progress, not a person) */
  {
    id: 'case-009',
    vrm: 'BV19 HJK',
    provider: 'CarCompany Solicitors',
    providerCode: 'CCPY',
    vehicleModel: 'Mercedes-Benz C220d',
    vehicleYear: 2019,
    evaFields: baseEvaFields({
      vehicleModel: f('Mercedes-Benz C220d', pPdf('Instruction PDF p.1', 0.92)),
      claimantName: f('Mr G. Fletcher', pPdf('Instruction PDF p.1', 0.9)),
      dateOfLoss: f('11/06/2026', pPdf('Instruction PDF p.1', 0.96)),
      dateOfInstruction: f('16/06/2026', pPdf('Instruction PDF p.1', 0.96)),
      mileage: f('', pStaff('Parse in progress'), 'needs_review'),
      mileageUnit: { ...f('', pStaff(), 'not_required'), value: '' as MileageUnit },
    }),
    evidence: [
      {
        id: 'ev-009-a',
        fileName: 'Instruction.pdf',
        kind: 'instruction',
        imageRole: 'unknown',
        registrationVisible: false,
        acceptedForEva: false,
        sourceLabel: 'Email — carcompany.co.uk',
      },
      {
        id: 'ev-009-b',
        fileName: 'overview.jpg',
        kind: 'image',
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        thumbColor: '#33485a',
        sourceLabel: 'Email — carcompany.co.uk',
      },
    ],
    notes: [],
    chasers: [],
    overviewFacts: {
      claimantName: 'Mr G. Fletcher',
      claimNumber: 'CC-2026-0502',
      insurerName: 'Northern Mutual',
      incidentDate: '11/06/2026',
    },
    status: 'ingested',
    missing: [
      { kind: 'required_field', label: 'Parse in progress — fields being extracted' },
    ],
    channel: { kind: 'email', mode: 'auto', sourceMailbox: 'instructions@collisionengineers.co.uk' },
    ageDays: 1,
    inspectionDecision: 'unknown',
    createdAt: '16/06/2026',
    dateDue: '30/06/2026',
  },

  /* 3b — the OPEN TWIN of case-003 (kept LAST so earlier positional indices are
     stable for the seam tests). Same VRM (LD19 MNO) + same provider (BRDN) as
     the duplicate-risk case-003, but a DIFFERENT claim reference — the candidate
     the attach-vs-new decision surface (ADR-0010) proposes linking to. Held open
     (ingested) so openVrmTwins() returns it; never auto-merged. */
  {
    id: 'case-003b',
    vrm: 'LD19 MNO',
    provider: 'Bridgen Claims',
    providerCode: 'BRDN',
    vehicleModel: 'BMW 320d M Sport',
    vehicleYear: 2019,
    evaFields: baseEvaFields({
      workProvider: f('Bridgen Claims', pCorpus('Principals corpus')),
      vehicleModel: f('BMW 320d M Sport', pPdf('Instruction PDF p.1', 0.93)),
      claimantName: f('Mr C. Okafor', pPdf('Instruction PDF p.1', 0.9)),
      dateOfLoss: f('28/05/2026', pPdf('Instruction PDF p.1', 0.97)),
      dateOfInstruction: f('04/06/2026', pPdf('Instruction PDF p.1', 0.97)),
      accidentCircumstances: f(
        'Rear-end shunt in stationary traffic on the M62.',
        pPdf('Instruction PDF p.2', 0.79),
      ),
    }),
    evidence: [
      {
        id: 'ev-003b-a',
        fileName: 'instruction.pdf',
        kind: 'instruction',
        imageRole: 'unknown',
        registrationVisible: false,
        acceptedForEva: false,
        sourceLabel: 'Email — claims@bridgenclaims.com',
      },
    ],
    notes: [],
    chasers: [],
    overviewFacts: {
      claimantName: 'Mr C. Okafor',
      claimNumber: 'BR-2026-3180',
      policyReference: 'POL-88240',
      insurerName: 'Pennine Assurance',
      incidentDate: '28/05/2026',
    },
    status: 'ingested',
    missing: [],
    channel: { kind: 'email', mode: 'auto', sourceMailbox: 'instructions@collisionengineers.co.uk' },
    ageDays: 13,
    inspectionDecision: 'unknown',
    createdAt: '04/06/2026',
    dateDue: '15/06/2026',
  },
];

export function caseById(id: string): Case | undefined {
  return cases.find((c) => c.id === id);
}
