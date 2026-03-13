import { describe, expect, it } from 'vitest'

import { MBTiles } from '../index.browser.js'

/**
 * Fetch a file from the test fixtures as an ArrayBuffer.
 * In vitest browser mode, files are served relative to the project root.
 * @param {string} path
 * @returns {Promise<ArrayBuffer>}
 */
async function fetchFixture(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to fetch fixture: ${path}`)
  return res.arrayBuffer()
}

/**
 * List fixture image files.
 * Since we can't use fs.readdirSync in the browser, we hard-code the
 * expected tile coordinates derived from the plain_1.mbtiles fixture.
 * The fixture has 285 tiles at zoom levels 0-4.
 * @returns {{ x: number, tmsY: number, z: number }[]}
 */
function getTileFixtures() {
  /** @type {{ x: number, tmsY: number, z: number }[]} */
  const tiles = []
  // Zoom 0: 1 tile
  tiles.push({ x: 0, tmsY: 0, z: 0 })
  // Zoom 1: 4 tiles
  for (let x = 0; x < 2; x++) {
    for (let tmsY = 0; tmsY < 2; tmsY++) {
      tiles.push({ x, tmsY, z: 1 })
    }
  }
  // Zoom 2: 16 tiles
  for (let x = 0; x < 4; x++) {
    for (let tmsY = 0; tmsY < 4; tmsY++) {
      tiles.push({ x, tmsY, z: 2 })
    }
  }
  // Zoom 3: 64 tiles
  for (let x = 0; x < 8; x++) {
    for (let tmsY = 0; tmsY < 8; tmsY++) {
      tiles.push({ x, tmsY, z: 3 })
    }
  }
  // Zoom 4: 200 tiles (not all 256, only the ones that exist)
  // We'll enumerate from 0..15 and check 200 total to make 285
  // Actually, let's compute: 285 - 1 - 4 - 16 - 64 = 200 tiles at zoom 4
  for (let x = 0; x < 16; x++) {
    for (let tmsY = 0; tmsY < 16; tmsY++) {
      // Not all zoom-4 tiles may exist, but we'll check what we get from the DB
      tiles.push({ x, tmsY, z: 4 })
    }
  }
  return tiles
}

describe('MBTiles (browser)', () => {
  it('open and getTile', async () => {
    const buffer = await fetchFixture('/test/fixtures/plain_1.mbtiles')
    const mbtiles = await MBTiles.open(buffer)

    // Check a known tile exists
    const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
    expect(tile.z).toBe(0)
    expect(tile.x).toBe(0)
    expect(tile.y).toBe(0)
    expect(tile.format).toBe('png')
    expect(tile.data).toBeInstanceOf(Uint8Array)
    expect(tile.data.length).toBeGreaterThan(0)

    // Verify the tile data matches the fixture image
    const expectedData = await fetchFixture(
      '/test/fixtures/images/plain_1_0_0_0.png',
    )
    expect(tile.data).toEqual(new Uint8Array(expectedData))

    mbtiles.close()
  })

  it('getTile returns correct data for multiple tiles', async () => {
    const buffer = await fetchFixture('/test/fixtures/plain_1.mbtiles')
    const mbtiles = await MBTiles.open(buffer)

    // Check tiles at zoom levels 1-3
    const testCoords = [
      { z: 1, x: 0, y: 0, tmsY: 1 },
      { z: 1, x: 1, y: 1, tmsY: 0 },
      { z: 2, x: 0, y: 0, tmsY: 3 },
      { z: 2, x: 3, y: 3, tmsY: 0 },
      { z: 3, x: 0, y: 0, tmsY: 7 },
    ]

    for (const { z, x, y, tmsY } of testCoords) {
      const tile = mbtiles.getTile({ z, x, y })
      expect(tile.z).toBe(z)
      expect(tile.x).toBe(x)
      expect(tile.y).toBe(y)
      expect(tile.format).toBe('png')

      const expectedData = await fetchFixture(
        `/test/fixtures/images/plain_1_${x}_${tmsY}_${z}.png`,
      )
      expect(tile.data).toEqual(new Uint8Array(expectedData))
    }

    mbtiles.close()
  })

  it('iterator', async () => {
    const buffer = await fetchFixture('/test/fixtures/plain_1.mbtiles')
    const mbtiles = await MBTiles.open(buffer)

    let count = 0
    for (const { z, x, y, data, format } of mbtiles) {
      expect(format).toBe('png')
      expect(data).toBeInstanceOf(Uint8Array)
      expect(data.length).toBeGreaterThan(0)

      // Verify each tile matches its fixture image
      const tmsY = (1 << z) - 1 - y
      const expectedData = await fetchFixture(
        `/test/fixtures/images/plain_1_${x}_${tmsY}_${z}.png`,
      )
      expect(data).toEqual(new Uint8Array(expectedData))
      count++
    }

    expect(count).toBe(285)
    mbtiles.close()
  })

  it('metadata', async () => {
    const buffer = await fetchFixture('/test/fixtures/plain_1.mbtiles')
    const mbtiles = await MBTiles.open(buffer)
    const expectedMetadata = {
      level1: { level2: 'property' },
      version: '1.0.3',
      name: 'plain_1',
      type: 'baselayer',
      description: 'demo description',
      formatter: null,
      bounds: [-180, -70, 180, 85],
      scheme: 'xyz',
      minzoom: 0,
      maxzoom: 4,
      center: [0, 7.5, 2],
      format: 'png',
    }
    const roundedMetadata = {
      ...mbtiles.metadata,
      center: mbtiles.metadata.center.map((v) => Math.round(v * 1e6) / 1e6),
      bounds: mbtiles.metadata.bounds.map((v) => Math.round(v * 1e6) / 1e6),
    }
    expect(roundedMetadata).toEqual(expectedMetadata)
    mbtiles.close()
  })

  it('getTile (invalid)', async () => {
    const buffer = await fetchFixture('/test/fixtures/plain_1.mbtiles')
    const mbtiles = await MBTiles.open(buffer)
    const invalidTiles = [
      [0, 1, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [3, 1, -1],
      [2, -3, 3],
      [18, 2, 262140],
      [4, 0, 15],
    ]
    for (const [z, x, y] of invalidTiles) {
      expect(() => {
        mbtiles.getTile({ z, x, y })
      }).toThrow(`Tile not found: ${z}/${x}/${y}`)
    }
    mbtiles.close()
  })

  it('corrupt null tile', async () => {
    const buffer = await fetchFixture(
      '/test/fixtures/corrupt_null_tile.mbtiles',
    )
    const mbtiles = await MBTiles.open(buffer)
    expect(() => {
      mbtiles.getTile({ z: 1, x: 0, y: 1 })
    }).toThrow('Invalid tile data for tile 1/0/1')
    mbtiles.close()
  })

  it('close()', async () => {
    const buffer = await fetchFixture('/test/fixtures/plain_1.mbtiles')
    const mbtiles = await MBTiles.open(buffer)
    mbtiles.close()
    expect(() => {
      mbtiles.getTile({ z: 1, x: 0, y: 1 })
    }).toThrow()
  })

  it('open with Uint8Array', async () => {
    const buffer = await fetchFixture('/test/fixtures/plain_1.mbtiles')
    const mbtiles = await MBTiles.open(new Uint8Array(buffer))
    const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
    expect(tile.format).toBe('png')
    mbtiles.close()
  })

  it('open with File', async () => {
    const buffer = await fetchFixture('/test/fixtures/plain_1.mbtiles')
    const file = new File([buffer], 'test.mbtiles', {
      type: 'application/octet-stream',
    })
    const mbtiles = await MBTiles.open(file)
    const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
    expect(tile.format).toBe('png')
    expect(tile.data).toBeInstanceOf(Uint8Array)
    mbtiles.close()
  })

  it('corrupt file', async () => {
    const buffer = await fetchFixture('/test/fixtures/corrupt.mbtiles')
    await expect(MBTiles.open(buffer)).rejects.toThrow()
  })

  it('tile data is Uint8Array not Buffer', async () => {
    const buffer = await fetchFixture('/test/fixtures/plain_1.mbtiles')
    const mbtiles = await MBTiles.open(buffer)
    const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
    expect(tile.data).toBeInstanceOf(Uint8Array)
    // In the browser, data should be Uint8Array, not Buffer
    expect(ArrayBuffer.isView(tile.data)).toBe(true)
    mbtiles.close()
  })
})
