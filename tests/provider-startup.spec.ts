import { expect, test } from '@playwright/test';
import { consentToSession, createSession, revealTask } from '../src/experiment/session';
import { SESSION_STORAGE_KEY } from '../src/experiment/persistence';

const config = { model: 'startup-fixture', promptVersion: 'advice-v1', schemaVersion: 'advice-v1', settings: { maxOutputTokens: 300 }, timeoutMs: 15000 };

test('visiting setup wakes the provider without generating advice or creating study records', async ({ page }) => {
  let configCalls = 0;
  let adviceCalls = 0;
  await page.route('**/api/interventions/config', route => {
    configCalls++;
    return route.fulfill({ json: config });
  });
  await page.route('**/api/interventions', route => {
    adviceCalls++;
    return route.abort();
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Assign a pilot session' })).toBeVisible();
  await expect.poll(() => configCalls).toBe(1);
  expect(adviceCalls).toBe(0);
  expect(await page.evaluate(key => localStorage.getItem(key), SESSION_STORAGE_KEY)).toBeNull();
});

test('the first selected advice waits through startup failures and shares the page warm-up', async ({ page }) => {
  const session = revealTask(consentToSession(createSession('COLD-START', 5)));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: SESSION_STORAGE_KEY, value: JSON.stringify(session),
  });
  let configCalls = 0;
  let adviceCalls = 0;
  await page.route('**/api/interventions/config', route => {
    configCalls++;
    return configCalls < 3
      ? route.fulfill({ status: 503, body: 'Starting up' })
      : route.fulfill({ json: config });
  });
  await page.route('**/api/interventions', route => {
    adviceCalls++;
    const request = route.request().postDataJSON();
    return route.fulfill({ json: { ...config, signalId: request.signal.id, type: 'suggestion', message: 'First request succeeded.', target: request.signal.target ?? null } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
  await expect(page.getByText('First request succeeded.', { exact: true })).toBeVisible({ timeout: 10000 });
  expect(configCalls).toBe(3);
  expect(adviceCalls).toBe(1);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SESSION_STORAGE_KEY);
  expect(saved.trials[0].agentHistory.requests).toHaveLength(1);
  expect(saved.trials[0].agentHistory.requests[0].status).toBe('succeeded');
  expect(saved.events.some((event: { eventType: string }) => event.eventType === 'agent_selection_released')).toBe(false);
});

test('a slow startup preserves the generation budget and skips selections superseded while waiting', async ({ page }) => {
  const session = revealTask(consentToSession(createSession('SLOW-START', 5)));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: SESSION_STORAGE_KEY, value: JSON.stringify(session),
  });
  const slowConfig = { ...config, timeoutMs: 1000 };
  let configCalls = 0;
  let adviceCalls = 0;
  await page.route('**/api/interventions/config', async route => {
    configCalls++;
    // Longer than the original five-second configuration timeout.
    await new Promise(resolve => setTimeout(resolve, 5500));
    await route.fulfill({ json: slowConfig });
  });
  await page.route('**/api/interventions', route => {
    adviceCalls++;
    const request = route.request().postDataJSON();
    expect(request.stateRevision).toBe(2);
    return route.fulfill({ json: { ...slowConfig, signalId: request.signal.id, type: 'suggestion', message: 'Advice for the latest plan.', target: request.signal.target ?? null } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
  await page.getByRole('button', { name: 'Add Water pack' }).click();
  expect(adviceCalls).toBe(0);
  await expect(page.getByText('Advice for the latest plan.', { exact: true })).toBeVisible({ timeout: 10000 });
  expect(configCalls).toBe(1);
  expect(adviceCalls).toBe(1);
});
