export type CaptureShotPlanId = 'essential-v1' | 'standard-exterior-v1';
export type CaptureGuidanceMode = 'off' | 'shadow' | 'advisory' | 'enforced';

export interface CaptureShotSnapshot {
  id: string;
  role: string;
  evidenceRole: 'overview' | 'damage_closeup' | 'additional' | 'unknown';
  label: string;
  prompt: string;
  required: boolean;
  sequence: number;
  guidanceProfile: Record<string, unknown>;
}

export interface CaptureShotPlan {
  id: CaptureShotPlanId;
  label: string;
  guidanceMode: CaptureGuidanceMode;
  rulesVersion: string;
  modelVersion?: string;
  shots: readonly CaptureShotSnapshot[];
}

const overview: CaptureShotSnapshot = {
  id: 'overview',
  role: 'overview',
  evidenceRole: 'overview',
  label: 'Vehicle overview',
  prompt: 'Take the whole vehicle with the registration clear.',
  required: true,
  sequence: 10,
  guidanceProfile: { framing: 'whole_vehicle', registrationExpected: true },
};

const damageCloseup: CaptureShotSnapshot = {
  id: 'damage-closeup',
  role: 'damage_closeup',
  evidenceRole: 'damage_closeup',
  label: 'Main damage close-up',
  prompt: 'Fill the frame with the main damaged area.',
  required: true,
  sequence: 20,
  guidanceProfile: { framing: 'damage_closeup' },
};

const optionalShots: readonly CaptureShotSnapshot[] = [
  ['damage-context', 'damage_context', 'Damage from further back', 'Step back so the panel and damage position are clear.'],
  ['front-left', 'front_left', 'Front left corner', 'Capture the front left corner from waist height.'],
  ['front-right', 'front_right', 'Front right corner', 'Capture the front right corner from waist height.'],
  ['rear-left', 'rear_left', 'Rear left corner', 'Capture the rear left corner from waist height.'],
  ['rear-right', 'rear_right', 'Rear right corner', 'Capture the rear right corner from waist height.'],
  ['vin', 'vin', 'VIN', 'Take the VIN plate or windscreen VIN if it is easy to reach.'],
  ['odometer', 'odometer', 'Odometer', 'Take the dashboard mileage with the numbers readable.'],
  ['additional', 'additional', 'Anything else', 'Add any other useful damage, interior, or context photo.'],
].map(([id, role, label, prompt], index) => ({
  id,
  role,
  evidenceRole: 'additional' as const,
  label,
  prompt,
  required: false,
  sequence: 30 + (index * 10),
  guidanceProfile: { framing: role },
}));

const PLANS: Record<CaptureShotPlanId, CaptureShotPlan> = {
  'essential-v1': {
    id: 'essential-v1',
    label: 'Essential vehicle photos',
    guidanceMode: 'advisory',
    rulesVersion: 'deterministic-quality-v1',
    shots: [overview, damageCloseup],
  },
  'standard-exterior-v1': {
    id: 'standard-exterior-v1',
    label: 'Standard exterior photo set',
    guidanceMode: 'advisory',
    rulesVersion: 'deterministic-quality-v1',
    shots: [overview, damageCloseup, ...optionalShots],
  },
};

export function captureShotPlan(value: unknown): CaptureShotPlan | undefined {
  const id = typeof value === 'string' ? value : 'essential-v1';
  return id === 'essential-v1' || id === 'standard-exterior-v1' ? PLANS[id] : undefined;
}

export function captureExpiryHours(value: unknown): 24 | 72 | 168 | undefined {
  const hours = value == null ? 168 : Number(value);
  return hours === 24 || hours === 72 || hours === 168 ? hours : undefined;
}

/**
 * Pin every new session to the currently configured rollout rung. Existing
 * sessions keep their immutable snapshot when the app setting changes.
 * Invalid values fail closed at session creation instead of silently enabling
 * a more permissive guidance mode.
 */
export function configuredCaptureGuidanceMode(
  value = process.env.CAPTURE_GUIDANCE_MODE,
): CaptureGuidanceMode | undefined {
  const mode = (value ?? 'advisory').trim().toLowerCase();
  return mode === 'off' || mode === 'shadow' || mode === 'advisory' || mode === 'enforced'
    ? mode
    : undefined;
}
