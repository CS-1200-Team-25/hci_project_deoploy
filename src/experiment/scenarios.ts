import type { TaskId } from '../types/experiment';
import { BIRTHDAY_REQUIREMENTS } from '../tasks/birthday-rules';

/** Fixed fictional pilot drafts; later task workspaces implement these requirements. */
export const PILOT_SCENARIOS: Record<TaskId, { title: string; instructions: string }> = {
  birthday: {
    title: 'Birthday-party planning',
    instructions: `Plan a fictional Saturday party for 12 guests, 14:00–17:00, within a $${BIRTHDAY_REQUIREMENTS.budget} budget. Include at least 12 food servings, 12 drink servings, one activity and one decoration. Include every food, drink, activity and decoration cost. Keep activities within the party window without overlaps. Extra activities are optional.`,
  },
  weekend: {
    title: 'Weekend-itinerary planning',
    instructions: 'Plan a fictional trip for one traveler, Saturday 09:00 through Sunday 18:00, within a $500 budget. Include Saturday-night lodging, transport and at least two activities each day. Include every activity, lodging and transport cost. Start at the station Saturday 09:00 and return there by Sunday 18:00. Lodging reserves Saturday 22:00–Sunday 08:00 at its listed location; include travel before check-in and after checkout. Respect listed opening windows, fixed travel times and avoid overlaps. Activity durations must fit entirely in their opening windows. Transport prices cover all transfers. Route efficiency beyond feasibility is optional.',
  },
  schedule: {
    title: 'Weekly-schedule planning',
    instructions: 'Arrange a fictional Monday–Friday week within 08:00–20:00 daily. Preserve classes Monday, Wednesday and Friday 09:00–11:00 and work Tuesday and Thursday 13:00–17:00. Schedule four assignment preparation hours before Friday 17:00. Count whole preparation minutes earlier than the deadline, including the portion of a block before it; later minutes do not count. Durations must be positive whole minutes. Blocks may meet at an endpoint; avoid overlaps and blocks outside daily bounds. Meals, rest, exercise and extra buffers are optional.',
  },
};
