import { ProgressIndicator } from './ProgressIndicator';
import { Timer } from './Timer';

export interface TaskHeaderProps {
  title: string;
  trialIndex?: number;
  startedAt?: number;
  completedAt?: number;
}

export function TaskHeader({ title, trialIndex, startedAt, completedAt }: TaskHeaderProps) {
  return (
    <header className="task-header">
      <div>
        <p className="eyebrow">Planning session</p>
        <h1>{title}</h1>
        <ProgressIndicator trialIndex={trialIndex} />
      </div>
      <Timer startedAt={startedAt} completedAt={completedAt} />
    </header>
  );
}
