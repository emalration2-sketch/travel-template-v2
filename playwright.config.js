const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 15000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx serve -l 5199 .',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 20000,
  },
});
