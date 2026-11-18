// Pixel sampling and the edge scan shared by corner measurements.
import type { PixelBuffer } from './artwork'

export type Rgba = {
  r: number
  g: number
  b: number
  a: number
}

export type Corner = { x: (value: number) => number; y: (value: number) => number }
export const TRANSPARENT_ALPHA = 235
export const EDGE_FRAME_DISTANCE = 34

export function samplePolar(
  buffer: PixelBuffer,
  corner: Corner,
  radius: number,
  radians: number,
): Rgba | null {
  const x = Math.round(Math.cos(radians) * radius)
  const y = Math.round(Math.sin(radians) * radius)
  const px = corner.x(x)
  const py = corner.y(y)
  if (px < 0 || py < 0 || px >= buffer.width || py >= buffer.height) {
    return null
  }
  return pixelAt(buffer, px, py)
}

export function averagePatch(
  buffer: PixelBuffer,
  startX: number,
  startY: number,
  size: number,
): (Rgba & { variance: number }) | null {
  const samples: Rgba[] = []
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = clamp(startX + Math.sign(buffer.width / 2 - startX) * x, 0, buffer.width - 1)
      const py = clamp(startY + Math.sign(buffer.height / 2 - startY) * y, 0, buffer.height - 1)
      samples.push(pixelAt(buffer, px, py))
    }
  }
  if (samples.length === 0) return null

  const mean = samples.reduce(
    (sum, sample) => ({
      r: sum.r + sample.r,
      g: sum.g + sample.g,
      b: sum.b + sample.b,
      a: sum.a + sample.a,
    }),
    { r: 0, g: 0, b: 0, a: 0 },
  )
  mean.r /= samples.length
  mean.g /= samples.length
  mean.b /= samples.length
  mean.a /= samples.length

  const variance =
    samples.reduce((sum, sample) => sum + colorDistance(sample, mean), 0) / samples.length

  return { ...mean, variance }
}

export function pixelAt(buffer: PixelBuffer, x: number, y: number): Rgba {
  const offset = (y * buffer.width + x) * 4
  return {
    r: buffer.data[offset] ?? 0,
    g: buffer.data[offset + 1] ?? 0,
    b: buffer.data[offset + 2] ?? 0,
    a: buffer.data[offset + 3] ?? 255,
  }
}

export function colorDistance(a: Rgba, b: Rgba): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  const da = (a.a - b.a) * 0.35
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da)
}

export function stableBackgroundColor(buffer: PixelBuffer): string | null {
  const dimension = Math.min(buffer.width, buffer.height)
  const offsets = [0.1, 0.14, 0.18].map((ratio) =>
    clamp(Math.floor(dimension * ratio), 4, dimension - 4),
  )
  const clusters = new Map<string, { corners: Set<number>; samples: Rgba[] }>()

  cornerSpecs(buffer).forEach((corner, cornerIndex) => {
    for (const primary of offsets) {
      for (const secondary of offsets) {
        const sample = pixelAt(buffer, corner.x(primary), corner.y(secondary))
        if (sample.a < TRANSPARENT_ALPHA) continue
        const key = dominantColorKey(sample)
        const cluster = clusters.get(key) ?? {
          corners: new Set<number>(),
          samples: [],
        }
        cluster.corners.add(cornerIndex)
        cluster.samples.push(sample)
        clusters.set(key, cluster)
      }
    }
  })

  const candidates = [...clusters.values()]
    .filter((cluster) => cluster.corners.size === 4 && cluster.samples.length >= 8)
    .sort((a, b) => b.samples.length - a.samples.length)

  for (const candidate of candidates) {
    const mean = averageColor(candidate.samples)
    const spread =
      candidate.samples.reduce((sum, sample) => sum + colorDistance(sample, mean), 0) /
      candidate.samples.length
    if (spread <= 34 && mean.a >= TRANSPARENT_ALPHA) {
      return rgbaToCss(mean)
    }
  }

  return null
}

function averageColor(samples: Rgba[]): Rgba {
  const total = samples.reduce(
    (sum, sample) => ({
      r: sum.r + sample.r,
      g: sum.g + sample.g,
      b: sum.b + sample.b,
      a: sum.a + sample.a,
    }),
    { r: 0, g: 0, b: 0, a: 0 },
  )
  return {
    r: Math.round(total.r / samples.length),
    g: Math.round(total.g / samples.length),
    b: Math.round(total.b / samples.length),
    a: Math.round(total.a / samples.length),
  }
}

function rgbaToCss(color: Rgba): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${(color.a / 255).toFixed(3)})`
}

function dominantColorKey(pixel: Rgba): string {
  return [Math.round(pixel.r / 18), Math.round(pixel.g / 18), Math.round(pixel.b / 18)].join('.')
}

export function detectEdgeFrame(buffer: PixelBuffer): {
  edges: number
  inset: number
} {
  const maxInset = Math.max(8, Math.floor(Math.min(buffer.width, buffer.height) * 0.11))
  const edges = [
    detectSingleEdgeFrame(buffer, 'top', maxInset),
    detectSingleEdgeFrame(buffer, 'right', maxInset),
    detectSingleEdgeFrame(buffer, 'bottom', maxInset),
    detectSingleEdgeFrame(buffer, 'left', maxInset),
  ].filter((inset): inset is number => inset !== null)

  return {
    edges: edges.length,
    inset: Math.max(...edges, maxInset),
  }
}

function detectSingleEdgeFrame(
  buffer: PixelBuffer,
  edge: 'top' | 'right' | 'bottom' | 'left',
  maxInset: number,
): number | null {
  const length = edge === 'top' || edge === 'bottom' ? buffer.width : buffer.height
  const start = Math.floor(length * 0.12)
  const end = Math.ceil(length * 0.88)
  const innerInset = Math.max(maxInset + 5, 14)
  let bestInset = 0
  let bestRatio = 0

  for (let inset = 1; inset <= maxInset; inset += 1) {
    let total = 0
    let hits = 0
    for (let pos = start; pos < end; pos += 3) {
      const outer = edgePixel(buffer, edge, pos, inset)
      const inner = edgePixel(buffer, edge, pos, innerInset)
      if (!outer || !inner) continue
      total += 1
      if (
        outer.a >= TRANSPARENT_ALPHA &&
        inner.a >= TRANSPARENT_ALPHA &&
        colorDistance(outer, inner) > EDGE_FRAME_DISTANCE
      ) {
        hits += 1
      }
    }

    const ratio = total > 0 ? hits / total : 0
    if (ratio > bestRatio) {
      bestRatio = ratio
      bestInset = inset
    }
  }

  return bestRatio >= 0.56 ? bestInset + 6 : null
}

function edgePixel(
  buffer: PixelBuffer,
  edge: 'top' | 'right' | 'bottom' | 'left',
  position: number,
  inset: number,
): Rgba | null {
  if (edge === 'top') return pixelAt(buffer, position, inset)
  if (edge === 'bottom') {
    return pixelAt(buffer, position, buffer.height - 1 - inset)
  }
  if (edge === 'left') return pixelAt(buffer, inset, position)
  return pixelAt(buffer, buffer.width - 1 - inset, position)
}

export function cornerSpecs(buffer: PixelBuffer) {
  return [
    { x: (v: number) => v, y: (v: number) => v },
    { x: (v: number) => buffer.width - 1 - v, y: (v: number) => v },
    { x: (v: number) => v, y: (v: number) => buffer.height - 1 - v },
    {
      x: (v: number) => buffer.width - 1 - v,
      y: (v: number) => buffer.height - 1 - v,
    },
  ]
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
