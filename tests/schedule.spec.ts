import { expect, test } from '@playwright/test';
import { FIXED_COMMITMENTS, scheduleTask } from '../src/tasks/schedule';
import { consentToSession, createSession, revealTask, updateTaskState } from '../src/experiment/session';
import { loadSession, saveSession } from '../src/experiment/persistence';
import { DISTRIBUTED_PREPARATION, PASSING_SCHEDULE } from './schedule-fixtures';

test('participant corrects conflicts and deadline timing while fixed commitments stay unchanged through recovery', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T12:00:01Z'));
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('S001');
  await page.getByLabel('Sequence index').fill('25');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await expect(page.getByRole('region', { name: 'Fixed commitments' }).getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('alert')).toContainText('at least four preparation hours');
  await page.getByRole('button', { name: 'Add preparation block' }).click();
  let preparation = page.getByRole('group', { name: 'preparation block 1' });
  await preparation.getByLabel('Start time').fill('10:00');
  await preparation.getByLabel('Duration (minutes)').fill('240');
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('alert')).toContainText('Monday: class and preparation overlap');
  await expect(page.getByRole('alert')).toContainText('at least 3 different weekdays');
  await expect(page.getByRole('alert')).toContainText('Monday at or below 90 minutes');
  await preparation.getByLabel('Day').selectOption('4');
  await preparation.getByLabel('Start time').fill('14:00');
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('alert')).toContainText('four preparation hours (240 minutes) before Friday 17:00');
  await preparation.getByLabel('Start time').fill('16:00');
  await preparation.getByLabel('Duration (minutes)').fill('60');
  await page.getByRole('button', { name: 'Add preparation block' }).click();
  await page.getByRole('group', { name: 'preparation block 2' }).getByLabel('Duration (minutes)').fill('90');
  await page.getByRole('button', { name: 'Add preparation block' }).click();
  const tuesday = page.getByRole('group', { name: 'preparation block 3' });
  await tuesday.getByLabel('Day').selectOption('1');
  await tuesday.getByLabel('Duration (minutes)').fill('90');
  await page.getByRole('button', { name: 'Add optional block' }).click();
  const optional = page.getByRole('group', { name: 'meal block 4' });
  await optional.getByLabel('Block type').selectOption('exercise');
  await page.getByRole('group', { name: 'exercise block 4' }).getByRole('button', { name: 'Remove' }).click();
  await page.clock.runFor(75000);
  await page.reload();
  preparation = page.getByRole('group', { name: 'preparation block 1' });
  await expect(preparation.getByLabel('Day')).toHaveValue('4');
  await expect(preparation.getByLabel('Start time')).toHaveValue('16:00');
  await expect(page.getByText('Preparation before deadline: 240 minutes')).toBeVisible();
  await expect(page.getByText('Preparation days before deadline: 3 (at least 3 required)')).toBeVisible();
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('heading', { name: 'Task submitted successfully' })).toBeVisible();
  await expect(page.getByText('Optional improvements')).toHaveCount(0);
  await page.reload();
  const session = await page.evaluate(async () => {
    const path = '/src/experiment/persistence.ts';
    return (await import(path)).loadSession();
  });
  expect(session.trials[0]).toMatchObject({ task: 'schedule', outcome: 'successful', successfulCompletionMs: 75000, taskVersion: 'schedule-fixture-v2' });
  expect(session.trials[0].finalPlan.blocks.filter((block: { kind: string }) => block.kind === 'class' || block.kind === 'work')).toEqual(FIXED_COMMITMENTS);
  expect(session.trials[0].submissionAttempts).toHaveLength(4);
  expect(session.trials[0].finalValidation.warnings).toEqual(['Meals, rest, exercise and buffers are optional; add them if helpful.']);
  expect(session.events.map((event: { eventType: string }) => event.eventType)).toEqual(expect.arrayContaining(['item_added', 'item_updated', 'item_moved', 'item_removed']));
});

test('four hours across three days with exact daily caps and deadline pass', () => {
  const state = PASSING_SCHEDULE;
  expect(scheduleTask.validate(state)).toEqual({ isComplete: true, errors: [], warnings: ['Meals, rest, exercise and buffers are optional; add them if helpful.'] });
  expect(scheduleTask.getAgentContext(state).summary.preparationMinutesBeforeDeadline).toBe(240);
  expect(scheduleTask.getAgentContext(state).summary).toMatchObject({ preparationDaysBeforeDeadline: 3, dailyPreparationMinutes: [90, 90, 0, 0, 60] });
});

test('a second passing schedule splits preparation and adds optional blocks at exact adjacency and daily bounds', () => {
  const state = { blocks: [...FIXED_COMMITMENTS,
    { id: 'prep-mon', kind: 'preparation' as const, day: 0, startMinute: 660, durationMinutes: 90 },
    { id: 'prep-tue', kind: 'preparation' as const, day: 1, startMinute: 480, durationMinutes: 90 },
    { id: 'prep-wed', kind: 'preparation' as const, day: 2, startMinute: 660, durationMinutes: 60 },
    { id: 'meal', kind: 'meal' as const, day: 0, startMinute: 750, durationMinutes: 30 },
    { id: 'exercise', kind: 'exercise' as const, day: 3, startMinute: 1020, durationMinutes: 60 },
    { id: 'rest', kind: 'rest' as const, day: 2, startMinute: 1140, durationMinutes: 60 },
  ] };
  expect(scheduleTask.validate(state)).toEqual({ isComplete: true, errors: [], warnings: [] });
  expect(scheduleTask.validate({ blocks: state.blocks.map((block) => block.id === 'rest' ? { ...block, durationMinutes: 61 } : block) }).errors)
    .toContain('Every block must have a positive whole-minute duration within Monday–Friday 08:00–20:00.');
  expect(scheduleTask.validate({ blocks: state.blocks.map((block) => block.id === 'prep-mon' ? { ...block, startMinute: 659 } : block) }).errors)
    .toContain('Monday: class and preparation overlap.');
});

test('only time before the deadline counts, and invalid day or nonpositive/fractional duration cannot pass', () => {
  const block = DISTRIBUTED_PREPARATION[2];
  const earlierDays = [...FIXED_COMMITMENTS, ...DISTRIBUTED_PREPARATION.slice(0, 2)];
  const late = { blocks: [...earlierDays, { ...block, startMinute: 961 }] };
  expect(scheduleTask.getAgentContext(late).summary.preparationMinutesBeforeDeadline).toBe(239);
  expect(scheduleTask.validate(late).isComplete).toBe(false);
  const straddling = { blocks: [...earlierDays, { ...block, durationMinutes: 90 }] };
  expect(scheduleTask.getAgentContext(straddling).summary.preparationMinutesBeforeDeadline).toBe(240);
  expect(scheduleTask.validate(straddling).isComplete).toBe(true);
  for (const changes of [{ day: 5 }, { durationMinutes: 0 }, { durationMinutes: -1 }, { durationMinutes: 1.5 }, { startMinute: 479 }]) {
    expect(scheduleTask.validate({ blocks: [...earlierDays, { ...block, ...changes }] }).isComplete).toBe(false);
  }
});

test('the old single-block shortcut and two-day plans cannot pass', () => {
  const single = { blocks: [...FIXED_COMMITMENTS, { id: 'prep', kind: 'preparation' as const, day: 0, startMinute: 660, durationMinutes: 240 }] };
  expect(scheduleTask.validate(single).errors).toEqual([
    'Spread preparation before Friday 17:00 across at least 3 different weekdays.',
    'Keep total preparation on Monday at or below 90 minutes, including time after the deadline.',
  ]);
  const twoDays = { blocks: [...FIXED_COMMITMENTS,
    { id: 'a', kind: 'preparation' as const, day: 0, startMinute: 660, durationMinutes: 120 },
    { id: 'b', kind: 'preparation' as const, day: 2, startMinute: 660, durationMinutes: 120 },
  ] };
  expect(scheduleTask.validate(twoDays).errors).toHaveLength(3);
});

test('daily limits aggregate separate blocks and include minutes after the deadline', () => {
  const over = { blocks: [...PASSING_SCHEDULE.blocks,
    { id: 'extra', kind: 'preparation' as const, day: 0, startMinute: 840, durationMinutes: 1 },
  ] };
  expect(scheduleTask.validate(over).errors).toEqual(['Keep total preparation on Monday at or below 90 minutes, including time after the deadline.']);
  const friday = { blocks: PASSING_SCHEDULE.blocks.map(block => block.id === 'prep-fri' ? { ...block, durationMinutes: 91 } : block) };
  expect(scheduleTask.validate(friday).errors).toEqual(['Keep total preparation on Friday at or below 90 minutes, including time after the deadline.']);
  const afterDeadline = { blocks: PASSING_SCHEDULE.blocks.map(block => block.id === 'prep-fri' ? { ...block, startMinute: 1020 } : block) };
  expect(scheduleTask.getAgentContext(afterDeadline).summary.preparationDaysBeforeDeadline).toBe(2);
  expect(scheduleTask.validate(afterDeadline).errors).toContain('Spread preparation before Friday 17:00 across at least 3 different weekdays.');
});

test('distribution and daily-limit signals are stable, bounded and resolve after redistribution', () => {
  const state = { blocks: [...FIXED_COMMITMENTS, { id: 'prep', kind: 'preparation' as const, day: 0, startMinute: 660, durationMinutes: 240 }] };
  const signals = scheduleTask.evaluateSignals(state);
  expect(signals).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'schedule:preparation-days', type: 'coverage' }),
    expect.objectContaining({ id: 'schedule:preparation-limit:0', type: 'schedule-conflict', severity: .9, metadata: { day: 0, weekday: 'Monday', plannedMinutes: 240, maxMinutes: 90 } }),
  ]));
  expect(signals.find(signal => signal.id === 'schedule:preparation-days')?.severity).toBeCloseTo(2 / 3);
  expect(scheduleTask.evaluateSignals({ blocks: [...state.blocks].reverse() }).map(signal => signal.id).sort()).toEqual(signals.map(signal => signal.id).sort());
  expect(signals.every(signal => signal.severity >= 0 && signal.severity <= 1)).toBe(true);
  expect(scheduleTask.evaluateSignals(PASSING_SCHEDULE).some(signal => /preparation-days|preparation-limit/.test(signal.id))).toBe(false);
});

test('fixed commitments cannot be changed through edits or damaged recovery', () => {
  const active = revealTask(consentToSession(createSession('S002', 25, 1000), 1500), 2000);
  const damaged = { blocks: FIXED_COMMITMENTS.map((block) => block.id === 'class-mon' ? { ...block, startMinute: 541 } : block) };
  expect(scheduleTask.validate(damaged).errors).toContain('Preserve the fixed Monday class commitment.');
  expect(() => updateTaskState(active, damaged, { type: 'item_moved', payload: {} })).toThrow('Invalid task state.');
  let serialized: string | null = null;
  const storage = { getItem: () => serialized, setItem: (_key: string, value: string) => { serialized = value; } };
  saveSession({ ...active, trials: active.trials.map((trial, index) => index === 0 ? { ...trial, taskState: damaged } : trial) }, storage, 3000);
  const original = serialized;
  expect(() => loadSession(storage)).toThrow(/incompatible or damaged/);
  expect(serialized).toBe(original);
});
