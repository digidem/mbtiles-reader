# MBTiles Reader

Read tiles and metadata from [MBTiles files](https://github.com/mapbox/mbtiles-spec). Works in both Node.js (using [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) and browsers (using [@sqlite.org/sqlite-wasm](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm)).

## Installation

```bash
npm install mbtiles-reader
```

The correct entry point is selected automatically via the `"browser"` [condition](https://nodejs.org/api/packages.html#conditional-exports) in `package.json`. Bundlers like Vite, Webpack, esbuild, and Rollup all support this out of the box.

## Usage (Node.js)

```js
import { MBTiles } from 'mbtiles-reader'

// Open from a file path
const mbtiles = new MBTiles('path/to/tiles.mbtiles')

// Or pass an existing better-sqlite3 Database instance
// const mbtiles = new MBTiles(db)

// Read a single tile (XYZ coordinates)
const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
console.log(tile.format) // 'png', 'jpg', 'webp', or 'pbf'
console.log(tile.data)   // Uint8Array

// Iterate over all tiles
for (const { z, x, y, data, format } of mbtiles) {
  console.log(`${z}/${x}/${y}: ${data.length} bytes (${format})`)
}

// Or use a readable stream
for await (const tile of mbtiles.readableStream()) {
  // ...
}

// Access metadata
console.log(mbtiles.metadata)
// { name, format, scheme, minzoom, maxzoom, bounds, center, ... }

mbtiles.close()
```

## Usage (Browser)

```js
import { MBTiles } from 'mbtiles-reader'

// Open from a File (e.g. from an <input type="file">)
const mbtiles = await MBTiles.open(file)

// Also accepts ArrayBuffer or Uint8Array
const response = await fetch('/tiles.mbtiles')
const mbtiles = await MBTiles.open(await response.arrayBuffer())

// Same API as Node for reading tiles
const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
console.log(tile.format) // 'png', 'jpg', 'webp', or 'pbf'
console.log(tile.data)   // Uint8Array

// Iterate over all tiles
for (const { z, x, y, data, format } of mbtiles) {
  // ...
}

console.log(mbtiles.metadata)

mbtiles.close()
```

### Bundler configuration

The browser entry point uses `@sqlite.org/sqlite-wasm`, which loads a `.wasm` file at runtime. Most bundlers need to be told not to pre-bundle this dependency, so the `.wasm` file can be resolved and served correctly.

**Vite:**

```js
// vite.config.js
export default {
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
}
```

**Webpack** and **esbuild** generally handle this without extra configuration.

## API

### Node.js

#### `new MBTiles(pathOrDb)`

Creates a new MBTiles reader. Throws if the file is missing, corrupt, or not a valid MBTiles file.

- `pathOrDb` — file path (`string`) or an existing [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) `Database` instance.

### Browser

#### `MBTiles.open(source)` → `Promise<MBTiles>`

Opens an MBTiles database in the browser. The entire file is loaded into memory using SQLite's `sqlite3_deserialize`.

- `source` — a `File`, `ArrayBuffer`, or `Uint8Array` containing the MBTiles data.

### Shared API

These methods are the same on both platforms.

#### `mbtiles.getTile({ z, x, y })` → `Tile`

Returns the tile at the given XYZ coordinates. Throws if the tile does not exist.

- `z` — zoom level
- `x` — tile column
- `y` — tile row (XYZ scheme, not TMS)

Returns a `Tile`:

| Property | Type                           | Description          |
| -------- | ------------------------------ | -------------------- |
| `z`      | `number`                       | Zoom level           |
| `x`      | `number`                       | Tile column          |
| `y`      | `number`                       | Tile row             |
| `data`   | `Uint8Array`                   | Raw tile data        |
| `format` | `string`                       | `'png'`, `'jpg'`, `'webp'`, or `'pbf'` |

#### `mbtiles.metadata` → `MBTilesMetadata`

Metadata from the MBTiles file per the [MBTiles spec](https://github.com/mapbox/mbtiles-spec/blob/master/1.3/spec.md#metadata). Properties `bounds`, `center`, `minzoom`, and `maxzoom` are always present — they are derived from the tile data if not set explicitly in the metadata table.

| Property      | Type                         | Description                       |
| ------------- | ---------------------------- | --------------------------------- |
| `name`        | `string`                     | Tileset name (required by spec)   |
| `format`      | `string`                     | Tile format: `png`, `jpg`, `webp`, or `pbf` |
| `scheme`      | `'xyz'`                      | Always `'xyz'` (TMS rows are converted) |
| `minzoom`     | `number`                     | Minimum zoom level                |
| `maxzoom`     | `number`                     | Maximum zoom level                |
| `bounds`      | `[w, s, e, n]`               | Bounding box in WGS84             |
| `center`      | `[lng, lat, zoom]`           | Default center point              |
| `attribution` | `string` *(optional)*        | Attribution string                |
| `description` | `string` *(optional)*        | Tileset description               |
| `version`     | `number` *(optional)*        | Tileset version                   |
| `type`        | `'overlay' \| 'baselayer'` *(optional)* | Layer type         |

For `pbf` (vector tile) tilesets, the `json` metadata field is parsed and merged, with explicit metadata values taking precedence.

#### `mbtiles[Symbol.iterator]()` → `IterableIterator<Tile>`

Iterates over every tile in the file:

```js
for (const tile of mbtiles) { /* ... */ }
```

#### `mbtiles.readableStream()` → `Readable` *(Node.js only)*

Returns a Node.js readable stream of `Tile` objects.

#### `mbtiles.close()`

Closes the underlying database. The instance should not be used after calling this.

## Coordinate system

MBTiles files store tiles using the [TMS](https://wiki.osgeo.org/wiki/Tile_Map_Service_Specification) coordinate scheme, where `y=0` is at the bottom. This library converts to the more common XYZ scheme (used by web maps, where `y=0` is at the top) automatically. All coordinates you pass to `getTile()` and receive from iterators use XYZ.

## License

MIT

## Acknowledgements

Inspired by [mbtiles](https://github.com/mapbox/node-mbtiles).
