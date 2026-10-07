import type { TaskId } from '../types/experiment';

/** Fixed fictional pilot drafts; later task workspaces implement these requirements. */
export const PILOT_SCENARIOS: Record<TaskId, { title: string; instructions: string }> = {
  birthday: {
    title: 'Birthday-party planning',
    instructions: 'Plan a fictional Saturday party for 12 guests, 14:00–17:00, within a $300 budget. Include at least 12 food servings, 12 drink servings and one activity. Keep activities within the party window without overlaps. Decorations and extra activities are optional.',
  },
  weekend: {
    title: 'Weekend-itinerary planning',
    instructions: 'Plan a fictional trip for one traveler, Saturday 09:00 through Sunday 18:00, within a $500 budget. Include Saturday-night lodging, transport and at least two activities each day. Include lodging and transport in the budget. Respect opening windows, travel times and avoid overlaps. Route efficiency beyond feasibility is optional.',
  },
  schedule: {
    title: 'Weekly-schedule planning',
    instructions: 'Arrange a fictional Monday–Friday week within 08:00–20:00 daily. Preserve classes Monday, Wednesday and Friday 09:00–11:00 and work Tuesday and Thursday 13:00–17:00. Schedule four assignment preparation hours before Friday 17:00. Avoid overlaps and blocks outside daily bounds. Meals, rest, exercise and extra buffers are optional.',
  },
};
