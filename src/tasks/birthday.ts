import type { ExperimentTask, ValidationResult } from '../types/task';
import { PILOT_SCENARIOS } from '../experiment/scenarios';

export interface BirthdayOption {
  id: string;
  label: string;
  category: 'food' | 'drink' | 'activity' | 'decoration';
  cost: number;
  servings?: number;
  durationMinutes?: number;
}

export const BIRTHDAY_CATALOG_VERSION = 'birthday-catalog-v1';
export const BIRTHDAY_CATALOG: BirthdayOption[] = [
  { id: 'sandwich-platter', label: 'Sandwich platter', category: 'food', cost: 45, servings: 6 },
  { id: 'pizza', label: 'Pizza', category: 'food', cost: 30, servings: 4 },
  { id: 'wrap-buffet', label: 'Wrap buffet', category: 'food', cost: 95, servings: 12 },
  { id: 'water-pack', label: 'Water pack', category: 'drink', cost: 18, servings: 12 },
  { id: 'lemonade-jug', label: 'Lemonade jug', category: 'drink', cost: 12, servings: 6 },
  { id: 'party-games', label: 'Party games', category: 'activity', cost: 40, durationMinutes: 45 },
  { id: 'craft-workshop', label: 'Craft workshop', category: 'activity', cost: 70, durationMinutes: 60 },
  { id: 'trivia', label: 'Trivia', category: 'activity', cost: 25, durationMinutes: 30 },
  { id: 'banners', label: 'Banners', category: 'decoration', cost: 20 },
];

export interface BirthdayItem {
  id: string;
  optionId: string;
  quantity: number;
  startMinute?: number;
}
export interface BirthdayState { items: BirthdayItem[] }

export function isBirthdayState(value: unknown): value is BirthdayState {
  if (typeof value !== 'object' || value === null || !('items' in value) || !Array.isArray(value.items)) return false;
  const ids = new Set<string>();
  return value.items.every((item: unknown) => {
    const valid = typeof item === 'object' && item !== null
    && 'id' in item && typeof item.id === 'string' && 'optionId' in item && typeof item.optionId === 'string'
    && 'quantity' in item && typeof item.quantity === 'number' && Number.isFinite(item.quantity)
      && (!('startMinute' in item) || (typeof item.startMinute === 'number' && Number.isFinite(item.startMinute)));
    if (!valid) return false;
    const selection = item as BirthdayItem;
    const option = BIRTHDAY_CATALOG.find((candidate) => candidate.id === selection.optionId);
    if (!option || !selection.id || ids.has(selection.id) || (option.category === 'activity' && selection.startMinute === undefined)) return false;
    ids.add(selection.id);
    return true;
  });
}

export function birthdaySummary(state: BirthdayState) {
  let totalCost = 0;
  let foodServings = 0;
  let drinkServings = 0;
  for (const item of state.items) {
    const option = BIRTHDAY_CATALOG.find((candidate) => candidate.id === item.optionId);
    if (!option) continue;
    totalCost += option.cost * item.quantity;
    if (option.category === 'food') foodServings += (option.servings ?? 0) * item.quantity;
    if (option.category === 'drink') drinkServings += (option.servings ?? 0) * item.quantity;
  }
  return { totalCost, foodServings, drinkServings };
}

function validateBirthday(state: BirthdayState): ValidationResult {
  const errors: string[] = [];
  const activities: { label: string; start: number; end: number }[] = [];
  const ids = new Set<string>();
  let decorations = false;
  for (const item of state.items) {
    const option = BIRTHDAY_CATALOG.find((candidate) => candidate.id === item.optionId);
    if (!option || !item.id || ids.has(item.id)) { errors.push('Every plan item must be a unique catalog selection.'); continue; }
    ids.add(item.id);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || (option.category === 'activity' && item.quantity !== 1)) {
      errors.push(`Use a positive whole quantity for ${option.label}; activities are scheduled individually.`);
    }
    if (option.category === 'decoration') decorations = true;
    if (option.category === 'activity') {
      const start = item.startMinute;
      if (start === undefined || !Number.isInteger(start) || start < 840 || start + (option.durationMinutes ?? 0) > 1020) {
        errors.push(`Schedule ${option.label} entirely within Saturday 14:00–17:00.`);
      } else activities.push({ label: option.label, start, end: start + (option.durationMinutes ?? 0) });
    }
  }
  const summary = birthdaySummary(state);
  if (summary.foodServings < 12) errors.push('Include at least 12 food servings.');
  if (summary.drinkServings < 12) errors.push('Include at least 12 drink servings.');
  if (!state.items.some((item) => BIRTHDAY_CATALOG.find((option) => option.id === item.optionId)?.category === 'activity')) errors.push('Include at least one activity.');
  if (!Number.isFinite(summary.totalCost) || summary.totalCost > 300) errors.push('Keep total cost at or below $300.');
  activities.sort((a, b) => a.start - b.start);
  for (let index = 1; index < activities.length; index++) {
    if (activities[index].start < activities[index - 1].end) errors.push(`${activities[index - 1].label} and ${activities[index].label} overlap.`);
  }
  return { isComplete: errors.length === 0, errors, warnings: decorations ? [] : ['Decorations are optional; none are included.'] };
}

export const birthdayTask: ExperimentTask<BirthdayState> = {
  id: 'birthday',
  title: PILOT_SCENARIOS.birthday.title,
  instructions: PILOT_SCENARIOS.birthday.instructions,
  initialState: { items: [] },
  version: BIRTHDAY_CATALOG_VERSION,
  isState: isBirthdayState,
  validate: validateBirthday,
  getAgentContext: (state) => ({ taskId: 'birthday', summary: birthdaySummary(state) }),
  evaluateSignals: () => [],
};
