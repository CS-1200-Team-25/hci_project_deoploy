import { expect, test } from '@playwright/test';
import { consentToSession, createSession, recoverSession, revealTask, updateTaskState } from '../src/experiment/session';
import { inspectIssueScores } from '../src/experiment/interventions';
import { loadSession, saveSession } from '../src/experiment/persistence';
import { beginGeneration, finishGeneration } from '../src/experiment/generation';
import { FIXED_COMMITMENTS } from '../src/tasks/schedule';

test('resolving food and removing it restarts only the food issue timer, including after reload', () => {
  let session = revealTask(consentToSession(createSession('ISSUE_CLOCK', 1, 1000), 1000), 1000);
  const score = (id: string, now: number) => inspectIssueScores(session, now)!.evaluations.find(item => item.signalId === id)!;
  expect(score('birthday:missing:food', 121000).recencyBonus).toBe(.45);
  session = updateTaskState(session, { items: [{ id: 'food', optionId: 'pizza', quantity: 12 }] },
    { type: 'item_added', payload: {} }, 121000);
  expect(score('birthday:missing:food', 121000)).toBeUndefined();
  session = updateTaskState(session, { items: [] }, { type: 'item_removed', payload: {} }, 123000);
  expect(score('birthday:missing:food', 123000)).toMatchObject({ recencyBonus: 0, finalScore: .425 });
  expect(score('birthday:missing:drink', 123000).recencyBonus).toBe(.45);
  expect(score('birthday:missing:food', 152999).recencyBonus).toBe(0);
  expect(score('birthday:missing:food', 153000).recencyBonus).toBe(.15);
  expect(score('birthday:missing:food', 183000).recencyBonus).toBe(.3);
  expect(score('birthday:missing:food', 243000).recencyBonus).toBe(.45);
  let serialized: string | null = null;
  const storage = { getItem: () => serialized, setItem: (_key: string, value: string) => { serialized = value; } };
  saveSession(session, storage, 124000);
  session = recoverSession(loadSession(storage)!, 153000);
  expect(score('birthday:missing:food', 153000).recencyBonus).toBe(.15);
  expect(score('birthday:missing:drink', 153000).recencyBonus).toBe(.45);
});

test('new issues start on the edit while ongoing severity changes and unrelated displays keep their timers', () => {
  const active = revealTask(consentToSession(createSession('INDEPENDENT', 5, 1000), 1000), 1000);
  let session = updateTaskState(active, { items: [{ id: 'food', optionId: 'sandwich-platter', quantity: 1 }] },
    { type: 'item_added', payload: {} }, 121000);
  const evaluations = inspectIssueScores(session, 121000)!.evaluations;
  expect(evaluations.find(item => item.signalId === 'birthday:coverage:food')).toMatchObject({ recencyBonus: 0, unresolvedMs: 0 });
  expect(evaluations.find(item => item.signalId === 'birthday:missing:drink')).toMatchObject({ recencyBonus: .45, unresolvedMs: 120000 });
  const selection = session.trials[0].agentHistory!.selections[0];
  const config = { model: 'fixture', promptVersion: 'advice-v1', schemaVersion: 'advice-v1', settings: { maxOutputTokens: 300 }, timeoutMs: 15000 };
  session = beginGeneration(session, selection.id, config, 122000);
  const request = session.trials[0].agentHistory!.requests![0];
  session = finishGeneration(session, request.id, 'succeeded', { ...config, signalId: selection.signal.id,
    type: 'suggestion', message: 'Add enough drinks.', target: null }, undefined, 123000);
  expect(inspectIssueScores(session, 124000)!.evaluations.find(item => item.signalId === 'birthday:missing:activity'))
    .toMatchObject({ recencyBonus: .45, unresolvedMs: 123000 });
  const state = { items: [{ id: 'food', optionId: 'sandwich-platter', quantity: .5 }] };
  session = updateTaskState(session, state, { type: 'item_updated', payload: {} }, 151000);
  const preview = inspectIssueScores(session, 151000)!.evaluations.find(item => item.signalId === 'birthday:coverage:food')!;
  expect(preview).toMatchObject({ recencyBonus: .15, rawSeverity: .7, issueStartedAt: 121000 });
  expect(session.events.filter(event => event.eventType === 'signal_evaluated' && event.payload.signalId === preview.signalId).at(-1)!.payload)
    .toMatchObject({ recencyBonus: .15, unresolvedMs: 30000, issueStartedAt: 121000 });
  expect(updateTaskState(session, state, { type: 'item_updated', payload: {} }, 155000)).toBe(session);
});

test('schedule optional issues independently restart when removed after being resolved', () => {
  let session = revealTask(consentToSession(createSession('SCHEDULE_CLOCK', 25, 1000), 1000), 1000);
  session = updateTaskState(session, { blocks: [...FIXED_COMMITMENTS,
    { id: 'meal', kind: 'meal', day: 0, startMinute: 720, durationMinutes: 60 }] },
    { type: 'item_added', payload: {} }, 121000);
  session = updateTaskState(session, { blocks: FIXED_COMMITMENTS }, { type: 'item_removed', payload: {} }, 123000);
  const evaluations = inspectIssueScores(session, 123000)!.evaluations;
  expect(evaluations.find(item => item.signalId === 'schedule:optional:meal')).toMatchObject({ recencyBonus: 0, unresolvedMs: 0 });
  expect(evaluations.find(item => item.signalId === 'schedule:optional:rest')).toMatchObject({ recencyBonus: .45, unresolvedMs: 122000 });
});

test('recovery rejects missing, invalid or mismatched issue clocks and old policy without overwriting saved records', () => {
  const session = revealTask(consentToSession(createSession('CLOCK_RECOVERY', 1, 1000), 1000), 1000);
  const food = 'birthday:missing:food';
  const clocks = session.trials[0].issueStartedAt!;
  for (const invalid of [undefined, [], { ...clocks, [food]: '1000' }, { ...clocks, [food]: null },
    { ...clocks, [food]: 999 }, { ...clocks, [food]: 1001 }, { ...clocks, other: 1000 }, {}]) {
    const damaged = structuredClone(session);
    damaged.trials[0].issueStartedAt = invalid as typeof clocks;
    const serialized = JSON.stringify(damaged);
    let writes = 0;
    expect(() => loadSession({ getItem: () => serialized, setItem: () => { writes++; } })).toThrow(/incompatible or damaged/);
    expect(writes).toBe(0);
  }
  const old = structuredClone(session);
  old.configuration.version = 'pilot-4';
  old.configuration.policyVersion = 'pilot-policy-v2';
  expect(() => loadSession({ getItem: () => JSON.stringify(old), setItem: () => {} })).toThrow(/incompatible or damaged/);
});

test('main-page diagnostics show a fresh food timer after adding twelve pizzas and removing them', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-13T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-13T12:00:01Z'));
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('PIZZA_CLOCK');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await page.getByRole('button', { name: 'Open supervisor tools' }).click();
  await page.getByRole('switch', { name: 'Show AI issue scores on main page' }).check();
  await page.getByRole('button', { name: 'Close supervisor tools' }).click();
  const food = page.locator('.issue-score-list li').filter({ has: page.getByRole('heading', { name: 'birthday:missing:food', exact: true }) });
  const drink = page.locator('.issue-score-list li').filter({ has: page.getByRole('heading', { name: 'birthday:missing:drink', exact: true }) });
  await page.clock.runFor(120000);
  await expect(food).toContainText('Recency bonus0.450');
  await page.getByRole('button', { name: 'Add Pizza', exact: true }).click();
  await page.getByLabel('Quantity').fill('12');
  await expect(food).toHaveCount(0);
  await page.clock.runFor(2000);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(food).toContainText('Unresolved for0 seconds');
  await expect(food).toContainText('Recency bonus0.000');
  await expect(drink).toContainText('Recency bonus0.450');
  await page.clock.runFor(30000);
  await expect(food).toContainText('Recency bonus0.150');
  await page.reload();
  await page.getByRole('button', { name: 'Open supervisor tools' }).click();
  await page.getByRole('switch', { name: 'Show AI issue scores on main page' }).check();
  await page.getByRole('button', { name: 'Close supervisor tools' }).click();
  await expect(food).toContainText('Unresolved for30 seconds');
  await expect(food).toContainText('Recency bonus0.150');
});
