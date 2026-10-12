import type { ShownIntervention } from '../../agent/generation';
import { InterventionCard } from './InterventionCard';

export interface AssistantToastsProps {
  interventions?: ShownIntervention[];
  onRespond?: (id: string, response: 'acknowledged' | 'dismissed') => void;
}
export function AssistantToasts({ interventions = [], onRespond }: AssistantToastsProps) {
  const pending = interventions.filter(intervention => !intervention.response);
  if (!onRespond || pending.length === 0) return null;
  return (
    <section className="assistant-toasts" aria-labelledby="assistant-title" aria-live="polite" aria-relevant="additions">
      <div className="assistant-heading">
        <span className="assistant-mark" aria-hidden="true">✦</span>
        <h2 id="assistant-title">AI Assistant</h2>
      </div>
      <p className="muted">Acknowledge or dismiss each suggestion to close it.</p>
      {pending.map((intervention) => <InterventionCard key={intervention.id} intervention={intervention} onRespond={onRespond} />)}
    </section>
  );
}
