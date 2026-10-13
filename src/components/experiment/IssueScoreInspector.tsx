import { useEffect, useState } from 'react';
import type { ExperimentSession } from '../../types/experiment';
import { inspectIssueScores } from '../../experiment/interventions';

export function IssueScoreInspector({ session }: { session: ExperimentSession }) {
  const [snapshot, setSnapshot] = useState<ReturnType<typeof inspectIssueScores>>(null);

  useEffect(() => {
    const refresh = () => setSnapshot(inspectIssueScores(session));
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [session]);
  const policy = session.configuration.conditions[session.trials[session.currentTrialIndex].condition];

  return <section className="issue-score-panel" aria-labelledby="issue-score-title">
    <h2 id="issue-score-title">AI issue scores (testing)</h2>

    <p>Deterministic task rules calculate severity. finalScore = min(1, severity + recencyBonus).
      Eligibility requires finalScore â‰¥ threshold and no exclusion; only the highest eligible score is selected.</p>
    <p>Threshold: {policy.threshold === null ? 'disabled (baseline)' : policy.threshold.toFixed(2)}.
      Inspecting or refreshing scores does not request advice or record study events.</p>
    <button type="button" onClick={() => setSnapshot(inspectIssueScores(session))}>Refresh issue scores</button>
    {!snapshot ? <p>Issue scores are available during an active task.</p> : <>
      <p>Snapshot: {new Date(snapshot.now).toLocaleTimeString()}, plan revision {snapshot.stateRevision}.
        Updates automatically every second and after plan edits. Selection preview: {snapshot.selected?.signal.id ?? 'none'}.</p>
      {snapshot.evaluations.length === 0 && <p>No current issue signals.</p>}
      <ul className="issue-score-list">
        {snapshot.evaluations.map(evaluation => <li key={evaluation.signalId}>
          <h3>{evaluation.signalId}</h3>
          <p>{snapshot.signals.find(signal => signal.id === evaluation.signalId)?.message}</p>
          <dl>
            <dt>Severity</dt><dd>{evaluation.rawSeverity.toFixed(3)}</dd>
            <dt>Recency bonus</dt><dd>{evaluation.recencyBonus.toFixed(3)}</dd>
            <dt>Final score</dt><dd>{evaluation.finalScore.toFixed(3)}</dd>
            <dt>Threshold</dt><dd>{evaluation.threshold === null ? 'disabled' : evaluation.threshold.toFixed(3)}</dd>
            <dt>Eligibility</dt><dd>{evaluation.triggered ? 'Eligible â€” selected in preview'
              : evaluation.exclusionReason === 'lower-priority' ? 'Eligible â€” lower priority'
                : `Excluded â€” ${evaluation.exclusionReason}`}</dd>
          </dl>
        </li>)}
      </ul>
    </>}
  </section>;
}
