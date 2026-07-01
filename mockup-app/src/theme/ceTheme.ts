import { createLightTheme, type Theme } from '@fluentui/react-components';
import { ceBrandRamp } from './ceBrandRamp';

/**
 * The Collision Engineers Fluent UI v9 light theme.
 *
 * Starts from `createLightTheme(ceBrandRamp)` then overrides neutrals, focus
 * stroke and the corner radii to match the CE design system:
 *   - warm-charcoal / near-black foreground, warm-grey secondary text
 *   - white ground, #f5f4f2 secondary ground, #e6e4e1 hairline strokes
 *   - CE-red focus stroke (rgba(219,8,22,.38))
 *   - 2px radii everywhere (Fluent's circular 999px is kept for pills/avatars)
 *
 * Use the standard Fluent `tokens.*` everywhere — they resolve to these values.
 */
export const ceTheme: Theme = {
  ...createLightTheme(ceBrandRamp),

  // Neutral foregrounds (CE ink / warm charcoal / warm grey)
  colorNeutralForeground1: '#16191d',
  colorNeutralForeground2: '#2c2a27',
  colorNeutralForeground3: '#6b6b6b',

  // Neutral grounds
  colorNeutralBackground1: '#ffffff',
  colorNeutralBackground2: '#f5f4f2',

  // Hairline strokes
  colorNeutralStroke1: '#e6e4e1',
  colorNeutralStroke2: '#e6e4e1',

  // CE-red keyboard focus halo. Fluent draws this as a 2px stroke on its own
  // focus indicator (Tabs, Dropdowns, Dialog buttons, SearchBox, the Case/PO
  // Input, etc.); a fuller alpha keeps it clearly visible against AA.
  colorStrokeFocus2: '#db0816',

  // Links are quiet ink, not brand red (reforge 2026-07-01): with the CE ramp,
  // Fluent's <Link> defaults render red text, which falsely signals severity in
  // a red-budgeted UI. Rest = charcoal; hover/pressed/selected darken to ink
  // (Fluent's own hover underline carries the affordance).
  colorBrandForegroundLink: '#2c2a27',
  colorBrandForegroundLinkHover: '#16191d',
  colorBrandForegroundLinkPressed: '#16191d',
  colorBrandForegroundLinkSelected: '#16191d',

  // 2px radii everywhere (keep circular)
  borderRadiusSmall: '2px',
  borderRadiusMedium: '2px',
  borderRadiusLarge: '2px',
  borderRadiusXLarge: '2px',
};
