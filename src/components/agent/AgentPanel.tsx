export function AgentPanel() {
  return (
    <aside className="agent-panel" aria-labelledby="assistant-title">
      <div className="assistant-heading">
        <span className="assistant-mark" aria-hidden="true">✦</span>
        <h2 id="assistant-title">AI Assistant</h2>
      </div>
      <p className="muted">A little support for your planning.</p>
      <div className="assistant-empty">
        <span aria-hidden="true">◇</span>
        <p>No suggestions right now.</p>
      </div>
    </aside>
  );
}
