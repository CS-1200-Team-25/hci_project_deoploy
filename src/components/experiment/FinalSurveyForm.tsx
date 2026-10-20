import { useRef, useState } from 'react';
import type { FinalSurveyDraft, Trial } from '../../types/experiment';
import { PILOT_SCENARIOS } from '../../experiment/scenarios';

export function FinalSurveyForm({ draft, trials, onChange, onSubmit }: {
  draft: FinalSurveyDraft; trials: Trial[]; onChange(draft: FinalSurveyDraft): void; onSubmit(): void;
}) {
  const draggedId = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const trialLabel = (id: string) => {
    const index = trials.findIndex(trial => trial.id === id);
    return `Trial ${index + 1} · ${PILOT_SCENARIOS[trials[index].task].title}`;
  };
  const moveTrial = (id: string, to: number) => {
    if (draft.noPreference) return;
    const from = draft.rankedTrialIds.indexOf(id);
    if (from < 0 || to < 0 || to >= trials.length || from === to) return;
    const ranking = [...draft.rankedTrialIds];
    ranking.splice(from, 1);
    ranking.splice(to, 0, id);
    onChange({ ...draft, rankedTrialIds: ranking });
    setAnnouncement(`${trialLabel(id)} moved to rank ${to + 1} of ${trials.length}.`);
  };
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <h2>Final survey</h2>
    <p>Pilot draft instrument for internal testing; not recruitment-approved.</p>
    <h3 id="ranking-heading">Rank the trial experiences</h3>
    <p id="ranking-instructions">Place your most preferred experience first and your least preferred last. Drag the trials or use the move buttons. You can submit the order shown if it already matches your preference.</p>
    <label className="preference-toggle">
      <input type="checkbox" role="switch" checked={draft.noPreference}
        onChange={event => { draggedId.current = null; onChange({ ...draft, noPreference: event.target.checked }); }} />
      No preference
    </label>
    <ol className={`trial-ranking${draft.noPreference ? ' trial-ranking-disabled' : ''}`} aria-labelledby="ranking-heading" aria-describedby="ranking-instructions">
      {draft.rankedTrialIds.map((id, index) => <li key={id} draggable={!draft.noPreference}
        onDragStart={event => {
          if (draft.noPreference) { event.preventDefault(); return; }
          draggedId.current = id;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', id);
        }}
        onDragOver={event => { if (!draft.noPreference && draggedId.current) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
        onDrop={event => {
          event.preventDefault();
          if (draggedId.current) moveTrial(draggedId.current, index);
          draggedId.current = null;
        }} onDragEnd={() => { draggedId.current = null; }}>
        <span className="trial-rank" aria-hidden="true">{index + 1}</span>
        <span className="trial-ranking-title">{trialLabel(id)}</span>
        <div className="trial-ranking-actions">
          <button type="button" aria-label={`Move ${trialLabel(id)} up`} disabled={draft.noPreference || index === 0} onClick={() => moveTrial(id, index - 1)}>↑</button>
          <button type="button" aria-label={`Move ${trialLabel(id)} down`} disabled={draft.noPreference || index === trials.length - 1} onClick={() => moveTrial(id, index + 1)}>↓</button>
        </div>
      </li>)}
    </ol>
    {draft.noPreference && <p>No preference selected. An ordering will not be recorded in your final response.</p>}
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <label>Optional explanation<textarea value={draft.explanation} onChange={(event) => onChange({ ...draft, explanation: event.target.value })} /></label>
    <button type="submit">Submit final survey</button>
  </form>;
}
