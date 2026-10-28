import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('TRAINING-QA');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
});

test('practice teaches adding, editing and removing without starting or changing trials', async ({ page }) => {
  let adviceRequests = 0;
  await page.route('**/api/interventions', route => {
    adviceRequests++;
    return route.abort();
  });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('planning-pilot-session-v1')!));
  await page.getByRole('button', { name: 'Complete practice' }).click();
  await expect(page.getByRole('alert')).toHaveText('Add water and set its quantity to 2 to finish practice.');
  await page.getByRole('button', { name: 'Add water' }).click();
  await expect(page.getByLabel('Practice quantity')).toHaveValue('1');
  await page.getByRole('button', { name: 'Remove water' }).click();
  await expect(page.getByLabel('Practice quantity')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add water' }).click();
  await page.getByLabel('Practice quantity').fill('2');
  await page.getByRole('button', { name: 'Complete practice' }).click();
  await expect(page.getByRole('status')).toHaveText('Practice complete. You can now reveal your first task.');
  const practiced = await page.evaluate(() => JSON.parse(localStorage.getItem('planning-pilot-session-v1')!));
  expect(practiced.phase).toBe('instructions');
  expect(practiced.trials).toEqual(before.trials);
  expect(practiced.events.filter((event: { eventType: string }) => event.eventType.startsWith('training_'))).toMatchObject([
    { eventType: 'training_action', payload: { action: 'item_added', quantity: 1 } },
    { eventType: 'training_action', payload: { action: 'item_removed', quantity: 1 } },
    { eventType: 'training_action', payload: { action: 'item_added', quantity: 1 } },
    { eventType: 'training_action', payload: { action: 'item_updated', quantity: 2 } },
    { eventType: 'training_completed' },
  ]);
  for (const event of practiced.events.filter((event: { eventType: string }) => event.eventType.startsWith('training_'))) {
    expect(event).not.toHaveProperty('trialId');
    expect(event).not.toHaveProperty('condition');
  }
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Practice complete. You can now reveal your first task.');
  await expect(page.getByRole('button', { name: 'Complete practice' })).toHaveCount(0);
  expect(adviceRequests).toBe(0);
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await expect(page.getByRole('heading', { name: 'Scenario and minimum requirements' })).toBeVisible();
  const started = await page.evaluate(() => JSON.parse(localStorage.getItem('planning-pilot-session-v1')!));
  expect(started.trials).toHaveLength(3);
  expect(started.trials[0].startedAt).toBeGreaterThanOrEqual(practiced.events.at(-1).timestamp);
});

test('unfinished practice resets on reload and can be skipped', async ({ page }) => {
  await page.getByRole('button', { name: 'Add water' }).click();
  await page.reload();
  await expect(page.getByLabel('Practice quantity')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await expect(page.getByRole('heading', { name: 'Scenario and minimum requirements' })).toBeVisible();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('planning-pilot-session-v1')!));
  expect(session.events.some((event: { eventType: string }) => event.eventType === 'training_completed')).toBe(false);
  expect(session.events.filter((event: { eventType: string }) => event.eventType === 'task_started')).toHaveLength(1);
});
