import type { TaskId } from '../../types/experiment';
import type { TaskAction } from '../../types/task';
import { isBirthdayState } from '../../tasks/birthday';
import { isWeekendState } from '../../tasks/weekend';
import { BirthdayWorkspace } from '../tasks/birthday';
import { WeekendWorkspace } from '../tasks/weekend';

export function TaskRenderer({ taskId, state, onChange }: { taskId: TaskId; state: unknown; onChange(state: unknown, action: TaskAction): void }) {
  if (taskId === 'birthday' && isBirthdayState(state)) return <BirthdayWorkspace state={state} onChange={onChange} />;
  if (taskId === 'weekend' && isWeekendState(state)) return <WeekendWorkspace state={state} onChange={onChange} />;
  return <div className="workspace-placeholder"><h3>Planning tools are being prepared</h3><p>This task workspace is not implemented yet. A trial cannot pass until its planning tools and validator are available.</p></div>;
}
