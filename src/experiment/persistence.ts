import type { ExperimentSession } from '../types/experiment';
import { experimentSequences } from './sequences';
import { PILOT_CONFIGURATION } from './conditions';

export const SESSION_STORAGE_KEY = 'planning-pilot-session-v1';
type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function saveSession(session: ExperimentSession, storage: SessionStorage = localStorage, now = Date.now()): ExperimentSession {
  const saved = { ...session, lastSavedAt: now };
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(saved));
  return saved;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reject incompatible or damaged data rather than silently replacing its assignment. */
export function loadSession(storage: SessionStorage = localStorage): ExperimentSession | null {
  const serialized = storage.getItem(SESSION_STORAGE_KEY);
  if (serialized === null) return null;
  const value: unknown = JSON.parse(serialized);
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.sessionId !== 'string'
    || typeof value.participantId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.participantId)
    || !Number.isSafeInteger(value.sequenceIndex) || (value.sequenceIndex as number) < 1 || (value.sequenceIndex as number) > 36
    || !['welcome', 'instructions', 'task', 'post-task-survey', 'final-survey', 'complete'].includes(String(value.phase))
    || !Number.isFinite(value.startedAt) || !Number.isFinite(value.lastSavedAt)
    || !Number.isInteger(value.currentTrialIndex) || (value.currentTrialIndex as number) < 0 || (value.currentTrialIndex as number) > 2
    || !Array.isArray(value.trials) || value.trials.length !== 3 || !Array.isArray(value.events)
    || !isRecord(value.postTaskSurveys)
    || !isRecord(value.configuration) || !isRecord(value.configuration.conditions)
    || !(['version', 'sequenceVersion', 'scenarioVersion', 'policyVersion'] as const).every((key) =>
      (value.configuration as Record<string, unknown>)[key] === PILOT_CONFIGURATION[key])) {
    throw new Error('Stored session is incompatible or damaged. The supervisor must preserve it before starting another session.');
  }
  const sequence = experimentSequences[(value.sequenceIndex as number) - 1];
  const trialIds = new Set<string>();
  const assignmentsValid = value.sequenceId === sequence.id && value.trials.every((trial, index) => {
    if (!isRecord(trial) || typeof trial.id !== 'string' || trialIds.has(trial.id)
      || trial.task !== sequence.trials[index].task || trial.condition !== sequence.trials[index].condition
      || !['pending', 'active', 'completed', 'terminated'].includes(String(trial.status))
      || !Number.isInteger(trial.stateRevision) || (trial.stateRevision as number) < 0
      || (trial.startedAt !== undefined && !Number.isFinite(trial.startedAt))
      || (trial.completedAt !== undefined && !Number.isFinite(trial.completedAt))
      || (trial.status !== 'pending' && trial.startedAt === undefined)
      || (trial.status === 'pending' && (trial.startedAt !== undefined || trial.completedAt !== undefined || trial.outcome !== undefined))
      || (trial.status === 'active' && (trial.completedAt !== undefined || trial.outcome !== undefined))
      || (['completed', 'terminated'].includes(String(trial.status)) &&
        (trial.completedAt === undefined || (trial.completedAt as number) < (trial.startedAt as number)
          || trial.outcome !== (trial.status === 'completed' ? 'successful' : 'unsuccessful')))
      || (trial.status === 'terminated' && (typeof trial.terminationReason !== 'string' || !trial.terminationReason.trim()))) return false;
    trialIds.add(trial.id);
    return true;
  });
  const eventIds = new Set<string>();
  const eventsValid = value.events.every((event, index) => {
    if (!isRecord(event) || typeof event.id !== 'string' || eventIds.has(event.id)
      || event.sequence !== index + 1 || event.sessionId !== value.sessionId
      || event.participantId !== value.participantId || !Number.isFinite(event.timestamp)
      || typeof event.eventType !== 'string' || !isRecord(event.payload)) return false;
    eventIds.add(event.id);
    return true;
  });
  const conditions = value.configuration.conditions;
  const configurationValid = ['baseline', 'low', 'high'].every((condition) => {
    const policy = conditions[condition];
    return isRecord(policy) && typeof policy.proactive === 'boolean'
      && (policy.threshold === null || (typeof policy.threshold === 'number' && Number.isFinite(policy.threshold)));
  });
  const activeTrial = value.trials[value.currentTrialIndex as number];
  const currentIndex = value.currentTrialIndex as number;
  const isEnded = (trial: Record<string, unknown>) => trial.status === 'completed' || trial.status === 'terminated';
  const phaseValid = value.phase === 'welcome' || value.phase === 'instructions'
    ? currentIndex === 0 && value.trials.every((trial) => trial.status === 'pending')
    : value.phase === 'task' || value.phase === 'post-task-survey'
      ? value.trials.every((trial, index) => index < currentIndex ? isEnded(trial)
        : index > currentIndex ? trial.status === 'pending'
          : value.phase === 'task' ? trial.status === 'active' : isEnded(trial))
      : currentIndex === 2 && value.trials.every(isEnded);
  if (!assignmentsValid || !eventsValid || !configurationValid
    || !phaseValid
    || (value.phase !== 'welcome' && !Number.isFinite(value.consentedAt))
    || (value.phase === 'task' && activeTrial.status !== 'active')) {
    throw new Error('Stored session is incompatible or damaged. The supervisor must preserve it before starting another session.');
  }
  return value as unknown as ExperimentSession;
}
