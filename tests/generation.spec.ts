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
test('edits and recovery retain one unanswered toast and response restarts the idle wait', async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  await page.route('**/api/interventions/config', route => route.fulfill({ json: config }));
  await page.route('**/api/interventions', route => {
    calls++;
    const request = route.request().postDataJSON();
    return route.fulfill({ json: { ...config, signalId: request.signal.id, type: 'suggestion', message: `Advice ${calls}`, target: null } });
  });
  await seed(page);
  await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
  await expect(page.getByText('Advice 1', { exact: true })).toBeVisible();
  await page.clock.fastForward(120000);
  await page.reload();
  await expect(page.getByText('Advice 1', { exact: true })).toBeVisible();
  await page.clock.fastForward(120000);
  await page.getByRole('button', { name: 'Add Water pack' }).click();
  const edited = await records(page);
  expect(edited.trials[0].stateRevision).toBe(2);
  expect(edited.trials[0].agentHistory.selections).toHaveLength(1);
  expect(edited.events.filter((event: { eventType: string }) => event.eventType === 'signal_resolved').at(-1).payload.signalId).toBe('birthday:missing:drink');
  expect(edited.events.filter((event: { eventType: string }) => event.eventType === 'intervention_evaluation_summary').at(-1).payload.selectedSignalId).toBeNull();
  expect(calls).toBe(1);
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.clock.fastForward(29000);
  expect(calls).toBe(1);
  await page.clock.fastForward(1000);
  await expect(page.getByText('Advice 2', { exact: true })).toBeVisible();
  expect(calls).toBe(2);
});
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
  const toast = page.getByRole('region', { name: 'AI Assistant' });
  await expect(toast).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'AI Assistant' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Complete task' })).toBeDisabled();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const viewport = page.viewportSize()!;
  const bounds = await toast.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  await page.getByRole('button', { name: 'Acknowledge' }).click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SESSION_STORAGE_KEY);
  expect(saved.events.filter((event: { eventType: string }) => event.eventType === 'agent_intervention_shown')).toHaveLength(1);
  expect(saved.events.filter((event: { eventType: string }) => event.eventType === 'agent_intervention_acknowledged')).toHaveLength(1);
  expect(saved.trials[0].agentHistory.requests[0].status).toBe('succeeded');
  await page.reload();
  await expect(page.getByRole('region', { name: 'AI Assistant' })).toHaveCount(0);
  expect(calls).toBe(1);
  expect((await records(page)).events.filter((event: { eventType: string }) => event.eventType === 'agent_intervention_shown')).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Complete task' })).toBeEnabled();
});

test('toast persists without timeout through reload and dismiss records the explicit response', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await page.route('**/api/interventions/config', route => route.fulfill({ json: config }));
  await page.route('**/api/interventions', route => {
    const request = route.request().postDataJSON();
    return route.fulfill({ json: { ...config, signalId: request.signal.id, type: 'suggestion', message: 'Persistent toast advice.', target: null } });
  });
  await seed(page);
  await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
  const toast = page.getByRole('region', { name: 'AI Assistant' });
  await expect(toast).toContainText('Persistent toast advice.');
  await page.clock.fastForward(120000);
  await expect(toast.getByText('Persistent toast advice.').first()).toBeVisible();
  await page.reload();
  await expect(toast).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const bounds = await toast.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  while (await toast.count()) await toast.getByRole('button', { name: 'Dismiss', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Complete task' })).toBeEnabled();
  const saved = await records(page);
  expect(saved.trials[0].agentHistory.interventions.every((advice: { response?: string }) => advice.response === 'dismissed')).toBe(true);
  const displays = saved.events.filter((event: { eventType: string }) => event.eventType === 'agent_intervention_shown');
  const dismissals = saved.events.filter((event: { eventType: string }) => event.eventType === 'agent_intervention_dismissed');
  expect(dismissals).toHaveLength(displays.length);
  await page.reload();
  await expect(toast).toHaveCount(0);
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
    await expect(page.getByRole('region', { name: 'AI Assistant' })).toHaveCount(0);
    await expect(page.getByRole('status', { name: 'Supervisor generation status' })).toContainText('Assistant generation');
    await expect(page.getByRole('status', { name: 'Supervisor generation status' })).toContainText('Editing and submission remain available');
    await page.getByRole('button', { name: 'Complete task' }).click();
    await expect(page.getByRole('alert')).toContainText('requirements');
  });
}

test('unavailable provider configuration shows a retained supervisor warning without exposing raw errors', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/interventions/config', (route) => route.fulfill({ status: 503, json: { error: 'private-upstream-detail' } }));
  await seed(page);
  await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
  // Startup gets its own bounded readiness window before the retained warning.
  await page.clock.fastForward(90_001);
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
  await expect(page.getByRole('region', { name: 'AI Assistant' })).toHaveCount(0);
});

test('baseline never makes a proactive provider request', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/interventions/config', (route) => route.fulfill({ json: config }));
  await page.route('**/api/interventions', (route) => { calls++; return route.abort(); });
  await seed(page, 1);
  await page.getByRole('button', { name: 'Add Sandwich platter' }).click();
  await expect(page.getByRole('region', { name: 'AI Assistant' })).toHaveCount(0);
  expect(calls).toBe(0);
});
