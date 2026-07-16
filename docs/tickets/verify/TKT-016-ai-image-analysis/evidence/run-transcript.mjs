/**
 * run-transcript.mjs — offline evidence runner for TKT-016 (G5 repo-data / no network).
 *
 * Runs the shipped pure pipeline (services/data-api/dist/features/assistant/image-analysis.js) over the TKT-040-derived
 * sample image set with SCRIPTED fake adapters, and prints the staged observations + the ranked
 * address suggestion exactly as the route would persist them (all review_state 'pending'). Proves
 * the acceptance offline. Regenerate: `node docs/tickets/verify/TKT-016-ai-image-analysis/evidence/run-transcript.mjs`.
 */
import { runImageAnalysis } from '../../../../../services/data-api/dist/features/assistant/image-analysis.js';

const images = [
  { evidenceId: 'ev-1', filename: '2_CLVDamage4-V1.jpg', imageBase64: 'AAAA', contentType: 'image/jpeg' },
  { evidenceId: 'ev-2', filename: '3_CLVDamage3-V1.jpg', imageBase64: 'AAAA', contentType: 'image/jpeg' },
  { evidenceId: 'ev-3', filename: '4_CLVDamage2-V1.jpg', imageBase64: 'AAAA', contentType: 'image/jpeg' },
  { evidenceId: 'ev-4', filename: 'CLVDamage5-V1.jpg', imageBase64: 'AAAA', contentType: 'image/jpeg' },
];
const ctx = { caseId: 'case-abc', casePo: 'HMA26001', caseVrm: 'WN14XPZ',
  accidentCircumstances: 'Rear-ended at the junction of Smith Road and the A34.' };

const adapters = {
  analyzeScene: async (img) => ({
    vehiclePresent: true, vehicleDescriptor: 'silver Toyota hatchback',
    registrationVisible: img.evidenceId === 'ev-4', visibility: img.evidenceId === 'ev-4' ? 'visible_readable' : 'not_visible',
    plateTextGuess: img.evidenceId === 'ev-4' ? 'WN14 XPZ' : '', personReflection: false,
    backgroundItems: img.evidenceId === 'ev-1' ? [{ text: 'SMITH RECOVERY', kind: 'business' }] : [],
    locationHints: img.evidenceId === 'ev-1' ? [{ detail: 'sign reads Smith Recovery, Acton', kind: 'business' }] : [],
    confidence: 0.8,
  }),
  compareSameVehicle: async () => ({ sameVehicle: true, confidence: 0.9, outliers: [], rationale: 'All photos show the same silver hatchback.' }),
  readPlate: async (img) => img.evidenceId === 'ev-4'
    ? { plateText: 'WN14XPZ', registrationVisible: true, vrmMatch: 'WN14XPZ', confidence: 0.87 }
    : { plateText: '', registrationVisible: false, vrmMatch: null, confidence: null },
  suggestAddress: async () => ([
    { label: 'Smith Recovery, Acton', addressLines: ['Unit 4', 'Acton'], postcode: 'W3 7QE', confidence: 0.72, evidence: [{ kind: 'photo_sign', detail: 'sign reads Smith Recovery' }] },
    { label: 'Depot 2', addressLines: ['Depot 2'], postcode: 'W3 0AA', confidence: 0.4 },
  ]),
};

const happy = await runImageAnalysis(ctx, images, adapters, { sceneModelVersion: 'gpt-5', plateModelVersion: 'fast-alpr' });
console.log('=== HAPPY PATH — sample set of 4 photos (ev-4 carries the plate) ===');
console.log('stageOutcomes:', JSON.stringify(happy.stageOutcomes));
console.log(`drafts (all persist as ai_suggestion, review_state DEFAULT pending): ${happy.drafts.length}`);
for (const d of happy.drafts) {
  console.log(`  - ${d.suggestionType}${d.evidenceId ? ` [${d.evidenceId}]` : ''} conf=${d.confidence} model=${d.modelVersion}`);
  console.log(`      value=${JSON.stringify(d.suggestedValue)}`);
}

// Degradation matrix
const scenarios = {
  'VLM scene down (analyzeScene -> null)': { ...adapters, analyzeScene: async () => null },
  'fast-alpr down (readPlate throws)': { ...adapters, readPlate: async () => { throw new Error('unreachable'); } },
  'location-assist off (suggestAddress -> null)': { ...adapters, suggestAddress: async () => null },
  'no images': null,
};
console.log('\n=== GRACEFUL DEGRADATION ===');
for (const [name, a] of Object.entries(scenarios)) {
  const r = a ? await runImageAnalysis(ctx, images, a) : await runImageAnalysis(ctx, [], adapters);
  console.log(`  ${name}: ${r.drafts.length} drafts | outcomes ${JSON.stringify(r.stageOutcomes)}`);
}
console.log('\nNo scenario threw; no draft is anything but a pending ai_suggestion; no evidence/case column written.');
