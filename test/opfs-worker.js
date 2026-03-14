import { MBTiles } from '../index.browser.js'

const OPFS_FILENAME = 'test.mbtiles'

self.onmessage = async (event) => {
  try {
    const { type, buffer, coords } = event.data
    switch (type) {
      case 'open': {
        await copyToOpfs(buffer, OPFS_FILENAME)
        const mbtiles = await MBTiles.open(OPFS_FILENAME)
        self._mbtiles = mbtiles
        self.postMessage({
          type: 'opened',
          metadata: mbtiles.metadata,
        })
        break
      }
      case 'getTile': {
        const tile = self._mbtiles.getTile(coords)
        self.postMessage({
          type: 'tile',
          tile: { z: tile.z, x: tile.x, y: tile.y, format: tile.format },
          data: tile.data,
        })
        break
      }
      case 'close': {
        self._mbtiles.close()
        self._mbtiles = undefined
        await removeFromOpfs(OPFS_FILENAME)
        self.postMessage({ type: 'closed' })
        break
      }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message })
  }
}

/**
 * @param {ArrayBuffer} buffer
 * @param {string} filename
 */
async function copyToOpfs(buffer, filename) {
  const root = await navigator.storage.getDirectory()
  // Remove any stale file first to avoid lock conflicts
  await root.removeEntry(filename).catch(() => {})
  const fileHandle = await root.getFileHandle(filename, { create: true })
  // Retry createSyncAccessHandle for WebKit transient OPFS errors
  let accessHandle
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      accessHandle = await fileHandle.createSyncAccessHandle()
      break
    } catch (e) {
      if (attempt === 2) throw e
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)))
    }
  }
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
