import { defineConfig, devices } from '@playwright/test';

/**
 * E2E-тести відкривають зібраний самодостатній файл dist/klsr-quiz.html
 * через file:// — так перевіряється саме той файл, який завантажує користувач.
 * Перед запуском: `npm run build`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
