import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = [
  readFileSync(new URL('./case-detail.controller.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('./case-detail-main.tsx', import.meta.url), 'utf8'),
].join('\n');

describe('case-detail chaser working-copy contract', () => {
  it('feeds the composer the current image working copy used by readiness', () => {
    expect(source).toContain('const liveCase: Case = {');
    expect(source).toMatch(/<ChaserPanel\s+case=\{liveCase\}/);
    expect(source).not.toMatch(/<ChaserPanel\s+case=\{c\}/);
  });
});
