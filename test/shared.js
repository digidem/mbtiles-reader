import { describe, expect, it } from 'vitest'

/**
 * @typedef {object} TestHelpers
 * @property {(fixtureName: string) => Promise<import('../lib/validate.js').MBTilesMetadata & { getTile: Function, close: Function, [Symbol.iterator]: Function }>} openMBTiles
 * @property {(filename: string) => Promise<Uint8Array>} readFixtureImage
 */

/**
 * Register shared tests for MBTiles. These tests verify feature parity
 * between the node and browser implementations.
 * @param {TestHelpers} helpers
 */
export function registerSharedTests({ openMBTiles, readFixtureImage }) {
  describe('getTile', () => {
    it('returns correct tile data for a known tile', async () => {
      const mbtiles = await openMBTiles('plain_1.mbtiles')
      const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
      expect(tile.z).toBe(0)
      expect(tile.x).toBe(0)
      expect(tile.y).toBe(0)
      expect(tile.format).toBe('png')
      expect(tile.data.length).toBeGreaterThan(0)

      const expected = await readFixtureImage('plain_1_0_0_0.png')
      expect(new Uint8Array(tile.data)).toEqual(expected)
      mbtiles.close()
    })

    it('returns correct data for tiles across zoom levels', async () => {
      const mbtiles = await openMBTiles('plain_1.mbtiles')
      const testCoords = [
        { z: 1, x: 0, y: 0, tmsY: 1 },
        { z: 1, x: 1, y: 1, tmsY: 0 },
        { z: 2, x: 0, y: 0, tmsY: 3 },
        { z: 2, x: 3, y: 3, tmsY: 0 },
        { z: 3, x: 0, y: 0, tmsY: 7 },
      ]

      for (const { z, x, y, tmsY } of testCoords) {
        const tile = mbtiles.getTile({ z, x, y })
        expect(tile.z).toBe(z)
        expect(tile.x).toBe(x)
        expect(tile.y).toBe(y)
        expect(tile.format).toBe('png')

        const expected = await readFixtureImage(
          `plain_1_${x}_${tmsY}_${z}.png`,
        )
        expect(new Uint8Array(tile.data)).toEqual(expected)
      }
      mbtiles.close()
    })

    it('throws for invalid tile coordinates', async () => {
      const mbtiles = await openMBTiles('plain_1.mbtiles')
      const invalidTiles = [
        [0, 1, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [3, 1, -1],
        [2, -3, 3],
        [18, 2, 262140],
        [4, 0, 15],
      ]
      for (const [z, x, y] of invalidTiles) {
        expect(() => {
          mbtiles.getTile({ z, x, y })
        }).toThrow(`Tile not found: ${z}/${x}/${y}`)
      }
      mbtiles.close()
    })
  })

  describe('iterator', () => {
    it('iterates over all 285 tiles with correct data', async () => {
      const mbtiles = await openMBTiles('plain_1.mbtiles')
      let count = 0
      for (const { z, x, y, data, format } of mbtiles) {
        expect(format).toBe('png')
        expect(data.length).toBeGreaterThan(0)

        const tmsY = (1 << z) - 1 - y
        const expected = await readFixtureImage(
          `plain_1_${x}_${tmsY}_${z}.png`,
        )
        expect(new Uint8Array(data)).toEqual(expected)
        count++
      }
      expect(count).toBe(285)
      mbtiles.close()
    })
  })

  describe('metadata', () => {
    it('returns correct metadata with derived properties', async () => {
      const mbtiles = await openMBTiles('plain_1.mbtiles')
      const expectedMetadata = {
        level1: { level2: 'property' },
        version: '1.0.3',
        name: 'plain_1',
        type: 'baselayer',
        description: 'demo description',
        formatter: null,
        bounds: [-180, -70, 180, 85],
        scheme: 'xyz',
        minzoom: 0,
        maxzoom: 4,
        center: [0, 7.5, 2],
        format: 'png',
      }
      const roundedMetadata = {
        ...mbtiles.metadata,
        center: mbtiles.metadata.center.map(
          (/** @type {number} */ v) => Math.round(v * 1e6) / 1e6,
        ),
        bounds: mbtiles.metadata.bounds.map(
          (/** @type {number} */ v) => Math.round(v * 1e6) / 1e6,
        ),
      }
      expect(roundedMetadata).toEqual(expectedMetadata)
      mbtiles.close()
    })
  })

  describe('error handling', () => {
    it('throws for corrupt null tile data', async () => {
      const mbtiles = await openMBTiles('corrupt_null_tile.mbtiles')
      expect(() => {
        mbtiles.getTile({ z: 1, x: 0, y: 1 })
      }).toThrow('Invalid tile data for tile 1/0/1')
      mbtiles.close()
    })
  })

  describe('close', () => {
    it('prevents further operations after closing', async () => {
      const mbtiles = await openMBTiles('plain_1.mbtiles')
      mbtiles.close()
      expect(() => {
        mbtiles.getTile({ z: 1, x: 0, y: 1 })
      }).toThrow()
    })
  })
}
