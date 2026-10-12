import { AgentPanel } from '../agent/AgentPanel';
import type { AgentPanelProps } from '../agent/AgentPanel';
import { TaskHeader } from './TaskHeader';
import type { TaskHeaderProps } from './TaskHeader';
import type { ReactNode } from 'react';

export function ExperimentShell({ children, completionControl, assistant, ...header }: TaskHeaderProps & {
  children: ReactNode;
  completionControl?: { onComplete(): void } | false;
  assistant?: AgentPanelProps;
}) {
  return (
    <div className="study-page">
      <header className="site-header">
        <span className="brand-mark" aria-hidden="true">P</span>
        <span>Planning study</span>
        <span className="study-label">Research prototype</span>
      </header>
      <main className="experiment-shell">
        <TaskHeader {...header} />
        <div className="workspace-layout">
          <section className="task-workspace" aria-label="Planning workspace">
            {children}
          </section>
          <AgentPanel {...assistant} />
        </div>
        <footer className="task-footer">
          <p>Complete your plan before moving on.</p>
          {completionControl !== false && <button type="button" disabled={!completionControl} onClick={completionControl ? completionControl.onComplete : undefined}>Complete task <span aria-hidden="true">→</span></button>}
        </footer>
      </main>
      <p className="prototype-note">Supervised internal pilot · Draft study materials</p>
    </div>
  );
}
