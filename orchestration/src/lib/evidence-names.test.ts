import { describe, it, expect } from 'vitest';
import { bodyInstructionFileName, messageFileToken, rawEmlFileName } from './evidence-names.js';

/* TKT-087: per-message evidence names — unique across messages, stable across
   replays of the same message (so a Box 409 only ever means "the SAME bytes
   were archived already", never a cross-email collision). */

describe('messageFileToken', () => {
  it('is deterministic for the same id (replay-stable)', () => {
    expect(messageFileToken('<abc@mail>')).toBe(messageFileToken('<abc@mail>'));
  });

  it('differs across different message ids (no cross-email collision)', () => {
    expect(messageFileToken('<abc@mail>')).not.toBe(messageFileToken('<def@mail>'));
  });

  it('is 8 lowercase hex chars (filesystem/Box-safe)', () => {
    expect(messageFileToken('anything')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('tolerates empty input without throwing', () => {
    expect(messageFileToken('')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('rawEmlFileName / bodyInstructionFileName', () => {
  it('keeps the .eml extension (classification keys on extension/content-type)', () => {
    expect(rawEmlFileName('<x@y>')).toMatch(/^message-[0-9a-f]{8}\.eml$/);
  });

  it('keeps the .txt extension for the body instruction', () => {
    expect(bodyInstructionFileName('<x@y>')).toMatch(/^email-body-[0-9a-f]{8}\.txt$/);
  });

  it('two different emails on one case can never collide in the Box folder', () => {
    expect(rawEmlFileName('<msg-1@p>')).not.toBe(rawEmlFileName('<msg-2@p>'));
    expect(bodyInstructionFileName('<msg-1@p>')).not.toBe(bodyInstructionFileName('<msg-2@p>'));
  });
});
