import type { ConditionId, TaskId } from '../types/experiment';

const taskOrders: TaskId[][] = [
  ['birthday', 'weekend', 'schedule'], ['birthday', 'schedule', 'weekend'],
  ['weekend', 'birthday', 'schedule'], ['weekend', 'schedule', 'birthday'],
  ['schedule', 'birthday', 'weekend'], ['schedule', 'weekend', 'birthday'],
];
const conditionOrders: ConditionId[][] = [
  ['baseline', 'low', 'high'], ['baseline', 'high', 'low'],
  ['low', 'baseline', 'high'], ['low', 'high', 'baseline'],
  ['high', 'baseline', 'low'], ['high', 'low', 'baseline'],
];

export const experimentSequences = taskOrders.flatMap((tasks, taskOrderIndex) =>
  conditionOrders.map((conditions, conditionOrderIndex) => ({
    id: `sequence-${taskOrderIndex * 6 + conditionOrderIndex + 1}`,
    trials: tasks.map((task, index) => ({ task, condition: conditions[index] })),
  })),
);
