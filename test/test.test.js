import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { MBTiles } from '../index.js'

const tileFixturesFolder = new URL('./fixtures/images/', import.meta.url)

describe('MBTiles', () => {
  it('getTile', () => {
    const plain1Path = new URL('./fixtures/plain_1.mbtiles', import.meta.url)
    const mbtiles = new MBTiles(fileURLToPath(plain1Path))
    const tileFixtures = readdirSync(tileFixturesFolder)
    expect(tileFixtures.length).toBeGreaterThan(0)
    for (const fileFixture of tileFixtures) {
      const coords = fileFixture.match(/^plain_1_(\d+)_(\d+)_(\d+).png$/)
      expect(coords).toBeTruthy()
      // Flip Y coordinate because file names are TMS, but .getTile() expects XYZ.
      const z = +coords[3]
      const x = +coords[1]
      const y = (1 << z) - 1 - +coords[2]
      const tile = mbtiles.getTile({ z, x, y })
      const expectedTile = new URL(fileFixture, tileFixturesFolder)
      const expectedTileData = readFileSync(expectedTile)
      expect(tile).toEqual({ data: expectedTileData, z, x, y, format: 'png' })
    }
  })

  it('iterator', () => {
    const plain1Path = new URL('./fixtures/plain_1.mbtiles', import.meta.url)
    const mbtiles = new MBTiles(fileURLToPath(plain1Path))
    const tileFixtures = readdirSync(tileFixturesFolder)
    let count = 0
    for (const { z, x, y, data } of mbtiles) {
      const tmsY = (1 << z) - 1 - y
      const imageFilename = `plain_1_${x}_${tmsY}_${z}.png`
      const expectedTile = new URL(imageFilename, tileFixturesFolder)
      const expectedTileData = readFileSync(expectedTile)
      expect(data).toEqual(expectedTileData)
      count++
    }
    expect(count).toBe(tileFixtures.length)
  })

  it('readableStream', async () => {
    const plain1Path = new URL('./fixtures/plain_1.mbtiles', import.meta.url)
    const mbtiles = new MBTiles(fileURLToPath(plain1Path))
    const tileFixtures = readdirSync(tileFixturesFolder)
    let count = 0
    for await (const { z, x, y, data } of mbtiles.readableStream()) {
      const tmsY = (1 << z) - 1 - y
      const imageFilename = `plain_1_${x}_${tmsY}_${z}.png`
      const expectedTile = new URL(imageFilename, tileFixturesFolder)
      const expectedTileData = readFileSync(expectedTile)
      expect(data).toEqual(expectedTileData)
      count++
    }
    expect(count).toBe(tileFixtures.length)
  })

  it('metadata', () => {
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
    expect(roundedMetadata).toEqual(expectedMetadata)
  })

  it('getTile (invalid)', () => {
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
      expect(() => {
        mbtiles.getTile({ z, x, y })
      }).toThrow(`Tile not found: ${z}/${x}/${y}`)
    }
  })

  it('non-existent file', () => {
    const nonExistentPath = new URL(
      './fixtures/non_existent.mbtiles',
      import.meta.url,
    )

    expect(() => {
      new MBTiles(fileURLToPath(nonExistentPath))
    }).toThrow('unable to open database file')
    expect(existsSync(nonExistentPath)).toBe(false)
  })

  it('corrupt file', () => {
    const corruptPath = new URL('./fixtures/corrupt.mbtiles', import.meta.url)
    expect(() => {
      new MBTiles(fileURLToPath(corruptPath))
    }).toThrow('database disk image is malformed')
  })

  it('corrupt null tile', () => {
    const corruptNullTilePath = new URL(
      './fixtures/corrupt_null_tile.mbtiles',
      import.meta.url,
    )
    const mbtiles = new MBTiles(fileURLToPath(corruptNullTilePath))
    expect(() => {
      mbtiles.getTile({ z: 1, x: 0, y: 1 })
    }).toThrow('Invalid tile data for tile 1/0/1')
  })

  it('close()', () => {
    const plain1Path = new URL('./fixtures/plain_1.mbtiles', import.meta.url)
    const mbtiles = new MBTiles(fileURLToPath(plain1Path))
    mbtiles.close()
    expect(() => {
      mbtiles.getTile({ z: 1, x: 0, y: 1 })
    }).toThrow('The database connection is not open')
  })
})
