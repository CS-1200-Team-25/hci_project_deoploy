import type { AgentContext } from '../types/task';
import type { AgentSignal, Intervention } from '../types/agent';

export interface GenerationConfiguration {
  /** Absent on historical OpenAI records; new endpoints identify their adapter. */
  provider?: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  settings: { maxOutputTokens: number; thinkingBudget?: number; thinkingLevel?: 'minimal' };
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
    && (config.provider === undefined || (typeof config.provider === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(config.provider)))
    && typeof config.promptVersion === 'string' && !!config.promptVersion
    && typeof config.schemaVersion === 'string' && !!config.schemaVersion
    && Number.isSafeInteger(config.settings?.maxOutputTokens) && config.settings.maxOutputTokens > 0
    && (config.settings.thinkingBudget === undefined || (Number.isSafeInteger(config.settings.thinkingBudget) && config.settings.thinkingBudget >= 0))
    && (config.settings.thinkingLevel === undefined || (config.settings.thinkingLevel === 'minimal' && config.settings.thinkingBudget === undefined))
    && Number.isSafeInteger(config.timeoutMs) && config.timeoutMs >= 100 && config.timeoutMs <= 120000;
}

export function validGeneratedAdvice(value: unknown, record: GenerationRecord): value is Omit<Intervention, 'id' | 'timestamp'> & GenerationConfiguration {
  const advice = value as Record<string, unknown> | null;
  return !!advice && advice.signalId === record.request.signal.id
    && ['warning', 'suggestion', 'conflict', 'budget', 'reminder'].includes(String(advice.type))
    && typeof advice.message === 'string' && advice.message.trim().length > 0 && advice.message.length <= 1200
    && advice.target === (record.request.signal.target ?? null)
    && advice.model === record.model && advice.promptVersion === record.promptVersion && advice.schemaVersion === record.schemaVersion
    && advice.provider === record.provider
    && JSON.stringify(advice.settings) === JSON.stringify(record.settings);
}
