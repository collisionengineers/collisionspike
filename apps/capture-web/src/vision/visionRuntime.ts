/*
 * VisionRuntime seam — the boundary the on-device ML plugs into (see ml/).
 *
 * This file is DELIBERATELY inert: it defines the interface, the content-addressed
 * model-manifest type, and a NullVisionRuntime that reports "unavailable". The real
 * ONNX-Runtime-Web implementation (YOLO11n detector + RepViT-M1.1 viewpoint
 * classifier) lands in the P1 "shadow" phase alongside the first trained model, so
 * the live PWA ships no ML runtime weight and the deterministic guidance path is
 * untouched until then.
 */

/** The ten viewpoint classes from the ml/ label schema. */
export type ViewpointLabel =
  | 'front'
  | 'rear'
  | 'left_side'
  | 'right_side'
  | 'front_left_3q'
  | 'front_right_3q'
  | 'rear_left_3q'
  | 'rear_right_3q'
  | 'close_up'
  | 'unknown';

export interface VehicleDetection {
  present: boolean;
  /** 0..1 */
  confidence: number;
  /** Normalised 0..1 within the analysed frame. */
  bbox?: { x: number; y: number; width: number; height: number };
  truncated?: boolean;
  count?: number;
}

export interface ViewpointPrediction {
  label: ViewpointLabel;
  /** 0..1 */
  confidence: number;
}

export interface VisionObservation {
  /** false whenever no model/runtime is loaded — callers must tolerate this. */
  available: boolean;
  detection?: VehicleDetection;
  viewpoint?: ViewpointPrediction;
  modelVersion?: string;
  inferenceMs?: number;
}

/** Content-addressed manifest the server pins per capture session (see ml/export/manifest). */
export interface VisionModelManifest {
  modelSha256: string;
  modelVersion: string;
  rulesVersion: string;
  labels: ViewpointLabel[];
  preprocessingVersion: string;
}

export interface VisionRuntime {
  readonly available: boolean;
  /** Analyse the latest frame only; must be safe to call at an adaptive 5–10 Hz. */
  analyze(frame: ImageData): Promise<VisionObservation>;
  dispose(): void;
}

/** Default runtime until an on-device model is shipped: always "unavailable". */
export class NullVisionRuntime implements VisionRuntime {
  readonly available = false;

  async analyze(_frame: ImageData): Promise<VisionObservation> {
    return { available: false };
  }

  dispose(): void {
    // no-op
  }
}

/**
 * Resolve the active vision runtime. Until a content-addressed model manifest AND
 * an ONNX-Runtime-Web backend are wired (P1), this always returns the
 * NullVisionRuntime — keeping the deterministic path authoritative and shipping no
 * ML runtime into the bundle.
 */
export function resolveVisionRuntime(_manifest?: VisionModelManifest): VisionRuntime {
  return new NullVisionRuntime();
}

/** Narrow an untrusted value to a VisionModelManifest before trusting a pinned model. */
export function isVisionModelManifest(value: unknown): value is VisionModelManifest {
  if (typeof value !== 'object' || value === null) return false;
  const manifest = value as Record<string, unknown>;
  return (
    typeof manifest.modelSha256 === 'string' &&
    /^[0-9a-f]{64}$/u.test(manifest.modelSha256) &&
    typeof manifest.modelVersion === 'string' &&
    typeof manifest.rulesVersion === 'string' &&
    typeof manifest.preprocessingVersion === 'string' &&
    Array.isArray(manifest.labels) &&
    manifest.labels.every((label) => typeof label === 'string')
  );
}
