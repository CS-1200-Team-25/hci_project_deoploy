import type { ValidationResult } from './task';

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
  status: 'pending' | 'active' | 'completed' | 'terminated';
  startedAt?: number;
  completedAt?: number;
  outcome?: 'successful' | 'unsuccessful';
  terminationReason?: string;
  taskState?: unknown;
  taskVersion?: string;
  stateRevision: number;
  submissionAttempts?: { timestamp: number; stateRevision: number; validation: ValidationResult }[];
  finalPlan?: unknown;
  finalValidation?: ValidationResult;
  elapsedMs?: number;
  successfulCompletionMs?: number;
}

export interface PilotConfiguration {
  version: string;
  sequenceVersion: string;
  scenarioVersion: string;
  policyVersion: string;
  conditions: Record<ConditionId, { proactive: boolean; threshold: number | null }>;
}

export interface ExperimentEvent {
  id: string;
  sequence: number;
  sessionId: string;
  participantId: string;
  trialId?: string;
  taskId?: TaskId;
  condition?: ConditionId;
  timestamp: number;
  eventType: string;
  payload: Record<string, unknown>;
}

/** Pilot instruments; their controller-owned submission screens follow in later work. */
export interface PostTaskSurvey {
  helpfulness: number | 'not-applicable';
  interruption: number;
  submittedAt: number;
}

export interface FinalSurvey {
  preferredTrialId: string | null;
  explanation: string;
  submittedAt: number;
}

export interface ExperimentSession {
  schemaVersion: 1;
  sessionId: string;
  participantId: string;
  phase: ExperimentPhase;
  trials: Trial[];
  currentTrialIndex: number;
  startedAt: number;
  sequenceIndex: number;
  sequenceId: string;
  configuration: PilotConfiguration;
  events: ExperimentEvent[];
  lastSavedAt: number;
  consentedAt?: number;
  postTaskSurveys: Record<string, PostTaskSurvey>;
  finalSurvey?: FinalSurvey;
  supervisorAccess?: { salt: string; verifier: string };
}
