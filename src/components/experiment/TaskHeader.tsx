import { ProgressIndicator } from './ProgressIndicator';
import { Timer } from './Timer';

export function TaskHeader() {
  return (
    <header className="task-header">
      <div>
        <p className="eyebrow">Planning session</p>
        <h1>Your planning task</h1>
        <ProgressIndicator />
      </div>
      <Timer />
    </header>
  );
}
