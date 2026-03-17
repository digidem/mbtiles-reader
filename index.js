import Database from 'better-sqlite3'

import { tileFromRow } from './lib/tile.js'
import { validate as _validate } from './lib/validate.js'

/** @import { Tile } from './lib/tile.js' */
/** @import { TileRow, MBTilesMetadata } from './lib/validate.js' */

/** @type {unique symbol} */
const INTERNAL = Symbol('MBTiles.internal')

/** @param {import('better-sqlite3').Database} db */
function validate(db) {
  return _validate(
    (sql) => /** @type {Record<string, any>[]} */ (db.prepare(sql).all()),
  )
}

export class MBTiles {
  /** @type {import('better-sqlite3').Database} */
  #db
  /** @type {MBTilesMetadata} */
  #metadata
  /** @type {import('better-sqlite3').Statement<[number, number, number], TileRow>} */
  #getTileStmt

  /**
   * @param {symbol} token
   * @param {import('better-sqlite3').Database} db
   * @param {MBTilesMetadata} metadata
   */
  constructor(token, db, metadata) {
    if (token !== INTERNAL) {
      throw new TypeError('Use MBTiles.open() to create an instance')
    }
    this.#db = db
    this.#metadata = metadata
    this.#getTileStmt = this.#db.prepare(
      'SELECT * FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?',
    )
  }

  /**
   * Open an MBTiles database.
   *
   * @param {string | ArrayBuffer | Uint8Array | import('better-sqlite3').Database} source File path, buffer, or better-sqlite3 Database instance.
   * @returns {Promise<MBTiles>}
   */
  static async open(source) {
    /** @type {import('better-sqlite3').Database} */
    let db
    if (typeof source === 'string') {
      db = new Database(source, { readonly: true, fileMustExist: true })
    } else if (source instanceof ArrayBuffer) {
      db = new Database(Buffer.from(source))
    } else if (source instanceof Uint8Array) {
      db = new Database(
        Buffer.from(source.buffer, source.byteOffset, source.byteLength),
      )
    } else {
      db = source
    }
    const metadata = validate(db)
    return new MBTiles(INTERNAL, db, metadata)
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
}
