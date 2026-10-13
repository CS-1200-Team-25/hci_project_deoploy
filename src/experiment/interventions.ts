import type { AgentSignal } from '../types/agent';
import type { ExperimentSession } from '../types/experiment';
import { evaluateInterventions } from '../agent/engine';
import { recordEvent } from './logger';
import { getTask } from '../tasks/registry';

/** Read-only decision preview: no events, reservations, requests or displays. */
export function inspectIssueScores(session: ExperimentSession, now = Date.now()) {
  const trial = session.trials[session.currentTrialIndex];
  const definition = getTask(trial.task);
  if (session.phase !== 'task' || trial.status !== 'active' || trial.startedAt === undefined || !definition) return null;
  const signals = definition.evaluateSignals(trial.taskState);
  return { now, stateRevision: trial.stateRevision, signals, ...evaluateTrialSignals(session, signals, now) };
}

function evaluateTrialSignals(session: ExperimentSession, signals: AgentSignal[], now: number) {
  const trial = session.trials[session.currentTrialIndex];
  const history = trial.agentHistory ?? { selections: [], displays: [], inFlightSignalIds: [] };
  const activeIds = new Set(signals.map(signal => signal.id));
  return evaluateInterventions(signals, session.configuration.conditions[trial.condition], {
    now, issueStartedAt: trial.issueStartedAt ?? {}, displays: history.displays,
    hasUnansweredIntervention: history.interventions?.some(advice => !advice.response),
    inFlightSignalIds: history.inFlightSignalIds,
    reservedSignalIds: history.selections.filter(selection => selection.resolvedAt === undefined && activeIds.has(selection.signal.id))
      .map(selection => selection.signal.id),
    resolvedSignalIds: [], displayCooldowns: session.configuration.displayCooldowns,
  });
}

/** Idle evaluations share edit policy without changing the participant's plan revision. */
export function evaluateIdleTrial(session: ExperimentSession, now = Date.now()): ExperimentSession {
  const trial = session.trials[session.currentTrialIndex];
  if (session.phase !== 'task' || trial.status !== 'active' || trial.startedAt === undefined
    || !session.configuration.conditions[trial.condition].proactive
    || trial.agentHistory?.interventions?.some(advice => !advice.response)
    || trial.agentHistory?.selections.some(selection => selection.resolvedAt === undefined)
    || trial.agentHistory?.requests?.some(request => request.status === 'pending')) return session;
  const lastEvaluation = session.events.filter(event => event.trialId === trial.id
    && event.eventType === 'intervention_evaluation_summary').at(-1);
  const lastResponse = Math.max(0, ...(trial.agentHistory?.interventions ?? []).map(advice => advice.respondedAt ?? 0));
  if (now - Math.max(lastEvaluation?.timestamp ?? trial.startedAt, lastResponse) < 30_000) return session;
  const definition = getTask(trial.task);
  if (!definition) return session;
  return evaluateCommittedEdit(recordEvent(session, 'idle_assistance_evaluated', {
    stateRevision: trial.stateRevision,
  }, now), definition.evaluateSignals(trial.taskState), now);
}

/** Selection reserves a candidate; it never creates a request or claims exposure. */
export function evaluateCommittedEdit(session: ExperimentSession, signals: AgentSignal[], now: number): ExperimentSession {
  const trial = session.trials[session.currentTrialIndex];
  const history = trial.agentHistory ?? { selections: [], displays: [], inFlightSignalIds: [] };
  const activeIds = new Set(signals.map((signal) => signal.id));
  const selections = history.selections.map((selection) => selection.resolvedAt === undefined && !activeIds.has(selection.signal.id)
    ? { ...selection, resolvedAt: now } : selection);
  const result = evaluateTrialSignals(session, signals, now);
  let next = session;
  for (const evaluation of result.evaluations) {
    next = recordEvent(next, 'signal_evaluated', { ...evaluation, stateRevision: trial.stateRevision,
      signalVersion: session.configuration.signalVersion, policyVersion: session.configuration.policyVersion }, now);
  }
  next = recordEvent(next, 'intervention_evaluation_summary', {
    candidateCount: signals.length, selectedSignalId: result.selected?.signal.id ?? null,
    stateRevision: trial.stateRevision, policyVersion: session.configuration.policyVersion,
    threshold: session.configuration.conditions[trial.condition].threshold,
    proactive: session.configuration.conditions[trial.condition].proactive,
  }, now);
  if (result.selected) {
    const selection = { id: crypto.randomUUID(), signal: structuredClone(result.selected.signal), selectedAt: now, stateRevision: trial.stateRevision };
    selections.push(selection);
    next = recordEvent(next, 'intervention_selected', { ...selection, score: result.selected.score, status: 'reserved' }, now);
  }
  return { ...next, trials: next.trials.map((candidate, index) => index === next.currentTrialIndex
    ? { ...candidate, agentHistory: { ...history, selections } } : candidate) };
}
