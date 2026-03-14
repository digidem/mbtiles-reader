import tiletype from '@mapbox/tiletype'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

import { validate } from './lib/validate.js'

/**
 * @typedef {object} Tile
 * @property {number} z
 * @property {number} x
 * @property {number} y
 * @property {Uint8Array} data
 * @property {tiletype.extensions} format
 */

/** @typedef {import('./lib/validate.js').MBTilesMetadata} MBTilesMetadata */

let /** @type {import('@sqlite.org/sqlite-wasm').default | undefined} */ sqlite3

/** @type {unique symbol} */
const INTERNAL = Symbol('MBTiles.internal')

export class MBTiles {
  /** @type {import('@sqlite.org/sqlite-wasm').Database} */
  #db
  /** @type {MBTilesMetadata} */
  #metadata

  /**
   * @param {symbol} token
   * @param {import('@sqlite.org/sqlite-wasm').Database} db
   * @param {MBTilesMetadata} metadata
   */
  constructor(token, db, metadata) {
    if (token !== INTERNAL) {
      throw new TypeError('Use MBTiles.open() to create an instance')
    }
    this.#db = db
    this.#metadata = metadata
  }

  /**
   * Open an MBTiles database.
   *
   * When `source` is a string, it is treated as an OPFS file path and opened
   * directly with `OpfsDb` (requires a Web Worker context with OPFS support).
   *
   * When `source` is a `File`, `ArrayBuffer`, or `Uint8Array`, the data is
   * loaded into wasm memory using `sqlite3_deserialize`.
   *
   * @param {string | File | ArrayBuffer | Uint8Array} source
   * @returns {Promise<MBTiles>}
   */
  static async open(source) {
    if (!sqlite3) {
      sqlite3 = await sqlite3InitModule()
    }
    if (typeof source === 'string') {
      if (!sqlite3.oo1.OpfsDb) {
        throw new Error(
          'OPFS is not available. MBTiles.open() with a file path requires a Web Worker context.',
        )
      }
      return openOpfs(sqlite3, source)
    }
    return openInMemory(sqlite3, source)
  }

  /**
   * Get the tile at the given coordinates.
   * @param {{ z: number, x: number, y: number }} tileCoords
   * @returns {Tile}
   */
  getTile({ z, x, y }) {
    const yTMS = (1 << z) - 1 - y
    /** @type {Record<string, any>[]} */
    const rows = this.#db.exec(
      'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?',
      {
        rowMode: 'object',
        returnValue: 'resultRows',
        bind: [z, x, yTMS],
      },
    )
    if (rows.length === 0) {
      throw new Error(`Tile not found: ${z}/${x}/${y}`)
    }
    const data = rows[0].tile_data
    if (!data || !(data instanceof Uint8Array)) {
      throw new Error(`Invalid tile data for tile ${z}/${x}/${y}`)
    }
    const format = tiletype.type(data)
    if (typeof format !== 'string') {
      throw new Error(`Invalid tile data for tile ${z}/${x}/${y}`)
    }
    return { z, x, y, data, format }
  }

  /**
   * Metadata of the MBTiles file (see spec), with optional properties bounds,
   * center, minzoom and maxzoom derived from the data in the mbtiles file.
   */
  get metadata() {
    return this.#metadata
  }

  close() {
    this.#db.close()
  }

  /**
   * Iterator over all tiles in the MBTiles file.
   * @returns {IterableIterator<Tile>}
   */
  *[Symbol.iterator]() {
    /** @type {Record<string, any>[]} */
    const rows = this.#db.exec('SELECT * FROM tiles', {
      rowMode: 'object',
      returnValue: 'resultRows',
    })
    for (const row of rows) {
      yield tileFromRow(row)
    }
  }
}

/**
 * Open an OPFS file directly with OpfsDb.
 *
 * @param {import('@sqlite.org/sqlite-wasm').default} sqlite3
 * @param {string} path OPFS file path
 * @returns {Promise<MBTiles>}
 */
async function openOpfs(sqlite3, path) {
  const db = new sqlite3.oo1.OpfsDb(path, 'r')

  /** @type {import('./lib/validate.js').QueryFn} */
  const query = (sql) =>
    db.exec(sql, { rowMode: 'object', returnValue: 'resultRows' })

  const metadata = validate(query)
  return new MBTiles(INTERNAL, db, metadata)
}

/**
 * Open in-memory using sqlite3_deserialize.
 *
 * @param {import('@sqlite.org/sqlite-wasm').default} sqlite3
 * @param {File | ArrayBuffer | Uint8Array} source
 * @returns {Promise<MBTiles>}
 */
async function openInMemory(sqlite3, source) {
  const bytes =
    source instanceof Uint8Array
      ? source
      : source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : new Uint8Array(await source.arrayBuffer())

  const db = new sqlite3.oo1.DB()
  const p = sqlite3.wasm.alloc(bytes.length)
  sqlite3.wasm.heap8u().set(bytes, p)
  const rc = sqlite3.capi.sqlite3_deserialize(
    db.pointer,
    'main',
    p,
    bytes.length,
    bytes.length,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
      sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  )
  if (rc !== 0) {
    throw new Error(`Failed to deserialize database: rc=${rc}`)
  }

  /** @type {import('./lib/validate.js').QueryFn} */
  const query = (sql) =>
    db.exec(sql, { rowMode: 'object', returnValue: 'resultRows' })

  const metadata = validate(query)
  return new MBTiles(INTERNAL, db, metadata)
}

/**
 * @param {Record<string, any>} row
 * @returns {Tile}
 */
function tileFromRow(row) {
  const z = row.zoom_level
  const x = row.tile_column
  const tile_row = row.tile_row
  // Flip Y coordinate because MBTiles files are TMS.
  const y = (1 << z) - 1 - tile_row
  const data = row.tile_data
  if (!(data instanceof Uint8Array)) {
    throw new Error(`Invalid tile data for tile ${z}/${x}/${y}`)
  }
  const format = tiletype.type(data)
  if (typeof format !== 'string') {
    throw new Error(`Invalid tile data for tile ${z}/${x}/${y}`)
  }
  return { z, x, y, data, format }
}
