import type { ExperimentSession } from '../types/experiment';
import { PILOT_CONFIGURATION } from './conditions';
import { experimentSequences } from './sequences';
import { recordEvent } from './logger';

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
  }, 'session_started', { sequenceIndex, sequenceId: sequence.id }, now);
}

export function consentToSession(session: ExperimentSession, now = Date.now()): ExperimentSession {
  if (session.phase !== 'welcome') return session;
  const consented = recordEvent({ ...session, phase: 'instructions', consentedAt: now }, 'consent_given', {}, now);
  return recordEvent(consented, 'instructions_viewed', {}, now);
}

export function revealTask(session: ExperimentSession, now = Date.now()): ExperimentSession {
  if (session.phase !== 'instructions' || session.consentedAt === undefined) return session;
  return recordEvent({
    ...session,
    phase: 'task',
    trials: session.trials.map((trial, index) => index === session.currentTrialIndex
      ? { ...trial, status: 'active', startedAt: now }
      : trial),
  }, 'task_started', { scenarioVersion: session.configuration.scenarioVersion }, now);
}

export function recoverSession(session: ExperimentSession, now = Date.now()): ExperimentSession {
  return recordEvent(session, 'session_recovered', {
    previousSavedAt: session.lastSavedAt,
    recoveryGapMs: Math.max(0, now - session.lastSavedAt),
    phase: session.phase,
  }, now);
}
