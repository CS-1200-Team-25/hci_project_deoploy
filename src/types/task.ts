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
  version: string;
  isState(state: unknown): state is TState;
  validate(state: TState): ValidationResult;
  getAgentContext(state: TState): AgentContext;
  evaluateSignals(state: TState): AgentSignal[];
}

export interface TaskAction {
  type: 'item_added' | 'item_removed' | 'item_updated' | 'item_moved';
  payload: Record<string, unknown>;
}
