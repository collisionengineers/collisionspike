export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Return the media rectangle rendered by `object-fit: contain`. */
export function containedMediaRect(
  destinationWidth: number,
  destinationHeight: number,
  sourceWidth: number,
  sourceHeight: number
): Rect {
  for (const value of [destinationWidth, destinationHeight, sourceWidth, sourceHeight]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError('Media and destination dimensions must be positive numbers.');
    }
  }

  const scale = Math.min(destinationWidth / sourceWidth, destinationHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    x: (destinationWidth - width) / 2,
    y: (destinationHeight - height) / 2,
    width,
    height
  };
}

/** Inset a rectangle without changing its centre. */
export function insetRect(rect: Readonly<Rect>, fraction: number): Rect {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 0.5) {
    throw new RangeError('Inset fraction must be between zero and one half.');
  }

  const insetX = rect.width * fraction;
  const insetY = rect.height * fraction;

  return {
    x: rect.x + insetX,
    y: rect.y + insetY,
    width: rect.width - insetX * 2,
    height: rect.height - insetY * 2
  };
}
