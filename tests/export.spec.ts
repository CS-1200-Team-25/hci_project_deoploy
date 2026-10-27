import { openSupervisorTools } from './supervisor-tools';
import { expect, test, type Page } from '@playwright/test';

async function downloadSession(page: Page) {
  await openSupervisorTools(page);
  await page.getByText('Supervisor storage tools', { exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download session JSON' }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  let json = '';
  for await (const chunk of stream!) json += chunk.toString();
  return JSON.parse(json);
}

test('supervisor downloads an incomplete recovered session without deleting saved data', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T12:00:01Z'));
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('EXPORT1');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await page.getByRole('button', { name: 'Complete task' }).click();
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('planning-pilot-session-v1')!));
  await page.clock.runFor(90000);
  await page.reload();
  await expect(page.getByLabel('Elapsed time')).toHaveText('Elapsed01:30');
  const document = await downloadSession(page);
  expect(document.exportVersion).toBe('planning-pilot-export-v1');
  expect(document.completion).toBe('incomplete');
  expect(document.units).toEqual({ duration: 'milliseconds', timestamp: 'unix-epoch-milliseconds', taskSchedule: 'minutes' });
  expect(document.session.trials).toEqual(original.trials);
  expect(document.session.events.slice(0, original.events.length)).toEqual(original.events);
  expect(document.trialMetrics[0]).toMatchObject({ elapsedMs: 90000, successfulCompletionMs: null, selectionCount: 0, displayCount: 0 });
  expect(document.session.configuration.conditions.baseline).toEqual({ proactive: false, threshold: null });
  expect(document.materials.birthday).toMatchObject({ budget: 200, requiredDecorations: 1 });
  expect(document.materials.schedule).toMatchObject({ version: 'schedule-fixture-v2', preparationMinutes: 240, minimumPreparationDays: 3, maxPreparationMinutesPerDay: 90, dailyPreparationLimitScope: expect.stringContaining('including time after the deadline') });
  expect(document.materials.birthday.catalog.find((option: { id: string }) => option.id === 'pizza')).toBeTruthy();
  expect(document.session.supervisorAccess).toBeUndefined();
  expect(new Set(document.session.events.map((event: { id: string }) => event.id)).size).toBe(document.session.events.length);
  expect(await page.evaluate(() => localStorage.getItem('planning-pilot-session-v1'))).not.toBeNull();
});

test('persistent storage exceptions leave all available actions exportable and flag retention', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('EXPORT_FAIL');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page.getByRole('alert')).toContainText('Local saving failed');
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await page.getByRole('button', { name: 'Complete task' }).click();
  const document = await downloadSession(page);
  expect(document.retention).toMatchObject({ compromised: true, failureCount: 4, downloadConfirmedSaved: false });
  expect(document.session.phase).toBe('task');
  expect(document.session.trials[0].submissionAttempts).toHaveLength(1);
  expect(document.session.events.filter((event: { eventType: string }) => event.eventType === 'persistence_failed')).toHaveLength(4);
  expect(await page.evaluate(() => localStorage.getItem('planning-pilot-session-v1'))).toBeNull();
});

test('completed export preserves unsuccessful durations, successful timing and raw surveys', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T12:00:01Z'));
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('EXPORT_COMPLETE');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await page.getByRole('button', { name: 'Add Wrap buffet' }).click();
  await page.getByRole('button', { name: 'Add Water pack' }).click();
  await page.getByRole('button', { name: 'Add Party games' }).click();
  await page.getByRole('button', { name: 'Add Banners' }).click();
  await page.clock.runFor(20000);
  await page.getByRole('button', { name: 'Complete task' }).click();
  for (let index = 0; index < 3; index++) {
    if (index > 0) {
      await page.clock.runFor(10000);
      await openSupervisorTools(page);
      await page.getByText('Supervisor access', { exact: true }).click();
      await page.getByLabel('Supervisor access code').fill('research-only');
      await page.getByRole('button', { name: 'Unlock supervisor controls' }).click();
      await page.getByLabel('Termination reason').fill('Pilot interruption');
      await page.getByRole('button', { name: 'End unsuccessful trial' }).click();
    }
    await page.getByLabel('Helpfulness rating').selectOption('not-applicable');
    await page.getByLabel('Interruption rating').selectOption('not-applicable');
    await page.getByRole('button', { name: 'Submit post-task survey' }).click();
  }
  await page.getByRole('switch', { name: 'No preference' }).check();
  await page.getByLabel('Optional explanation').fill('Pilot export check');
  await page.getByRole('button', { name: 'Submit final survey' }).click();
  const document = await downloadSession(page);
  expect(document.completion).toBe('complete');
  expect(document.trialMetrics.map((metric: unknown) => metric)).toEqual([
    { trialId: document.session.trials[0].id, outcome: 'successful', elapsedMs: 20000, successfulCompletionMs: 20000, selectionCount: 0, displayCount: 0 },
    { trialId: document.session.trials[1].id, outcome: 'unsuccessful', elapsedMs: 10000, successfulCompletionMs: null, selectionCount: 0, displayCount: 0 },
    { trialId: document.session.trials[2].id, outcome: 'unsuccessful', elapsedMs: 10000, successfulCompletionMs: null, selectionCount: 0, displayCount: 0 },
  ]);
  expect(document.session.trials[0].finalPlan.items).toHaveLength(4);
  expect(Object.values(document.session.postTaskSurveys)).toHaveLength(3);
  expect(Object.values(document.session.postTaskSurveys).every((survey: any) => survey.helpfulness === 'not-applicable')).toBe(true);
  expect(Object.values(document.session.postTaskSurveys).every((survey: any) => survey.interruption === 'not-applicable')).toBe(true);
  expect(document.materials.survey.interruption.noDisplayAnswer).toBe('not-applicable');
  expect(document.session.finalSurvey).toMatchObject({ rankedTrialIds: null, noPreference: true, explanation: 'Pilot export check' });
  expect(document.retention.compromised).toBe(false);
});

test('storage read exceptions during editing are retained in the download', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('EXPORT_READ');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.evaluate(() => {
    Storage.prototype.getItem = function () { throw new DOMException('Denied', 'SecurityError'); };
  });
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  const document = await downloadSession(page);
  expect(document.retention.compromised).toBe(true);
  expect(document.session.events.filter((event: { eventType: string }) => event.eventType === 'persistence_failed')).toEqual([
    expect.objectContaining({ payload: { operation: 'read' } }),
  ]);
  await expect(page.getByText('Retention is compromised:', { exact: false })).toBeVisible();
});

test('selection counts do not claim exposure and saved extension fields remain lossless', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/interventions/config', route => route.fulfill({ status: 503, json: { error: 'provider-unconfigured' } }));
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('EXPORT_SELECTION');
  await page.getByLabel('Sequence index').fill('3');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await page.getByRole('button', { name: 'Add Wrap buffet' }).click();
  await page.clock.fastForward(120000);
  await expect(page.getByRole('status', { name: 'Supervisor generation status' })).toContainText('Assistant configuration could not be loaded');
  await page.evaluate(() => {
    const key = 'planning-pilot-session-v1';
    const session = JSON.parse(localStorage.getItem(key)!);
    session.configuration.futureConfiguration = { version: 'future-v1', model: 'recorded-model' };
    session.trials[0].futureGenerationData = { outcome: 'interrupted', latencyMs: 3000 };
    localStorage.setItem(key, JSON.stringify(session));
  });
  await page.reload();
  const document = await downloadSession(page);
  expect(document.trialMetrics[0]).toMatchObject({ selectionCount: 1, displayCount: 0, successfulCompletionMs: null });
  expect(document.session.configuration.futureConfiguration).toEqual({ version: 'future-v1', model: 'recorded-model' });
  expect(document.session.trials[0].futureGenerationData).toEqual({ outcome: 'interrupted', latencyMs: 3000 });
});

test('a focus-time read failure is surfaced and exported without another participant action', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('EXPORT_FOCUS');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.evaluate(() => {
    Storage.prototype.getItem = function () { throw new DOMException('Denied', 'SecurityError'); };
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('alert')).toContainText('Local storage could not be read');
  const document = await downloadSession(page);
  expect(document.retention.compromised).toBe(true);
  expect(document.session.events.at(-1)).toMatchObject({ eventType: 'persistence_failed', payload: { operation: 'read' } });
});
