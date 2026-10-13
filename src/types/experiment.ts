import type { ValidationResult } from './task';
import type { AgentSignal } from './agent';
import type { GenerationRecord, ShownIntervention } from '../agent/generation';

export interface SelectionHistory {
  id: string;
  signal: AgentSignal;
  selectedAt: number;
  stateRevision: number;
  resolvedAt?: number;
}

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
  /** Start of each currently unresolved stable signal's occurrence. */
  issueStartedAt?: Record<string, number>;
  submissionAttempts?: { timestamp: number; stateRevision: number; validation: ValidationResult }[];
  finalPlan?: unknown;
  finalValidation?: ValidationResult;
  elapsedMs?: number;
  successfulCompletionMs?: number;
  agentHistory?: { selections: SelectionHistory[]; displays: { signalId: string; timestamp: number }[]; inFlightSignalIds: string[];
    requests?: GenerationRecord[]; interventions?: ShownIntervention[] };
}

export interface PilotConfiguration {
  version: string;
  sequenceVersion: string;
  scenarioVersion: string;
  policyVersion: string;
  surveyVersion: string;
  signalVersion: string;
  displayCooldowns: { globalMs: number; signalMs: number };
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

/** Fixed pilot-draft instruments submitted through controller-owned phase gates. */
export type SurveyRating = number | 'not-applicable';

export interface PostTaskSurvey {
  helpfulness: SurveyRating;
  interruption: SurveyRating;
  submittedAt: number;
}
export type PostTaskSurveyDraft = Partial<Pick<PostTaskSurvey, 'helpfulness' | 'interruption'>>;
export interface FinalSurveyDraft { preferredTrialId?: string | null; explanation: string }

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
  persistedAt?: number;
  consentedAt?: number;
  postTaskSurveys: Record<string, PostTaskSurvey>;
  postTaskSurveyDrafts: Record<string, PostTaskSurveyDraft>;
  finalSurveyDraft: FinalSurveyDraft;
  completedAt?: number;
  finalSurvey?: FinalSurvey;
  supervisorAccess?: { salt: string; verifier: string };
}
