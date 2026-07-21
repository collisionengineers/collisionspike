/** *
 * TKT-298 acceptance under test: the shadow enqueue fires exactly once per REAL
 * eva_submitted transition while the gate is on, never fires otherwise, and a transport
 * failure is swallowed into a warn (the staff response must be byte-identical either way).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ enqueueQueueMessage: vi.fn() }));
vi.mock('../inbound/outlook-queue.js', () => ({
  enqueueQueueMessage: transport.enqueueQueueMessage,
}));

const gateState = vi.hoisted(() => ({ shadowOn: false, serviceUrl: '' }));
vi.mock('../settings/gates.js', () => ({
  gates: {
    evaShadowAutosubmit: () => gateState.shadowOn,
    evidenceBackfillQueueServiceUrl: () => gateState.serviceUrl,
  },
}));

import {
  EVA_SHADOW_SUBMIT_QUEUE_NAME,
  enqueueEvaShadowSubmit,
  maybeEnqueueEvaShadowSubmit,
} from './eva-shadow-queue.js';

beforeEach(() => {
  transport.enqueueQueueMessage.mockReset().mockResolvedValue(undefined);
  gateState.shadowOn = false;
  gateState.serviceUrl = 'https://cespkorchstdev01.queue.core.windows.net';
});

describe('maybeEnqueueEvaShadowSubmit — the markEvaSubmitted seam', () => {
  it('does nothing while the gate is off, even on a real transition', async () => {
    const warn = vi.fn();
    await maybeEnqueueEvaShadowSubmit(true, 'case-1', warn);
    expect(transport.enqueueQueueMessage).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does nothing on an idempotent no-op transition (updated=false), even with the gate on', async () => {
    gateState.shadowOn = true;
    await maybeEnqueueEvaShadowSubmit(false, 'case-1', vi.fn());
    expect(transport.enqueueQueueMessage).not.toHaveBeenCalled();
  });

  it('enqueues exactly one job on a real transition with the gate on', async () => {
    gateState.shadowOn = true;
    await maybeEnqueueEvaShadowSubmit(true, 'case-42', vi.fn());
    expect(transport.enqueueQueueMessage).toHaveBeenCalledTimes(1);
    expect(transport.enqueueQueueMessage).toHaveBeenCalledWith(
      gateState.serviceUrl,
      EVA_SHADOW_SUBMIT_QUEUE_NAME,
      { caseId: 'case-42' },
    );
  });

  it('swallows a transport failure into a warn — never throws', async () => {
    gateState.shadowOn = true;
    transport.enqueueQueueMessage.mockRejectedValue(new Error('eva-shadow-submit enqueue → 403: denied'));
    const warn = vi.fn();
    await expect(maybeEnqueueEvaShadowSubmit(true, 'case-9', warn)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('case-9');
  });

  it('swallows a missing queue-service-URL config the same way', async () => {
    gateState.shadowOn = true;
    gateState.serviceUrl = '';
    const warn = vi.fn();
    await maybeEnqueueEvaShadowSubmit(true, 'case-9', warn);
    expect(transport.enqueueQueueMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('enqueueEvaShadowSubmit — the throwing transport contract', () => {
  it('throws when the queue service URL is not configured', async () => {
    gateState.serviceUrl = '';
    await expect(enqueueEvaShadowSubmit({ caseId: 'c' })).rejects.toThrow(/not configured/);
  });
});
