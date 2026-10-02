export type ExperimentPhase =
  | 'welcome'
  | 'instructions'
  | 'task'
  | 'post-task-survey'
  | 'final-survey'
  | 'complete';

export type TaskId = 'birthday' | 'weekend' | 'schedule';
export type ConditionId = 'baseline' | 'low' | 'high';

export interface Trial {
  id: string;
  task: TaskId;
  condition: ConditionId;
  status: 'pending' | 'active' | 'completed';
  startedAt?: number;
  completedAt?: number;
}

export interface ExperimentSession {
  sessionId: string;
  participantId: string;
  phase: ExperimentPhase;
  trials: Trial[];
  currentTrialIndex: number;
  startedAt: number;
}
