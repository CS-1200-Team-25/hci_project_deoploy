import { defineConfig } from '@playwright/test';

const port = process.env.PILOT_TEST_PORT ?? '4173';

export default defineConfig({
  testDir: './tests',
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
