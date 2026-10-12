import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { consentToSession, createSession, revealTask } from '../src/experiment/session';
import { SESSION_STORAGE_KEY } from '../src/experiment/persistence';

const config = { model: 'test-model', promptVersion: 'advice-v1', schemaVersion: 'advice-v1', settings: { maxOutputTokens: 300 }, timeoutMs: 15000 };
async function seed(page: Page, sequence = 5) {
  const session = revealTask(consentToSession(createSession('ADVICE', sequence)));
  await page.goto('/');
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: SESSION_STORAGE_KEY, value: JSON.stringify(session) });
  await page.reload();
}
async function records(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SESSION_STORAGE_KEY);
}
test('selected advice is displayed once, persisted and acknowledged while editing stays usable', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/interventions/config', (route) => route.fulfill({ json: config }));
  await page.route('**/api/interventions', (route) => {
    calls++;
    const request = route.request().postDataJSON();
    return route.fulfill({ json: { ...config, signalId: request.signal.id, type: 'suggestion', message: 'Choose enough drinks for all twelve guests.', target: request.signal.target ?? null } });
  });
  await seed(page);
  await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
  await expect(page.getByText('Choose enough drinks for all twelve guests.')).toBeVisible();
  await page.getByRole('button', { name: 'Acknowledge' }).click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SESSION_STORAGE_KEY);
  expect(saved.events.filter((event: { eventType: string }) => event.eventType === 'agent_intervention_shown')).toHaveLength(1);
  expect(saved.events.filter((event: { eventType: string }) => event.eventType === 'agent_intervention_acknowledged')).toHaveLength(1);
  expect(saved.trials[0].agentHistory.requests[0].status).toBe('succeeded');
  await page.reload();
  await expect(page.getByText('Acknowledged', { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  expect((await records(page)).events.filter((event: { eventType: string }) => event.eventType === 'agent_intervention_shown')).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Complete task' })).toBeEnabled();
});

for (const failure of ['invalid', 'provider', 'transport'] as const) {
  test(`${failure} failure records no exposure and keeps task completion available`, async ({ page }) => {
    await page.route('**/api/interventions/config', (route) => route.fulfill({ json: config }));
    await page.route('**/api/interventions', (route) => failure === 'transport' ? route.abort()
      : route.fulfill({ status: failure === 'provider' ? 502 : 200, json: failure === 'invalid' ? { ...config, signalId: 'wrong', type: 'suggestion', message: 'Unrelated advice', target: null } : { error: 'provider-error' } }));
    await seed(page);
    await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
    await expect.poll(async () => (await records(page)).trials[0].agentHistory.requests[0].status).toBe(failure === 'invalid' ? 'invalid' : 'failed');
    expect((await records(page)).events.filter((event: { eventType: string }) => event.eventType === 'agent_intervention_shown')).toHaveLength(0);
    await expect(page.getByText('No suggestions right now.')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Supervisor generation status' })).toContainText('Assistant generation');
    await expect(page.getByRole('status', { name: 'Supervisor generation status' })).toContainText('Editing and submission remain available');
    await page.getByRole('button', { name: 'Complete task' }).click();
    await expect(page.getByRole('alert')).toContainText('requirements');
  });
}

test('unavailable provider configuration shows a retained supervisor warning without exposing raw errors', async ({ page }) => {
  await page.route('**/api/interventions/config', (route) => route.fulfill({ status: 503, json: { error: 'private-upstream-detail' } }));
  await seed(page);
  await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
  const warning = page.getByRole('status', { name: 'Supervisor generation status' });
  await expect(warning).toContainText('Assistant configuration could not be loaded');
  await expect(page.getByText('private-upstream-detail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Complete task' })).toBeEnabled();
  await page.reload();
  await expect(warning).toContainText('Assistant configuration could not be loaded');
  expect((await records(page)).events.filter((event: { eventType: string }) => event.eventType === 'agent_intervention_shown')).toHaveLength(0);
});

test('delayed advice is canceled by a relevant edit and cannot display its late response', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route('**/api/interventions/config', (route) => route.fulfill({ json: config }));
  await page.route('**/api/interventions', async (route) => {
    calls++;
    const request = route.request().postDataJSON();
    if (calls === 1) await delayed;
    await route.fulfill({ status: calls === 1 ? 200 : 502, json: calls === 1
      ? { ...config, signalId: request.signal.id, type: 'suggestion', message: 'Stale advice', target: request.signal.target ?? null } : { error: 'unavailable' } }).catch(() => {});
  });
  await seed(page);
  await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
  await expect.poll(async () => (await records(page)).trials[0].agentHistory.requests[0].status).toBe('pending');
  await page.getByRole('button', { name: 'Add Water pack' }).click();
  await expect.poll(async () => (await records(page)).trials[0].agentHistory.requests[0].status).toBe('canceled');
  release();
  await expect(page.getByText('Stale advice')).toHaveCount(0);
  expect((await records(page)).trials[0].agentHistory.displays).toHaveLength(0);
});

test('finite timeout and reload interrupt generation without replay', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/interventions/config', (route) => route.fulfill({ json: { ...config, timeoutMs: 1000 } }));
  let calls = 0;
  await page.route('**/api/interventions', () => { calls++; });
  await seed(page);
  await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
  await expect.poll(async () => calls).toBe(1);
  await page.clock.fastForward(1001);
  await expect.poll(async () => (await records(page)).trials[0].agentHistory.requests[0].status).toBe('timeout');
  await expect(page.getByRole('status', { name: 'Supervisor generation status' })).toContainText('Assistant generation timed out');
  await page.getByRole('button', { name: 'Add Water pack' }).click();
  await expect.poll(async () => calls).toBe(2);
  await page.reload();
  await expect.poll(async () => (await records(page)).trials[0].agentHistory.requests[1].status).toBe('interrupted');
  expect(calls).toBe(2);
  await expect(page.getByText('No suggestions right now.')).toBeVisible();
});

test('baseline never makes a proactive provider request', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/interventions/config', (route) => route.fulfill({ json: config }));
  await page.route('**/api/interventions', (route) => { calls++; return route.abort(); });
  await seed(page, 1);
  await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
  await expect(page.getByText('No suggestions right now.')).toBeVisible();
  expect(calls).toBe(0);
});
