import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { MBTiles } from '../index.js'
import { registerSharedTests } from './shared.js'

const fixturesDir = new URL('./fixtures/', import.meta.url)

describe('MBTiles (node)', () => {
  registerSharedTests({
    async openMBTiles(fixtureName) {
      const path = fileURLToPath(new URL(fixtureName, fixturesDir))
      return MBTiles.open(path)
    },
    async readFixtureImage(filename) {
      const path = new URL(`images/${filename}`, fixturesDir)
      return new Uint8Array(readFileSync(path))
    },
    async readFixture(fixtureName) {
      const path = fileURLToPath(new URL(fixtureName, fixturesDir))
      const buf = readFileSync(path)
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    },
    open: (source) => MBTiles.open(source),
  })

  describe('node-specific', () => {
    it('non-existent file', async () => {
      const nonExistentPath = new URL('non_existent.mbtiles', fixturesDir)
      await expect(
        MBTiles.open(fileURLToPath(nonExistentPath)),
      ).rejects.toThrow('unable to open database file')
      expect(existsSync(nonExistentPath)).toBe(false)
    })

    it('corrupt file', async () => {
      const corruptPath = fileURLToPath(new URL('corrupt.mbtiles', fixturesDir))
      await expect(MBTiles.open(corruptPath)).rejects.toThrow(
        'database disk image is malformed',
      )
    })

    it('constructor throws without MBTiles.open()', () => {
      expect(() => {
        // @ts-expect-error - testing runtime guard
        new MBTiles()
      }).toThrow('Use MBTiles.open() to create an instance')
    })

    it('tile data is Uint8Array (not Buffer)', async () => {
      const path = fileURLToPath(new URL('plain_1.mbtiles', fixturesDir))
      const mbtiles = await MBTiles.open(path)
      const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
      expect(tile.data).toBeInstanceOf(Uint8Array)
      expect(Buffer.isBuffer(tile.data)).toBe(false)
      mbtiles.close()
    })

    it('accepts a Database instance', async () => {
      const path = fileURLToPath(new URL('plain_1.mbtiles', fixturesDir))
      const db = new Database(path, { readonly: true })
      const mbtiles = await MBTiles.open(db)
      const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
      expect(tile.format).toBe('png')
      expect(mbtiles.metadata.name).toBe('plain_1')
      mbtiles.close()
    })
  })
})
