import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/*.test.js'],
          exclude: ['test/*.browser.test.js'],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['test/*.browser.test.js'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
