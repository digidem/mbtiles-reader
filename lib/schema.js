import { SphericalMercator } from '@mapbox/sphericalmercator'
import tiletype from '@mapbox/tiletype'

import assert from 'node:assert/strict'

const sm = new SphericalMercator()

/**
 * @typedef {object} MBTilesMetadata
 * @property {string} name
 * @property {string} format
 * @property {'xyz'} scheme
 * @property {number} minzoom
 * @property {number} maxzoom
 * @property {number[]} center
 * @property {number[]} bounds
 * @property {string} [attribution]
 * @property {string} [description]
 * @property {number} [version]
 * @property {'overlay' | 'baselayer'} [type]
 */

/**
 * Validates the MBTiles file and returns the metadata.
 * @param {import('better-sqlite3').Database} db
 * @returns {MBTilesMetadata}
 */
export function validate(db) {
  const stmt = db.prepare('SELECT * FROM sqlite_master WHERE name = ?')

  const tilesTable = stmt.get('tiles')
  if (!tilesTable) {
    throw new Error('Invalid MBTiles file: Missing tiles table')
  }

  const tilesColumns = /** @type {ColumnInfo[]} */ (
    db.prepare(`PRAGMA table_info(tiles)`).all()
  )
  assertMatchingSchema(tilesColumns, TILES_SCHEMA)

  const metadataTable = stmt.get('metadata')
  if (!metadataTable) {
    throw new Error('Invalid MBTiles file: Missing metadata table')
  }
  const metadataColumns = /** @type {ColumnInfo[]} */ (
    db.prepare(`PRAGMA table_info(metadata)`).all()
  )
  assertMatchingSchema(metadataColumns, METADATA_SCHEMA)

  const metadataRows = /** @type {MetadataRow[]} */ (
    db.prepare('SELECT * FROM metadata').all()
  )

  /** @type {any} */
  let metadata = {}
  for (const { name, value } of metadataRows) {
    switch (name) {
      // The special "json" key/value pair allows JSON to be serialized
      // and merged into the metadata of an MBTiles based source. This
      // enables nested properties and non-string datatypes to be
      // captured by the MBTiles metadata table.
      case 'json':
        metadata = { ...JSON.parse(value), ...metadata }
        break
      case 'minzoom':
      case 'maxzoom':
        metadata[name] = parseInt(value, 10)
        if (isNaN(metadata[name])) {
          throw new Error(`Invalid MBTiles file: Invalid ${name} metadata`)
        }
        break
      case 'center':
      case 'bounds':
        metadata[name] = value.split(',').map((v) => {
          const n = parseFloat(v)
          if (isNaN(n)) {
            throw new Error(`Invalid MBTiles file: Invalid ${name} metadata`)
          }
          return n
        })
        break
      default:
        metadata[name] = value
        break
    }
  }

  if (!metadata['name']) {
    throw new Error('Invalid MBTiles file: Missing name metadata')
  }
  if (
    metadata.format === 'pbf' &&
    !metadataRows.some((r) => r.name === 'json')
  ) {
    throw new Error('Invalid MBTiles file: Missing json metadata')
  }
  // Guarantee that we always return proper scheme type, even if 'tms' is specified in metadata
  metadata.scheme = 'xyz'

  if (!metadata['minzoom']) {
    const minzoom = db
      .prepare('SELECT MIN(zoom_level) FROM tiles')
      .pluck()
      .get()
    metadata.minzoom = minzoom
  }

  if (!metadata['maxzoom']) {
    const maxzoom = db
      .prepare('SELECT MAX(zoom_level) FROM tiles')
      .pluck()
      .get()
    metadata.maxzoom = maxzoom
  }

  if (!metadata['bounds']) {
    const { maxx, minx, maxy, miny } =
      /** @type {{ maxx: number, minx: number, maxy: number, miny: number }} */ (
        db
          .prepare(
            'SELECT MAX(tile_column) AS maxx, ' +
              'MIN(tile_column) AS minx, MAX(tile_row) AS maxy, ' +
              'MIN(tile_row) AS miny FROM tiles ' +
              'WHERE zoom_level = ?',
          )
          .get(metadata.minzoom)
      )
    // @TODO this breaks a little at zoom level zero
    var urTile = sm.bbox(maxx, maxy, metadata.minzoom, true)
    var llTile = sm.bbox(minx, miny, metadata.minzoom, true)
    // @TODO bounds are limited to "sensible" values here
    // as sometimes tilesets are rendered with "negative"
    // and/or other extremity tiles. Revisit this if there
    // are actual use cases for out-of-bounds bounds.
    metadata.bounds = [
      llTile[0] > -180 ? llTile[0] : -180,
      llTile[1] > -90 ? llTile[1] : -90,
      urTile[2] < 180 ? urTile[2] : 180,
      urTile[3] < 90 ? urTile[3] : 90,
    ]
  }

  if (!metadata['center']) {
    const range = metadata.maxzoom - metadata.minzoom
    const [w, s, e, n] = metadata.bounds
    metadata.center = [
      (e - w) / 2 + w,
      (n - s) / 2 + s,
      range <= 1
        ? metadata.maxzoom
        : Math.floor(range * 0.5) + metadata.minzoom,
    ]
  }

  if (!metadata.format) {
    const stmt = db.prepare(
      'SELECT tile_data FROM tiles WHERE tile_data IS NOT NULL LIMIT 1',
    )
    const tileData = stmt.pluck().get()
    if (Buffer.isBuffer(tileData)) {
      metadata.format = tiletype.type(tileData)
    }
  }

  return metadata
}

/** @typedef {{ type: 'INTEGER' | 'BLOB' | 'TEXT', pk: 1 | 0, cid: number, notnull: 1 | 0, dflt_value: any, name: string }} ColumnInfo */
/** @typedef {Record<string, Partial<Omit<ColumnInfo, 'name'>>>} ColumnSchema */
/**
 * @template {Record<string, { type: ColumnInfo['type'] }>} T
 * @typedef {{ [K in keyof T]: T[K]['type'] extends 'INTEGER' ? number : T[K]['type'] extends 'TEXT' ? string : T[K]['type'] extends 'BLOB' ? Buffer : never }} TypedRow
 */
/** @typedef {TypedRow<typeof TILES_SCHEMA>} TileRow */
/** @typedef {TypedRow<typeof METADATA_SCHEMA>} MetadataRow */

const METADATA_SCHEMA = /** @satisfies {ColumnSchema} */ ({
  name: { type: 'TEXT' },
  value: { type: 'TEXT' },
})

const TILES_SCHEMA = /** @satisfies {ColumnSchema} */ ({
  zoom_level: { type: 'INTEGER' },
  tile_column: { type: 'INTEGER' },
  tile_row: { type: 'INTEGER' },
  tile_data: { type: 'BLOB' },
})

/**
 * @param {ColumnInfo[]} columns
 * @param {ColumnSchema} schema
 */
function assertMatchingSchema(columns, schema) {
  for (const [name, info] of Object.entries(schema)) {
    const column = columns.find((c) => c.name === name)
    assert(column, `Missing column '${name}'`)
    for (const [prop, value] of Object.entries(info)) {
      assert(
        // @ts-expect-error
        column[prop] === value,
        // @ts-expect-error
        `Column '${name}' should have ${prop}=${value}, but instead ${prop}=${column[prop]}`,
      )
    }
  }
}
