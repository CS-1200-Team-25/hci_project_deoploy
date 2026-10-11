import { expect, test } from '@playwright/test';

test('clearing storage is not undone by the current tab on a visibility change', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('QA19');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.evaluate(() => {
    localStorage.removeItem('planning-pilot-session-v1');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('heading', { name: 'Assign a pilot session' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('planning-pilot-session-v1'))).toBeNull();
});

test('edited JSON survives visibility changes and clearing it unblocks recovery', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('QA19');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.evaluate(() => {
    localStorage.setItem('planning-pilot-session-v1', '{invalid JSON');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('alert')).toContainText('Stored data could not be recovered');
  await expect(page.getByRole('button', { name: 'Create session' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('planning-pilot-session-v1'))).toBe('{invalid JSON');
  await page.evaluate(() => localStorage.removeItem('planning-pilot-session-v1'));
  await page.getByRole('button', { name: 'Reload saved session' }).click();
  await expect(page.getByRole('button', { name: 'Create session' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a participant action does not overwrite an externally edited session', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('QA19');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.evaluate(() => {
    const key = 'planning-pilot-session-v1';
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.configuration.scenarioVersion = 'unsupported-scenarios-v0';
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await expect(page.getByRole('alert')).toContainText('Stored data could not be recovered');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('planning-pilot-session-v1')!));
  expect(saved.configuration.scenarioVersion).toBe('unsupported-scenarios-v0');
  expect(saved.phase).toBe('welcome');
});

test('unsupported scenario versions block recovery and preserve the original saved data', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('P008');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  const original = await page.evaluate(async () => {
    const modulePath = '/src/experiment/persistence.ts';
    const { loadSession, saveSession, SESSION_STORAGE_KEY } = await import(modulePath);
    const session = loadSession();
    session.configuration.scenarioVersion = 'unsupported-scenarios-v0';
    saveSession(session);
    return { serialized: localStorage.getItem(SESSION_STORAGE_KEY), key: SESSION_STORAGE_KEY };
  });
  // Seed the recovered document before React loads; the current tab still owns its in-memory session.
  await page.addInitScript(({ key, serialized }) => localStorage.setItem(key, serialized!), original);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Stored data could not be recovered');
  await expect(page.getByRole('button', { name: 'Create session' })).toBeDisabled();
  const retained = await page.evaluate(async () => {
    const modulePath = '/src/experiment/persistence.ts';
    const { SESSION_STORAGE_KEY } = await import(modulePath);
    return localStorage.getItem(SESSION_STORAGE_KEY);
  });
  expect(retained).toBe(original.serialized);
});

test('a failed save keeps the session usable and retains a failure record when saving recovers', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    let firstSave = true;
    Storage.prototype.setItem = function (...args) {
      if (firstSave) { firstSave = false; throw new DOMException('Storage unavailable', 'QuotaExceededError'); }
      return original.apply(this, args);
    };
  });
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('P007');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page.getByRole('alert')).toContainText('Local saving failed');
  await expect(page.getByRole('heading', { name: 'Welcome to the planning pilot' })).toBeVisible();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  const session = await page.evaluate(async () => {
    const modulePath = '/src/experiment/persistence.ts';
    return (await import(modulePath)).loadSession();
  });
  expect(session.events.map((event: { eventType: string }) => event.eventType)).toEqual([
    'session_started', 'persistence_failed', 'consent_given', 'instructions_viewed',
  ]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('committed actions, visibility and recovery retain uniquely ordered records', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T12:00:01Z'));
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('P004');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  const before = await page.evaluate(async () => {
    const modulePath = '/src/experiment/persistence.ts';
    return (await import(modulePath)).loadSession();
  });
  expect(before.events.map((event: { eventType: string }) => event.eventType)).toEqual([
    'session_started', 'consent_given', 'instructions_viewed', 'task_started',
  ]);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(90000);
  await page.reload();
  await expect(page.getByLabel('Elapsed time')).toHaveText('Elapsed01:30');
  const after = await page.evaluate(async () => {
    const modulePath = '/src/experiment/persistence.ts';
    return (await import(modulePath)).loadSession();
  });
  expect(after.events.slice(0, before.events.length)).toEqual(before.events);
  expect(after.events.map((event: { eventType: string }) => event.eventType)).toEqual([
    'session_started', 'consent_given', 'instructions_viewed', 'task_started', 'visibility_changed', 'session_recovered',
  ]);
  expect(after.events.at(-1).payload.recoveryGapMs).toBe(90000);
  expect(after.events.at(-2).payload.visibility).toBe('hidden');
  expect(after.events.map((event: { sequence: number }) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(new Set(after.events.map((event: { id: string }) => event.id)).size).toBe(6);
  expect(after.trials).toEqual(before.trials);
  expect(after.configuration.conditions.baseline).toEqual({ proactive: false, threshold: null });
});

test('reload restores consent phase, stable assignment and elapsed task time', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T12:00:01Z'));
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('P003');
  await page.getByLabel('Sequence index').fill('36');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to the planning pilot' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to instructions' })).toBeDisabled();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Shared instructions' })).toBeVisible();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await expect(page.getByRole('heading', { name: 'Weekly-schedule planning', exact: true })).toBeVisible();
  await page.clock.runFor(41000);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Weekly-schedule planning', exact: true })).toBeVisible();
  await expect(page.getByLabel('Elapsed time')).toHaveText('Elapsed00:41');
  await page.clock.runFor(19000);
  await expect(page.getByLabel('Elapsed time')).toHaveText('Elapsed01:00');
});

test('scenario reveal starts elapsed time and placeholder tasks cannot complete', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T12:00:01Z'));
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('P002');
  await page.getByLabel('Sequence index').fill('25');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.clock.runFor(5000);
  await expect(page.getByLabel('Elapsed time')).toHaveText('Elapsed00:00');
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await expect(page.getByRole('heading', { name: 'Weekly-schedule planning', exact: true })).toBeVisible();
  await expect(page.getByText('Task 1 of 3')).toBeVisible();
  await expect(page.getByText('four assignment preparation hours', { exact: false })).toBeVisible();
  await page.clock.runFor(65000);
  await expect(page.getByLabel('Elapsed time')).toHaveText('Elapsed01:05');
  await expect(page.getByRole('button', { name: 'Complete task' })).toBeDisabled();
  await expect(page.getByRole('complementary', { name: 'AI Assistant' })).toBeVisible();
  await expect(page.getByText(/baseline|low eagerness|high eagerness/i)).toHaveCount(0);
});

test('supervisor assigns a session before consent and shared instructions', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('P001');
  await page.getByLabel('Sequence index').fill('1');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to the planning pilot' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to instructions' })).toBeDisabled();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await expect(page.getByRole('heading', { name: 'Shared instructions' })).toBeVisible();
  await expect(page.getByLabel('Elapsed time')).toHaveText('Elapsed00:00');
});
