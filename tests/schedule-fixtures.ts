import { FIXED_COMMITMENTS } from '../src/tasks/schedule';
import type { ScheduleBlock } from '../src/tasks/schedule';

export const DISTRIBUTED_PREPARATION: ScheduleBlock[] = [
  { id: 'prep-mon', kind: 'preparation', day: 0, startMinute: 720, durationMinutes: 90 },
  { id: 'prep-tue', kind: 'preparation', day: 1, startMinute: 540, durationMinutes: 90 },
  { id: 'prep-fri', kind: 'preparation', day: 4, startMinute: 960, durationMinutes: 60 },
];
export const PASSING_SCHEDULE = { blocks: [...FIXED_COMMITMENTS, ...DISTRIBUTED_PREPARATION] };
