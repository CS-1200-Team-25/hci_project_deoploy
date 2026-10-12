import type { ExperimentEvent } from '../../types/experiment';

/** Retained operational incidents; expected edit cancellation is not a provider failure. */
export function GenerationStatus({ events }: { events: ExperimentEvent[] }) {
  const failures = events.filter((event) => (event.eventType === 'agent_request_finished'
    && ['failed', 'timeout', 'invalid'].includes(String(event.payload.status)))
    || (event.eventType === 'agent_selection_released' && event.payload.reason === 'configuration-unavailable'));
  const latest = failures.at(-1);
  if (!latest) return null;
  const message = latest.eventType === 'agent_selection_released' ? 'Assistant configuration could not be loaded.'
    : latest.payload.status === 'timeout' ? 'Assistant generation timed out.'
      : latest.payload.status === 'invalid' ? 'Assistant generation returned an invalid suggestion.'
        : 'Assistant generation failed.';
  return <div role="status" aria-label="Supervisor generation status" className="generation-status">
    <strong>Supervisor: {message}</strong>
    <p>{failures.length} generation {failures.length === 1 ? 'incident is' : 'incidents are'} retained in this session’s records.
      {' '}Check the provider setup before continuing the pilot. Editing and submission remain available.</p>
  </div>;
}
