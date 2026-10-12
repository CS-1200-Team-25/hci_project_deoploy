import type { ShownIntervention } from '../../agent/generation';

export function InterventionCard({ intervention, onRespond }: {
  intervention: ShownIntervention;
  onRespond?: (id: string, response: 'acknowledged' | 'dismissed') => void;
}) {
  return <article className="intervention-card" aria-label="Assistant suggestion">
    <p>{intervention.message}</p>
    {intervention.response ? <p className="muted">{intervention.response === 'acknowledged' ? 'Acknowledged' : 'Dismissed'}</p>
      : onRespond && <div><button type="button" onClick={() => onRespond(intervention.id, 'acknowledged')}>Acknowledge</button>
        <button type="button" onClick={() => onRespond(intervention.id, 'dismissed')}>Dismiss</button></div>}
  </article>;
}
