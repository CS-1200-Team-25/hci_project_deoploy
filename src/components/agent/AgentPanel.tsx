import type { ShownIntervention } from '../../agent/generation';
import { InterventionCard } from './InterventionCard';

export interface AgentPanelProps {
  interventions?: ShownIntervention[];
  onRespond?: (id: string, response: 'acknowledged' | 'dismissed') => void;
}
export function AgentPanel({ interventions = [], onRespond }: AgentPanelProps) {
  return (
    <aside className="agent-panel" aria-labelledby="assistant-title">
      <div className="assistant-heading">
        <span className="assistant-mark" aria-hidden="true">✦</span>
        <h2 id="assistant-title">AI Assistant</h2>
      </div>
      <p className="muted">A little support for your planning.</p>
      {interventions.map((intervention) => <InterventionCard key={intervention.id} intervention={intervention} onRespond={onRespond} />)}
      {interventions.length === 0 && <div className="assistant-empty">
        <span aria-hidden="true">◇</span>
        <p>No suggestions right now.</p>
      </div>}
    </aside>
  );
}
