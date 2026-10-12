import type { AgentContext } from '../types/task';
import type { AgentSignal, Intervention } from '../types/agent';

export interface GenerationConfiguration {
  model: string;
  promptVersion: string;
  schemaVersion: string;
  settings: { maxOutputTokens: number };
  timeoutMs: number;
}
export interface GenerationRequest {
  requestId: string;
  sessionId: string;
  trialId: string;
  taskId: AgentContext['taskId'];
  stateRevision: number;
  selectionId: string;
  signal: AgentSignal;
  context: AgentContext;
}
export interface GenerationRecord extends GenerationConfiguration {
  id: string;
  request: GenerationRequest;
  requestedAt: number;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'timeout' | 'invalid' | 'interrupted' | 'stale';
  finishedAt?: number;
  latencyMs?: number;
  reason?: string;
  response?: unknown;
}
export interface ShownIntervention extends Intervention {
  requestId: string;
  selectionId: string;
  response?: 'acknowledged' | 'dismissed';
  respondedAt?: number;
}

export function validGenerationConfiguration(value: unknown): value is GenerationConfiguration {
  const config = value as GenerationConfiguration | null;
  return !!config && typeof config.model === 'string' && !!config.model
    && typeof config.promptVersion === 'string' && !!config.promptVersion
    && typeof config.schemaVersion === 'string' && !!config.schemaVersion
    && Number.isSafeInteger(config.settings?.maxOutputTokens) && config.settings.maxOutputTokens > 0
    && Number.isSafeInteger(config.timeoutMs) && config.timeoutMs >= 100 && config.timeoutMs <= 120000;
}

export function validGeneratedAdvice(value: unknown, record: GenerationRecord): value is Omit<Intervention, 'id' | 'timestamp'> & GenerationConfiguration {
  const advice = value as Record<string, unknown> | null;
  return !!advice && advice.signalId === record.request.signal.id
    && ['warning', 'suggestion', 'conflict', 'budget', 'reminder'].includes(String(advice.type))
    && typeof advice.message === 'string' && advice.message.trim().length > 0 && advice.message.length <= 1200
    && advice.target === (record.request.signal.target ?? null)
    && advice.model === record.model && advice.promptVersion === record.promptVersion && advice.schemaVersion === record.schemaVersion
    && JSON.stringify(advice.settings) === JSON.stringify(record.settings);
}
