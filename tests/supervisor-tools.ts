import type { Page } from '@playwright/test';

export async function openSupervisorTools(page: Page) {
  if (!await page.getByRole('dialog', { name: 'Supervisor tools' }).isVisible()) {
    await page.getByRole('button', { name: 'Open supervisor tools' }).click();
  }
}
