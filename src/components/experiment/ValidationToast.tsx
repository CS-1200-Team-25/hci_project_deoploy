export function ValidationToast({ errors, onDismiss }: { errors: string[]; onDismiss(): void }) {
  return <aside className="validation-toast" aria-label="Task validation notification">
    <div role="alert" aria-atomic="true">
      <h2>Plan needs changes</h2>
      <p>Your timer is still running. Correct these requirements and try again.</p>
      <ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
    </div>
    <button type="button" aria-label="Dismiss validation notification" onClick={onDismiss}>Dismiss</button>
  </aside>;
}
