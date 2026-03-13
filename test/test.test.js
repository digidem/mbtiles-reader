import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { MBTiles } from '../index.js'

import { registerSharedTests } from './shared.js'

const fixturesDir = new URL('./fixtures/', import.meta.url)

describe('MBTiles (node)', () => {
  registerSharedTests({
    async openMBTiles(fixtureName) {
      const path = fileURLToPath(new URL(fixtureName, fixturesDir))
      return new MBTiles(path)
    },
    async readFixtureImage(filename) {
      const path = new URL(`images/${filename}`, fixturesDir)
      return new Uint8Array(readFileSync(path))
    },
  })

  describe('node-specific', () => {
    it('readableStream', async () => {
      const path = fileURLToPath(new URL('plain_1.mbtiles', fixturesDir))
      const mbtiles = new MBTiles(path)
      let count = 0
      for await (const { z, x, y, data, format } of mbtiles.readableStream()) {
        expect(format).toBe('png')
        const tmsY = (1 << z) - 1 - y
        const expected = readFileSync(
          new URL(`images/plain_1_${x}_${tmsY}_${z}.png`, fixturesDir),
        )
        expect(data).toEqual(expected)
        count++
      }
      expect(count).toBe(285)
    })

    it('non-existent file', () => {
      const nonExistentPath = new URL('non_existent.mbtiles', fixturesDir)
      expect(() => {
        new MBTiles(fileURLToPath(nonExistentPath))
      }).toThrow('unable to open database file')
      expect(existsSync(nonExistentPath)).toBe(false)
    })

    it('corrupt file', () => {
      const corruptPath = fileURLToPath(
        new URL('corrupt.mbtiles', fixturesDir),
      )
      expect(() => {
        new MBTiles(corruptPath)
      }).toThrow('database disk image is malformed')
    })

    it('tile data is Buffer', () => {
      const path = fileURLToPath(new URL('plain_1.mbtiles', fixturesDir))
      const mbtiles = new MBTiles(path)
      const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
      expect(Buffer.isBuffer(tile.data)).toBe(true)
      mbtiles.close()
    })
  })
})
