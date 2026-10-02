import type { AgentSignal } from './agent';
import type { TaskId } from './experiment';

export interface ValidationResult {
  isComplete: boolean;
  errors: string[];
  warnings: string[];
}

export interface AgentContext {
  taskId: TaskId;
  summary: Record<string, unknown>;
}

export interface ExperimentTask<TState> {
  id: TaskId;
  title: string;
  instructions: string;
  initialState: TState;
  validate(state: TState): ValidationResult;
  getAgentContext(state: TState): AgentContext;
  evaluateSignals(state: TState): AgentSignal[];
}
