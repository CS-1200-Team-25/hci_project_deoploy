import { useState } from 'react';

/** Untimed UI practice; never edits an assigned trial or requests assistance. */
export function TrainingTask({ completed, onAction, onComplete }: {
  completed: boolean;
  onAction(action: string, quantity: number): void;
  onComplete(): void;
}) {
  const [quantity, setQuantity] = useState<number | null>(null);
  const [error, setError] = useState('');

  return <section className="training-task" aria-labelledby="training-heading">
    <h3 id="training-heading">Try the UI</h3>
    {completed ? <p role="status">Practice complete. You can now reveal your first task.</p> : <>
      <p>This optional practice is untimed. Add water, change its quantity to 2, then select Complete practice.</p>
      <article className="catalog-option">
        <h4>Water</h4>
        <button type="button" disabled={quantity !== null} onClick={() => {
          setQuantity(1);
          setError('');
          onAction('item_added', 1);
        }}>Add water</button>
      </article>
      <h4>Your practice plan</h4>
      {quantity === null ? <p>No items yet.</p> : <fieldset className="plan-item">
        <legend>Water</legend>
        <label>Practice quantity<input type="number" min="1" step="1" value={quantity}
          onChange={event => {
            const next = Number(event.target.value);
            setQuantity(next);
            setError('');
            onAction('item_updated', next);
          }} /></label>
        <button type="button" className="button-danger" onClick={() => {
          setQuantity(null);
          setError('');
          onAction('item_removed', quantity);
        }}>Remove water</button>
      </fieldset>}
      <p className="muted">Remove lets you undo a selection. In each task, read the requirements above the plan and use Complete task when ready.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => {
        if (quantity !== 2) {
          setError('Add water and set its quantity to 2 to finish practice.');
          return;
        }
        onComplete();
      }}>Complete practice</button>
    </>}
  </section>;
}
