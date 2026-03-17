import tiletype from '@mapbox/tiletype'

/**
 * @typedef {object} Tile
 * @property {number} z
 * @property {number} x
 * @property {number} y
 * @property {Uint8Array} data
 * @property {tiletype.extensions} format
 */

/**
 * @param {Record<string, any>} row
 * @returns {Tile}
 */
export function tileFromRow(row) {
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
  // Wrap with Uint8Array to strip Buffer prototype in Node
  return {
    z,
    x,
    y,
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    format,
  }
}
