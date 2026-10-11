import { expect, test } from '@playwright/test';
import { weekendTask } from '../src/tasks/weekend';

test('participant corrects missing requirements, budget, opening hours and travel before a saved timed submission', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T12:00:01Z'));
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('W001');
  await page.getByLabel('Sequence index').fill('13');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('alert')).toContainText('Select Saturday-night lodging');
  await expect(page.getByRole('alert')).toContainText('Select a transport option');
  await expect(page.getByRole('alert')).toContainText('Schedule at least two Saturday activities');
  await expect(page.getByRole('alert')).toContainText('Schedule at least two Sunday activities');
  await page.getByLabel('Saturday-night lodging').selectOption('luxury-suite');
  await page.getByLabel('Transport option').selectOption('transit-pass');
  await page.getByRole('button', { name: 'Add Museum visit', exact: true }).click();
  await page.getByRole('button', { name: 'Add Gallery visit', exact: true }).click();
  await page.getByRole('button', { name: 'Add Park walk', exact: true }).click();
  await page.getByRole('button', { name: 'Add Harbor tour', exact: true }).click();
  await page.getByRole('group', { name: 'Museum visit booking 1' }).getByLabel('Start time').fill('09:30');
  await page.getByRole('group', { name: 'Gallery visit booking 2' }).getByLabel('Start time').fill('11:00');
  await page.getByRole('group', { name: 'Park walk booking 3' }).getByLabel('Day').selectOption('1');
  await page.getByRole('group', { name: 'Park walk booking 3' }).getByLabel('Start time').fill('09:00');
  await page.getByRole('group', { name: 'Harbor tour booking 4' }).getByLabel('Day').selectOption('1');
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('alert')).toContainText('at or below $500');
  await expect(page.getByRole('alert')).toContainText('Museum visit must fit entirely within its listed opening hours');
  await expect(page.getByRole('alert')).toContainText('Allow 45 minutes to travel from Park walk to Harbor tour');
  await page.getByLabel('Saturday-night lodging').selectOption('guesthouse');
  await page.getByRole('group', { name: 'Museum visit booking 1' }).getByLabel('Start time').fill('10:00');
  await page.getByRole('group', { name: 'Gallery visit booking 2' }).getByLabel('Start time').fill('11:30');
  await page.getByRole('group', { name: 'Harbor tour booking 4' }).getByLabel('Start time').fill('10:45');
  await page.getByRole('button', { name: 'Add Boat ride', exact: true }).click();
  await page.getByRole('group', { name: 'Boat ride booking 5' }).getByRole('button', { name: 'Remove' }).click();
  await page.clock.runFor(75000);
  await page.reload();
  await expect(page.getByText('Total trip cost: $260')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Harbor tour booking 4' }).getByLabel('Day')).toHaveValue('1');
  await expect(page.getByRole('group', { name: 'Harbor tour booking 4' }).getByLabel('Start time')).toHaveValue('10:45');
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('heading', { name: 'Task submitted successfully' })).toBeVisible();
  await expect(page.getByLabel('Elapsed time')).toHaveText('Elapsed01:15');
  await page.reload();
  const session = await page.evaluate(async () => {
    const path = '/src/experiment/persistence.ts';
    return (await import(path)).loadSession();
  });
  expect(session.trials[0]).toMatchObject({ task: 'weekend', outcome: 'successful', successfulCompletionMs: 75000, taskVersion: 'weekend-catalog-v1' });
  expect(session.trials[0].submissionAttempts).toHaveLength(3);
  expect(session.trials[0].finalPlan.activities).toHaveLength(4);
  expect(session.events.map((event: { eventType: string }) => event.eventType)).toEqual(expect.arrayContaining(['item_added', 'item_updated', 'item_moved', 'item_removed']));
});

test('a weekend catalog itinerary covers both days, overnight lodging and all required costs', () => {
  const state = { lodgingId: 'guesthouse', transportId: 'transit-pass', activities: [
    { id: 'sat-museum', optionId: 'museum', startMinute: 600 },
    { id: 'sat-gallery', optionId: 'gallery', startMinute: 720 },
    { id: 'sun-park', optionId: 'park-walk', startMinute: 1980 },
    { id: 'sun-harbor', optionId: 'harbor-tour', startMinute: 2100 },
  ] };
  expect(weekendTask.validate(state)).toEqual({ isComplete: true, errors: [], warnings: [] });
  expect(weekendTask.getAgentContext(state).summary).toMatchObject({ totalCost: 260, saturdayActivities: 2, sundayActivities: 2 });
});

test('a second distinct itinerary exactly uses the $500 budget and rejects an extra paid booking', () => {
  const state = { lodgingId: 'harbor-hotel', transportId: 'transit-pass', activities: [
    { id: 'sat-boat', optionId: 'boat-ride', startMinute: 660 },
    { id: 'sat-concert', optionId: 'concert', startMinute: 1080 },
    { id: 'sun-museum', optionId: 'museum', startMinute: 2040 },
    { id: 'sun-gallery', optionId: 'gallery', startMinute: 2160 },
  ] };
  expect(weekendTask.getAgentContext(state).summary.totalCost).toBe(500);
  expect(weekendTask.validate(state).isComplete).toBe(true);
  expect(weekendTask.validate({ ...state, activities: [...state.activities, { id: 'extra', optionId: 'harbor-tour', startMinute: 810 }] }).errors)
    .toContain('Keep all activity, lodging and transport costs at or below $500.');
});

test('exact travel and opening boundaries pass, while one-minute travel deficits, overlaps and closed-day bookings fail', () => {
  const state = { lodgingId: 'guesthouse', transportId: 'transit-pass', activities: [
    { id: 'sat-gallery', optionId: 'gallery', startMinute: 560 },
    { id: 'sat-museum', optionId: 'museum', startMinute: 630 },
    { id: 'sun-breakfast', optionId: 'breakfast-market', startMinute: 1950 },
    { id: 'sun-park', optionId: 'park-walk', startMinute: 2460 },
  ] };
  // Station09:00→gallery09:20 exactly20min; checkout08:00→breakfast08:30 exactly30min.
  // Park17:00–18:00 itself fits, but cannot return to the station by18:00.
  expect(weekendTask.validate(state).errors).toContain('Allow 30 minutes to travel from Park walk to Sunday station departure.');
  const passing = { ...state, activities: state.activities.map((item) => item.id === 'sun-park' ? { ...item, startMinute: 2430 } : item) };
  expect(weekendTask.validate(passing).isComplete).toBe(true);
  expect(weekendTask.validate({ ...passing, activities: passing.activities.map((item) => item.id === 'sat-gallery' ? { ...item, startMinute: 559 } : item) }).errors)
    .toContain('Allow 20 minutes to travel from Saturday station arrival to Gallery visit.');
  expect(weekendTask.validate({ ...passing, activities: passing.activities.map((item) => item.id === 'sun-breakfast' ? { ...item, startMinute: 1949 } : item) }).errors)
    .toContain('Allow 30 minutes to travel from Overnight lodging to Breakfast market.');
  expect(weekendTask.validate({ ...passing, activities: passing.activities.map((item) => item.id === 'sat-museum' ? { ...item, startMinute: 610 } : item) }).errors)
    .toContain('Gallery visit and Museum visit overlap.');
  expect(weekendTask.validate({ ...passing, activities: passing.activities.map((item) => item.id === 'sun-park' ? { ...item, optionId: 'concert' } : item) }).errors)
    .toContain('Evening concert must fit entirely within its listed opening hours.');
});

test('feasible backtracking is an optional warning and overnight bookings cannot overlap lodging', () => {
  const state = { lodgingId: 'guesthouse', transportId: 'transit-pass', activities: [
    { id: 'sat-museum', optionId: 'museum', startMinute: 600 },
    { id: 'sat-park', optionId: 'park-walk', startMinute: 720 },
    { id: 'sat-gallery', optionId: 'gallery', startMinute: 840 },
    { id: 'sun-park', optionId: 'park-walk', startMinute: 1980 },
    { id: 'sun-harbor', optionId: 'harbor-tour', startMinute: 2100 },
  ] };
  expect(weekendTask.validate(state)).toEqual({ isComplete: true, errors: [], warnings: ['Optional: group visits at the same location to reduce backtracking.'] });
  expect(weekendTask.validate({ ...state, activities: [...state.activities, { id: 'late', optionId: 'concert', startMinute: 1260 }] }).errors)
    .toContain('Evening concert and Overnight lodging overlap.');
});
