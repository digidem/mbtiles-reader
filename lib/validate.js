import { SphericalMercator } from '@mapbox/sphericalmercator'
import tiletype from '@mapbox/tiletype'

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
 * @typedef {{ type: 'INTEGER' | 'BLOB' | 'TEXT', pk: 1 | 0, cid: number, notnull: 1 | 0, dflt_value: any, name: string }} ColumnInfo
 * @typedef {Record<string, Partial<Omit<ColumnInfo, 'name'>>>} ColumnSchema
 */

/**
 * @template {Record<string, { type: ColumnInfo['type'] }>} T
 * @typedef {{ [K in keyof T]: T[K]['type'] extends 'INTEGER' ? number : T[K]['type'] extends 'TEXT' ? string : T[K]['type'] extends 'BLOB' ? Buffer | Uint8Array : never }} TypedRow
 */

/** @typedef {TypedRow<typeof TILES_SCHEMA>} TileRow */
/** @typedef {TypedRow<typeof METADATA_SCHEMA>} MetadataRow */

export const METADATA_SCHEMA = /** @satisfies {ColumnSchema} */ ({
  name: { type: 'TEXT' },
  value: { type: 'TEXT' },
})

export const TILES_SCHEMA = /** @satisfies {ColumnSchema} */ ({
  zoom_level: { type: 'INTEGER' },
  tile_column: { type: 'INTEGER' },
  tile_row: { type: 'INTEGER' },
  tile_data: { type: 'BLOB' },
})

/**
 * A query function that executes SQL and returns rows as arrays of objects.
 * @callback QueryFn
 * @param {string} sql
 * @returns {Record<string, any>[]}
 */

/**
 * Validates the MBTiles file and returns the metadata.
 * @param {QueryFn} query - Function that executes SQL and returns row objects
 * @returns {MBTilesMetadata}
 */
export function validate(query) {
  const tilesColumns = /** @type {ColumnInfo[]} */ (
    query('PRAGMA table_info(tiles)')
  )
  if (tilesColumns.length === 0) {
    throw new Error('Invalid MBTiles file: Missing tiles table')
  }
  assertMatchingSchema(tilesColumns, TILES_SCHEMA)

  const metadataColumns = /** @type {ColumnInfo[]} */ (
    query('PRAGMA table_info(metadata)')
  )
  if (metadataColumns.length === 0) {
    throw new Error('Invalid MBTiles file: Missing metadata table')
  }
  assertMatchingSchema(metadataColumns, METADATA_SCHEMA)

  const metadataRows = /** @type {MetadataRow[]} */ (
    query('SELECT * FROM metadata')
  )

  /** @type {any} */
  let metadata = {}
  for (const { name, value } of metadataRows) {
    switch (name) {
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
        metadata[name] = value.split(',').map((/** @type {string} */ v) => {
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
  metadata.scheme = 'xyz'

  if (metadata['minzoom'] == null) {
    const [row] = query('SELECT MIN(zoom_level) AS minzoom FROM tiles')
    metadata.minzoom = row.minzoom
  }

  if (metadata['maxzoom'] == null) {
    const [row] = query('SELECT MAX(zoom_level) AS maxzoom FROM tiles')
    metadata.maxzoom = row.maxzoom
  }

  if (!metadata['bounds']) {
    const [{ maxx, minx, maxy, miny }] = query(
      'SELECT MAX(tile_column) AS maxx, ' +
        'MIN(tile_column) AS minx, MAX(tile_row) AS maxy, ' +
        'MIN(tile_row) AS miny FROM tiles ' +
        'WHERE zoom_level = ' +
        metadata.minzoom,
    )
    // @TODO this breaks a little at zoom level zero
    var urTile = sm.bbox(maxx, maxy, metadata.minzoom, true)
    var llTile = sm.bbox(minx, miny, metadata.minzoom, true)
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
    const [row] = query(
      'SELECT tile_data FROM tiles WHERE tile_data IS NOT NULL LIMIT 1',
    )
    if (row && row.tile_data) {
      const data = row.tile_data
      metadata.format = tiletype.type(data)
    }
  }

  return metadata
}

/**
 * @param {ColumnInfo[]} columns
 * @param {ColumnSchema} schema
 */
function assertMatchingSchema(columns, schema) {
  for (const [name, info] of Object.entries(schema)) {
    const column = columns.find((c) => c.name === name)
    if (!column) {
      throw new Error(`Missing column '${name}'`)
    }
    for (const [prop, value] of Object.entries(info)) {
      if (
        // @ts-expect-error
        column[prop] !== value
      ) {
        throw new Error(
          // @ts-expect-error
          `Column '${name}' should have ${prop}=${value}, but instead ${prop}=${column[prop]}`,
        )
      }
    }
  }
}
