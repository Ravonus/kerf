// Masks: shapes a field shows through. Coverage stays soft, so an edge dithers instead of aliasing, and `halo` is the same
// shape blurred, the light a letter throws on the cloth around it.
export type MaskSource =
  | { text: string; font?: string; weight?: number | string; fit?: number }
  | { path: string; box: [width: number, height: number]; fit?: number; stroke?: number }
  | ((ctx: CanvasRenderingContext2D, cols: number, rows: number) => void)

export interface Mask { shape: Float32Array; halo: Float32Array }

function blur(v: Float32Array, cols: number, rows: number, r: number) {
  const out = new Float32Array(v), tmp = new Float32Array(v.length), div = r * 2 + 1
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < rows; y++) {
      let sum = 0
      const row = y * cols
      for (let x = -r; x <= r; x++) sum += out[row + Math.max(0, Math.min(cols - 1, x))]!
      for (let x = 0; x < cols; x++) {
        tmp[row + x] = sum / div
        sum += out[row + Math.min(cols - 1, x + r + 1)]! - out[row + Math.max(0, x - r)]!
      }
    }
    for (let x = 0; x < cols; x++) {
      let sum = 0
      for (let y = -r; y <= r; y++) sum += tmp[Math.max(0, Math.min(rows - 1, y)) * cols + x]!
      for (let y = 0; y < rows; y++) {
        out[y * cols + x] = sum / div
        sum += tmp[Math.min(rows - 1, y + r + 1) * cols + x]! - tmp[Math.max(0, y - r) * cols + x]!
      }
    }
  }
  return out
}

function draw(g: CanvasRenderingContext2D, source: MaskSource, cols: number, rows: number, family: string) {
  if (typeof source === 'function') return source(g, cols, rows)
  const fit = source.fit ?? 0.86
  if ('text' in source) {
    const font = (px: number) => `${source.weight ?? 700} ${px}px ${source.font ?? family}`
    g.font = font(100)
    const m = g.measureText(source.text), width = m.actualBoundingBoxRight + m.actualBoundingBoxLeft, height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
    if (!width || !height) return
    const px = 100 * Math.min(cols * fit / width, rows * fit / height)
    g.font = font(px)
    const k = px / 100
    g.fillText(source.text, (cols - width * k) / 2 + m.actualBoundingBoxLeft * k, (rows - height * k) / 2 + m.actualBoundingBoxAscent * k)
  } else {
    const [w, h] = source.box, k = Math.min(cols * fit / w, rows * fit / h)
    g.translate((cols - w * k) / 2, (rows - h * k) / 2)
    g.scale(k, k)
    const shape = new Path2D(source.path)
    // oxlint-disable-next-line unicorn/no-array-fill-with-reference-type -- a canvas fill, not an array's
    if (source.stroke) { g.lineWidth = source.stroke; g.stroke(shape) } else g.fill(shape)
  }
}

// Drawn at four times the grid and averaged, so a cell holds real coverage and small type keeps its shape.
const SS = 4

/** Rasterises a mask to the grid. `family` is the font used when the source names none. */
export function rasterMask(source: MaskSource, cols: number, rows: number, family = 'sans-serif'): Mask | undefined {
  const c = document.createElement('canvas')
  c.width = cols * SS
  c.height = rows * SS
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return
  g.scale(SS, SS)
  g.fillStyle = g.strokeStyle = '#fff'
  draw(g, source, cols, rows, family)
  const px = g.getImageData(0, 0, c.width, c.height).data, shape = new Float32Array(cols * rows)
  for (let i = 3, p = 0; i < px.length; i += 4, p++) shape[((p / c.width | 0) >> 2) * cols + ((p % c.width) >> 2)]! += px[i]! / (255 * SS * SS)
  return { shape, halo: blur(shape, cols, rows, Math.max(2, Math.round(rows / 18))) }
}
