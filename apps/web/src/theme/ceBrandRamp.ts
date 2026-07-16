import type { BrandVariants } from '@fluentui/react-components';

/**
 * Collision Engineers brand ramp for Fluent UI v9.
 *
 * A 16-step BrandVariants (keys 10..160). Fluent maps the *filled primary*
 * accent to brand[80] and the *pressed* state to brand[70]/brand[60], so the
 * ramp is anchored:
 *   - brand[80]  = #db0816  (CE WEB red — the filled primary; this is a screen UI)
 *   - brand[70]  = #b5111f  (hover-dark)
 *   - brand[60]  = #8f1422  (pressed — aligns to --ce-red-dark)
 * The light end (10..40) tints toward #fff4f5 (the faint red wash) so selected
 * / tinted surfaces read as a soft CE-red blush rather than Fluent's default
 * blue-violet. The dark end deepens toward near-black maroon.
 *
 * NOTE: these are screen tokens. The PRINT brand red is deliberately NOT used
 * anywhere under apps/web/src (guarded by theme/contrast.test.ts; the hex
 * itself lives only in docs/design/THEME-MAPPING.md).
 */
export const ceBrandRamp: BrandVariants = {
  10: '#1f0204',
  20: '#330509',
  30: '#4d070d',
  40: '#660a12',
  50: '#7a0f1a',
  60: '#8f1422', // pressed  (≈ --ce-red-dark)
  70: '#b5111f', // hover-dark
  80: '#db0816', // FILLED PRIMARY — CE web red
  90: '#e63340',
  100: '#ed5660',
  110: '#f37882',
  120: '#f898a0',
  130: '#fcb6bc',
  140: '#fdd2d6',
  150: '#fee7ea',
  160: '#fff4f5', // faint red wash / light tint end
};
