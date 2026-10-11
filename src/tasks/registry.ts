import type { TaskId } from '../types/experiment';
import type { ExperimentTask } from '../types/task';
import { birthdayTask } from './birthday';
import { weekendTask } from './weekend';
import { scheduleTask } from './schedule';

/** Erase each workspace's state type only after checking its public runtime contract. */
function registerTask<T>(task: ExperimentTask<T>): ExperimentTask<unknown> {
  function state(value: unknown): T {
    if (!task.isState(value)) throw new Error(`Invalid ${task.id} task state.`);
    return value;
  }
  return {
    ...task,
    validate: (value) => task.validate(state(value)),
    getAgentContext: (value) => task.getAgentContext(state(value)),
    evaluateSignals: (value) => task.evaluateSignals(state(value)),
  };
}

const implementedTasks: Partial<Record<TaskId, ExperimentTask<unknown>>> = {
  birthday: registerTask(birthdayTask), weekend: registerTask(weekendTask),
  schedule: registerTask(scheduleTask),
};
export function getTask(taskId: TaskId) { return implementedTasks[taskId]; }
