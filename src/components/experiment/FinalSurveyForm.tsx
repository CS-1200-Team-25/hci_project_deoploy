import type { FinalSurveyDraft, Trial } from '../../types/experiment';
import { PILOT_SCENARIOS } from '../../experiment/scenarios';

export function FinalSurveyForm({ draft, trials, onChange, onSubmit }: {
  draft: FinalSurveyDraft; trials: Trial[]; onChange(draft: FinalSurveyDraft): void; onSubmit(): void;
}) {
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <h2>Final survey</h2>
    <p>Pilot draft instrument for internal testing; not recruitment-approved.</p>
    <label>Which trial experience did you prefer overall?
      <select aria-label="Preferred trial experience" required value={draft.preferredTrialId === null ? 'no-preference' : draft.preferredTrialId ?? ''} onChange={(event) => onChange({ ...draft, preferredTrialId: event.target.value === '' ? undefined : event.target.value === 'no-preference' ? null : event.target.value })}>
        <option value="">Choose a response</option>{trials.map((trial, index) => <option key={trial.id} value={trial.id}>Trial {index + 1} · {PILOT_SCENARIOS[trial.task].title}</option>)}
        <option value="no-preference">No preference</option>
      </select>
    </label>
    <label>Optional explanation<textarea value={draft.explanation} onChange={(event) => onChange({ ...draft, explanation: event.target.value })} /></label>
    <button type="submit" disabled={draft.preferredTrialId === undefined}>Submit final survey</button>
  </form>;
}
