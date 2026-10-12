import type { AgentSignal } from '../types/agent';
import type { ExperimentSession } from '../types/experiment';
import { evaluateInterventions } from '../agent/engine';
import { recordEvent } from './logger';

/** Selection reserves a candidate; it never creates a request or claims exposure. */
export function evaluateCommittedEdit(session: ExperimentSession, signals: AgentSignal[], now: number): ExperimentSession {
  const trial = session.trials[session.currentTrialIndex];
  const history = trial.agentHistory ?? { selections: [], displays: [], inFlightSignalIds: [] };
  const activeIds = new Set(signals.map((signal) => signal.id));
  const selections = history.selections.map((selection) => selection.resolvedAt === undefined && !activeIds.has(selection.signal.id)
    ? { ...selection, resolvedAt: now } : selection);
  const result = evaluateInterventions(signals, session.configuration.conditions[trial.condition], {
    now, trialStartedAt: trial.startedAt!, displays: history.displays,
    inFlightSignalIds: history.inFlightSignalIds,
    reservedSignalIds: selections.filter((selection) => selection.resolvedAt === undefined).map((selection) => selection.signal.id),
    resolvedSignalIds: [], displayCooldowns: session.configuration.displayCooldowns,
  });
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
