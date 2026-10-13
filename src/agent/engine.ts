import type { AgentSignal } from '../types/agent';
import { PILOT_CONFIGURATION } from '../experiment/conditions';

export interface DecisionContext {
  now: number;
  issueStartedAt: Record<string, number>;
  displays: { signalId: string; timestamp: number }[];
  inFlightSignalIds: string[];
  reservedSignalIds: string[];
  resolvedSignalIds: string[];
  hasUnansweredIntervention?: boolean;
  displayCooldowns?: { globalMs: number; signalMs: number };
}

/** Bounded pressure from how long one issue has continuously remained unresolved. */
export function recencyBonus(seconds: number): number {
  return seconds >= 120 ? 0.2 : seconds >= 60 ? 0.1 : seconds >= 30 ? 0.05 : 0;
}

export function evaluateInterventions(
  signals: AgentSignal[],
  policy: { proactive: boolean; threshold: number | null },
  context: DecisionContext,
) {
  const cooldowns = context.displayCooldowns ?? PILOT_CONFIGURATION.displayCooldowns;
  const evaluations = signals.map((signal) => {
    if (!Number.isFinite(signal.severity) || signal.severity < 0 || signal.severity > 1) {
      throw new Error('Signal severity must be normalized.');
    }
    const issueStartedAt = context.issueStartedAt[signal.id] ?? context.now;
    const unresolvedMs = Math.max(0, context.now - issueStartedAt);
    const bonus = recencyBonus(unresolvedMs / 1000);
    const finalScore = Math.min(1, signal.severity + bonus);
    let exclusionReason: string | null = null;
    if (!policy.proactive) exclusionReason = 'baseline';
    else if (context.hasUnansweredIntervention) exclusionReason = 'unanswered-intervention';
    else if (context.resolvedSignalIds.includes(signal.id)) exclusionReason = 'resolved';
    else if (context.inFlightSignalIds.includes(signal.id)) exclusionReason = 'in-flight';
    else if (context.reservedSignalIds.includes(signal.id)) exclusionReason = 'reserved';
    else if (context.displays.some((display) => context.now - display.timestamp < cooldowns.globalMs)) exclusionReason = 'global-cooldown';
    else if (context.displays.some((display) => display.signalId === signal.id && context.now - display.timestamp < cooldowns.signalMs)) exclusionReason = 'signal-cooldown';
    else if (policy.threshold === null || finalScore < policy.threshold) exclusionReason = 'below-threshold';
    return { signalId: signal.id, signalType: signal.type, issueStartedAt, unresolvedMs,
      rawSeverity: signal.severity, recencyBonus: bonus, finalScore,
      threshold: policy.threshold, proactive: policy.proactive, triggered: false, exclusionReason };
  });
  const eligible = evaluations.filter((evaluation) => evaluation.exclusionReason === null)
    .sort((a, b) => b.finalScore - a.finalScore || (a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0));
  const winner = eligible[0];
  for (const evaluation of eligible) {
    evaluation.triggered = evaluation === winner;
    if (evaluation !== winner) evaluation.exclusionReason = 'lower-priority';
  }
  const selected = winner ? { signal: signals.find((signal) => signal.id === winner.signalId)!, score: winner.finalScore } : null;
  return { selected, evaluations };
}
