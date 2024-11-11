import tiletype from '@mapbox/tiletype'
import Database from 'better-sqlite3'

import { Readable } from 'node:stream'

import { validate } from './lib/schema.js'

/**
 * @typedef {object} Tile
 * @property {number} z
 * @property {number} x
 * @property {number} y
 * @property {Buffer} data
 * @property {tiletype.extensions} format
 */

/** @import { TileRow, MBTilesMetadata } from './lib/schema.js' */

export class MBTiles {
  #db
  /** @type {MBTilesMetadata} */
  #metadata
  /** @type {import('better-sqlite3').Statement<[number, number, number], TileRow>} */
  #getTileStmt
  /**
   * @param {string | import('better-sqlite3').Database} filePathOrDb
   */
  constructor(filePathOrDb) {
    if (typeof filePathOrDb === 'string') {
      this.#db = new Database(filePathOrDb, {
        readonly: true,
        fileMustExist: true,
      })
    } else {
      this.#db = filePathOrDb
    }
    this.#metadata = validate(this.#db)
    this.#getTileStmt = this.#db.prepare(
      'SELECT * FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?',
    )
  }

  /**
   * Get the tile at the given coordinates.
   * @param {{ z: number, x: number, y: number }} tileCoords
   * @returns {Tile}
   */
  getTile({ z, x, y }) {
    const tileRow = this.#getTileStmt.get(z, x, (1 << z) - 1 - y)
    if (!tileRow) {
      throw new Error(`Tile not found: ${z}/${x}/${y}`)
    }
    return tileFromRow(tileRow)
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
    const stmt =
      /** @type {import('better-sqlite3').Statement<[], TileRow>} */ (
        this.#db.prepare('SELECT * FROM tiles')
      )
    for (const row of stmt.iterate()) {
      yield tileFromRow(row)
    }
  }

  /**
   * Readable stream of all tiles in the MBTiles file.
   * @returns {Readable}
   */
  readableStream() {
    return Readable.from(this)
  }
}

/**
 * @param {TileRow} tileRow
 * @returns {Tile}
 */
function tileFromRow({
  zoom_level: z,
  tile_column: x,
  tile_row,
  tile_data: data,
}) {
  // Flip Y coordinate because MBTiles files are TMS.
  const y = (1 << z) - 1 - tile_row
  if (!data) {
    throw new Error(`Invalid tile data for tile ${z}/${x}/${y}`)
  }
  const format = tiletype.type(data)
  if (typeof format !== 'string') {
    throw new Error(`Invalid tile data for tile ${z}/${x}/${y}`)
  }
  return { z, x, y, data, format }
}
