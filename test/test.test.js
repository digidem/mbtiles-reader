import Database from 'better-sqlite3'
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

    it('tile data is Uint8Array (not Buffer)', () => {
      const path = fileURLToPath(new URL('plain_1.mbtiles', fixturesDir))
      const mbtiles = new MBTiles(path)
      const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
      expect(tile.data).toBeInstanceOf(Uint8Array)
      expect(Buffer.isBuffer(tile.data)).toBe(false)
      mbtiles.close()
    })

    it('accepts a Database instance', () => {
      const path = fileURLToPath(new URL('plain_1.mbtiles', fixturesDir))
      const db = new Database(path, { readonly: true })
      const mbtiles = new MBTiles(db)
      const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
      expect(tile.format).toBe('png')
      expect(mbtiles.metadata.name).toBe('plain_1')
      mbtiles.close()
    })
  })
})
