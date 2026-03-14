import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
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
        server: {
          headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
          },
        },
        plugins: [
          {
            name: 'cross-origin-isolation',
            configureServer(server) {
              server.middlewares.use((_req, res, next) => {
                res.setHeader(
                  'Cross-Origin-Opener-Policy',
                  'same-origin',
                )
                res.setHeader(
                  'Cross-Origin-Embedder-Policy',
                  'require-corp',
                )
                next()
              })
            },
          },
        ],
        test: {
          name: 'browser',
          include: ['test/browser.test.js'],
          browser: {
            enabled: true,
            provider: playwright({
              launchOptions: {
                args: ['--enable-features=SharedArrayBuffer'],
              },
            }),
            headless: true,
            screenshotFailures: false,
            instances: browserInstances,
          },
        },
      },
    ],
  },
})
