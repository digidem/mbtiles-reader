declare module '@mapbox/tiletype' {
  export type extensions = 'png' | 'pbf' | 'jpg' | 'webp'
  export function type(buffer: Buffer | Uint8Array): extensions | boolean
}
