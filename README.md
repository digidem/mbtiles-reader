# MBTiles Reader

Read tiles and metadata from [MBTiles files](https://github.com/mapbox/mbtiles-spec), uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) under-the-hood.

## Installation

```bash
npm install mbtiles-reader
```

## Usage

Here's a basic example of how to use MBTiles Reader:

```javascript
import { MBTilesReader } from 'mbtiles-reader'

const mbtiles = new MBTilesReader('path/to/your/mbtiles/file.mbtiles')

const { x, y, z, data, format } = reader.getTile(0, 0, 0)

for (const { x, y, z, data, format } in mbtiles) {
  console.log(`Tile ${x}, ${y}, ${z}: ${data.length} bytes of ${format} data`)
}

console.log(mbtiles.metadata)
```

## API

### `MBTilesReader`

#### `constructor(filePathOrDb)`

Creates a new instance of MBTilesReader. Will throw if the file is not a valid MBTiles file.

- `filePathOrDb` (string | Database): Path to the MBTiles file or a better-sqlite3 Database instance.

#### `mbtiles.getTile({ z, x, y })`

Retrieves a tile from the MBTiles file.

- `z` (number): Zoom level.
- `x` (number): Tile column.
- `y` (number): Tile row.
- Returns: `{ x: number, y: number, z: number, data: Buffer, format: string }`

#### `mbtiles.metadata`

Metadata from the MBTiles file, [see spec](https://github.com/mapbox/mbtiles-spec/blob/master/1.3/spec.md#metadata). Will always include `bounds`, `center`, `minzoom`, `maxzoom` derived from the tile data in the file.

#### `[Symbol.iterator]()`

`mbtiles` is an iterable object that yields `Tile` objects:

```typescript
interface Tile {
  x: number
  y: number
  z: number
  data: Buffer
  format: string
}
```

#### `mbtiles.readableStream()`

Returns a readable stream that yields `Tile` objects (see above).

#### `mbtiles.close()`

Closes the MBTiles file.

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Acknowledgements

Inspired by [mbtiles](https://github.com/mapbox/node-mbtiles)
