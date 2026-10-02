export type SignalType =
  | 'budget'
  | 'missing-category'
  | 'coverage'
  | 'schedule-conflict'
  | 'deadline'
  | 'efficiency';

export interface AgentSignal {
  id: string;
  type: SignalType;
  severity: number;
  message: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

export interface Intervention {
  id: string;
  signalId: string;
  type: 'warning' | 'suggestion' | 'conflict' | 'budget' | 'reminder';
  message: string;
  target?: string;
  timestamp: number;
}
