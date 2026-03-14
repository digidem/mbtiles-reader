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
})
