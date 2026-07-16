import test from 'node:test';
import assert from 'node:assert/strict';
import { scanText, validateAllowlist } from './check-repository-data-authority.mjs';

test('rejects direct and paraphrased PII-only raw-data prohibitions', () => {
  assert.equal(scanText('fixture.md', 'Bytes are never sent to the model.').length, 1);
  assert.equal(scanText('fixture.md', 'Client data must not be sent as raw images.').length, 1);
});

test('allows the canonical authority and retained security boundaries', () => {
  assert.equal(scanText('fixture.md', 'Raw image bytes may be sent to the configured project multimodal assistant.').length, 0);
  assert.equal(scanText('fixture.md', 'Secrets must not be disclosed to an unapproved service.').length, 0);
});

test('rejects stale and overbroad allowlist entries', () => {
  const files = new Map([['fixture.md', 'current line']]);
  assert.match(validateAllowlist([{ file: 'fixture.md', line: 1, text: '.*', reason: 'x', authority: 'TKT-199' }], files)[0], /literal/);
  assert.match(validateAllowlist([{ file: 'fixture.md', line: 1, text: 'old line', reason: 'x', authority: 'TKT-199' }], files)[0], /stale/);
});
