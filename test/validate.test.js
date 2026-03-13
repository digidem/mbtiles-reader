import Database from 'better-sqlite3'

import { describe, expect, it } from 'vitest'

import { validate } from '../lib/validate.js'

/**
 * Create an in-memory database with the standard MBTiles schema.
 * @param {object} [opts]
 * @param {boolean} [opts.skipTilesTable]
 * @param {boolean} [opts.skipMetadataTable]
 * @param {Record<string, string | null>[]} [opts.metadataRows]
 * @param {{ z: number, x: number, y: number, data: Buffer | null }[]} [opts.tiles]
 * @returns {Database.Database}
 */
function createTestDb({
  skipTilesTable = false,
  skipMetadataTable = false,
  metadataRows = [],
  tiles = [],
} = {}) {
  const db = new Database(':memory:')

  if (!skipTilesTable) {
    db.exec(`CREATE TABLE tiles (
      zoom_level INTEGER,
      tile_column INTEGER,
      tile_row INTEGER,
      tile_data BLOB
    )`)
    const insert = db.prepare(
      'INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)',
    )
    for (const { z, x, y, data } of tiles) {
      insert.run(z, x, y, data)
    }
  }

  if (!skipMetadataTable) {
    db.exec(`CREATE TABLE metadata (name TEXT, value TEXT)`)
    const insert = db.prepare(
      'INSERT INTO metadata (name, value) VALUES (?, ?)',
    )
    for (const { name, value } of metadataRows) {
      insert.run(name, value)
    }
  }

  return db
}

// Minimal valid PNG header (8 bytes)
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

/** @param {Database.Database} db */
const query = (db) => (/** @type {string} */ sql) => db.prepare(sql).all()

describe('validate', () => {
  describe('table validation', () => {
    it('throws when tiles table is missing', () => {
      const db = createTestDb({
        skipTilesTable: true,
      })
      expect(() => validate(query(db))).toThrow(
        'Invalid MBTiles file: Missing tiles table',
      )
      db.close()
    })

    it('throws when metadata table is missing', () => {
      const db = createTestDb({
        skipMetadataTable: true,
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      expect(() => validate(query(db))).toThrow(
        'Invalid MBTiles file: Missing metadata table',
      )
      db.close()
    })

    it('throws when tiles table has wrong column type', () => {
      const db = new Database(':memory:')
      db.exec(`CREATE TABLE tiles (
        zoom_level TEXT,
        tile_column INTEGER,
        tile_row INTEGER,
        tile_data BLOB
      )`)
      db.exec('CREATE TABLE metadata (name TEXT, value TEXT)')
      expect(() => validate(query(db))).toThrow(
        "Column 'zoom_level' should have type=INTEGER",
      )
      db.close()
    })
  })

  describe('metadata validation', () => {
    it('throws when name metadata is missing', () => {
      const db = createTestDb({
        metadataRows: [{ name: 'description', value: 'no name here' }],
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      expect(() => validate(query(db))).toThrow(
        'Invalid MBTiles file: Missing name metadata',
      )
      db.close()
    })

    it('throws when pbf format lacks json metadata', () => {
      const db = createTestDb({
        metadataRows: [
          { name: 'name', value: 'test' },
          { name: 'format', value: 'pbf' },
        ],
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      expect(() => validate(query(db))).toThrow(
        'Invalid MBTiles file: Missing json metadata',
      )
      db.close()
    })

    it('throws for invalid minzoom value', () => {
      const db = createTestDb({
        metadataRows: [
          { name: 'name', value: 'test' },
          { name: 'minzoom', value: 'not-a-number' },
        ],
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      expect(() => validate(query(db))).toThrow(
        'Invalid MBTiles file: Invalid minzoom metadata',
      )
      db.close()
    })

    it('throws for invalid maxzoom value', () => {
      const db = createTestDb({
        metadataRows: [
          { name: 'name', value: 'test' },
          { name: 'maxzoom', value: 'abc' },
        ],
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      expect(() => validate(query(db))).toThrow(
        'Invalid MBTiles file: Invalid maxzoom metadata',
      )
      db.close()
    })

    it('throws for invalid bounds value', () => {
      const db = createTestDb({
        metadataRows: [
          { name: 'name', value: 'test' },
          { name: 'bounds', value: '-180,abc,180,85' },
        ],
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      expect(() => validate(query(db))).toThrow(
        'Invalid MBTiles file: Invalid bounds metadata',
      )
      db.close()
    })

    it('throws for invalid center value', () => {
      const db = createTestDb({
        metadataRows: [
          { name: 'name', value: 'test' },
          { name: 'center', value: '0,xyz,2' },
        ],
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      expect(() => validate(query(db))).toThrow(
        'Invalid MBTiles file: Invalid center metadata',
      )
      db.close()
    })

    it('parses explicit minzoom and maxzoom from metadata', () => {
      const db = createTestDb({
        metadataRows: [
          { name: 'name', value: 'test' },
          { name: 'minzoom', value: '2' },
          { name: 'maxzoom', value: '8' },
        ],
        tiles: [
          { z: 0, x: 0, y: 0, data: PNG_HEADER },
          { z: 10, x: 0, y: 0, data: PNG_HEADER },
        ],
      })
      const metadata = validate(query(db))
      // Should use metadata values, not derived from tiles
      expect(metadata.minzoom).toBe(2)
      expect(metadata.maxzoom).toBe(8)
      db.close()
    })

    it('respects explicit minzoom of 0', () => {
      const db = createTestDb({
        metadataRows: [
          { name: 'name', value: 'test' },
          { name: 'minzoom', value: '0' },
          { name: 'maxzoom', value: '3' },
        ],
        tiles: [
          { z: 2, x: 0, y: 0, data: PNG_HEADER },
          { z: 5, x: 0, y: 0, data: PNG_HEADER },
        ],
      })
      const metadata = validate(query(db))
      // minzoom=0 is falsy but should still be respected
      expect(metadata.minzoom).toBe(0)
      expect(metadata.maxzoom).toBe(3)
      db.close()
    })

    it('parses explicit bounds from metadata', () => {
      const db = createTestDb({
        metadataRows: [
          { name: 'name', value: 'test' },
          { name: 'bounds', value: '-10.5,20.3,30.7,50.1' },
        ],
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      const metadata = validate(query(db))
      expect(metadata.bounds).toEqual([-10.5, 20.3, 30.7, 50.1])
      db.close()
    })

    it('parses explicit center from metadata', () => {
      const db = createTestDb({
        metadataRows: [
          { name: 'name', value: 'test' },
          { name: 'center', value: '10.5,20.3,5' },
        ],
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      const metadata = validate(query(db))
      expect(metadata.center).toEqual([10.5, 20.3, 5])
      db.close()
    })

    it('json metadata is merged under explicit values', () => {
      const db = createTestDb({
        metadataRows: [
          { name: 'name', value: 'test' },
          { name: 'version', value: '1.0' },
          {
            name: 'json',
            value: '{"version":"2.0","custom":{"nested":"value"}}',
          },
        ],
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      const metadata = validate(query(db))
      // Explicit 'version' row should win over json's 'version'
      expect(metadata.version).toBe('1.0')
      // Custom nested property from json should be present
      expect(metadata.custom).toEqual({ nested: 'value' })
      db.close()
    })
  })

  describe('derived values', () => {
    it('derives minzoom and maxzoom from tiles', () => {
      const db = createTestDb({
        metadataRows: [{ name: 'name', value: 'test' }],
        tiles: [
          { z: 2, x: 0, y: 0, data: PNG_HEADER },
          { z: 5, x: 0, y: 0, data: PNG_HEADER },
          { z: 3, x: 0, y: 0, data: PNG_HEADER },
        ],
      })
      const metadata = validate(query(db))
      expect(metadata.minzoom).toBe(2)
      expect(metadata.maxzoom).toBe(5)
      db.close()
    })

    it('derives bounds from tile extent', () => {
      const db = createTestDb({
        metadataRows: [{ name: 'name', value: 'test' }],
        tiles: [{ z: 1, x: 0, y: 0, data: PNG_HEADER }],
      })
      const metadata = validate(query(db))
      expect(metadata.bounds).toBeInstanceOf(Array)
      expect(metadata.bounds).toHaveLength(4)
      // All bounds values should be finite numbers
      for (const v of metadata.bounds) {
        expect(Number.isFinite(v)).toBe(true)
      }
      db.close()
    })

    it('derives center from bounds', () => {
      const db = createTestDb({
        metadataRows: [{ name: 'name', value: 'test' }],
        tiles: [
          { z: 1, x: 0, y: 0, data: PNG_HEADER },
          { z: 3, x: 0, y: 0, data: PNG_HEADER },
        ],
      })
      const metadata = validate(query(db))
      expect(metadata.center).toBeInstanceOf(Array)
      expect(metadata.center).toHaveLength(3)
      // center[2] should be a zoom level between minzoom and maxzoom
      expect(metadata.center[2]).toBeGreaterThanOrEqual(metadata.minzoom)
      expect(metadata.center[2]).toBeLessThanOrEqual(metadata.maxzoom)
      db.close()
    })

    it('detects format from tile data', () => {
      const db = createTestDb({
        metadataRows: [{ name: 'name', value: 'test' }],
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      const metadata = validate(query(db))
      expect(metadata.format).toBe('png')
      db.close()
    })

    it('always sets scheme to xyz', () => {
      const db = createTestDb({
        metadataRows: [
          { name: 'name', value: 'test' },
          { name: 'scheme', value: 'tms' },
        ],
        tiles: [{ z: 0, x: 0, y: 0, data: PNG_HEADER }],
      })
      const metadata = validate(query(db))
      expect(metadata.scheme).toBe('xyz')
      db.close()
    })

    it('center zoom is maxzoom when range <= 1', () => {
      const db = createTestDb({
        metadataRows: [{ name: 'name', value: 'test' }],
        tiles: [
          { z: 5, x: 0, y: 0, data: PNG_HEADER },
          { z: 6, x: 0, y: 0, data: PNG_HEADER },
        ],
      })
      const metadata = validate(query(db))
      expect(metadata.center[2]).toBe(metadata.maxzoom)
      db.close()
    })
  })
})
