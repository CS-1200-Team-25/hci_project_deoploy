import type { ExperimentEvent, ExperimentSession } from '../types/experiment';

/** Append only; existing records retain their identity through saves and recovery. */
export function recordEvent(session: ExperimentSession, eventType: string, payload: Record<string, unknown> = {}, now = Date.now()): ExperimentSession {
  const trial = session.phase === 'task' || session.phase === 'post-task-survey'
    ? session.trials[session.currentTrialIndex] : undefined;
  const event: ExperimentEvent = {
    id: crypto.randomUUID(),
    sequence: session.events.length + 1,
    sessionId: session.sessionId,
    participantId: session.participantId,
    ...(trial ? { trialId: trial.id, taskId: trial.task, condition: trial.condition } : {}),
    timestamp: now,
    eventType,
    payload,
  };
  return { ...session, events: [...session.events, event] };
}
