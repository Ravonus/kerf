// The hero's field: one pure function from a cell and a time to a dither level, so the build's poster and the running
// canvas are the same picture.
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]

export const PALETTE: [number, number, number, number][] = [
  [0, 0, 0, 0], [14, 44, 32, 255], [20, 92, 60, 255], [38, 156, 92, 255], [110, 226, 140, 255], [236, 255, 190, 255],
]

const wave = (u: number, v: number, t: number) =>
  Math.sin(u * 0.9 + t * 0.7) * 0.5 + Math.sin(v * 1.7 - t * 0.5 + Math.sin(u * 0.6 + t * 0.3) * 1.4) * 0.5 + Math.sin((u + v) * 2.3 + t) * 0.22

/** Level 0–5 of cell (x, y) at time `t`; `lift` adds light (a pointer, a letter). */
export function level(x: number, y: number, cols: number, rows: number, t: number, lift = 0) {
  const n = (wave((x / cols) * 7, (y / rows) * 4.4, t) + 1.1) / 2.2
  const threshold = BAYER[(y & 7) * 8 + (x & 7)] / 64
  return Math.min(PALETTE.length - 1, Math.floor((n * n * 0.62 + lift) * (PALETTE.length - 1) + threshold * 0.9))
}
