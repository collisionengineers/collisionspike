import type {
  CaptureSessionManifest,
  CaptureShotDefinition,
  CaptureShotProgress,
  CaptureUploadRequest
} from '@collisioncapture/contracts';

export const DEFAULT_MAX_FILE_BYTES = 15 * 1024 * 1024;

export const DEFAULT_ACCEPTED_MIME_TYPES: CaptureUploadRequest['contentType'][] = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

export const DEFAULT_SHOTS: CaptureShotDefinition[] = [
  {
    id: 'overview',
    role: 'overview',
    evidenceRole: 'overview',
    label: 'Vehicle overview',
    prompt: 'Take the whole vehicle with the registration clear.',
    required: true,
    sequence: 10
  },
  {
    id: 'damage-closeup',
    role: 'damage_closeup',
    evidenceRole: 'damage_closeup',
    label: 'Main damage close-up',
    prompt: 'Fill the frame with the main damaged area.',
    required: true,
    sequence: 20
  },
  {
    id: 'damage-context',
    role: 'damage_context',
    evidenceRole: 'additional',
    label: 'Damage from further back',
    prompt: 'Step back so the panel and damage position are clear.',
    required: false,
    sequence: 30
  },
  {
    id: 'front-left',
    role: 'front_left',
    evidenceRole: 'additional',
    label: 'Front left corner',
    prompt: 'Capture the front left corner from waist height.',
    required: false,
    sequence: 40
  },
  {
    id: 'front-right',
    role: 'front_right',
    evidenceRole: 'additional',
    label: 'Front right corner',
    prompt: 'Capture the front right corner from waist height.',
    required: false,
    sequence: 50
  },
  {
    id: 'rear-left',
    role: 'rear_left',
    evidenceRole: 'additional',
    label: 'Rear left corner',
    prompt: 'Capture the rear left corner from waist height.',
    required: false,
    sequence: 60
  },
  {
    id: 'rear-right',
    role: 'rear_right',
    evidenceRole: 'additional',
    label: 'Rear right corner',
    prompt: 'Capture the rear right corner from waist height.',
    required: false,
    sequence: 70
  },
  {
    id: 'vin',
    role: 'vin',
    evidenceRole: 'additional',
    label: 'VIN',
    prompt: 'Take the VIN plate or windscreen VIN if it is easy to reach.',
    required: false,
    sequence: 80
  },
  {
    id: 'odometer',
    role: 'odometer',
    evidenceRole: 'additional',
    label: 'Odometer',
    prompt: 'Take the dashboard mileage with the numbers readable.',
    required: false,
    sequence: 90
  },
  {
    id: 'additional',
    role: 'additional',
    evidenceRole: 'additional',
    label: 'Anything else',
    prompt: 'Add any other useful damage, interior, or context photo.',
    required: false,
    sequence: 100
  }
];

export function emptyProgress(shots: readonly CaptureShotDefinition[]): CaptureShotProgress[] {
  return shots.map((shot) => ({
    shotId: shot.id,
    status: 'empty'
  }));
}

export function orderedShots(shots: readonly CaptureShotDefinition[]): CaptureShotDefinition[] {
  return [...shots].sort((a, b) => a.sequence - b.sequence);
}

export function progressByShot(
  progress: readonly CaptureShotProgress[]
): Map<string, CaptureShotProgress> {
  return new Map(progress.map((item) => [item.shotId, item]));
}

export function requiredShotsComplete(manifest: CaptureSessionManifest): boolean {
  const byShot = progressByShot(manifest.progress);
  return manifest.shots
    .filter((shot) => shot.required)
    .every((shot) => isSubmittableProgress(byShot.get(shot.id)));
}

export function isSubmittableProgress(progress: CaptureShotProgress | undefined): boolean {
  return progress?.status === 'accepted' || progress?.status === 'pending_review';
}

export function completionCounts(manifest: CaptureSessionManifest): {
  requiredDone: number;
  requiredTotal: number;
  totalDone: number;
  total: number;
} {
  const byShot = progressByShot(manifest.progress);
  const required = manifest.shots.filter((shot) => shot.required);
  const isUploaded = (shot: CaptureShotDefinition): boolean =>
    isSubmittableProgress(byShot.get(shot.id));

  return {
    requiredDone: required.filter(isUploaded).length,
    requiredTotal: required.length,
    totalDone: manifest.shots.filter(isUploaded).length,
    total: manifest.shots.length
  };
}
