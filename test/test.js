import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { MBTiles } from '../index.js'

const tileFixturesFolder = new URL('./fixtures/images/', import.meta.url)

test('getTile', () => {
  const plain1Path = new URL('./fixtures/plain_1.mbtiles', import.meta.url)
  const mbtiles = new MBTiles(fileURLToPath(plain1Path))
  const tileFixtures = readdirSync(tileFixturesFolder)
  assert(tileFixtures.length > 0)
  for (const fileFixture of tileFixtures) {
    const coords = fileFixture.match(/^plain_1_(\d+)_(\d+)_(\d+).png$/)
    assert(coords)
    // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
    const z = +coords[3]
    const x = +coords[1]
    const y = (1 << z) - 1 - +coords[2]
    const tile = mbtiles.getTile({ z, x, y })
    const expectedTile = new URL(fileFixture, tileFixturesFolder)
    const expectedTileData = readFileSync(expectedTile)
    assert.deepEqual(tile, { data: expectedTileData, z, x, y, format: 'png' })
  }
})

test('iterator', () => {
  const plain1Path = new URL('./fixtures/plain_1.mbtiles', import.meta.url)
  const mbtiles = new MBTiles(fileURLToPath(plain1Path))
  const tileFixtures = readdirSync(tileFixturesFolder)
  let count = 0
  for (const { z, x, y, data } of mbtiles) {
    const tmsY = (1 << z) - 1 - y
    const imageFilename = `plain_1_${x}_${tmsY}_${z}.png`
    const expectedTile = new URL(imageFilename, tileFixturesFolder)
    const expectedTileData = readFileSync(expectedTile)
    assert.deepEqual(data, expectedTileData)
    count++
  }
  assert.equal(count, tileFixtures.length)
})

test('readableStream', async () => {
  const plain1Path = new URL('./fixtures/plain_1.mbtiles', import.meta.url)
  const mbtiles = new MBTiles(fileURLToPath(plain1Path))
  const tileFixtures = readdirSync(tileFixturesFolder)
  let count = 0
  for await (const { z, x, y, data } of mbtiles.readableStream()) {
    const tmsY = (1 << z) - 1 - y
    const imageFilename = `plain_1_${x}_${tmsY}_${z}.png`
    const expectedTile = new URL(imageFilename, tileFixturesFolder)
    const expectedTileData = readFileSync(expectedTile)
    assert.deepEqual(data, expectedTileData)
    count++
  }
  assert.equal(count, tileFixtures.length)
})

test('metadata', () => {
  const plain1Path = new URL('./fixtures/plain_1.mbtiles', import.meta.url)
  const mbtiles = new MBTiles(fileURLToPath(plain1Path))
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
  assert.deepEqual(roundedMetadata, expectedMetadata)
})

test('getTile (invalid)', () => {
  const plain1Path = new URL('./fixtures/plain_1.mbtiles', import.meta.url)
  const mbtiles = new MBTiles(fileURLToPath(plain1Path))
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
    assert.throws(
      () => {
        mbtiles.getTile({ z, x, y })
      },
      { name: 'Error', message: `Tile not found: ${z}/${x}/${y}` },
    )
  }
})

test('non-existent file', () => {
  const nonExistentPath = new URL(
    './fixtures/non_existent.mbtiles',
    import.meta.url,
  )

  assert.throws(
    () => {
      new MBTiles(fileURLToPath(nonExistentPath))
    },
    { message: 'unable to open database file' },
  )
  assert(!existsSync(nonExistentPath), 'file not created')
})

test('corrupt file', () => {
  const corruptPath = new URL('./fixtures/corrupt.mbtiles', import.meta.url)
  assert.throws(
    () => {
      new MBTiles(fileURLToPath(corruptPath))
    },
    { message: 'database disk image is malformed' },
  )
})

test('corrupt null tile', () => {
  const corruptNullTilePath = new URL(
    './fixtures/corrupt_null_tile.mbtiles',
    import.meta.url,
  )
  const mbtiles = new MBTiles(fileURLToPath(corruptNullTilePath))
  assert.throws(
    () => {
      mbtiles.getTile({ z: 1, x: 0, y: 1 })
    },
    { message: 'Invalid tile data for tile 1/0/1' },
  )
})

test('close()', () => {
  const plain1Path = new URL('./fixtures/plain_1.mbtiles', import.meta.url)
  const mbtiles = new MBTiles(fileURLToPath(plain1Path))
  mbtiles.close()
  assert.throws(
    () => {
      mbtiles.getTile({ z: 1, x: 0, y: 1 })
    },
    { message: 'The database connection is not open' },
  )
})
