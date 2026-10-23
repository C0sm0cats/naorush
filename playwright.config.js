import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173/naorush/' },
  webServer: {
    command:
      'npm run build -- --base=/naorush/ && npx vite preview --port 4173 --strictPort --host 127.0.0.1 --base=/naorush/',
    url: 'http://127.0.0.1:4173/naorush/',
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
