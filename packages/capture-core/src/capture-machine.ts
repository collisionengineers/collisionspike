/**
 * Pure state machine for a public guided-capture session.
 *
 * Session availability and per-photo attempt progress are intentionally
 * separate. A session can be ready while different shots are at different
 * upload stages, and a retake can supersede an in-flight attempt without a
 * late response selecting it again.
 */

export type CaptureSessionPhase =
  | 'bootstrap'
  | 'loading'
  | 'ready'
  | 'submitting'
  | 'complete'
  | 'expired'
  | 'revoked'
  | 'locked';

export type CaptureAttemptStatus =
  | 'local_draft'
  | 'queued'
  | 'uploading'
  | 'validating'
  | 'accepted'
  | 'pending_review'
  | 'retryable'
  | 'terminal'
  | 'superseded';

export type CaptureSessionClosure = 'complete' | 'expired' | 'revoked' | 'locked';
export type CaptureValidationOutcome = 'accepted' | 'pending_review';
export type CaptureFailureDisposition = 'retryable' | 'terminal';

export interface CaptureFailure {
  readonly code: string;
  readonly message: string;
}

export interface CaptureAttemptState {
  readonly id: string;
  readonly status: CaptureAttemptStatus;
  readonly localDraftId: string | null;
  readonly uploadId: string | null;
  readonly failure: CaptureFailure | null;
}

export interface CaptureAttemptSeed {
  readonly id: string;
  readonly status: CaptureAttemptStatus;
  readonly localDraftId?: string;
  readonly uploadId?: string;
  readonly failure?: CaptureFailure;
}

export interface CaptureShotState {
  readonly shotId: string;
  readonly required: boolean;
  readonly selectedAttemptId: string | null;
  readonly attempts: readonly CaptureAttemptState[];
}

export interface CaptureShotSeed {
  readonly shotId: string;
  readonly required: boolean;
  readonly selectedAttemptId?: string;
  readonly attempts?: readonly CaptureAttemptSeed[];
}

export interface CaptureMachineState {
  readonly phase: CaptureSessionPhase;
  readonly sessionId: string | null;
  readonly shots: readonly CaptureShotState[];
  readonly submitFailure: CaptureFailure | null;
}

export type CaptureMachineEvent =
  | { readonly type: 'bootstrap.requested' }
  | {
      readonly type: 'session.loaded';
      readonly sessionId: string;
      readonly shots: readonly CaptureShotSeed[];
    }
  | { readonly type: 'session.closed'; readonly reason: CaptureSessionClosure }
  | {
      readonly type: 'draft.created';
      readonly shotId: string;
      readonly attemptId: string;
      readonly localDraftId: string;
    }
  | { readonly type: 'attempt.queued'; readonly attemptId: string }
  | {
      readonly type: 'upload.started';
      readonly attemptId: string;
      readonly uploadId: string;
    }
  | { readonly type: 'upload.completed'; readonly attemptId: string }
  | {
      readonly type: 'validation.resolved';
      readonly attemptId: string;
      readonly outcome: CaptureValidationOutcome;
    }
  | {
      readonly type: 'attempt.failed';
      readonly attemptId: string;
      readonly disposition: CaptureFailureDisposition;
      readonly failure: CaptureFailure;
    }
  | {
      readonly type: 'retake.requested';
      readonly shotId: string;
      readonly attemptId: string;
      readonly localDraftId: string;
    }
  | { readonly type: 'submit.requested' }
  | { readonly type: 'submit.accepted' }
  | { readonly type: 'submit.failed'; readonly failure: CaptureFailure };

export class CaptureTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptureTransitionError';
  }
}

const ACTIVE_ATTEMPT_STATUSES: ReadonlySet<CaptureAttemptStatus> = new Set([
  'local_draft',
  'queued',
  'uploading',
  'validating'
]);

const SUBMITTABLE_ATTEMPT_STATUSES: ReadonlySet<CaptureAttemptStatus> = new Set([
  'accepted',
  'pending_review'
]);

const ATTEMPT_FAILURE_SOURCES: ReadonlySet<CaptureAttemptStatus> = new Set([
  'queued',
  'uploading',
  'validating'
]);

export function createCaptureMachine(): CaptureMachineState {
  return {
    phase: 'bootstrap',
    sessionId: null,
    shots: [],
    submitFailure: null
  };
}

export function reduceCaptureMachine(
  state: Readonly<CaptureMachineState>,
  event: CaptureMachineEvent
): CaptureMachineState {
  if (event.type === 'session.closed') {
    assertCanCloseSession(state.phase);
    return {
      ...state,
      phase: event.reason,
      submitFailure: null
    };
  }

  switch (event.type) {
    case 'bootstrap.requested':
      assertPhase(state, ['bootstrap'], event.type);
      return {
        ...state,
        phase: 'loading',
        submitFailure: null
      };

    case 'session.loaded':
      assertPhase(state, ['loading'], event.type);
      assertIdentifier(event.sessionId, 'sessionId');
      return {
        phase: 'ready',
        sessionId: event.sessionId,
        shots: normaliseShots(event.shots),
        submitFailure: null
      };

    case 'draft.created':
      assertPhase(state, ['ready'], event.type);
      return updateShot(state, event.shotId, (shot) => {
        if (shot.selectedAttemptId !== null) {
          throw new CaptureTransitionError(
            `Shot ${event.shotId} already has a selected attempt; request a retake instead.`
          );
        }
        assertNewAttempt(state, event.attemptId, event.localDraftId);
        return {
          ...shot,
          selectedAttemptId: event.attemptId,
          attempts: [...shot.attempts, createDraftAttempt(event.attemptId, event.localDraftId)]
        };
      });

    case 'attempt.queued':
      assertPhase(state, ['ready'], event.type);
      return updateAttempt(state, event.attemptId, ['local_draft', 'retryable'], (attempt) => ({
        ...attempt,
        status: 'queued',
        uploadId: null,
        failure: null
      }));

    case 'upload.started':
      assertPhase(state, ['ready'], event.type);
      assertIdentifier(event.uploadId, 'uploadId');
      return updateAttempt(state, event.attemptId, ['queued'], (attempt) => ({
        ...attempt,
        status: 'uploading',
        uploadId: event.uploadId,
        failure: null
      }));

    case 'upload.completed':
      assertPhase(state, ['ready'], event.type);
      return updateAttempt(state, event.attemptId, ['uploading'], (attempt) => ({
        ...attempt,
        status: 'validating',
        failure: null
      }));

    case 'validation.resolved':
      assertPhase(state, ['ready'], event.type);
      return updateAttempt(state, event.attemptId, ['validating'], (attempt) => ({
        ...attempt,
        status: event.outcome,
        failure: null
      }));

    case 'attempt.failed':
      assertPhase(state, ['ready'], event.type);
      assertFailure(event.failure);
      return updateAttempt(
        state,
        event.attemptId,
        [...ATTEMPT_FAILURE_SOURCES],
        (attempt) => ({
          ...attempt,
          status: event.disposition,
          failure: cloneFailure(event.failure)
        })
      );

    case 'retake.requested':
      assertPhase(state, ['ready'], event.type);
      return updateShot(state, event.shotId, (shot) => {
        if (shot.selectedAttemptId === null) {
          throw new CaptureTransitionError(
            `Shot ${event.shotId} has no selected attempt; create a draft instead.`
          );
        }
        assertNewAttempt(state, event.attemptId, event.localDraftId);
        return {
          ...shot,
          selectedAttemptId: event.attemptId,
          attempts: [
            ...shot.attempts.map((attempt) =>
              attempt.id === shot.selectedAttemptId
                ? { ...attempt, status: 'superseded' as const }
                : attempt
            ),
            createDraftAttempt(event.attemptId, event.localDraftId)
          ]
        };
      });

    case 'submit.requested':
      assertPhase(state, ['ready'], event.type);
      if (!canSubmitCapture(state)) {
        throw new CaptureTransitionError(
          'Capture cannot be submitted until every required shot is accepted or pending review and no selected attempt is active.'
        );
      }
      return {
        ...state,
        phase: 'submitting',
        submitFailure: null
      };

    case 'submit.accepted':
      assertPhase(state, ['submitting'], event.type);
      return {
        ...state,
        phase: 'complete',
        submitFailure: null
      };

    case 'submit.failed':
      assertPhase(state, ['submitting'], event.type);
      assertFailure(event.failure);
      return {
        ...state,
        phase: 'ready',
        submitFailure: cloneFailure(event.failure)
      };
  }
}

export function selectedAttempt(
  shot: Readonly<CaptureShotState>
): CaptureAttemptState | undefined {
  if (shot.selectedAttemptId === null) return undefined;
  return shot.attempts.find((attempt) => attempt.id === shot.selectedAttemptId);
}

export function canSubmitCapture(state: Readonly<CaptureMachineState>): boolean {
  if (state.phase !== 'ready') return false;

  for (const shot of state.shots) {
    const attempt = selectedAttempt(shot);
    if (attempt && ACTIVE_ATTEMPT_STATUSES.has(attempt.status)) return false;
    if (shot.required && (!attempt || !SUBMITTABLE_ATTEMPT_STATUSES.has(attempt.status))) {
      return false;
    }
  }

  return true;
}

export function isCaptureSessionClosed(state: Readonly<CaptureMachineState>): boolean {
  return (
    state.phase === 'complete' ||
    state.phase === 'expired' ||
    state.phase === 'revoked' ||
    state.phase === 'locked'
  );
}

function normaliseShots(seeds: readonly CaptureShotSeed[]): CaptureShotState[] {
  const shotIds = new Set<string>();
  const attemptIds = new Set<string>();

  return seeds.map((seed) => {
    assertIdentifier(seed.shotId, 'shotId');
    if (shotIds.has(seed.shotId)) {
      throw new CaptureTransitionError(`Duplicate shotId: ${seed.shotId}.`);
    }
    shotIds.add(seed.shotId);

    const attempts = (seed.attempts ?? []).map((attempt) => {
      assertIdentifier(attempt.id, 'attemptId');
      if (attemptIds.has(attempt.id)) {
        throw new CaptureTransitionError(`Duplicate attemptId: ${attempt.id}.`);
      }
      attemptIds.add(attempt.id);
      if (attempt.failure) assertFailure(attempt.failure);
      return {
        id: attempt.id,
        status: attempt.status,
        localDraftId: attempt.localDraftId ?? null,
        uploadId: attempt.uploadId ?? null,
        failure: attempt.failure ? cloneFailure(attempt.failure) : null
      };
    });

    const selectedAttemptId = seed.selectedAttemptId ?? null;
    if (
      selectedAttemptId !== null &&
      !attempts.some(
        (attempt) => attempt.id === selectedAttemptId && attempt.status !== 'superseded'
      )
    ) {
      throw new CaptureTransitionError(
        `Selected attempt ${selectedAttemptId} is missing or superseded for shot ${seed.shotId}.`
      );
    }

    return {
      shotId: seed.shotId,
      required: seed.required,
      selectedAttemptId,
      attempts
    };
  });
}

function updateShot(
  state: Readonly<CaptureMachineState>,
  shotId: string,
  updater: (shot: CaptureShotState) => CaptureShotState
): CaptureMachineState {
  const index = state.shots.findIndex((shot) => shot.shotId === shotId);
  if (index < 0) throw new CaptureTransitionError(`Unknown shotId: ${shotId}.`);

  return {
    ...state,
    submitFailure: null,
    shots: state.shots.map((shot, shotIndex) => (shotIndex === index ? updater(shot) : shot))
  };
}

function updateAttempt(
  state: Readonly<CaptureMachineState>,
  attemptId: string,
  allowedStatuses: readonly CaptureAttemptStatus[],
  updater: (attempt: CaptureAttemptState) => CaptureAttemptState
): CaptureMachineState {
  let found = false;
  let superseded = false;

  const shots = state.shots.map((shot) => ({
    ...shot,
    attempts: shot.attempts.map((attempt) => {
      if (attempt.id !== attemptId) return attempt;
      found = true;
      if (attempt.status === 'superseded') {
        superseded = true;
        return attempt;
      }
      if (!allowedStatuses.includes(attempt.status)) {
        throw new CaptureTransitionError(
          `Attempt ${attemptId} cannot transition from ${attempt.status}.`
        );
      }
      return updater(attempt);
    })
  }));

  if (!found) throw new CaptureTransitionError(`Unknown attemptId: ${attemptId}.`);
  if (superseded) return state;

  return {
    ...state,
    shots,
    submitFailure: null
  };
}

function createDraftAttempt(attemptId: string, localDraftId: string): CaptureAttemptState {
  return {
    id: attemptId,
    status: 'local_draft',
    localDraftId,
    uploadId: null,
    failure: null
  };
}

function assertNewAttempt(
  state: Readonly<CaptureMachineState>,
  attemptId: string,
  localDraftId: string
): void {
  assertIdentifier(attemptId, 'attemptId');
  assertIdentifier(localDraftId, 'localDraftId');
  if (
    state.shots.some((shot) => shot.attempts.some((attempt) => attempt.id === attemptId))
  ) {
    throw new CaptureTransitionError(`Duplicate attemptId: ${attemptId}.`);
  }
}

function assertPhase(
  state: Readonly<CaptureMachineState>,
  allowed: readonly CaptureSessionPhase[],
  eventType: CaptureMachineEvent['type']
): void {
  if (!allowed.includes(state.phase)) {
    throw new CaptureTransitionError(`Event ${eventType} is not valid while ${state.phase}.`);
  }
}

function assertCanCloseSession(phase: CaptureSessionPhase): void {
  if (phase !== 'loading' && phase !== 'ready' && phase !== 'submitting') {
    throw new CaptureTransitionError(`Session cannot close while ${phase}.`);
  }
}

function assertIdentifier(value: string, field: string): void {
  if (!value.trim()) throw new CaptureTransitionError(`${field} must not be empty.`);
}

function assertFailure(failure: Readonly<CaptureFailure>): void {
  assertIdentifier(failure.code, 'failure.code');
  assertIdentifier(failure.message, 'failure.message');
}

function cloneFailure(failure: Readonly<CaptureFailure>): CaptureFailure {
  return { code: failure.code, message: failure.message };
}
