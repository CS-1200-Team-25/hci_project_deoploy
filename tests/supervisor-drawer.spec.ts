import { expect, test } from '@playwright/test';
import { openSupervisorTools } from './supervisor-tools';

for (const [sequence, task] of [[1, 'birthday'], [13, 'weekend'], [25, 'schedule']] as const) {
  test(`supervisor skips an unfinished ${task} task for testing and recovery preserves its unsuccessful outcome`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Participant ID').fill('SKIP_TEST');
    await page.getByLabel('Sequence index').fill(String(sequence));
    await page.getByLabel('Supervisor access code').fill('research-only');
    await page.getByRole('button', { name: 'Create session' }).click();
    await page.getByLabel('I consent to take part in this supervised pilot').check();
    await page.getByRole('button', { name: 'Continue to instructions' }).click();
    await page.getByRole('button', { name: 'Reveal first task' }).click();
    await openSupervisorTools(page);
    await page.getByText('Supervisor access', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Skip task (testing)', exact: true })).toHaveCount(0);
    await page.getByLabel('Supervisor access code').fill('research-only');
    await page.getByRole('button', { name: 'Unlock supervisor controls' }).click();
    await page.getByRole('button', { name: 'Skip task (testing)', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Trial ended by supervisor' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Trial ended by supervisor' })).toBeVisible();
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('planning-pilot-session-v1')!));
    expect(session.phase).toBe('post-task-survey');
    expect(session.trials[0]).toMatchObject({ task, status: 'terminated', outcome: 'unsuccessful', terminationReason: 'Skipped for testing.' });
    expect(session.trials[0].successfulCompletionMs).toBeUndefined();
    expect(session.trials[1].status).toBe('pending');
    expect(session.events.filter((event: { eventType: string }) => event.eventType === 'task_terminated')).toHaveLength(1);
    expect(session.events.filter((event: { eventType: string }) => event.eventType === 'task_completed')).toHaveLength(0);
  });
}

test('supervisor drawer stays outside workspace, traps focus and closes with Escape or backdrop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('DRAWER');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  const trigger = page.getByRole('button', { name: 'Open supervisor tools' });
  const dialog = page.getByRole('dialog', { name: 'Supervisor tools' });
  await expect(page.getByText('Supervisor access', { exact: true })).not.toBeVisible();
  await expect(page.getByText('Supervisor storage tools', { exact: true })).not.toBeVisible();
  const position = await trigger.boundingBox();
  expect(position!.x).toBeLessThan(24);
  expect(position!.y).toBeGreaterThan(760);
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Close supervisor tools' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Complete task' }).evaluate((button: HTMLButtonElement) => button.focus());
  expect(await page.evaluate(() => document.querySelector('dialog')!.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('button', { name: 'Close supervisor tools' }).click();
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 1000, height: 800 });
  await trigger.click();
  await page.mouse.click(900, 400);
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
