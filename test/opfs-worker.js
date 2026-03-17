/// <reference lib="webworker" />
import { MBTiles } from '../index.browser.js'

const OPFS_FILENAME = 'test.mbtiles'
/** @type {MBTiles | undefined} */
let mbtiles

self.onmessage = async (event) => {
  try {
    const { type, buffer, coords } = event.data
    switch (type) {
      case 'open': {
        await copyToOpfs(buffer, OPFS_FILENAME)
        mbtiles = await MBTiles.open(OPFS_FILENAME)
        self.postMessage({
          type: 'opened',
          metadata: mbtiles.metadata,
        })
        break
      }
      case 'getTile': {
        if (!mbtiles) {
          throw new Error('MBTiles not opened')
        }
        const tile = mbtiles.getTile(coords)
        self.postMessage({
          type: 'tile',
          tile: { z: tile.z, x: tile.x, y: tile.y, format: tile.format },
          data: tile.data,
        })
        break
      }
      case 'close': {
        mbtiles?.close()
        mbtiles = undefined
        await removeFromOpfs(OPFS_FILENAME)
        self.postMessage({ type: 'closed' })
        break
      }
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: /** @type {Error} */ (error)?.message,
    })
  }
}

/**
 * @param {ArrayBuffer} buffer
 * @param {string} filename
 */
async function copyToOpfs(buffer, filename) {
  const root = await navigator.storage.getDirectory()
  await root.removeEntry(filename).catch(() => {})
  const fileHandle = await root.getFileHandle(filename, { create: true })
  const accessHandle = await fileHandle.createSyncAccessHandle()
  try {
    accessHandle.write(new Uint8Array(buffer), { at: 0 })
  } finally {
    accessHandle.flush()
    accessHandle.close()
  }
}

/**
 * @param {string} filename
 */
async function removeFromOpfs(filename) {
  const root = await navigator.storage.getDirectory()
  await root.removeEntry(filename).catch(() => {})
}
