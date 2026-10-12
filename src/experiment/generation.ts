import type { ExperimentSession } from '../types/experiment';
import type { GenerationConfiguration, GenerationRecord } from '../agent/generation';
import { validGeneratedAdvice } from '../agent/generation';
import { getTask } from '../tasks/registry';
import { recordEvent } from './logger';

export function cancelPendingGenerations(session: ExperimentSession, reason: string, now = Date.now()): ExperimentSession {
  for (const trial of session.trials) {
    for (const request of trial.agentHistory?.requests ?? []) {
      if (request.status === 'pending') session = finishGeneration(session, request.id, 'canceled', undefined, reason, now);
    }
  }
  return session;
}

export function abandonSelection(session: ExperimentSession, selectionId: string, reason: string, now = Date.now()): ExperimentSession {
  const trial = session.trials.find((trial) => trial.agentHistory?.selections.some((selection) => selection.id === selectionId));
  if (!trial?.agentHistory) return session;
  return recordEvent({ ...session, trials: session.trials.map((candidate) => candidate.id === trial.id ? { ...candidate,
    agentHistory: { ...trial.agentHistory!, selections: trial.agentHistory!.selections.map((selection) => selection.id === selectionId
      ? { ...selection, resolvedAt: selection.resolvedAt ?? now } : selection) } } : candidate) },
  'agent_selection_released', { selectionId, reason }, now, trial);
}

export function beginGeneration(session: ExperimentSession, selectionId: string, config: GenerationConfiguration, now = Date.now()): ExperimentSession {
  const trial = session.trials[session.currentTrialIndex];
  const history = trial.agentHistory;
  const selection = history?.selections.find((candidate) => candidate.id === selectionId);
  if (session.phase !== 'task' || trial.status !== 'active' || !session.configuration.conditions[trial.condition].proactive
    || !history || !selection || selection.resolvedAt !== undefined || selection.stateRevision !== trial.stateRevision
    || history.interventions?.some(advice => !advice.response)
    || history.requests?.some((request) => request.status === 'pending') || history.requests?.some((request) => request.request.selectionId === selectionId)) return session;
  const requestId = crypto.randomUUID();
  const request = { requestId, sessionId: session.sessionId, trialId: trial.id, taskId: trial.task, stateRevision: trial.stateRevision,
    selectionId, signal: structuredClone(selection.signal), context: getTask(trial.task)!.getAgentContext(trial.taskState) };
  const record: GenerationRecord = { ...structuredClone(config), id: requestId, request, requestedAt: now, status: 'pending' };
  return recordEvent({ ...session, trials: session.trials.map((candidate) => candidate.id === trial.id
    ? { ...candidate, agentHistory: { ...history, requests: [...(history.requests ?? []), record], inFlightSignalIds: [selection.signal.id] } } : candidate) },
  'agent_request_started', { ...record }, now);
}

export function finishGeneration(session: ExperimentSession, requestId: string, status: GenerationRecord['status'], response?: unknown, reason?: string, now = Date.now()): ExperimentSession {
  const trial = session.trials.find((candidate) => candidate.agentHistory?.requests?.some((request) => request.id === requestId));
  const history = trial?.agentHistory;
  const record = history?.requests?.find((request) => request.id === requestId);
  if (!trial || !history || !record || record.status !== 'pending') return session;
  let next = session;
  if (response !== undefined) next = recordEvent(next, 'agent_response_received', { requestId, response, latencyMs: Math.max(0, now - record.requestedAt) }, now, trial);
  if (status === 'succeeded') {
    const active = next.trials[next.currentTrialIndex];
    const signal = getTask(trial.task)!.evaluateSignals(trial.taskState).find((signal) => signal.id === record.request.signal.id);
    const lastDisplay = history.displays.at(-1);
    const signalDisplay = history.displays.filter((display) => display.signalId === record.request.signal.id).at(-1);
    if (next.phase !== 'task' || active.id !== trial.id || trial.status !== 'active' || trial.stateRevision !== record.request.stateRevision || !signal
      || (lastDisplay && now - lastDisplay.timestamp < session.configuration.displayCooldowns.globalMs)
      || (signalDisplay && now - signalDisplay.timestamp < session.configuration.displayCooldowns.signalMs)) status = 'stale';
    else if (!validGeneratedAdvice(response, record)) status = 'invalid';
  }
  const finished = { ...record, status, finishedAt: now, latencyMs: Math.max(0, now - record.requestedAt), ...(response !== undefined ? { response } : {}), ...(reason ? { reason } : {}) };
  const advice = status === 'succeeded' && validGeneratedAdvice(response, record) ? {
    id: crypto.randomUUID(), requestId, selectionId: record.request.selectionId, signalId: response.signalId,
    type: response.type, message: response.message, ...(typeof response.target === 'string' ? { target: response.target } : {}), timestamp: now,
  } : null;
  next = { ...next, trials: next.trials.map((candidate) => candidate.id === trial.id ? { ...candidate, agentHistory: {
    ...history, requests: history.requests!.map((request) => request.id === requestId ? finished : request), inFlightSignalIds: [],
    selections: history.selections.map((selection) => selection.id === record.request.selectionId ? { ...selection, resolvedAt: selection.resolvedAt ?? now } : selection),
    displays: advice ? [...history.displays, { signalId: advice.signalId, timestamp: now }] : history.displays,
    interventions: advice ? [...(history.interventions ?? []), advice] : (history.interventions ?? []),
  } } : candidate) };
  next = recordEvent(next, 'agent_request_finished', { requestId, status, reason: reason ?? null, latencyMs: finished.latencyMs }, now, trial);
  return advice ? recordEvent(next, 'agent_intervention_shown', { ...advice, ...(record.provider ? { provider: record.provider } : {}), model: record.model, promptVersion: record.promptVersion, schemaVersion: record.schemaVersion, settings: record.settings, context: record.request.context }, now, trial) : next;
}

export function respondToIntervention(session: ExperimentSession, interventionId: string, response: 'acknowledged' | 'dismissed', now = Date.now()): ExperimentSession {
  const trial = session.trials[session.currentTrialIndex];
  const history = trial.agentHistory;
  const advice = history?.interventions?.find((intervention) => intervention.id === interventionId);
  if (session.phase !== 'task' || trial.status !== 'active' || !history || !advice || advice.response) return session;
  return recordEvent({ ...session, trials: session.trials.map((candidate) => candidate.id === trial.id ? { ...candidate,
    agentHistory: { ...history, interventions: history.interventions!.map((intervention) => intervention.id === interventionId
      ? { ...intervention, response, respondedAt: now } : intervention) } } : candidate) },
  `agent_intervention_${response}`, { interventionId, requestId: advice.requestId }, now);
}
