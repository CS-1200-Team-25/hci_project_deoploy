import type { AgentSignal } from '../types/agent';
import type { ExperimentTask, ValidationResult } from '../types/task';
import { PILOT_SCENARIOS } from '../experiment/scenarios';

export const SCHEDULE_VERSION = 'schedule-fixture-v1';
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export type ScheduleKind = 'class' | 'work' | 'preparation' | 'meal' | 'rest' | 'exercise' | 'buffer';
export interface ScheduleBlock { id: string; kind: ScheduleKind; day: number; startMinute: number; durationMinutes: number }
export interface ScheduleState { blocks: ScheduleBlock[] }
export const FIXED_COMMITMENTS: ScheduleBlock[] = [
  { id: 'class-mon', kind: 'class', day: 0, startMinute: 540, durationMinutes: 120 },
  { id: 'class-wed', kind: 'class', day: 2, startMinute: 540, durationMinutes: 120 },
  { id: 'class-fri', kind: 'class', day: 4, startMinute: 540, durationMinutes: 120 },
  { id: 'work-tue', kind: 'work', day: 1, startMinute: 780, durationMinutes: 240 },
  { id: 'work-thu', kind: 'work', day: 3, startMinute: 780, durationMinutes: 240 },
];
export function isFixedCommitment(block: ScheduleBlock) { return FIXED_COMMITMENTS.some((fixed) => fixed.id === block.id); }
function matchesFixedCommitment(block: ScheduleBlock, fixed: ScheduleBlock) {
  return block.id === fixed.id && block.kind === fixed.kind && block.day === fixed.day
    && block.startMinute === fixed.startMinute && block.durationMinutes === fixed.durationMinutes;
}

function isScheduleShape(value: unknown): value is ScheduleState {
  if (typeof value !== 'object' || value === null || !('blocks' in value) || !Array.isArray(value.blocks)) return false;
  const ids = new Set<string>();
  return value.blocks.every((block: unknown) => {
    if (typeof block !== 'object' || block === null || !('id' in block) || typeof block.id !== 'string' || !block.id || ids.has(block.id)
      || !('kind' in block) || !['class', 'work', 'preparation', 'meal', 'rest', 'exercise', 'buffer'].includes(String(block.kind))
      || !['day', 'startMinute', 'durationMinutes'].every((key) => key in block && typeof (block as Record<string, unknown>)[key] === 'number' && Number.isFinite((block as Record<string, unknown>)[key]))) return false;
    ids.add(block.id);
    return true;
  });
}

export function isScheduleState(value: unknown): value is ScheduleState {
  return isScheduleShape(value) && FIXED_COMMITMENTS.every((fixed) => value.blocks.some((block) => matchesFixedCommitment(block, fixed)))
    && value.blocks.every((block) => (block.kind !== 'class' && block.kind !== 'work') || isFixedCommitment(block));
}

export function scheduleSummary(state: ScheduleState) {
  const preparationMinutesBeforeDeadline = state.blocks.filter((block) => block.kind === 'preparation'
    && Number.isInteger(block.day) && block.day >= 0 && block.day <= 4
    && Number.isSafeInteger(block.startMinute) && Number.isSafeInteger(block.durationMinutes)
    && block.durationMinutes > 0 && block.startMinute >= 480 && block.startMinute + block.durationMinutes <= 1200)
    .reduce((minutes, block) => minutes + (block.day < 4 ? block.durationMinutes : Math.max(0, Math.min(block.startMinute + block.durationMinutes, 1020) - block.startMinute)), 0);
  return { preparationMinutesBeforeDeadline, blockCount: state.blocks.length };
}

function validateSchedule(state: ScheduleState): ValidationResult {
  if (!isScheduleShape(state)) return { isComplete: false, errors: ['Use uniquely identified blocks with valid types and finite times.'], warnings: [] };
  const errors: string[] = [];
  for (const fixed of FIXED_COMMITMENTS) {
    if (!state.blocks.some((block) => matchesFixedCommitment(block, fixed))) {
      errors.push(`Preserve the fixed ${WEEKDAYS[fixed.day]} ${fixed.kind} commitment.`);
    }
  }
  for (const block of state.blocks) {
    if ((block.kind === 'class' || block.kind === 'work') && !isFixedCommitment(block)) errors.push('Classes and work are fixed; add preparation or optional blocks instead.');
    if (!Number.isInteger(block.day) || block.day < 0 || block.day > 4
      || !Number.isSafeInteger(block.startMinute) || !Number.isSafeInteger(block.durationMinutes) || block.durationMinutes <= 0
      || block.startMinute < 480 || block.startMinute + block.durationMinutes > 1200) {
      errors.push('Every block must have a positive whole-minute duration within Monday–Friday 08:00–20:00.');
    }
  }
  for (let day = 0; day < 5; day++) {
    const blocks = state.blocks.filter((block) => block.day === day).sort((a, b) => a.startMinute - b.startMinute);
    for (let index = 1; index < blocks.length; index++) {
      if (blocks[index].startMinute < blocks[index - 1].startMinute + blocks[index - 1].durationMinutes) {
        errors.push(`${WEEKDAYS[day]}: ${blocks[index - 1].kind} and ${blocks[index].kind} overlap.`);
      }
    }
  }
  if (scheduleSummary(state).preparationMinutesBeforeDeadline < 240) errors.push('Schedule at least four preparation hours (240 minutes) before Friday 17:00.');
  const hasOptional = state.blocks.some((block) => ['meal', 'rest', 'exercise', 'buffer'].includes(block.kind));
  return { isComplete: errors.length === 0, errors, warnings: hasOptional ? [] : ['Meals, rest, exercise and buffers are optional; add them if helpful.'] };
}

export function evaluateScheduleSignals(state: ScheduleState): AgentSignal[] {
  const signals: AgentSignal[] = [];
  const add = (id: string, type: AgentSignal['type'], severity: number, message: string, metadata: Record<string, unknown>) =>
    signals.push({ id: `schedule:${id}`, type, severity: Math.min(1, Math.max(0, severity)), message, metadata });
  // Only feasible, non-overlapping preparation contributes to assistance coverage.
  const validPreparation = state.blocks.filter(block => block.kind === 'preparation'
    && Number.isInteger(block.day) && block.day >= 0 && block.day <= 4
    && Number.isSafeInteger(block.startMinute) && Number.isSafeInteger(block.durationMinutes)
    && block.durationMinutes > 0 && block.startMinute >= 480 && block.startMinute + block.durationMinutes <= 1200
    && !state.blocks.some(other => other.id !== block.id && other.day === block.day
      && other.startMinute < block.startMinute + block.durationMinutes && block.startMinute < other.startMinute + other.durationMinutes));
  const prepared = scheduleSummary({ blocks: validPreparation }).preparationMinutesBeforeDeadline;
  if (prepared < 240) add('preparation', 'coverage', .4 + .45 * (240 - prepared) / 240,
    'Reserve four non-overlapping preparation hours before Friday 17:00.', { preparedMinutes: prepared, requiredMinutes: 240 });
  for (const block of state.blocks) {
    if (!Number.isInteger(block.day) || block.day < 0 || block.day > 4 || !Number.isSafeInteger(block.startMinute)
      || !Number.isSafeInteger(block.durationMinutes) || block.durationMinutes <= 0 || block.startMinute < 480 || block.startMinute + block.durationMinutes > 1200) {
      add(`bounds:${block.id}`, 'schedule-conflict', .9, 'Keep blocks within weekday 08:00 to 20:00 with positive whole-minute duration.', { block });
    }
    if (block.kind === 'preparation' && block.day === 4 && block.startMinute + block.durationMinutes > 1020) {
      add(`deadline:${block.id}`, 'deadline', .9, 'Preparation after Friday 17:00 does not count toward the assignment.', { block, deadline: { day: 4, minute: 1020 } });
    }
  }
  for (let day = 0; day < 5; day++) {
    const blocks = state.blocks.filter(block => block.day === day).sort((a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id));
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (b.startMinute < a.startMinute + a.durationMinutes && a.startMinute < b.startMinute + b.durationMinutes) {
        add(`overlap:${[a.id, b.id].sort().join(':')}`, 'schedule-conflict', .9, 'Separate overlapping blocks.', { day, blocks: [a, b] });
      }
    }
    for (let i = 1; i < blocks.length; i++) {
      const a = blocks[i - 1], b = blocks[i], gap = b.startMinute - a.startMinute - a.durationMinutes;
      if (gap >= 0 && gap < 15) add(`back-to-back:${a.id}:${b.id}`, 'efficiency', .45 * (15 - gap) / 15,
        'Optionally leave a short transition buffer between these blocks.', { day, blocks: [a, b], gapMinutes: gap, suggestedMinutes: 15 });
    }
  }
  for (const kind of ['meal', 'rest', 'exercise'] as const) {
    if (!state.blocks.some(block => block.kind === kind)) add(`optional:${kind}`, 'missing-category', .45,
      `Optionally reserve time for ${kind}; this is not required to pass.`, { category: kind, optional: true });
  }
  return signals;
}

export const scheduleTask: ExperimentTask<ScheduleState> = {
  id: 'schedule', title: PILOT_SCENARIOS.schedule.title, instructions: PILOT_SCENARIOS.schedule.instructions,
  version: SCHEDULE_VERSION, initialState: { blocks: structuredClone(FIXED_COMMITMENTS) }, isState: isScheduleState,
  validate: validateSchedule, getAgentContext: (state) => ({ taskId: 'schedule', summary: { ...scheduleSummary(state), plan: structuredClone(state), fixedCommitments: FIXED_COMMITMENTS, constraints: { weekdays: WEEKDAYS, startMinute: 480, endMinute: 1200, preparationMinutes: 240, deadline: { day: 4, minute: 1020 }, optionalKinds: ['meal', 'rest', 'exercise', 'buffer'] } } }), evaluateSignals: evaluateScheduleSignals,
};
