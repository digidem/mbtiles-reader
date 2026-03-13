import { validate as _validate } from './validate.js'

export { TILES_SCHEMA, METADATA_SCHEMA } from './validate.js'

/**
 * @typedef {import('./validate.js').MBTilesMetadata} MBTilesMetadata
 * @typedef {import('./validate.js').TileRow} TileRow
 * @typedef {import('./validate.js').MetadataRow} MetadataRow
 */

/**
 * Validates the MBTiles file and returns the metadata.
 * @param {import('better-sqlite3').Database} db
 * @returns {MBTilesMetadata}
 */
export function validate(db) {
  return _validate((sql) => db.prepare(sql).all())
}
