import { expect, test, type Page } from '@playwright/test';
import { consentToSession, createSession, revealTask } from '../src/experiment/session';
import { SESSION_STORAGE_KEY } from '../src/experiment/persistence';
import { evaluateIdleTrial } from '../src/experiment/interventions';
import { beginGeneration, finishGeneration, respondToIntervention } from '../src/experiment/generation';

test('unanswered advice blocks idle assistance until a full idle period after responding', () => {
  const active = revealTask(consentToSession(createSession('RESPONSE_IDLE', 5, 1000), 1000), 1000);
  const selected = evaluateIdleTrial(active, 31000);
  const pending = beginGeneration(selected, selected.trials[0].agentHistory!.selections[0].id, config, 31000);
  const request = pending.trials[0].agentHistory!.requests![0];
  const shown = finishGeneration(pending, request.id, 'succeeded', { ...config, signalId: request.request.signal.id,
    type: 'suggestion', message: 'Advice awaiting a response.', target: null }, undefined, 32000);
  expect(shown.trials[0].agentHistory!.interventions).toHaveLength(1);
  expect(evaluateIdleTrial(shown, 180000)).toBe(shown);
  for (const response of ['acknowledged', 'dismissed'] as const) {
    const answered = respondToIntervention(shown, shown.trials[0].agentHistory!.interventions![0].id, response, 180000);
    expect(evaluateIdleTrial(answered, 209999)).toBe(answered);
    expect(evaluateIdleTrial(answered, 210000).trials[0].agentHistory!.selections).toHaveLength(2);
  }
});

const config = { model: 'idle-fixture', promptVersion: 'advice-v1', schemaVersion: 'advice-v1', settings: { maxOutputTokens: 300 }, timeoutMs: 15000 };

async function secondTask(page: Page) {
  await page.clock.install();
  await page.goto('/');
  const session = revealTask(consentToSession(createSession('IDLE_DIAGNOSTIC', 1)));
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: SESSION_STORAGE_KEY, value: JSON.stringify(session) });
  await page.reload();
  await page.getByRole('button', { name: 'Add Wrap buffet', exact: true }).click();
  await page.getByRole('button', { name: 'Add Water pack', exact: true }).click();
  await page.getByRole('button', { name: 'Add Trivia', exact: true }).click();
  await page.getByRole('button', { name: 'Add Banners', exact: true }).click();
  await page.getByRole('button', { name: 'Complete task' }).click();
  await page.getByLabel('Helpfulness rating').selectOption('not-applicable');
  await page.getByLabel('Interruption rating').selectOption('2');
  await page.getByRole('button', { name: 'Submit post-task survey' }).click();
  await expect(page.getByLabel('Saturday-night lodging')).toBeVisible();
}

test('idle policy respects baseline, pending selection/request, ended trials and unchanged revisions', () => {
  const baseline = revealTask(consentToSession(createSession('BASE_IDLE', 1, 1000), 1000), 1000);
  expect(evaluateIdleTrial(baseline, 121000)).toBe(baseline);
  const active = revealTask(consentToSession(createSession('ACTIVE_IDLE', 5, 1000), 1000), 1000);
  expect(evaluateIdleTrial(active, 30999)).toBe(active);
  const evaluated = evaluateIdleTrial(active, 31000);
  expect(evaluated.trials[0].stateRevision).toBe(0);
  expect(evaluated.trials[0].agentHistory?.selections).toHaveLength(1);
  expect(evaluateIdleTrial(evaluated, 121000)).toBe(evaluated);
  const pending = beginGeneration(evaluated, evaluated.trials[0].agentHistory!.selections[0].id, config, 31000);
  expect(evaluateIdleTrial(pending, 121000)).toBe(pending);
  const ended = { ...active, phase: 'post-task-survey' as const };
  expect(evaluateIdleTrial(ended, 121000)).toBe(ended);
});

for (const edit of [false, true]) {
  test(`sequence 1 second task shows advice after two idle minutes${edit ? ' and an edit' : ''}`, async ({ page }) => {
    let requests = 0;
    await page.route('**/api/interventions/config', route => route.fulfill({ json: config }));
    await page.route('**/api/interventions', route => {
      requests++;
      const request = route.request().postDataJSON();
      return route.fulfill({ json: { ...config, signalId: request.signal.id, type: 'suggestion', message: 'Idle diagnostic advice.', target: request.signal.target ?? null } });
    });
    await secondTask(page);
    await page.clock.fastForward(29_000);
    expect(requests).toBe(0);
    await expect(page.getByText('Idle diagnostic advice.', { exact: true })).toHaveCount(0);
    await page.clock.fastForward(120000);
    if (edit) await page.getByLabel('Saturday-night lodging').selectOption('guesthouse');
    await expect(page.getByText('Idle diagnostic advice.', { exact: true })).toBeVisible({ timeout: 2000 });
    expect(requests).toBe(1);
    await page.reload();
    await expect(page.getByText('Idle diagnostic advice.', { exact: true })).toBeVisible();
    expect(requests).toBe(1);
  });
}
