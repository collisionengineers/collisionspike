import { describe, expect, it } from 'vitest';
import {
  APP_SHELL_LAYOUT,
  COMPACT_NAV_MEDIA_QUERY,
  appShellLayoutForWidth,
} from './app-shell-layout';

describe('AppShell responsive layout contract', () => {
  it('keeps the full navigation rail at desktop and 1024px', () => {
    expect(appShellLayoutForWidth(1440)).toMatchObject({ compact: false, railWidth: 240 });
    expect(appShellLayoutForWidth(1024)).toMatchObject({ compact: false, railWidth: 240 });
  });

  it('uses the compact rail at tablet and narrow mobile widths', () => {
    expect(COMPACT_NAV_MEDIA_QUERY).toBe('(max-width: 800px)');
    expect(appShellLayoutForWidth(800)).toMatchObject({ compact: true, railWidth: 60 });
    expect(appShellLayoutForWidth(768)).toMatchObject({ compact: true, railWidth: 60 });
    expect(appShellLayoutForWidth(390)).toEqual({
      compact: true,
      railWidth: 60,
      contentPadding: 16,
      usableContentWidth: 298,
    });
  });

  it('switches to compact geometry when 1024px is viewed at 200% zoom', () => {
    const cssViewportWidth = 1024 / 2;
    expect(appShellLayoutForWidth(cssViewportWidth)).toMatchObject({
      compact: true,
      railWidth: APP_SHELL_LAYOUT.compactRailWidth,
      usableContentWidth: 420,
    });
  });
});
