import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import type { BrowserInstanceOption } from 'vitest/node'

const browserInstances: BrowserInstanceOption[] = [{ browser: 'chromium' }]

if (process.platform === 'darwin') {
  browserInstances.push({ browser: 'webkit' })
}

if (!process.env.CI) {
  // Firefox tests are flakey in CI, so only run locally
  browserInstances.push({ browser: 'firefox' })
}

export default defineConfig({
  test: {
    reporters: process.env.CI ? ['verbose'] : ['default'],
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/*.test.js'],
          exclude: ['test/browser.test.js'],
        },
      },
      {
        optimizeDeps: {
          exclude: ['@sqlite.org/sqlite-wasm'],
        },
        plugins: [
          {
            name: 'cross-origin-isolation',
            configureServer(server) {
              // Hook into the HTTP server directly to ensure COOP/COEP
              // headers are set on ALL responses, including Vitest's
              // internal HTML pages (orchestrator/tester) which are
              // served by middleware that runs before plugin middleware.
              server.httpServer?.prependListener('request', (_req, res) => {
                res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
                res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
              })
            },
          },
        ],
        test: {
          name: 'browser',
          include: ['test/browser.test.js'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: browserInstances,
          },
        },
      },
    ],
  },
})
