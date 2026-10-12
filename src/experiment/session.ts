import type { ExperimentSession } from '../types/experiment';
import { PILOT_CONFIGURATION } from './conditions';
import { experimentSequences } from './sequences';
import { recordEvent } from './logger';
import { getTask } from '../tasks/registry';
import type { TaskResolver } from '../tasks/registry';
import type { TaskAction } from '../types/task';
import { isSupervisorAuthorized } from './supervisor';
import type { SupervisorAuthorization } from './supervisor';
import { evaluateCommittedEdit } from './interventions';

/** Sequence indices are one-based, allocated by the supervisor across sessions. */
export function createSession(participantId: string, sequenceIndex: number, now = Date.now()): ExperimentSession {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(participantId)) {
    throw new Error('Use a pseudonymous ID of 1–64 letters, numbers, underscores or hyphens.');
  }
  if (!Number.isSafeInteger(sequenceIndex) || sequenceIndex < 1 || sequenceIndex > experimentSequences.length) {
    throw new Error('Choose a sequence index from 1 to 36.');
  }
  const sequence = experimentSequences[sequenceIndex - 1];
  const sessionId = crypto.randomUUID();
  return recordEvent({
    schemaVersion: 1,
    sessionId,
    participantId,
    phase: 'welcome',
    trials: sequence.trials.map((trial, index) => ({
      ...trial, id: `${sessionId}-trial-${index + 1}`, status: 'pending', stateRevision: 0,
    })),
    currentTrialIndex: 0,
    startedAt: now,
    sequenceIndex,
    sequenceId: sequence.id,
    configuration: structuredClone(PILOT_CONFIGURATION),
    events: [],
    lastSavedAt: now,
    postTaskSurveys: {},
    postTaskSurveyDrafts: {},
    finalSurveyDraft: { explanation: '' },
  }, 'session_started', { sequenceIndex, sequenceId: sequence.id }, now);
}

export function consentToSession(session: ExperimentSession, now = Date.now()): ExperimentSession {
  if (session.phase !== 'welcome') return session;
  const consented = recordEvent({ ...session, phase: 'instructions', consentedAt: now }, 'consent_given', {}, now);
  return recordEvent(consented, 'instructions_viewed', {}, now);
}

export function revealTask(session: ExperimentSession, now = Date.now(), resolve: TaskResolver = getTask): ExperimentSession {
  if (session.phase !== 'instructions' || session.consentedAt === undefined) return session;
  return startAssignedTask(session, now, resolve);
}

/** Public task-adapter boundary used by the controller and protocol verification. */
export function startAssignedTask(session: ExperimentSession, now = Date.now(), resolve: TaskResolver = getTask): ExperimentSession {
  const trial = session.trials[session.currentTrialIndex];
  if (trial.status !== 'pending' || session.consentedAt === undefined
    || (session.phase !== 'instructions' && session.phase !== 'post-task-survey')) return session;
  if (session.currentTrialIndex === 0 && session.phase !== 'instructions') return session;
  if (session.currentTrialIndex > 0 && (session.phase !== 'post-task-survey' || session.trials.slice(0, session.currentTrialIndex)
    .some((previous) => (previous.status !== 'completed' && previous.status !== 'terminated') || !session.postTaskSurveys[previous.id]))) return session;
  const definition = resolve(trial.task);
  return recordEvent({
    ...session,
    phase: 'task',
    trials: session.trials.map((trial, index) => index === session.currentTrialIndex
      ? { ...trial, status: 'active', startedAt: now, ...(definition ? { taskVersion: definition.version, taskState: structuredClone(definition.initialState) } : {}) }
      : trial),
  }, 'task_started', { scenarioVersion: session.configuration.scenarioVersion }, now);
}

export function updateTaskState(session: ExperimentSession, taskState: unknown, action: TaskAction, now = Date.now(), resolve: TaskResolver = getTask): ExperimentSession {
  const trial = session.trials[session.currentTrialIndex];
  const definition = resolve(trial.task);
  if (session.phase !== 'task' || trial.status !== 'active' || !definition) return session;
  if (!definition.isState(taskState)) throw new Error('Invalid task state.');
  if (JSON.stringify(taskState) === JSON.stringify(trial.taskState)) return session;
  const next = recordEvent({
    ...session,
    trials: session.trials.map((candidate, index) => index === session.currentTrialIndex
      ? { ...candidate, taskState: structuredClone(taskState), stateRevision: candidate.stateRevision + 1 }
      : candidate),
  }, action.type, { ...action.payload, stateRevision: trial.stateRevision + 1 }, now);
  return trial.task === 'birthday' ? evaluateCommittedEdit(next, definition.evaluateSignals(taskState), now) : next;
}

export function submitTask(session: ExperimentSession, now = Date.now(), resolve: TaskResolver = getTask): ExperimentSession {
  const trial = session.trials[session.currentTrialIndex];
  const definition = resolve(trial.task);
  if (session.phase !== 'task' || trial.status !== 'active' || !definition || trial.startedAt === undefined) return session;
  const validation = definition.validate(trial.taskState);
  const attempt = { timestamp: now, stateRevision: trial.stateRevision, validation };
  let next = recordEvent(session, 'task_validation_requested', { attempt: (trial.submissionAttempts?.length ?? 0) + 1, stateRevision: trial.stateRevision }, now);
  next = recordEvent(next, 'task_validation_result', { ...validation, stateRevision: trial.stateRevision }, now);
  const elapsedMs = Math.max(0, now - trial.startedAt);
  next = {
    ...next,
    phase: validation.isComplete ? 'post-task-survey' : 'task',
    trials: next.trials.map((candidate, index) => index === next.currentTrialIndex ? {
      ...candidate,
      submissionAttempts: [...(candidate.submissionAttempts ?? []), attempt],
      ...(validation.isComplete ? {
        status: 'completed', outcome: 'successful', completedAt: now, elapsedMs,
        successfulCompletionMs: elapsedMs, finalPlan: structuredClone(candidate.taskState), finalValidation: validation,
      } : {}),
    } : candidate),
  };
  return validation.isComplete ? recordEvent(next, 'task_completed', { outcome: 'successful', elapsedMs, successfulCompletionMs: elapsedMs }, now) : next;
}

export function terminateTask(session: ExperimentSession, authorization: SupervisorAuthorization, reason: string, now = Date.now(), resolve: TaskResolver = getTask): ExperimentSession {
  if (!isSupervisorAuthorized(session, authorization)) throw new Error('Supervisor authorization is required.');
  if (!reason.trim()) throw new Error('A termination reason is required.');
  const trial = session.trials[session.currentTrialIndex];
  const definition = resolve(trial.task);
  if (session.phase !== 'task' || trial.status !== 'active' || trial.startedAt === undefined || !definition) return session;
  const elapsedMs = Math.max(0, now - trial.startedAt);
  const next: ExperimentSession = {
    ...session,
    phase: 'post-task-survey',
    trials: session.trials.map((candidate, index) => index === session.currentTrialIndex ? {
      ...candidate, status: 'terminated', outcome: 'unsuccessful', completedAt: now,
      elapsedMs, terminationReason: reason.trim(), finalPlan: structuredClone(candidate.taskState),
      finalValidation: definition.validate(candidate.taskState),
    } : candidate),
  };
  return recordEvent(next, 'task_terminated', { outcome: 'unsuccessful', terminationReason: reason.trim(), elapsedMs }, now);
}

export function recoverSession(session: ExperimentSession, now = Date.now()): ExperimentSession {
  return recordEvent(session, 'session_recovered', {
    previousSavedAt: session.lastSavedAt,
    recoveryGapMs: Math.max(0, now - session.lastSavedAt),
    phase: session.phase,
  }, now);
}
