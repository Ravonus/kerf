// The work, in the TS a careful author writes: typed arrays, no allocation in a loop. The Rust does the same arithmetic,
// so the two give the same bytes and a call can be compared by its answer.

export interface Done { checksum: string; mean: number[]; thumb: number[] }

/** A 64-pixel tile of noise, repeated: what a call starts from, and not what it's measured on. */
function photo(seed: number, width: number, height: number): Uint8Array {
  const tile = new Uint8Array(64 * 64 * 4)
  let x = seed | 1
  for (let i = 0; i < tile.length; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    tile[i] = x & 255
  }
  const image = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const row = tile.subarray(((y & 63) * 64) * 4, ((y & 63) * 64 + 64) * 4)
    for (let px = 0; px < width; px += 64) image.set(px + 64 <= width ? row : row.subarray(0, (width - px) * 4), (y * width + px) * 4)
  }
  return image
}

/** 1 4 6 4 1 across each row. */
function blurRows(src: Uint8Array, dst: Uint8Array, width: number, height: number) {
  const stride = width * 4
  dst.set(src)
  for (let y = 0; y < height; y++) {
    const start = y * stride + 8, end = (y + 1) * stride - 8
    for (let i = start; i < end; i++) dst[i] = (src[i - 8] + 4 * src[i - 4] + 6 * src[i] + 4 * src[i + 4] + src[i + 8] + 8) >> 4
  }
}

/** 1 4 6 4 1 down each column. */
function blurColumns(src: Uint8Array, dst: Uint8Array, width: number, height: number) {
  const s = width * 4
  dst.set(src)
  const end = (height - 2) * s
  for (let i = 2 * s; i < end; i++) dst[i] = (src[i - 2 * s] + 4 * src[i - s] + 6 * src[i] + 4 * src[i + s] + src[i + 2 * s] + 8) >> 4
}

/** The mean of each `factor`-square cell. */
function shrink(src: Uint8Array, width: number, height: number, factor: number) {
  const w = Math.floor(width / factor), h = Math.floor(height / factor)
  const out = new Uint8Array(w * h * 4)
  const sums = new Uint32Array(w * 4)
  const cell = factor * factor
  for (let cy = 0; cy < h; cy++) {
    sums.fill(0)
    for (let y = 0; y < factor; y++) {
      let i = (cy * factor + y) * width * 4
      for (let c = 0; c < w * 4; c += 4) {
        for (let n = 0; n < factor; n++, i += 4) {
          sums[c] += src[i]
          sums[c + 1] += src[i + 1]
          sums[c + 2] += src[i + 2]
          sums[c + 3] += src[i + 3]
        }
      }
    }
    for (let i = 0; i < w * 4; i++) out[cy * w * 4 + i] = Math.floor(sums[i] / cell)
  }
  return { out, w, h }
}

export function thumbnail(seed: number, width: number, height: number, passes: number, factor: number): Done {
  let a = photo(seed, width, height), b = new Uint8Array(a.length)
  for (let p = 0; p < passes; p++) {
    blurRows(a, b, width, height)
    blurColumns(b, a, width, height)
  }
  const { out } = shrink(a, width, height, factor)
  let hash = 0x811c9dc5
  const mean = [0, 0, 0, 0]
  for (let i = 0; i < out.length; i++) {
    hash = Math.imul(hash ^ out[i], 0x01000193)
    mean[i & 3] += out[i]
  }
  const pixels = out.length / 4
  return { checksum: (hash >>> 0).toString(16).padStart(8, '0'), mean: mean.map(m => Math.floor(m / pixels)), thumb: Array.from(out.subarray(0, 16)) }
}
