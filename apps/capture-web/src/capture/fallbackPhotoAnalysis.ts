import {
  analyseFrameQuality,
  evaluateFrameQuality,
  type FrameQualityEvaluation,
  type FrameQualitySignals
} from '@collisioncapture/core';

const ANALYSIS_WIDTH = 160;

export interface FallbackPhotoAnalysis {
  signals: FrameQualitySignals;
  evaluation: FrameQualityEvaluation;
}

/**
 * Analyse the decoded pixels shown in the fallback preview.
 *
 * A still image has no preceding frame, so motion is deliberately fixed to
 * zero. These deterministic heuristics measure only exposure, contrast and
 * sharpness; they do not recognise a vehicle, viewpoint, part or damage.
 */
export function analyseFallbackPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): FallbackPhotoAnalysis {
  const analysed = analyseFrameQuality(rgba, width, height);
  const signals: FrameQualitySignals = {
    ...analysed.signals,
    motion: 0
  };
  return {
    signals,
    evaluation: evaluateFrameQuality(signals)
  };
}

/** Downsample a decoded browser image before reading its pixels. */
export function analyseDecodedFallbackPhoto(image: HTMLImageElement): FallbackPhotoAnalysis {
  if (image.naturalWidth < 1 || image.naturalHeight < 1) {
    throw new Error('The selected photo could not be decoded.');
  }

  const scale = Math.min(1, ANALYSIS_WIDTH / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Photo analysis is unavailable.');

  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  return analyseFallbackPixels(pixels.data, width, height);
}
