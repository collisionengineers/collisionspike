/** Responsive measurements shared by AppShell and its layout contract tests. */
export const APP_SHELL_LAYOUT = Object.freeze({
  wideRailWidth: 240,
  compactRailWidth: 60,
  topbarHeight: 56,
  compactMaxWidth: 800,
  wideContentPadding: 32,
  compactContentPadding: 16,
});

export interface AppShellViewportLayout {
  compact: boolean;
  railWidth: number;
  contentPadding: number;
  usableContentWidth: number;
}

/**
 * Returns the default shell geometry for a CSS viewport. The expanded compact
 * rail is deliberately an overlay, so it never reduces usable content width.
 */
export function appShellLayoutForWidth(viewportWidth: number): AppShellViewportLayout {
  const width = Math.max(0, viewportWidth);
  const compact = width <= APP_SHELL_LAYOUT.compactMaxWidth;
  const railWidth = compact
    ? APP_SHELL_LAYOUT.compactRailWidth
    : APP_SHELL_LAYOUT.wideRailWidth;
  const contentPadding = compact
    ? APP_SHELL_LAYOUT.compactContentPadding
    : APP_SHELL_LAYOUT.wideContentPadding;

  return {
    compact,
    railWidth,
    contentPadding,
    usableContentWidth: Math.max(0, width - railWidth - 2 * contentPadding),
  };
}

export const COMPACT_NAV_MEDIA_QUERY = `(max-width: ${APP_SHELL_LAYOUT.compactMaxWidth}px)`;
