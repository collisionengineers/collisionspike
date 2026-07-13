import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('./Inbox.tsx', import.meta.url)), 'utf8');

describe('inbox long-message preview contract', () => {
  it('uses a viewport-aware popover instead of an unbounded text tooltip', () => {
    expect(source).toContain('<Popover');
    expect(source).toContain('openOnHover');
    expect(source).toContain("position: 'after'");
    expect(source).toContain('aria-label="Preview email text"');
    expect(source).toContain('aria-label="Email text preview"');
    expect(source).not.toContain('<Tooltip content={e.bodyPreview}');
  });

  it('bounds both axes and scrolls long content inside the preview', () => {
    expect(source).toContain("width: 'min(420px, calc(100vw - 32px))'");
    expect(source).toContain("maxWidth: 'calc(100vw - 32px)'");
    expect(source).toContain("maxHeight: 'min(420px, calc(100vh - 64px))'");
    expect(source).toContain("overflowY: 'auto'");
    expect(source).toContain("overscrollBehavior: 'contain'");
  });
});
