/**
 * capture-observations.ts — the guided-capture photo-quality observation contract.
 *
 * Validates the client-reported capture observation (route/disposition/issue/signals) against
 * the session's pinned rules version, shapes the advisory per-shot guidance profile exposed on
 * the manifest, and builds the server's structural-validation fingerprint. These are the pure
 * validation/serialisation rules shared by the upload-intent and completion routes; they never
 * touch storage or the database.
 */

import { CaptureProblem } from './capture-http.js';
import { MAX_UPLOAD_BYTES } from '../evidence/upload-validate.js';

const MAX_CLIENT_OBSERVATION_BYTES = 1024;
const MAX_STABLE_FRAMES = 120;
const CAPTURE_SHOT_FRAMINGS = new Set([
  'whole_vehicle',
  'damage_closeup',
  'damage_context',
  'front_left',
  'front_right',
  'rear_left',
  'rear_right',
  'vin',
  'odometer',
  'additional',
]);
const CLIENT_CAPTURE_ROUTES = ['guided', 'os_fallback'] as const;
const CLIENT_CAPTURE_DISPOSITIONS = ['ready', 'take_anyway', 'unassessed'] as const;
const CLIENT_CAPTURE_ISSUES = [
  'too-dark',
  'too-bright',
  'camera-moving',
  'not-sharp',
  'low-contrast',
] as const;

export type ClientCaptureRoute = typeof CLIENT_CAPTURE_ROUTES[number];
export type ClientCaptureDisposition = typeof CLIENT_CAPTURE_DISPOSITIONS[number];
export type ClientCaptureIssue = typeof CLIENT_CAPTURE_ISSUES[number];

export interface ClientCaptureSignals {
  brightness: number;
  contrast: number;
  sharpness: number;
  motion: number;
}

export interface ClientCaptureObservation {
  route: ClientCaptureRoute;
  disposition: ClientCaptureDisposition;
  issue?: ClientCaptureIssue;
  signals?: ClientCaptureSignals;
  stableFrames: number;
  rulesVersion: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function clientGuidanceProfile(
  raw: unknown,
): { guidanceProfile: { framing: string; registrationExpected?: boolean } } | Record<string, never> {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  if (!isRecord(value)) return {};
  const framing = value.framing;
  if (typeof framing !== 'string' || !CAPTURE_SHOT_FRAMINGS.has(framing)) return {};
  return {
    guidanceProfile: {
      framing,
      ...(typeof value.registrationExpected === 'boolean'
        ? { registrationExpected: value.registrationExpected }
        : {}),
    },
  };
}

export function normalizedClientCaptureObservation(
  raw: unknown,
  expectedRulesVersion: string,
): ClientCaptureObservation {
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
  }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_CLIENT_OBSERVATION_BYTES || !isRecord(raw)) {
    throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
  }
  if (!hasOnlyKeys(raw, ['route', 'disposition', 'issue', 'signals', 'stableFrames', 'rulesVersion'])) {
    throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
  }
  if (
    typeof raw.route !== 'string'
    || !CLIENT_CAPTURE_ROUTES.includes(raw.route as ClientCaptureRoute)
    || typeof raw.disposition !== 'string'
    || !CLIENT_CAPTURE_DISPOSITIONS.includes(raw.disposition as ClientCaptureDisposition)
    || typeof raw.stableFrames !== 'number'
    || !Number.isInteger(raw.stableFrames)
    || raw.stableFrames < 0
    || raw.stableFrames > MAX_STABLE_FRAMES
    || typeof raw.rulesVersion !== 'string'
    || raw.rulesVersion.length < 1
    || raw.rulesVersion.length > 64
    || raw.rulesVersion !== expectedRulesVersion
  ) {
    throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
  }

  let issue: ClientCaptureIssue | undefined;
  if (raw.issue !== undefined) {
    if (typeof raw.issue !== 'string' || !CLIENT_CAPTURE_ISSUES.includes(raw.issue as ClientCaptureIssue)) {
      throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
    }
    issue = raw.issue as ClientCaptureIssue;
  }

  let signals: ClientCaptureSignals | undefined;
  if (raw.signals !== undefined) {
    if (!isRecord(raw.signals) || !hasOnlyKeys(raw.signals, ['brightness', 'contrast', 'sharpness', 'motion'])) {
      throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
    }
    const values = [
      raw.signals.brightness,
      raw.signals.contrast,
      raw.signals.sharpness,
      raw.signals.motion,
    ];
    if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
    }
    signals = {
      brightness: raw.signals.brightness as number,
      contrast: raw.signals.contrast as number,
      sharpness: raw.signals.sharpness as number,
      motion: raw.signals.motion as number,
    };
  }

  if (
    (raw.disposition === 'unassessed' && (issue !== undefined || signals !== undefined || raw.stableFrames !== 0))
    || (raw.disposition === 'ready' && (issue !== undefined || signals === undefined))
    || (raw.route === 'guided' && raw.disposition === 'ready' && raw.stableFrames < 1)
    || (issue !== undefined && signals === undefined)
  ) {
    throw new CaptureProblem(400, 'capture_validation', 'The photo guidance details are invalid.');
  }

  return {
    route: raw.route as ClientCaptureRoute,
    disposition: raw.disposition as ClientCaptureDisposition,
    ...(issue === undefined ? {} : { issue }),
    ...(signals === undefined ? {} : { signals }),
    stableFrames: raw.stableFrames,
    rulesVersion: raw.rulesVersion,
  };
}

export function storedClientObservationFingerprint(raw: unknown, rulesVersion: string): string | undefined {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
    return JSON.stringify(normalizedClientCaptureObservation(value, rulesVersion));
  } catch {
    return undefined;
  }
}

function boundedContentType(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase().split(';')[0]?.trim() ?? '';
  return normalized ? normalized.slice(0, 200) : undefined;
}

export function serverStructuralObservation(input: {
  result: 'blob_properties_mismatch' | 'structural_validation_failed' | 'passed';
  contentType?: unknown;
  sizeBytes?: number | null;
  propertiesMatch: boolean;
  hashMatches?: boolean;
  magicBytesValid?: boolean;
  decodable?: boolean;
  width?: number;
  height?: number;
}): string {
  return JSON.stringify({
    version: 'structural-v1',
    result: input.result,
    propertiesMatch: input.propertiesMatch,
    ...(boundedContentType(input.contentType) ? { contentType: boundedContentType(input.contentType) } : {}),
    ...(typeof input.sizeBytes === 'number' && Number.isFinite(input.sizeBytes)
      ? { sizeBytes: Math.max(0, Math.min(input.sizeBytes, MAX_UPLOAD_BYTES)) }
      : {}),
    ...(input.hashMatches === undefined ? {} : { hashMatches: input.hashMatches }),
    ...(input.magicBytesValid === undefined ? {} : { magicBytesValid: input.magicBytesValid }),
    ...(input.decodable === undefined ? {} : { decodable: input.decodable }),
    ...(input.width === undefined ? {} : { width: input.width }),
    ...(input.height === undefined ? {} : { height: input.height }),
  });
}
