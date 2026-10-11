import type { ExperimentTask, ValidationResult } from '../types/task';
import { PILOT_SCENARIOS } from '../experiment/scenarios';

export type WeekendLocation = 'station' | 'museum' | 'park' | 'harbor';
export const WEEKEND_LOCATIONS: WeekendLocation[] = ['station', 'museum', 'park', 'harbor'];
export const WEEKEND_CATALOG_VERSION = 'weekend-catalog-v1';
export const WEEKEND_BOUNDARIES = { start: 540, checkIn: 1320, checkOut: 1920, end: 2520 } as const;

export interface WeekendOption {
  id: string;
  label: string;
  cost: number;
  durationMinutes: number;
  location: WeekendLocation;
  openingWindows: { day: 0 | 1; start: number; end: number }[];
}
function bothDays(start: number, end: number): WeekendOption['openingWindows'] {
  return [{ day: 0, start, end }, { day: 1, start, end }];
}
export const WEEKEND_ACTIVITIES: WeekendOption[] = [
  { id: 'museum', label: 'Museum visit', cost: 35, durationMinutes: 90, location: 'museum', openingWindows: bothDays(600, 1020) },
  { id: 'gallery', label: 'Gallery visit', cost: 25, durationMinutes: 60, location: 'museum', openingWindows: bothDays(540, 1080) },
  { id: 'park-walk', label: 'Park walk', cost: 0, durationMinutes: 60, location: 'park', openingWindows: bothDays(540, 1080) },
  { id: 'breakfast-market', label: 'Breakfast market', cost: 15, durationMinutes: 60, location: 'park', openingWindows: bothDays(480, 720) },
  { id: 'harbor-tour', label: 'Harbor tour', cost: 60, durationMinutes: 90, location: 'harbor', openingWindows: bothDays(600, 960) },
  { id: 'boat-ride', label: 'Boat ride', cost: 100, durationMinutes: 120, location: 'harbor', openingWindows: bothDays(660, 960) },
  { id: 'concert', label: 'Evening concert', cost: 120, durationMinutes: 120, location: 'harbor', openingWindows: [{ day: 0, start: 1080, end: 1260 }] },
];
export const WEEKEND_LODGING: { id: string; label: string; cost: number; location: WeekendLocation }[] = [
  { id: 'guesthouse', label: 'Station guesthouse', cost: 100, location: 'station' },
  { id: 'harbor-hotel', label: 'Harbor hotel', cost: 180, location: 'harbor' },
  { id: 'luxury-suite', label: 'Luxury station suite', cost: 400, location: 'station' },
];
export const WEEKEND_TRANSPORT = [
  { id: 'transit-pass', label: 'Weekend transit pass', cost: 40 },
  { id: 'taxi-package', label: 'Prepaid taxi package', cost: 140 },
] as const;
type TravelMatrix = Record<WeekendLocation, Record<WeekendLocation, number>>;
export const WEEKEND_TRAVEL: Record<string, TravelMatrix> = {
  'transit-pass': {
    station: { station: 0, museum: 20, park: 30, harbor: 40 },
    museum: { station: 20, museum: 0, park: 25, harbor: 35 },
    park: { station: 30, museum: 25, park: 0, harbor: 45 },
    harbor: { station: 40, museum: 35, park: 45, harbor: 0 },
  },
  'taxi-package': {
    station: { station: 0, museum: 10, park: 15, harbor: 20 },
    museum: { station: 10, museum: 0, park: 13, harbor: 18 },
    park: { station: 15, museum: 13, park: 0, harbor: 23 },
    harbor: { station: 20, museum: 18, park: 23, harbor: 0 },
  },
};

export interface WeekendActivity { id: string; optionId: string; startMinute: number }
/** Absolute whole minutes since Saturday 00:00; Sunday is offset by 1440. */
export interface WeekendState { lodgingId: string | null; transportId: string | null; activities: WeekendActivity[] }

export function isWeekendState(value: unknown): value is WeekendState {
  if (typeof value !== 'object' || value === null || !('lodgingId' in value) || !('transportId' in value)
    || !('activities' in value) || !Array.isArray(value.activities)) return false;
  if (value.lodgingId !== null && !WEEKEND_LODGING.some((option) => option.id === value.lodgingId)) return false;
  if (value.transportId !== null && !WEEKEND_TRANSPORT.some((option) => option.id === value.transportId)) return false;
  const ids = new Set<string>();
  return value.activities.every((item: unknown) => {
    if (typeof item !== 'object' || item === null || !('id' in item) || typeof item.id !== 'string' || !item.id || ids.has(item.id)
      || !('optionId' in item) || !WEEKEND_ACTIVITIES.some((option) => option.id === item.optionId)
      || !('startMinute' in item) || typeof item.startMinute !== 'number' || !Number.isFinite(item.startMinute)) return false;
    ids.add(item.id);
    return true;
  });
}

export function weekendSummary(state: WeekendState) {
  const totalCost = (WEEKEND_LODGING.find((option) => option.id === state.lodgingId)?.cost ?? 0)
    + (WEEKEND_TRANSPORT.find((option) => option.id === state.transportId)?.cost ?? 0)
    + state.activities.reduce((sum, item) => sum + (WEEKEND_ACTIVITIES.find((option) => option.id === item.optionId)?.cost ?? 0), 0);
  return { totalCost, saturdayActivities: state.activities.filter((item) => Math.floor(item.startMinute / 1440) === 0).length,
    sundayActivities: state.activities.filter((item) => Math.floor(item.startMinute / 1440) === 1).length };
}

function validateWeekend(state: WeekendState): ValidationResult {
  if (!isWeekendState(state)) return { isComplete: false, errors: ['Use valid unique catalog selections and finite activity times.'], warnings: [] };
  const errors: string[] = [];
  const lodging = WEEKEND_LODGING.find((option) => option.id === state.lodgingId);
  const travel = state.transportId ? WEEKEND_TRAVEL[state.transportId] : undefined;
  if (!lodging) errors.push('Select Saturday-night lodging.');
  if (!travel) errors.push('Select a transport option.');
  const summary = weekendSummary(state);
  if (summary.saturdayActivities < 2) errors.push('Schedule at least two Saturday activities.');
  if (summary.sundayActivities < 2) errors.push('Schedule at least two Sunday activities.');
  if (summary.totalCost > 500) errors.push('Keep all activity, lodging and transport costs at or below $500.');
  const visits = state.activities.map((item) => {
    const option = WEEKEND_ACTIVITIES.find((candidate) => candidate.id === item.optionId)!;
    const day = Math.floor(item.startMinute / 1440);
    const localStart = item.startMinute - day * 1440;
    if (!Number.isSafeInteger(item.startMinute) || item.startMinute < WEEKEND_BOUNDARIES.start
      || item.startMinute + option.durationMinutes > WEEKEND_BOUNDARIES.end) errors.push(`${option.label} must fit within Saturday 09:00–Sunday 18:00.`);
    if (!option.openingWindows.some((window) => window.day === day && localStart >= window.start && localStart + option.durationMinutes <= window.end)) {
      errors.push(`${option.label} must fit entirely within its listed opening hours.`);
    }
    return { label: option.label, location: option.location, start: item.startMinute, end: item.startMinute + option.durationMinutes };
  });
  const route = [
    { label: 'Saturday station arrival', location: 'station' as WeekendLocation, start: WEEKEND_BOUNDARIES.start, end: WEEKEND_BOUNDARIES.start },
    ...visits,
    ...(lodging ? [{ label: 'Overnight lodging', location: lodging.location, start: WEEKEND_BOUNDARIES.checkIn, end: WEEKEND_BOUNDARIES.checkOut }] : []),
    { label: 'Sunday station departure', location: 'station' as WeekendLocation, start: WEEKEND_BOUNDARIES.end, end: WEEKEND_BOUNDARIES.end },
  ].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < route.length; index++) {
    const previous = route[index - 1];
    const next = route[index];
    if (next.start < previous.end) errors.push(`${previous.label} and ${next.label} overlap.`);
    else if (travel && next.start - previous.end < travel[previous.location][next.location]) {
      errors.push(`Allow ${travel[previous.location][next.location]} minutes to travel from ${previous.label} to ${next.label}.`);
    }
  }
  const inefficient = [0, 1].some((day) => {
    const locations = visits.filter((visit) => Math.floor(visit.start / 1440) === day).sort((a, b) => a.start - b.start).map((visit) => visit.location);
    return locations.some((location, index) => index > 1 && location !== locations[index - 1] && locations.slice(0, index - 1).includes(location));
  });
  return { isComplete: errors.length === 0, errors, warnings: inefficient ? ['Optional: group visits at the same location to reduce backtracking.'] : [] };
}

export const weekendTask: ExperimentTask<WeekendState> = {
  id: 'weekend', title: PILOT_SCENARIOS.weekend.title, instructions: PILOT_SCENARIOS.weekend.instructions,
  version: WEEKEND_CATALOG_VERSION, initialState: { lodgingId: null, transportId: null, activities: [] },
  isState: isWeekendState, validate: validateWeekend,
  getAgentContext: (state) => ({ taskId: 'weekend', summary: weekendSummary(state) }), evaluateSignals: () => [],
};
