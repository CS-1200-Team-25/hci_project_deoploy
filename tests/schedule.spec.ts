import { expect, test } from '@playwright/test';
import { FIXED_COMMITMENTS, scheduleTask } from '../src/tasks/schedule';
import { consentToSession, createSession, revealTask, updateTaskState } from '../src/experiment/session';
import { loadSession, saveSession } from '../src/experiment/persistence';

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
  await preparation.getByLabel('Day').selectOption('4');
  await preparation.getByLabel('Start time').fill('14:00');
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('alert')).toContainText('four preparation hours (240 minutes) before Friday 17:00');
  await preparation.getByLabel('Start time').fill('13:00');
  await page.getByRole('button', { name: 'Add optional block' }).click();
  const optional = page.getByRole('group', { name: 'meal block 2' });
  await optional.getByLabel('Block type').selectOption('exercise');
  await page.getByRole('group', { name: 'exercise block 2' }).getByRole('button', { name: 'Remove' }).click();
  await page.clock.runFor(75000);
  await page.reload();
  preparation = page.getByRole('group', { name: 'preparation block 1' });
  await expect(preparation.getByLabel('Day')).toHaveValue('4');
  await expect(preparation.getByLabel('Start time')).toHaveValue('13:00');
  await expect(page.getByText('Preparation before deadline: 240 minutes')).toBeVisible();
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('heading', { name: 'Task submitted successfully' })).toBeVisible();
  await expect(page.getByText('Optional improvements')).toHaveCount(0);
  await page.reload();
  const session = await page.evaluate(async () => {
    const path = '/src/experiment/persistence.ts';
    return (await import(path)).loadSession();
  });
  expect(session.trials[0]).toMatchObject({ task: 'schedule', outcome: 'successful', successfulCompletionMs: 75000, taskVersion: 'schedule-fixture-v1' });
  expect(session.trials[0].finalPlan.blocks.filter((block: { kind: string }) => block.kind === 'class' || block.kind === 'work')).toEqual(FIXED_COMMITMENTS);
  expect(session.trials[0].submissionAttempts).toHaveLength(4);
  expect(session.trials[0].finalValidation.warnings).toEqual(['Meals, rest, exercise and buffers are optional; add them if helpful.']);
  expect(session.events.map((event: { eventType: string }) => event.eventType)).toEqual(expect.arrayContaining(['item_added', 'item_updated', 'item_moved', 'item_removed']));
});

test('four hours of preparation ending at the deadline pass with all fixed commitments', () => {
  const state = { blocks: [...FIXED_COMMITMENTS,
    { id: 'prep', kind: 'preparation' as const, day: 4, startMinute: 780, durationMinutes: 240 },
  ] };
  expect(scheduleTask.validate(state)).toEqual({ isComplete: true, errors: [], warnings: ['Meals, rest, exercise and buffers are optional; add them if helpful.'] });
  expect(scheduleTask.getAgentContext(state).summary.preparationMinutesBeforeDeadline).toBe(240);
});

test('a second passing schedule splits preparation and adds optional blocks at exact adjacency and daily bounds', () => {
  const state = { blocks: [...FIXED_COMMITMENTS,
    { id: 'prep-mon', kind: 'preparation' as const, day: 0, startMinute: 660, durationMinutes: 120 },
    { id: 'prep-tue', kind: 'preparation' as const, day: 1, startMinute: 480, durationMinutes: 120 },
    { id: 'meal', kind: 'meal' as const, day: 0, startMinute: 780, durationMinutes: 30 },
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
  const block = { id: 'prep', kind: 'preparation' as const, day: 4, startMinute: 780, durationMinutes: 240 };
  const late = { blocks: [...FIXED_COMMITMENTS, { ...block, startMinute: 781 }] };
  expect(scheduleTask.getAgentContext(late).summary.preparationMinutesBeforeDeadline).toBe(239);
  expect(scheduleTask.validate(late).isComplete).toBe(false);
  const straddling = { blocks: [...FIXED_COMMITMENTS, { ...block, durationMinutes: 300 }] };
  expect(scheduleTask.getAgentContext(straddling).summary.preparationMinutesBeforeDeadline).toBe(240);
  expect(scheduleTask.validate(straddling).isComplete).toBe(true);
  for (const changes of [{ day: 5 }, { durationMinutes: 0 }, { durationMinutes: -1 }, { durationMinutes: 1.5 }, { startMinute: 479 }]) {
    expect(scheduleTask.validate({ blocks: [...FIXED_COMMITMENTS, { ...block, ...changes }] }).isComplete).toBe(false);
  }
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
