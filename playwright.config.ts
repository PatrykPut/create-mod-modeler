import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const URL = `http://localhost:${PORT}/create-mod-modeler/`

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: URL,
    colorScheme: 'dark',
  },
  projects: [
    { name: 'smoke', testMatch: 'smoke.spec.ts' },
    {
      name: 'screenshots',
      testMatch: 'screenshots.spec.ts',
      use: { viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 },
    },
  ],
  // the production build, served under the GitHub Pages base path
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
