import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { birthdayTask } from '../src/tasks/birthday';
import { consentToSession, createSession, revealTask, submitTask, terminateTask, updateTaskState } from '../src/experiment/session';
import { loadSession, saveSession } from '../src/experiment/persistence';
import { authorizeSupervisor, configureSupervisorAccess } from '../src/experiment/supervisor';

test('damaged final outcomes cannot recover or overwrite preserved study records', async () => {
  const active = revealTask(consentToSession(createSession('B003', 1, 1000), 1500), 2000);
  const edited = updateTaskState(active, { items: [
    { id: 'food', optionId: 'wrap-buffet', quantity: 1 },
    { id: 'drink', optionId: 'water-pack', quantity: 1 },
    { id: 'activity', optionId: 'trivia', quantity: 1, startMinute: 840 },
  ] }, { type: 'item_added', payload: {} }, 2000);
  const completed = submitTask(edited, 3000);
  const supervised = await configureSupervisorAccess(edited, 'research-only');
  const authorization = (await authorizeSupervisor(supervised, 'research-only'))!;
  const terminated = terminateTask(supervised, authorization, 'Protocol interruption.', 4000);
  const damaged = [
    { ...completed.trials[0], finalPlan: undefined },
    { ...completed.trials[0], successfulCompletionMs: undefined },
    { ...completed.trials[0], elapsedMs: 999 },
    { ...completed.trials[0], finalValidation: { isComplete: true, errors: 'invalid', warnings: [] } },
    { ...completed.trials[0], submissionAttempts: [{ timestamp: 'invalid' }] },
    { ...terminated.trials[0], successfulCompletionMs: 2000 },
    { ...edited.trials[0], submissionAttempts: {} },
  ];
  for (const trial of damaged) {
    const source = trial.status === 'terminated' ? terminated : trial.status === 'active' ? edited : completed;
    const session = { ...source, trials: [trial, ...source.trials.slice(1)] };
    let serialized: string | null = null;
    const storage = { getItem: () => serialized, setItem: (_key: string, value: string) => { serialized = value; } };
    saveSession(session as typeof completed, storage, 5000);
    const original = serialized;
    expect(() => loadSession(storage)).toThrow(/incompatible or damaged/);
    expect(serialized).toBe(original);
  }
});

test('zero-duration passing submission freezes the plan and subsequent edits or submissions do nothing', () => {
  const active = revealTask(consentToSession(createSession('B002', 1, 1000), 1500), 2000);
  const plan = { items: [
    { id: 'food', optionId: 'wrap-buffet', quantity: 1 },
    { id: 'drink', optionId: 'water-pack', quantity: 1 },
    { id: 'activity', optionId: 'trivia', quantity: 1, startMinute: 840 },
  ] };
  const edited = updateTaskState(active, plan, { type: 'item_added', payload: { items: plan.items } }, 2000);
  const completed = submitTask(edited, 2000);
  expect(completed.trials[0].successfulCompletionMs).toBe(0);
  expect(completed.trials[0].finalPlan).toEqual(plan);
  expect(submitTask(completed, 5000)).toBe(completed);
  expect(updateTaskState(completed, { items: [] }, { type: 'item_removed', payload: {} }, 6000)).toBe(completed);
  plan.items[0].quantity = 99;
  expect((completed.trials[0].finalPlan as typeof plan).items[0].quantity).toBe(1);
});

async function startBirthday(page: Page) {
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('B001');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
}

test('only an unlocked supervisor can end a trial with a reason and unsuccessful duration', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T12:00:01Z'));
  await startBirthday(page);
  await page.getByRole('button', { name: 'Add Pizza', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End unsuccessful trial' })).toHaveCount(0);
  await page.getByText('Supervisor access', { exact: true }).click();
  await page.getByLabel('Supervisor access code').fill('wrong-code');
  await page.getByRole('button', { name: 'Unlock supervisor controls' }).click();
  await expect(page.getByRole('alert')).toContainText('Access code did not match');
  await expect(page.getByRole('button', { name: 'End unsuccessful trial' })).toHaveCount(0);
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Unlock supervisor controls' }).click();
  await expect(page.getByRole('button', { name: 'End unsuccessful trial' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'End unsuccessful trial' })).toHaveCount(0);
  await page.getByText('Supervisor access', { exact: true }).click();
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Unlock supervisor controls' }).click();
  await page.getByLabel('Termination reason').fill('Participant requested to stop.');
  await page.clock.runFor(45000);
  await page.getByRole('button', { name: 'End unsuccessful trial' }).click();
  await expect(page.getByRole('heading', { name: 'Trial ended by supervisor' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Elapsed time')).toHaveText('Elapsed00:45');
  const session = await page.evaluate(async () => {
    const path = '/src/experiment/persistence.ts';
    return (await import(path)).loadSession();
  });
  expect(session.trials[0]).toMatchObject({ status: 'terminated', outcome: 'unsuccessful', elapsedMs: 45000, terminationReason: 'Participant requested to stop.' });
  expect(session.trials[0].successfulCompletionMs).toBeUndefined();
  expect(session.trials[0].finalValidation.isComplete).toBe(false);
  expect(session.trials[0].finalPlan.items[0].optionId).toBe('pizza');
  expect(session.events.filter((event: { eventType: string }) => event.eventType === 'task_terminated')).toHaveLength(1);
  expect(session.events.filter((event: { eventType: string }) => event.eventType === 'task_completed')).toHaveLength(0);
});

test('failed submission continues timing and a corrected passing submission freezes a final outcome once', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T12:00:01Z'));
  await startBirthday(page);
  await page.clock.runFor(20000);
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('alert')).toContainText('Include at least 12 food servings');
  await expect(page.getByRole('alert')).toContainText('Include at least 12 drink servings');
  await expect(page.getByRole('alert')).toContainText('Include at least one activity');
  await expect(page.getByRole('alert')).toBeInViewport();
  await page.getByRole('button', { name: 'Dismiss validation notification' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Requirements to correct')).toHaveCount(0);
  await expect(page.getByText('Optional improvements')).toHaveCount(0);
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('alert')).toBeInViewport();
  await expect(page.getByRole('alert')).toContainText('Include at least 12 food servings');
  await page.getByRole('button', { name: 'Add Wrap buffet', exact: true }).click();
  await page.getByRole('button', { name: 'Add Water pack', exact: true }).click();
  await page.getByRole('button', { name: 'Add Trivia', exact: true }).click();
  await page.clock.runFor(40000);
  await page.getByRole('button', { name: 'Complete task' }).dblclick();
  await expect(page.getByRole('heading', { name: 'Task submitted successfully' })).toBeVisible();
  await expect(page.getByLabel('Task validation notification')).toHaveCount(0);
  await expect(page.getByText('Optional improvements')).toHaveCount(0);
  await expect(page.getByLabel('Elapsed time')).toHaveText('Elapsed01:00');
  await page.clock.runFor(30000);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Task submitted successfully' })).toBeVisible();
  await expect(page.getByLabel('Elapsed time')).toHaveText('Elapsed01:00');
  await expect(page.getByRole('button', { name: /Add|Remove|Complete task/ })).toHaveCount(0);
  const session = await page.evaluate(async () => {
    const path = '/src/experiment/persistence.ts';
    return (await import(path)).loadSession();
  });
  const trial = session.trials[0];
  expect(session.phase).toBe('post-task-survey');
  expect(trial.outcome).toBe('successful');
  expect(trial.elapsedMs).toBe(60000);
  expect(trial.successfulCompletionMs).toBe(60000);
  expect(trial.submissionAttempts).toHaveLength(3);
  expect(trial.submissionAttempts[0].validation.isComplete).toBe(false);
  expect(trial.finalValidation.isComplete).toBe(true);
  expect(trial.finalValidation.warnings).toHaveLength(1);
  expect(trial.finalPlan).toEqual(trial.taskState);
  expect(session.events.filter((event: { eventType: string }) => event.eventType === 'task_completed')).toHaveLength(1);
});

test('a narrow screen shows coverage and party-window errors in a toast and a corrected plan succeeds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startBirthday(page);
  await page.getByRole('button', { name: 'Add Pizza', exact: true }).click();
  await page.getByRole('button', { name: 'Add Lemonade jug', exact: true }).click();
  await page.getByRole('button', { name: 'Add Party games', exact: true }).click();
  const activity = page.getByRole('group', { name: /Party games item/ });
  await activity.getByLabel('Start time').fill('13:59');
  await page.getByRole('button', { name: 'Complete task' }).click();
  const toast = page.getByLabel('Task validation notification');
  await expect(toast).toBeInViewport({ ratio: 1 });
  await expect(toast).toContainText('Include at least 12 food servings');
  await expect(toast).toContainText('Include at least 12 drink servings');
  await expect(toast).toContainText('14:00');
  await page.getByRole('button', { name: 'Dismiss validation notification' }).click();
  await page.getByRole('group', { name: 'Pizza item 1' }).getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('group', { name: /Lemonade jug item/ }).getByRole('button', { name: 'Remove' }).click();
  await activity.getByLabel('Start time').fill('14:00');
  await page.getByRole('button', { name: 'Add Sandwich platter', exact: true }).click();
  await page.getByRole('group', { name: 'Sandwich platter item 2' }).getByLabel('Quantity').fill('2');
  await page.getByRole('button', { name: 'Add Water pack', exact: true }).click();
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('heading', { name: 'Task submitted successfully' })).toBeVisible();
  await expect(toast).toHaveCount(0);
  await expect(page.getByText('Optional improvements')).toHaveCount(0);
});

test('participant adds, updates, moves and removes catalog items and reload keeps the edited plan', async ({ page }) => {
  await startBirthday(page);
  await page.getByRole('button', { name: 'Add Sandwich platter', exact: true }).click();
  const sandwich = page.getByRole('group', { name: 'Sandwich platter item 1' });
  await sandwich.getByLabel('Quantity').fill('2');
  await page.getByRole('button', { name: 'Add Water pack', exact: true }).click();
  await page.getByRole('button', { name: 'Add Party games', exact: true }).click();
  await page.getByRole('group', { name: 'Party games item 3' }).getByLabel('Start time').fill('15:00');
  await page.getByRole('button', { name: 'Add Banners', exact: true }).click();
  await page.getByRole('group', { name: 'Banners item 4' }).getByRole('button', { name: 'Remove' }).click();
  await page.reload();
  await expect(page.getByText('Total cost: $148')).toBeVisible();
  await expect(page.getByText('Food servings: 12')).toBeVisible();
  await expect(page.getByText('Drink servings: 12')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Party games item 3' }).getByLabel('Start time')).toHaveValue('15:00');
  const session = await page.evaluate(async () => {
    const path = '/src/experiment/persistence.ts';
    return (await import(path)).loadSession();
  });
  const actions = session.events.filter((event: { eventType: string }) => /item_/.test(event.eventType));
  expect(actions.map((event: { eventType: string }) => event.eventType)).toEqual(['item_added', 'item_updated', 'item_added', 'item_added', 'item_moved', 'item_added', 'item_removed']);
  expect(actions[1].payload.previousItem.quantity).toBe(1);
  expect(actions[1].payload.item.quantity).toBe(2);
  expect(session.trials[0].stateRevision).toBe(7);
});

test('a catalog birthday plan covers all guests and fits the budget and party window', () => {
  const result = birthdayTask.validate({ items: [
    { id: 'food', optionId: 'sandwich-platter', quantity: 2 },
    { id: 'drink', optionId: 'water-pack', quantity: 1 },
    { id: 'activity', optionId: 'party-games', quantity: 1, startMinute: 840 },
  ] });
  expect(result).toEqual({ isComplete: true, errors: [], warnings: ['Decorations are optional; none are included.'] });
});

test('a second passing plan can exactly use the budget and end at 17:00 with adjacent activities', () => {
  const state = { items: [
    { id: 'pizza', optionId: 'pizza', quantity: 2 },
    { id: 'sandwich', optionId: 'sandwich-platter', quantity: 1 },
    { id: 'drinks', optionId: 'lemonade-jug', quantity: 5 },
    { id: 'games', optionId: 'party-games', quantity: 1, startMinute: 840 },
    { id: 'craft', optionId: 'craft-workshop', quantity: 1, startMinute: 885 },
    { id: 'trivia', optionId: 'trivia', quantity: 1, startMinute: 990 },
  ] };
  expect(birthdayTask.getAgentContext(state).summary).toMatchObject({ totalCost: 300, foodServings: 14, drinkServings: 30, plan: state, constraints: { guests: 12, budget: 300 } });
  expect(birthdayTask.validate(state).isComplete).toBe(true);
  expect(birthdayTask.validate({ items: [...state.items, { id: 'extra', optionId: 'banners', quantity: 1 }] }).errors).toContain('Keep total cost at or below $300.');
  expect(birthdayTask.validate({ items: state.items.map((item) => item.id === 'craft' ? { ...item, startMinute: 884 } : item) }).errors).toContain('Party games and Craft workshop overlap.');
  expect(birthdayTask.validate({ items: state.items.map((item) => item.id === 'trivia' ? { ...item, startMinute: 991 } : item) }).errors).toContain('Schedule Trivia entirely within Saturday 14:00–17:00.');
});

test('missing coverage, outside-party activities and invalid quantities cannot pass', () => {
  const result = birthdayTask.validate({ items: [
    { id: 'food', optionId: 'pizza', quantity: 1 },
    { id: 'drink', optionId: 'lemonade-jug', quantity: 1 },
    { id: 'activity', optionId: 'party-games', quantity: 1, startMinute: 839 },
  ] });
  expect(result.isComplete).toBe(false);
  expect(result.errors).toEqual([
    'Schedule Party games entirely within Saturday 14:00–17:00.', 'Include at least 12 food servings.', 'Include at least 12 drink servings.',
  ]);
  expect(birthdayTask.validate({ items: [{ id: 'food', optionId: 'pizza', quantity: 0 }] }).errors).toContain('Use a positive whole quantity for Pizza; activities are scheduled individually.');
});
