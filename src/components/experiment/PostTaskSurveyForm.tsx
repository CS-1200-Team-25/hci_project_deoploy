import type { PostTaskSurveyDraft, SurveyRating } from '../../types/experiment';

function parseRating(value: string): SurveyRating | undefined {
  return value === '' ? undefined : value === 'not-applicable' ? 'not-applicable' : Number(value);
}

export function PostTaskSurveyForm({ draft, allowNotApplicable, onChange, onSubmit }: {
  draft: PostTaskSurveyDraft; allowNotApplicable: boolean;
  onChange(draft: PostTaskSurveyDraft): void; onSubmit(): void;
}) {
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <h2>Post-task survey</h2>
    <p>Pilot draft instrument for internal testing; not recruitment-approved.</p>
    <label>How helpful was the assistant during this task?
      <select aria-label="Helpfulness rating" required value={draft.helpfulness ?? ''} onChange={(event) => onChange({ ...draft, helpfulness: parseRating(event.target.value) })}>
        <option value="">Choose a response</option>{Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}{index === 0 ? ' · Not at all helpful' : index === 6 ? ' · Extremely helpful' : ''}</option>)}
        {allowNotApplicable && <option value="not-applicable">Not applicable — no assistance was displayed</option>}
      </select>
    </label>
    <p>1 = Not at all helpful; 7 = Extremely helpful.</p>
    <label>How much did the assistant interrupt your planning during this task?
      <select aria-label="Interruption rating" required value={draft.interruption ?? ''} onChange={(event) => onChange({ ...draft, interruption: parseRating(event.target.value) })}>
        <option value="">Choose a response</option>{Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}{index === 0 ? ' · Not at all interruptive' : index === 6 ? ' · Extremely interruptive' : ''}</option>)}
        {allowNotApplicable && <option value="not-applicable">Not applicable — no assistance was displayed</option>}
      </select>
    </label>
    <p>1 = Not at all interruptive; 7 = Extremely interruptive.</p>
    <button type="submit" disabled={draft.helpfulness === undefined || draft.interruption === undefined}>Submit post-task survey</button>
  </form>;
}
