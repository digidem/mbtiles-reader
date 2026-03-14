import { MBTiles } from '../index.browser.js'

self.onmessage = async (event) => {
  try {
    const { type, buffer, coords } = event.data
    switch (type) {
      case 'open': {
        const mbtiles = await MBTiles.open(buffer)
        self.postMessage({
          type: 'opened',
          metadata: mbtiles.metadata,
          // Store instance ID so main thread can reference it
          // (only one instance supported in this simple worker)
        })
        // Store on self for subsequent messages
        self._mbtiles = mbtiles
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
        await self._mbtiles.close()
        self._mbtiles = undefined
        self.postMessage({ type: 'closed' })
        break
      }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message })
  }
}
