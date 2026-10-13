import { expect, test } from '@playwright/test';
import { consentToSession, createSession, revealTask } from '../src/experiment/session';
import { inspectIssueScores } from '../src/experiment/interventions';
import { abandonSelection, beginGeneration, finishGeneration } from '../src/experiment/generation';
import { updateTaskState } from '../src/experiment/session';

test('read-only preview uses severity, recency and disabled/low/high policies across tasks', () => {
  const state = { items: [
    { id: 'food', optionId: 'sandwich-platter', quantity: 1 },
    { id: 'drink', optionId: 'water-pack', quantity: 1 },
    { id: 'games', optionId: 'party-games', quantity: 1, startMinute: 840 },
    { id: 'craft', optionId: 'craft-workshop', quantity: 1, startMinute: 885 },
  ] };
  for (const [index, threshold, excluded] of [[1, null, 'baseline'], [3, .75, 'below-threshold'], [5, .4, 'below-threshold']] as const) {
    let session = updateTaskState(revealTask(consentToSession(createSession('SCORE', index, 1000), 1000), 1000),
      state, { type: 'item_added', payload: {} }, 1000);
    for (const selection of session.trials[0].agentHistory?.selections ?? []) {
      session = abandonSelection(session, selection.id, 'test-preview', 1000);
    }
    const before = JSON.stringify(session);
    expect(inspectIssueScores(session, 1000)!.evaluations).toMatchObject([{
      signalId: 'birthday:coverage:food', rawSeverity: .6, recencyBonus: 0,
      finalScore: .3, threshold, exclusionReason: excluded,
    }]);
    expect(inspectIssueScores(session, 121000)!.evaluations[0]).toMatchObject({
      rawSeverity: .6, recencyBonus: .45, finalScore: .75,
      exclusionReason: threshold === null ? 'baseline' : null,
    });
    expect(JSON.stringify(session)).toBe(before);
  }
  for (const index of [13, 25]) {
    const session = revealTask(consentToSession(createSession('OTHER', index, 1000), 1000), 1000);
    const snapshot = inspectIssueScores(session, 1000)!;
    expect(snapshot.signals.length).toBeGreaterThan(0);
    expect(snapshot.signals.every(signal => signal.id.startsWith(`${session.trials[0].task}:`))).toBe(true);
  }
  expect(inspectIssueScores(createSession('SETUP', 1, 1000))).toBeNull();
});

test('preview retains real reservations, pending requests, unanswered suggestions and cooldowns without mutation', () => {
  const active = revealTask(consentToSession(createSession('BUSY', 5, 1000), 1000), 1000);
  let session = updateTaskState(active, { items: [{ id: 'food', optionId: 'sandwich-platter', quantity: 1 }] },
    { type: 'item_added', payload: {} }, 1000);
  const selection = session.trials[0].agentHistory!.selections[0];
  const before = JSON.stringify(session);
  expect(inspectIssueScores(session, 1000)!.evaluations.find(item => item.signalId === selection.signal.id)!.exclusionReason).toBe('reserved');
  expect(JSON.stringify(session)).toBe(before);
  const config = { model: 'test-model', promptVersion: 'advice-v1', schemaVersion: 'advice-v1', settings: { maxOutputTokens: 300 }, timeoutMs: 15000 };
  session = beginGeneration(session, selection.id, config, 2000);
  const request = session.trials[0].agentHistory!.requests![0];
  expect(inspectIssueScores(session, 2000)!.evaluations.find(item => item.signalId === selection.signal.id)!.exclusionReason).toBe('in-flight');
  session = finishGeneration(session, request.id, 'succeeded', {
    ...config, signalId: selection.signal.id, type: 'suggestion', message: 'Add enough drinks.', target: null,
  }, undefined, 3000);
  expect(inspectIssueScores(session, 3000)!.evaluations.every(item => item.exclusionReason === 'unanswered-intervention')).toBe(true);
  session.trials[0].agentHistory!.interventions![0].response = 'acknowledged';
  expect(inspectIssueScores(session, 32999)!.evaluations.every(item => item.exclusionReason === 'global-cooldown')).toBe(true);
  expect(inspectIssueScores(session, 33000)!.evaluations.find(item => item.signalId === selection.signal.id)!.exclusionReason).toBe('signal-cooldown');
  const shown = JSON.stringify(session);
  inspectIssueScores(session, 63000);
  expect(JSON.stringify(session)).toBe(shown);
});

test('supervisor sees score fields and baseline exclusion while inspection leaves saved study records unchanged', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-12T12:00:01Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('SCORE_UI');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  const before = await page.evaluate(() => localStorage.getItem('planning-pilot-session-v1'));
  await page.getByRole('button', { name: 'Open supervisor tools' }).click();
  await page.getByRole('switch', { name: 'Show AI issue scores on main page' }).check();
  await page.getByRole('button', { name: 'Close supervisor tools' }).click();
  await expect(page.getByText('Threshold: disabled (baseline).', { exact: false })).toBeVisible();
  const food = page.locator('.issue-score-list li').filter({ has: page.getByRole('heading', { name: 'birthday:missing:food', exact: true }) });
  await expect(food).toContainText('Severity0.850');
  await expect(food).toContainText('Recency bonus0.000');
  await expect(food).toContainText('Final score0.425');
  await expect(food).toContainText('Excluded — baseline');
  await page.clock.runFor(120000);

  await expect(food).toContainText('Recency bonus0.450');
  await expect(food).toContainText('Final score0.875');
  expect(await page.evaluate(() => localStorage.getItem('planning-pilot-session-v1'))).toBe(before);
  await page.getByRole('button', { name: 'Open supervisor tools' }).click();
  await expect(page.getByText('Supervisor storage tools', { exact: true })).toBeVisible();
});
