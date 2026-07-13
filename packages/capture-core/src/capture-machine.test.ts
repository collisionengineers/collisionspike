import { describe, expect, it } from 'vitest';
import {
  canSubmitCapture,
  CaptureTransitionError,
  createCaptureMachine,
  isCaptureSessionClosed,
  reduceCaptureMachine,
  selectedAttempt,
  type CaptureMachineEvent,
  type CaptureMachineState,
  type CaptureSessionClosure,
  type CaptureShotSeed,
  type CaptureShotState
} from './capture-machine';

const REQUIRED_SHOTS: readonly CaptureShotSeed[] = [
  { shotId: 'overview', required: true },
  { shotId: 'damage-closeup', required: true },
  { shotId: 'additional', required: false }
];

function loadReady(shots: readonly CaptureShotSeed[] = REQUIRED_SHOTS): CaptureMachineState {
  return transition(createCaptureMachine(), [
    { type: 'bootstrap.requested' },
    { type: 'session.loaded', sessionId: 'session-1', shots }
  ]);
}

function transition(
  initial: CaptureMachineState,
  events: readonly CaptureMachineEvent[]
): CaptureMachineState {
  return events.reduce(reduceCaptureMachine, initial);
}

function shot(state: CaptureMachineState, shotId: string): CaptureShotState {
  const result = state.shots.find((candidate) => candidate.shotId === shotId);
  if (!result) throw new Error(`Missing shot: ${shotId}`);
  return result;
}

function addDraft(
  state: CaptureMachineState,
  shotId: string,
  attemptId = `${shotId}-attempt-1`
): CaptureMachineState {
  return reduceCaptureMachine(state, {
    type: 'draft.created',
    shotId,
    attemptId,
    localDraftId: `${attemptId}-draft`
  });
}

function resolveAttempt(
  state: CaptureMachineState,
  attemptId: string,
  outcome: 'accepted' | 'pending_review' = 'accepted'
): CaptureMachineState {
  return transition(state, [
    { type: 'attempt.queued', attemptId },
    { type: 'upload.started', attemptId, uploadId: `${attemptId}-upload` },
    { type: 'upload.completed', attemptId },
    { type: 'validation.resolved', attemptId, outcome }
  ]);
}

describe('capture session bootstrap', () => {
  it('moves from bootstrap through loading to a ready session', () => {
    const bootstrap = createCaptureMachine();
    expect(bootstrap).toEqual({
      phase: 'bootstrap',
      sessionId: null,
      shots: [],
      submitFailure: null
    });

    const loading = reduceCaptureMachine(bootstrap, { type: 'bootstrap.requested' });
    const ready = reduceCaptureMachine(loading, {
      type: 'session.loaded',
      sessionId: 'session-1',
      shots: REQUIRED_SHOTS
    });

    expect(loading.phase).toBe('loading');
    expect(ready.phase).toBe('ready');
    expect(ready.sessionId).toBe('session-1');
    expect(ready.shots.map(({ shotId, required }) => ({ shotId, required }))).toEqual(
      REQUIRED_SHOTS
    );
  });

  it('hydrates a selected local draft for resume', () => {
    const ready = loadReady([
      {
        shotId: 'overview',
        required: true,
        selectedAttemptId: 'attempt-1',
        attempts: [
          {
            id: 'attempt-1',
            status: 'local_draft',
            localDraftId: 'draft-from-indexeddb'
          }
        ]
      }
    ]);

    expect(selectedAttempt(ready.shots[0]!)).toEqual({
      id: 'attempt-1',
      status: 'local_draft',
      localDraftId: 'draft-from-indexeddb',
      uploadId: null,
      failure: null
    });
  });

  it('rejects inconsistent hydrated state', () => {
    expect(() =>
      loadReady([
        {
          shotId: 'overview',
          required: true,
          selectedAttemptId: 'missing-attempt'
        }
      ])
    ).toThrow(CaptureTransitionError);

    expect(() =>
      loadReady([
        { shotId: 'overview', required: true },
        { shotId: 'overview', required: false }
      ])
    ).toThrow('Duplicate shotId');

    expect(() =>
      loadReady([
        {
          shotId: 'overview',
          required: true,
          attempts: [{ id: 'duplicate', status: 'accepted' }]
        },
        {
          shotId: 'damage-closeup',
          required: true,
          attempts: [{ id: 'duplicate', status: 'accepted' }]
        }
      ])
    ).toThrow('Duplicate attemptId');
  });
});

describe('capture attempt lifecycle', () => {
  it('advances a local draft through queue, upload, validation, and acceptance', () => {
    const ready = addDraft(loadReady(), 'overview', 'attempt-1');
    const draftBeforeTransition = selectedAttempt(shot(ready, 'overview'))!;

    const queued = reduceCaptureMachine(ready, {
      type: 'attempt.queued',
      attemptId: 'attempt-1'
    });
    const uploading = reduceCaptureMachine(queued, {
      type: 'upload.started',
      attemptId: 'attempt-1',
      uploadId: 'upload-1'
    });
    const validating = reduceCaptureMachine(uploading, {
      type: 'upload.completed',
      attemptId: 'attempt-1'
    });
    const accepted = reduceCaptureMachine(validating, {
      type: 'validation.resolved',
      attemptId: 'attempt-1',
      outcome: 'accepted'
    });

    expect(draftBeforeTransition.status).toBe('local_draft');
    expect(selectedAttempt(shot(queued, 'overview'))?.status).toBe('queued');
    expect(selectedAttempt(shot(uploading, 'overview'))).toMatchObject({
      status: 'uploading',
      uploadId: 'upload-1'
    });
    expect(selectedAttempt(shot(validating, 'overview'))?.status).toBe('validating');
    expect(selectedAttempt(shot(accepted, 'overview'))).toMatchObject({
      status: 'accepted',
      failure: null
    });
  });

  it('records an advisory validation result as pending review', () => {
    const ready = addDraft(loadReady(), 'overview', 'attempt-1');
    const pending = resolveAttempt(ready, 'attempt-1', 'pending_review');

    expect(selectedAttempt(shot(pending, 'overview'))?.status).toBe('pending_review');
  });

  it('moves operational failures to retryable and can queue the same attempt again', () => {
    const uploading = transition(addDraft(loadReady(), 'overview', 'attempt-1'), [
      { type: 'attempt.queued', attemptId: 'attempt-1' },
      { type: 'upload.started', attemptId: 'attempt-1', uploadId: 'upload-1' }
    ]);
    const retryable = reduceCaptureMachine(uploading, {
      type: 'attempt.failed',
      attemptId: 'attempt-1',
      disposition: 'retryable',
      failure: { code: 'network', message: 'Connection lost.' }
    });
    const queuedAgain = reduceCaptureMachine(retryable, {
      type: 'attempt.queued',
      attemptId: 'attempt-1'
    });

    expect(selectedAttempt(shot(retryable, 'overview'))).toMatchObject({
      status: 'retryable',
      uploadId: 'upload-1',
      failure: { code: 'network', message: 'Connection lost.' }
    });
    expect(selectedAttempt(shot(queuedAgain, 'overview'))).toMatchObject({
      status: 'queued',
      uploadId: null,
      failure: null
    });
  });

  it('makes a structural validation failure terminal until the user retakes', () => {
    const validating = transition(addDraft(loadReady(), 'overview', 'attempt-1'), [
      { type: 'attempt.queued', attemptId: 'attempt-1' },
      { type: 'upload.started', attemptId: 'attempt-1', uploadId: 'upload-1' },
      { type: 'upload.completed', attemptId: 'attempt-1' }
    ]);
    const terminal = reduceCaptureMachine(validating, {
      type: 'attempt.failed',
      attemptId: 'attempt-1',
      disposition: 'terminal',
      failure: { code: 'invalid-image', message: 'Take this photo again.' }
    });

    expect(selectedAttempt(shot(terminal, 'overview'))).toMatchObject({
      status: 'terminal',
      failure: { code: 'invalid-image' }
    });
    expect(() =>
      reduceCaptureMachine(terminal, {
        type: 'attempt.queued',
        attemptId: 'attempt-1'
      })
    ).toThrow('cannot transition from terminal');
  });

  it('rejects out-of-order and unknown attempt events', () => {
    const draft = addDraft(loadReady(), 'overview', 'attempt-1');

    expect(() =>
      reduceCaptureMachine(draft, {
        type: 'upload.completed',
        attemptId: 'attempt-1'
      })
    ).toThrow('cannot transition from local_draft');
    expect(() =>
      reduceCaptureMachine(draft, {
        type: 'attempt.queued',
        attemptId: 'missing'
      })
    ).toThrow('Unknown attemptId');
  });
});

describe('retakes and supersession', () => {
  it('supersedes the selected attempt and preserves attempt history', () => {
    const accepted = resolveAttempt(
      addDraft(loadReady(), 'overview', 'attempt-1'),
      'attempt-1'
    );
    const retaken = reduceCaptureMachine(accepted, {
      type: 'retake.requested',
      shotId: 'overview',
      attemptId: 'attempt-2',
      localDraftId: 'draft-2'
    });

    expect(shot(retaken, 'overview')).toMatchObject({
      selectedAttemptId: 'attempt-2',
      attempts: [
        { id: 'attempt-1', status: 'superseded' },
        { id: 'attempt-2', status: 'local_draft', localDraftId: 'draft-2' }
      ]
    });
  });

  it('ignores a late response from an in-flight superseded attempt', () => {
    const uploading = transition(addDraft(loadReady(), 'overview', 'attempt-1'), [
      { type: 'attempt.queued', attemptId: 'attempt-1' },
      { type: 'upload.started', attemptId: 'attempt-1', uploadId: 'upload-1' }
    ]);
    const retaken = reduceCaptureMachine(uploading, {
      type: 'retake.requested',
      shotId: 'overview',
      attemptId: 'attempt-2',
      localDraftId: 'draft-2'
    });
    const afterLateCompletion = reduceCaptureMachine(retaken, {
      type: 'upload.completed',
      attemptId: 'attempt-1'
    });

    expect(afterLateCompletion).toBe(retaken);
    expect(shot(afterLateCompletion, 'overview').selectedAttemptId).toBe('attempt-2');
    expect(shot(afterLateCompletion, 'overview').attempts[0]?.status).toBe('superseded');
  });

  it('requires an initial draft before retake and unique attempt identifiers', () => {
    const ready = loadReady();
    expect(() =>
      reduceCaptureMachine(ready, {
        type: 'retake.requested',
        shotId: 'overview',
        attemptId: 'attempt-1',
        localDraftId: 'draft-1'
      })
    ).toThrow('has no selected attempt');

    const withDraft = addDraft(ready, 'overview', 'attempt-1');
    expect(() =>
      reduceCaptureMachine(withDraft, {
        type: 'retake.requested',
        shotId: 'overview',
        attemptId: 'attempt-1',
        localDraftId: 'draft-2'
      })
    ).toThrow('Duplicate attemptId');
  });
});

describe('submission', () => {
  function requiredResolved(): CaptureMachineState {
    let state = loadReady();
    state = resolveAttempt(addDraft(state, 'overview', 'overview-1'), 'overview-1');
    state = resolveAttempt(
      addDraft(state, 'damage-closeup', 'damage-1'),
      'damage-1',
      'pending_review'
    );
    return state;
  }

  it('requires every required shot to be accepted or pending review', () => {
    const onlyOverview = resolveAttempt(
      addDraft(loadReady(), 'overview', 'overview-1'),
      'overview-1'
    );

    expect(canSubmitCapture(onlyOverview)).toBe(false);
    expect(() =>
      reduceCaptureMachine(onlyOverview, { type: 'submit.requested' })
    ).toThrow('Capture cannot be submitted');
    expect(canSubmitCapture(requiredResolved())).toBe(true);
  });

  it('waits for an active optional attempt but does not require a failed optional shot', () => {
    const required = requiredResolved();
    const optionalDraft = addDraft(required, 'additional', 'additional-1');
    expect(canSubmitCapture(optionalDraft)).toBe(false);

    const optionalQueued = reduceCaptureMachine(optionalDraft, {
      type: 'attempt.queued',
      attemptId: 'additional-1'
    });
    const optionalFailed = reduceCaptureMachine(optionalQueued, {
      type: 'attempt.failed',
      attemptId: 'additional-1',
      disposition: 'retryable',
      failure: { code: 'offline', message: 'Try again when online.' }
    });

    expect(canSubmitCapture(optionalFailed)).toBe(true);
  });

  it('submits, reports a retryable submit failure, and completes after retry', () => {
    const ready = requiredResolved();
    const submitting = reduceCaptureMachine(ready, { type: 'submit.requested' });
    const failed = reduceCaptureMachine(submitting, {
      type: 'submit.failed',
      failure: { code: 'timeout', message: 'Submission timed out.' }
    });
    const resubmitting = reduceCaptureMachine(failed, { type: 'submit.requested' });
    const complete = reduceCaptureMachine(resubmitting, { type: 'submit.accepted' });

    expect(submitting.phase).toBe('submitting');
    expect(canSubmitCapture(submitting)).toBe(false);
    expect(failed).toMatchObject({
      phase: 'ready',
      submitFailure: { code: 'timeout', message: 'Submission timed out.' }
    });
    expect(complete.phase).toBe('complete');
    expect(complete.submitFailure).toBeNull();
    expect(isCaptureSessionClosed(complete)).toBe(true);
  });
});

describe('server-closed sessions', () => {
  it.each<CaptureSessionClosure>(['expired', 'revoked', 'locked', 'complete'])(
    'renders %s as a distinct closed phase while loading',
    (reason) => {
      const loading = reduceCaptureMachine(createCaptureMachine(), {
        type: 'bootstrap.requested'
      });
      const closed = reduceCaptureMachine(loading, { type: 'session.closed', reason });

      expect(closed.phase).toBe(reason);
      expect(isCaptureSessionClosed(closed)).toBe(true);
    }
  );

  it('can close a ready or submitting session when server state changes', () => {
    const revoked = reduceCaptureMachine(loadReady(), {
      type: 'session.closed',
      reason: 'revoked'
    });
    expect(revoked.phase).toBe('revoked');

    const readyToSubmit = loadReady([
      {
        shotId: 'overview',
        required: true,
        selectedAttemptId: 'accepted-1',
        attempts: [{ id: 'accepted-1', status: 'accepted' }]
      }
    ]);
    const submitting = reduceCaptureMachine(readyToSubmit, { type: 'submit.requested' });
    const locked = reduceCaptureMachine(submitting, {
      type: 'session.closed',
      reason: 'locked'
    });
    expect(locked.phase).toBe('locked');
  });

  it('rejects capture changes after the session is closed', () => {
    const expired = reduceCaptureMachine(loadReady(), {
      type: 'session.closed',
      reason: 'expired'
    });

    expect(() =>
      reduceCaptureMachine(expired, {
        type: 'draft.created',
        shotId: 'overview',
        attemptId: 'attempt-1',
        localDraftId: 'draft-1'
      })
    ).toThrow('not valid while expired');
    expect(() =>
      reduceCaptureMachine(expired, {
        type: 'session.closed',
        reason: 'revoked'
      })
    ).toThrow('cannot close while expired');
  });
});
