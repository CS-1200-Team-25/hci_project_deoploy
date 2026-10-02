import { AgentPanel } from '../agent/AgentPanel';
import { TaskHeader } from './TaskHeader';

export function ExperimentShell() {
  return (
    <div className="study-page">
      <header className="site-header">
        <span className="brand-mark" aria-hidden="true">P</span>
        <span>Planning study</span>
        <span className="study-label">Research prototype</span>
      </header>
      <main className="experiment-shell">
        <TaskHeader />
        <div className="workspace-layout">
          <section className="task-workspace" aria-labelledby="workspace-title">
            <p className="eyebrow">Your workspace</p>
            <h2 id="workspace-title">A place to put your plans together</h2>
            <p className="muted">Task instructions and planning tools will appear here.</p>
            <div className="workspace-placeholder">
              <span className="placeholder-symbol" aria-hidden="true">+</span>
              <h3>Task workspace</h3>
              <p>Birthday-party, weekend-itinerary, and weekly-schedule planning share this space.</p>
            </div>
          </section>
          <AgentPanel />
        </div>
        <footer className="task-footer">
          <p>Complete your plan before moving on.</p>
          <button type="button" disabled>Complete task <span aria-hidden="true">→</span></button>
        </footer>
      </main>
      <p className="prototype-note">Static layout preview · Study controls are not active.</p>
    </div>
  );
}
