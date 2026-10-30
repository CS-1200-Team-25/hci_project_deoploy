import { BIRTHDAY_CATALOG, BIRTHDAY_CATALOG_VERSION, birthdaySummary } from '../../../tasks/birthday';
import type { BirthdayItem, BirthdayState } from '../../../tasks/birthday';
import type { TaskAction } from '../../../types/task';

function displayTime(minutes: number) {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}

export function BirthdayWorkspace({ state, onChange }: {
  state: BirthdayState;
  onChange(state: BirthdayState, action: TaskAction): void;
}) {
  const summary = birthdaySummary(state);
  function update(item: BirthdayItem, changes: Partial<BirthdayItem>, type: TaskAction['type']) {
    const next = { ...item, ...changes };
    onChange({ items: state.items.map((candidate) => candidate.id === item.id ? next : candidate) }, {
      type, payload: { item: next, previousItem: item },
    });
  }
  return <>
    <div className="plan-summary"><p>Total cost: ${summary.totalCost}</p><p>Food servings: {summary.foodServings}</p><p>Drink servings: {summary.drinkServings}</p></div>
    <h3>Catalog options</h3>
    <p>Quantities are positive whole numbers. Schedule each activity individually. Prices and capacities are per option; all selections count toward the budget.</p>
    <div className="catalog-grid">{BIRTHDAY_CATALOG.map((option) => <article className="catalog-option" key={option.id}>
      <h4>{option.label}</h4><p>${option.cost}{option.servings ? ` · ${option.servings} servings` : ''}{option.durationMinutes ? ` · ${option.durationMinutes} minutes` : ''}</p>
      <button type="button" onClick={() => {
        const item: BirthdayItem = { id: crypto.randomUUID(), optionId: option.id, quantity: 1, ...(option.category === 'activity' ? { startMinute: 840 } : {}) };
        onChange({ items: [...state.items, item] }, { type: 'item_added', payload: { item, catalogVersion: BIRTHDAY_CATALOG_VERSION } });
      }}>Add {option.label}</button>
    </article>)}</div>
    <h3>Your plan</h3>
    {state.items.length === 0 && <p>No items yet. Choose food, drinks, an activity and decorations from the catalog.</p>}
    {state.items.map((item, index) => {
      const option = BIRTHDAY_CATALOG.find((candidate) => candidate.id === item.optionId)!;
      return <fieldset className="plan-item" key={item.id}>
        <legend>{option.label} item {index + 1}</legend>
        <p>${option.cost} per selection{option.servings ? ` · ${option.servings} servings each` : ''}{option.durationMinutes ? ` · ${option.durationMinutes} minutes` : ''}</p>
        {option.category !== 'activity' ? <label>Quantity<input type="number" min="1" step="1" value={item.quantity} onChange={(event) => update(item, { quantity: Number(event.target.value) }, 'item_updated')} /></label>
          : <label>Start time<input type="time" step="60" value={displayTime(item.startMinute ?? 840)} onChange={(event) => {
            const [hours, minutes] = event.target.value.split(':').map(Number);
            if (event.target.value) update(item, { startMinute: hours * 60 + minutes }, 'item_moved');
          }} /></label>}
        <button type="button" className="button-danger" onClick={() => onChange({ items: state.items.filter((candidate) => candidate.id !== item.id) }, { type: 'item_removed', payload: { item } })}>Remove</button>
      </fieldset>;
    })}
  </>;
}
