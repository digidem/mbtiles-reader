# MBTiles Reader

Read tiles and metadata from [MBTiles files](https://github.com/mapbox/mbtiles-spec). Works in both Node.js (using [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) and browsers (using [@sqlite.org/sqlite-wasm](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm)).

## Installation

```bash
npm install mbtiles-reader
```

The correct entry point is selected automatically via the `"browser"` [condition](https://nodejs.org/api/packages.html#conditional-exports) in `package.json`. Bundlers like Vite, Webpack, esbuild, and Rollup all support this out of the box.

The platform-specific SQLite drivers (`better-sqlite3` for Node.js, `@sqlite.org/sqlite-wasm` for browsers) are optional dependencies — only the one needed for your platform will be used, and a failed install of the other won't cause errors.

## Usage

```js
import { MBTiles } from 'mbtiles-reader'

// Open from a file path (Node.js) or ArrayBuffer/Uint8Array (both platforms)
const mbtiles = await MBTiles.open('path/to/tiles.mbtiles')

// Read a single tile (XYZ coordinates)
const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
console.log(tile.format) // 'png', 'jpg', 'webp', or 'pbf'
console.log(tile.data) // Uint8Array

// Iterate over all tiles
for (const { z, x, y, data, format } of mbtiles) {
  console.log(`${z}/${x}/${y}: ${data.length} bytes (${format})`)
}

// Access metadata
console.log(mbtiles.metadata)
// { name, format, scheme, minzoom, maxzoom, bounds, center, ... }

mbtiles.close()
```

### Opening from a buffer

Both platforms support opening from an `ArrayBuffer` or `Uint8Array`:

```js
const response = await fetch('/tiles.mbtiles')
const mbtiles = await MBTiles.open(await response.arrayBuffer())
```

### Browser-specific sources

In the browser, `MBTiles.open()` also accepts a `File` (e.g. from `<input type="file">`):

```js
const mbtiles = await MBTiles.open(file)
```

### Node.js-specific sources

In Node.js, `MBTiles.open()` also accepts an existing [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) `Database` instance:

```js
const mbtiles = await MBTiles.open(db)
```

### OPFS (Web Worker)

When running in a Web Worker, you can pass an [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) file path to `MBTiles.open()` instead of loading the entire file into memory. The consumer is responsible for writing the file to OPFS first:

```js
// In a Web Worker:

// 1. Write the file to OPFS (your responsibility)
const root = await navigator.storage.getDirectory()
const handle = await root.getFileHandle('tiles.mbtiles', { create: true })
const access = await handle.createSyncAccessHandle()
access.write(new Uint8Array(buffer), { at: 0 })
access.flush()
access.close()

// 2. Open by OPFS path — uses OpfsDb, no copy into wasm memory
const mbtiles = await MBTiles.open('tiles.mbtiles')

// 3. Use as normal
const tile = mbtiles.getTile({ z: 0, x: 0, y: 0 })
mbtiles.close()

// 4. Clean up OPFS when done (your responsibility)
await root.removeEntry('tiles.mbtiles')
```

### TypeScript

This package includes type declarations for both entry points. TypeScript resolves the correct types based on your `moduleResolution` setting:

| `moduleResolution`                            | Types resolved    | `MBTiles.open()` accepts                          |
| --------------------------------------------- | ----------------- | ------------------------------------------------- |
| `"nodenext"` / `"node16"`                     | Node.js           | `string \| ArrayBuffer \| Uint8Array \| Database` |
| `"bundler"`                                   | Node.js (default) | same as above                                     |
| `"bundler"` + `customConditions: ["browser"]` | Browser           | `string \| File \| ArrayBuffer \| Uint8Array`     |

TypeScript does not set the `"browser"` condition automatically in any mode. By default, the Node.js types are resolved, which include `MBTiles.open()` and all shared methods — this works for most browser consumers since the common source types (`string`, `ArrayBuffer`, `Uint8Array`) are the same on both platforms.

If you need browser-specific types (e.g. `File` support in autocomplete), add `customConditions` to your `tsconfig.json`:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "customConditions": ["browser"],
  },
}
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

#### `MBTiles.open(source)` → `Promise<MBTiles>`

Opens an MBTiles database. Throws if the file is missing, corrupt, or not a valid MBTiles file.

- `source` — an `ArrayBuffer` or `Uint8Array` (both platforms), file path or [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) `Database` (Node.js), or `File` / OPFS path (browser).

In the browser, when `source` is a string it is treated as an OPFS file path and opened directly with `OpfsDb` (requires a Web Worker context). This avoids loading the entire database into wasm memory. When `source` is a `File`, `ArrayBuffer`, or `Uint8Array`, the data is loaded into memory using SQLite's `sqlite3_deserialize`.

#### `mbtiles.getTile({ z, x, y })` → `Tile`

Returns the tile at the given XYZ coordinates. Throws if the tile does not exist.

- `z` — zoom level
- `x` — tile column
- `y` — tile row (XYZ scheme, not TMS)

Returns a `Tile`:

| Property | Type         | Description                            |
| -------- | ------------ | -------------------------------------- |
| `z`      | `number`     | Zoom level                             |
| `x`      | `number`     | Tile column                            |
| `y`      | `number`     | Tile row                               |
| `data`   | `Uint8Array` | Raw tile data                          |
| `format` | `string`     | `'png'`, `'jpg'`, `'webp'`, or `'pbf'` |

#### `mbtiles.metadata` → `MBTilesMetadata`

Metadata from the MBTiles file per the [MBTiles spec](https://github.com/mapbox/mbtiles-spec/blob/master/1.3/spec.md#metadata). Properties `bounds`, `center`, `minzoom`, and `maxzoom` are always present — they are derived from the tile data if not set explicitly in the metadata table.

| Property      | Type                                    | Description                                 |
| ------------- | --------------------------------------- | ------------------------------------------- |
| `name`        | `string`                                | Tileset name (required by spec)             |
| `format`      | `string`                                | Tile format: `png`, `jpg`, `webp`, or `pbf` |
| `scheme`      | `'xyz'`                                 | Always `'xyz'` (TMS rows are converted)     |
| `minzoom`     | `number`                                | Minimum zoom level                          |
| `maxzoom`     | `number`                                | Maximum zoom level                          |
| `bounds`      | `[w, s, e, n]`                          | Bounding box in WGS84                       |
| `center`      | `[lng, lat, zoom]`                      | Default center point                        |
| `attribution` | `string` _(optional)_                   | Attribution string                          |
| `description` | `string` _(optional)_                   | Tileset description                         |
| `version`     | `number` _(optional)_                   | Tileset version                             |
| `type`        | `'overlay' \| 'baselayer'` _(optional)_ | Layer type                                  |

For `pbf` (vector tile) tilesets, the `json` metadata field is parsed and merged, with explicit metadata values taking precedence.

#### `mbtiles[Symbol.iterator]()` → `IterableIterator<Tile>`

Iterates over every tile in the file:

```js
for (const tile of mbtiles) {
  /* ... */
}
```

#### `mbtiles.close()`

Closes the underlying database. The instance should not be used after calling this.

## Coordinate system

MBTiles files store tiles using the [TMS](https://wiki.osgeo.org/wiki/Tile_Map_Service_Specification) coordinate scheme, where `y=0` is at the bottom. This library converts to the more common XYZ scheme (used by web maps, where `y=0` is at the top) automatically. All coordinates you pass to `getTile()` and receive from iterators use XYZ.

## License

MIT

## Acknowledgements

Inspired by [mbtiles](https://github.com/mapbox/node-mbtiles).
