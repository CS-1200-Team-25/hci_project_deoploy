import { WEEKEND_ACTIVITIES, WEEKEND_CATALOG_VERSION, WEEKEND_LODGING, WEEKEND_LOCATIONS, WEEKEND_TRANSPORT, WEEKEND_TRAVEL, weekendSummary } from '../../../tasks/weekend';
import type { WeekendActivity, WeekendState } from '../../../tasks/weekend';
import type { TaskAction } from '../../../types/task';

function time(minutes: number) {
  const local = ((minutes % 1440) + 1440) % 1440;
  return `${Math.floor(local / 60).toString().padStart(2, '0')}:${(local % 60).toString().padStart(2, '0')}`;
}
export function WeekendWorkspace({ state, onChange }: { state: WeekendState; onChange(state: WeekendState, action: TaskAction): void }) {
  const summary = weekendSummary(state);
  function selection(field: 'lodgingId' | 'transportId', selected: string) {
    const next = selected || null;
    onChange({ ...state, [field]: next }, {
      type: next === null ? 'item_removed' : state[field] === null ? 'item_added' : 'item_updated',
      payload: { category: field, previousSelection: state[field], selection: next, catalogVersion: WEEKEND_CATALOG_VERSION },
    });
  }
  function update(item: WeekendActivity, changes: Partial<WeekendActivity>, type: TaskAction['type']) {
    const next = { ...item, ...changes };
    onChange({ ...state, activities: state.activities.map((candidate) => candidate.id === item.id ? next : candidate) }, {
      type, payload: { item: next, previousItem: item },
    });
  }
  const travel = state.transportId ? WEEKEND_TRAVEL[state.transportId] : undefined;
  return <>
    <div className="plan-summary"><p>Total trip cost: ${summary.totalCost}</p><p>Saturday activities: {summary.saturdayActivities}</p><p>Sunday activities: {summary.sundayActivities}</p></div>
    <div className="trip-options">
      <label>Saturday-night lodging<select value={state.lodgingId ?? ''} onChange={(event) => selection('lodgingId', event.target.value)}>
        <option value="">Choose lodging</option>{WEEKEND_LODGING.map((option) => <option key={option.id} value={option.id}>{option.label} · ${option.cost} · {option.location}</option>)}
      </select></label>
      <label>Transport option<select value={state.transportId ?? ''} onChange={(event) => selection('transportId', event.target.value)}>
        <option value="">Choose transport</option>{WEEKEND_TRANSPORT.map((option) => <option key={option.id} value={option.id}>{option.label} · ${option.cost} (all transfers included)</option>)}
      </select></label>
    </div>
    <h3>Fixed travel times</h3>
    <p>Allow the listed minutes between consecutive locations, including station arrival/departure and the overnight stay. Staying at the same location takes zero travel minutes.</p>
    {travel ? <table className="travel-table"><caption>Travel minutes for your selected transport</caption><thead><tr><th>From / to</th>{WEEKEND_LOCATIONS.map((location) => <th key={location}>{location}</th>)}</tr></thead><tbody>
      {WEEKEND_LOCATIONS.map((from) => <tr key={from}><th>{from}</th>{WEEKEND_LOCATIONS.map((to) => <td key={to}>{travel[from][to]}</td>)}</tr>)}
    </tbody></table> : <p>Choose a transport option to see its complete travel-time table.</p>}
    <h3>Activity catalog</h3>
    <div className="catalog-grid">{WEEKEND_ACTIVITIES.map((option) => <article className="catalog-option" key={option.id}>
      <h4>{option.label}</h4><p>${option.cost} · {option.durationMinutes} minutes · {option.location}</p>
      <p>Open: {option.openingWindows.map((window) => `${window.day === 0 ? 'Saturday' : 'Sunday'} ${time(window.start)}–${time(window.end)}`).join('; ')}. Entire visit must fit.</p>
      <button type="button" onClick={() => {
        const item = { id: crypto.randomUUID(), optionId: option.id, startMinute: 600 };
        onChange({ ...state, activities: [...state.activities, item] }, { type: 'item_added', payload: { item, catalogVersion: WEEKEND_CATALOG_VERSION } });
      }}>Add {option.label}</button>
    </article>)}</div>
    <h3>Your itinerary</h3>
    {state.activities.length === 0 && <p>No activities yet. Schedule at least two on each day.</p>}
    {state.activities.map((item, index) => {
      const option = WEEKEND_ACTIVITIES.find((candidate) => candidate.id === item.optionId)!;
      return <fieldset className="plan-item" key={item.id}><legend>{option.label} booking {index + 1}</legend>
        <p>${option.cost} · {option.durationMinutes} minutes · {option.location} · ends {time(item.startMinute + option.durationMinutes)}</p>
        <label>Activity<select value={item.optionId} onChange={(event) => update(item, { optionId: event.target.value }, 'item_updated')}>
          {WEEKEND_ACTIVITIES.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.label}</option>)}
        </select></label>
        <label>Day<select value={Math.floor(item.startMinute / 1440)} onChange={(event) => update(item, { startMinute: Number(event.target.value) * 1440 + item.startMinute % 1440 }, 'item_moved')}>
          <option value="0">Saturday</option><option value="1">Sunday</option>
        </select></label>
        <label>Start time<input type="time" step="60" value={time(item.startMinute)} onChange={(event) => {
          if (!event.target.value) return;
          const [hours, minutes] = event.target.value.split(':').map(Number);
          update(item, { startMinute: Math.floor(item.startMinute / 1440) * 1440 + hours * 60 + minutes }, 'item_moved');
        }} /></label>
        <button type="button" onClick={() => onChange({ ...state, activities: state.activities.filter((candidate) => candidate.id !== item.id) }, { type: 'item_removed', payload: { item } })}>Remove</button>
      </fieldset>;
    })}
  </>;
}
