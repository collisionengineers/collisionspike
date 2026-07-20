import type {
  FrameQualityEvaluation,
  FrameQualitySignals
} from '@collisioncapture/core';
import type { ClientCaptureObservation } from '@collisioncapture/contracts';

export type { ClientCaptureObservation } from '@collisioncapture/contracts';
export type ClientCaptureRoute = ClientCaptureObservation['route'];

interface AssessedObservationInput {
  route: ClientCaptureRoute;
  rulesVersion: string;
  evaluation: FrameQualityEvaluation;
  signals: FrameQualitySignals;
  stableFrames: number;
  ready: boolean;
}

export function unassessedObservation(
  route: ClientCaptureRoute,
  rulesVersion: string
): ClientCaptureObservation {
  return {
    route,
    disposition: 'unassessed',
    stableFrames: 0,
    rulesVersion
  };
}

export function assessedObservation({
  route,
  rulesVersion,
  evaluation,
  signals,
  stableFrames,
  ready
}: AssessedObservationInput): ClientCaptureObservation {
  const normalizedSignals = normalizeSignals(signals);
  const normalizedStableFrames = normalizeStableFrames(stableFrames);

  if (ready && evaluation.passing) {
    return {
      route,
      disposition: 'ready',
      signals: normalizedSignals,
      stableFrames: normalizedStableFrames,
      rulesVersion
    };
  }

  return {
    route,
    disposition: 'take_anyway',
    ...(evaluation.issue === null ? {} : { issue: evaluation.issue }),
    signals: normalizedSignals,
    stableFrames: normalizedStableFrames,
    rulesVersion
  };
}

export function cloneClientCaptureObservation(
  observation: ClientCaptureObservation
): ClientCaptureObservation {
  return {
    route: observation.route,
    disposition: observation.disposition,
    ...(observation.issue === undefined ? {} : { issue: observation.issue }),
    ...(observation.signals === undefined
      ? {}
      : { signals: { ...observation.signals } }),
    stableFrames: observation.stableFrames,
    rulesVersion: observation.rulesVersion
  };
}

function normalizeSignals(signals: FrameQualitySignals): FrameQualitySignals {
  return {
    brightness: normalizeUnit(signals.brightness),
    contrast: normalizeUnit(signals.contrast),
    sharpness: normalizeUnit(signals.sharpness),
    motion: normalizeUnit(signals.motion)
  };
}

function normalizeUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeStableFrames(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(120, Math.max(0, Math.trunc(value)));
}
