import { EDITABLE_SCHEDULE_KINDS, WEEKDAYS, isFixedCommitment, scheduleSummary } from '../../../tasks/schedule';
import type { ScheduleBlock, ScheduleKind, ScheduleState } from '../../../tasks/schedule';
import type { TaskAction } from '../../../types/task';

function time(minutes: number) { return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`; }

export function ScheduleWorkspace({ state, onChange }: { state: ScheduleState; onChange(state: ScheduleState, action: TaskAction): void }) {
  const editable = state.blocks.filter((block) => !isFixedCommitment(block));
  function update(block: ScheduleBlock, changes: Partial<ScheduleBlock>, type: TaskAction['type']) {
    const next = { ...block, ...changes };
    onChange({ blocks: state.blocks.map((candidate) => candidate.id === block.id ? next : candidate) }, { type, payload: { block: next, previousBlock: block } });
  }
  function add(kind: ScheduleKind) {
    const block: ScheduleBlock = { id: crypto.randomUUID(), kind, day: 0, startMinute: 660, durationMinutes: 60 };
    onChange({ blocks: [...state.blocks, block] }, { type: 'item_added', payload: { block } });
  }
  return <>
    <div className="plan-summary"><p>Preparation before deadline: {scheduleSummary(state).preparationMinutesBeforeDeadline} minutes</p><p>Required: 240 minutes</p></div>
    <section aria-label="Fixed commitments"><h3>Fixed commitments</h3><p>These commitments stay unchanged in your plan.</p>
      <ul>{state.blocks.filter(isFixedCommitment).map((block) => <li key={block.id}>{WEEKDAYS[block.day]} {block.kind}: {time(block.startMinute)}–{time(block.startMinute + block.durationMinutes)}</li>)}</ul>
    </section>
    <h3>Editable blocks</h3><p>Use positive whole-minute durations within 08:00–20:00. Adjacent blocks can meet at an endpoint. All selected blocks must avoid overlap. Only preparation minutes before Friday 17:00 count, including the portion of a block before that deadline.</p>
    <div className="block-actions"><button type="button" onClick={() => add('preparation')}>Add preparation block</button><button type="button" onClick={() => add('meal')}>Add optional block</button></div>
    {editable.map((block, index) => <fieldset className="plan-item" key={block.id}><legend>{block.kind} block {index + 1}</legend>
      <p>{WEEKDAYS[block.day]} · {time(block.startMinute)}–{time(block.startMinute + block.durationMinutes)}</p>
      <label>Block type<select value={block.kind} onChange={(event) => update(block, { kind: event.target.value as ScheduleKind }, 'item_updated')}>
        {EDITABLE_SCHEDULE_KINDS.map((kind) => <option value={kind} key={kind}>{kind}</option>)}
      </select></label>
      <label>Day<select value={block.day} onChange={(event) => update(block, { day: Number(event.target.value) }, 'item_moved')}>
        {WEEKDAYS.map((day, dayIndex) => <option value={dayIndex} key={day}>{day}</option>)}
      </select></label>
      <label>Start time<input type="time" step="60" value={time(block.startMinute)} onChange={(event) => {
        if (!event.target.value) return;
        const [hours, minutes] = event.target.value.split(':').map(Number);
        update(block, { startMinute: hours * 60 + minutes }, 'item_moved');
      }} /></label>
      <label>Duration (minutes)<input type="number" min="1" step="1" value={block.durationMinutes} onChange={(event) => update(block, { durationMinutes: Number(event.target.value) }, 'item_updated')} /></label>
      <button type="button" onClick={() => onChange({ blocks: state.blocks.filter((candidate) => candidate.id !== block.id) }, { type: 'item_removed', payload: { block } })}>Remove</button>
    </fieldset>)}
  </>;
}
