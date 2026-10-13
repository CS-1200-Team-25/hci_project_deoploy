import { expect, test } from '@playwright/test';

test('score toggle keeps live diagnostics visible while editing outside the drawer', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('LIVE_SCORE');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await page.getByRole('button', { name: 'Open supervisor tools' }).click();
  await page.getByRole('switch', { name: 'Show AI issue scores on main page' }).check({ timeout: 2000 });
  await page.getByRole('button', { name: 'Close supervisor tools' }).click();
  const panel = page.getByRole('region', { name: 'AI issue scores (testing)' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('birthday:missing:food');
  await page.getByRole('button', { name: 'Add Pizza', exact: true }).click();
  await expect(panel).not.toContainText('birthday:missing:food');
  await expect(panel).toContainText('birthday:coverage:food');
  await page.getByRole('button', { name: 'Open supervisor tools' }).click();
  await page.getByRole('switch', { name: 'Show AI issue scores on main page' }).uncheck();
  await page.getByRole('button', { name: 'Close supervisor tools' }).click();
  await expect(panel).toHaveCount(0);
});
