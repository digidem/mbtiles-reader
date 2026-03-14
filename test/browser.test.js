import { describe, expect, it } from 'vitest'

import { MBTiles } from '../index.browser.js'
import { registerSharedTests } from './shared.js'

/**
 * @param {string} path
 * @returns {Promise<ArrayBuffer>}
 */
async function fetchFixture(path) {
  const res = await fetch(`/test/fixtures/${path}`)
  if (!res.ok) throw new Error(`Failed to fetch fixture: ${path}`)
  return res.arrayBuffer()
}

describe('MBTiles (browser)', () => {
  registerSharedTests({
    async openMBTiles(fixtureName) {
      const buffer = await fetchFixture(fixtureName)
      return MBTiles.open(buffer)
    },
    async readFixtureImage(filename) {
      const buffer = await fetchFixture(`images/${filename}`)
      return new Uint8Array(buffer)
    },
  })

  describe('browser-specific', () => {
    it('open with Uint8Array', async () => {
      const buffer = await fetchFixture('plain_1.mbtiles')
      const mbtiles = await MBTiles.open(new Uint8Array(buffer))
      const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
      expect(tile.format).toBe('png')
      mbtiles.close()
    })

    it('open with File', async () => {
      const buffer = await fetchFixture('plain_1.mbtiles')
      const file = new File([buffer], 'test.mbtiles', {
        type: 'application/octet-stream',
      })
      const mbtiles = await MBTiles.open(file)
      const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
      expect(tile.format).toBe('png')
      mbtiles.close()
    })

    it('constructor throws without MBTiles.open()', () => {
      expect(() => {
        // @ts-expect-error - testing runtime guard
        new MBTiles()
      }).toThrow('Use MBTiles.open() to create an instance')
    })

    it('corrupt file rejects', async () => {
      const buffer = await fetchFixture('corrupt.mbtiles')
      await expect(MBTiles.open(buffer)).rejects.toThrow()
    })

    it('tile data is Uint8Array', async () => {
      const buffer = await fetchFixture('plain_1.mbtiles')
      const mbtiles = await MBTiles.open(buffer)
      const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
      expect(tile.data).toBeInstanceOf(Uint8Array)
      expect(ArrayBuffer.isView(tile.data)).toBe(true)
      mbtiles.close()
    })
  })

  describe('OPFS worker', () => {
    /**
     * Send a message to the worker and wait for a response.
     * @param {Worker} worker
     * @param {any} message
     * @param {Transferable[]} [transfer]
     * @returns {Promise<any>}
     */
    function workerRpc(worker, message, transfer = []) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Worker timeout')),
          10000,
        )
        worker.onmessage = (event) => {
          clearTimeout(timeout)
          if (event.data.type === 'error') {
            reject(new Error(event.data.message))
          } else {
            resolve(event.data)
          }
        }
        worker.onerror = (error) => {
          clearTimeout(timeout)
          reject(error)
        }
        worker.postMessage(message, transfer)
      })
    }

    // WebKit does not support SharedArrayBuffer in workers (needed for OPFS)
    const isWebKit =
      /AppleWebKit/.test(navigator.userAgent) &&
      !/Chrome/.test(navigator.userAgent)
    it.skipIf(isWebKit)('opens MBTiles via OPFS in a worker', async () => {
      const worker = new Worker(new URL('./opfs-worker.js', import.meta.url), {
        type: 'module',
      })
      try {
        const buffer = await fetchFixture('plain_1.mbtiles')
        const opened = await workerRpc(worker, { type: 'open', buffer }, [
          buffer,
        ])
        expect(opened.type).toBe('opened')
        expect(opened.metadata.name).toBe('plain_1')
        expect(opened.metadata.format).toBe('png')

        const tileResult = await workerRpc(worker, {
          type: 'getTile',
          coords: { z: 0, x: 0, y: 0 },
        })
        expect(tileResult.type).toBe('tile')
        expect(tileResult.tile.format).toBe('png')
        expect(tileResult.data).toBeInstanceOf(Uint8Array)
        expect(tileResult.data.length).toBeGreaterThan(0)

        const expected = await fetchFixture('images/plain_1_0_0_0.png')
        expect(tileResult.data).toEqual(new Uint8Array(expected))

        const closed = await workerRpc(worker, { type: 'close' })
        expect(closed.type).toBe('closed')
      } finally {
        worker.terminate()
      }
    })
  })
})
