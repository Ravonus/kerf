import {
  TRANSPARENT_ALPHA,
  EDGE_FRAME_DISTANCE,
  cornerSpecs,
  clamp,
  averagePatch,
  colorDistance,
  pixelAt,
  detectEdgeFrame,
  samplePolar,
  stableBackgroundColor,
  type Corner,
  type Rgba,
} from './corner-pixels'

/** The measured corner treatment and the pixel pattern that produced it. */
export type CornerAnalysis = {
  shouldClip: boolean
  scale: number
  repairInsetRatio: number
  repairColor: string | null
  confidence: number
  reason: 'transparent-corners' | 'rounded-matte' | 'edge-frame' | 'solid-corners'
}

/** RGBA pixels in row-major order. */
export type PixelBuffer = {
  data: Uint8ClampedArray
  width: number
  height: number
}

const BACKGROUND_DISTANCE = 26
const ART_DISTANCE = 44
const TRANSPARENT_MIN_SCALE = 1.08
const MATTE_MIN_SCALE = 1.12
const EDGE_FRAME_MIN_SCALE = 1.2
const TRANSPARENT_MAX_SCALE = 1.28
const MATTE_MAX_SCALE = 1.32
const EDGE_FRAME_MAX_SCALE = 1.42

/** Detect alpha corners, rounded mattes and opaque edge frames in a small image sample. */
export function analyzeArtworkCorners(buffer: PixelBuffer): CornerAnalysis {
  if (
    buffer.width < 12 ||
    buffer.height < 12 ||
    buffer.data.length !== buffer.width * buffer.height * 4
  ) {
    return solidResult()
  }

  for (const measure of cornerMeasures) {
    const match = measure.find(buffer)
    if (match) {
      const [inset, confidence] = match
      return {
        shouldClip: true,
        scale: scaleFromInset(inset, buffer, measure.min, measure.max),
        repairInsetRatio: repairInsetRatioFromInset(inset, buffer),
        repairColor: stableBackgroundColor(buffer),
        confidence,
        reason: measure.reason,
      }
    }
  }
  return solidResult()
}

type Measure = {
  reason: CornerAnalysis['reason']
  min: number
  max: number
  find: (buffer: PixelBuffer) => [number, number] | undefined
}

const cornerMeasures: Measure[] = [
  {
    reason: 'transparent-corners',
    min: TRANSPARENT_MIN_SCALE,
    max: TRANSPARENT_MAX_SCALE,
    find(buffer) {
      const depths = cornerDepths(buffer, transparentCornerAlphaDepth)
      if (depths.length >= 2) return [median(depths), Math.min(0.96, 0.7 + depths.length * 0.06)]
      const translucent = cornerSpecs(buffer)
        .map((corner) => transparentDepth(buffer, corner))
        .filter(({ ratio }) => ratio > 0.14)
      if (translucent.length >= 2)
        return [
          median(translucent.map(({ inset }) => inset)),
          Math.min(0.98, 0.68 + translucent.length * 0.08),
        ]
      return undefined
    },
  },
  {
    reason: 'edge-frame',
    min: EDGE_FRAME_MIN_SCALE,
    max: EDGE_FRAME_MAX_SCALE,
    find(buffer) {
      const depths = cornerDepths(buffer, cornerFrameDepth)
      if (depths.length >= 2) return [median(depths), Math.min(0.96, 0.66 + depths.length * 0.08)]
      const { inset, edges } = detectEdgeFrame(buffer)
      if (edges >= 3) return [inset, Math.min(0.97, 0.66 + edges * 0.08)]
      return undefined
    },
  },
  {
    reason: 'rounded-matte',
    min: MATTE_MIN_SCALE,
    max: MATTE_MAX_SCALE,
    find(buffer) {
      const depths = cornerDepths(buffer, roundedMatteDepth)
      if (depths.length >= 2) return [median(depths), Math.min(0.95, 0.62 + depths.length * 0.08)]
      return undefined
    },
  },
]

function cornerDepths(
  buffer: PixelBuffer,
  scan: (buffer: PixelBuffer, corner: Corner) => number | null,
) {
  return cornerSpecs(buffer)
    .map((corner) => scan(buffer, corner))
    .filter((depth) => depth !== null)
}

function solidResult(): CornerAnalysis {
  return {
    shouldClip: false,
    scale: 1,
    repairInsetRatio: 0,
    repairColor: null,
    confidence: 0.7,
    reason: 'solid-corners',
  }
}

function transparentDepth(buffer: PixelBuffer, corner: Corner): { ratio: number; inset: number } {
  const depth = Math.max(8, Math.floor(Math.min(buffer.width, buffer.height) * 0.16))
  let total = 0
  let transparent = 0
  let farthest = 0

  for (let y = 0; y < depth; y += 1) {
    for (let x = 0; x < depth; x += 1) {
      if (x + y > depth) continue
      total += 1
      if (pixelAt(buffer, corner.x(x), corner.y(y)).a < TRANSPARENT_ALPHA) {
        transparent += 1
        farthest = Math.max(farthest, x, y)
      }
    }
  }

  return {
    ratio: total > 0 ? transparent / total : 0,
    inset: farthest,
  }
}

function transparentCornerAlphaDepth(buffer: PixelBuffer, corner: Corner): number | null {
  const cornerAlpha = pixelAt(buffer, corner.x(0), corner.y(0)).a
  if (cornerAlpha >= TRANSPARENT_ALPHA) return null

  const limit = Math.max(6, Math.floor(Math.min(buffer.width, buffer.height) * 0.18))
  let farthest = 0
  let transparentPixels = 0

  for (let y = 0; y <= limit; y += 1) {
    for (let x = 0; x <= limit; x += 1) {
      if (x + y > limit * 1.2) continue
      const sample = pixelAt(buffer, corner.x(x), corner.y(y))
      if (sample.a < TRANSPARENT_ALPHA) {
        transparentPixels += 1
        farthest = Math.max(farthest, x, y)
      }
    }
  }

  return transparentPixels >= 3 ? farthest + 2 : null
}

function roundedMatteDepth(buffer: PixelBuffer, corner: Corner): number | null {
  const bg = averagePatch(buffer, corner.x(0), corner.y(0), 4)
  if (!bg || bg.a < TRANSPARENT_ALPHA || bg.variance > 18) return null

  const radius = Math.floor(Math.min(buffer.width, buffer.height) * 0.19)
  const outsideRadius = 5
  const insideRadius = radius
  const angles = [18, 28, 38, 48, 58, 68, 78]
  let transitions = 0

  for (const angle of angles) {
    const radians = (angle * Math.PI) / 180
    const outside = samplePolar(buffer, corner, outsideRadius, radians)
    const inside = samplePolar(buffer, corner, insideRadius, radians)
    if (!outside || !inside) continue

    if (
      colorDistance(outside, bg) < BACKGROUND_DISTANCE &&
      colorDistance(inside, bg) > ART_DISTANCE &&
      inside.a >= TRANSPARENT_ALPHA
    ) {
      transitions += 1
    }
  }

  if (transitions < 4) return null
  return matteDiagonalInset(buffer, corner, bg)
}

function matteDiagonalInset(buffer: PixelBuffer, corner: Corner, bg: Rgba): number {
  const limit = Math.floor(Math.min(buffer.width, buffer.height) * 0.28)
  for (let inset = 1; inset < limit; inset += 1) {
    const sample = pixelAt(buffer, corner.x(inset), corner.y(inset))
    if (colorDistance(sample, bg) > ART_DISTANCE) {
      return inset
    }
  }
  return Math.floor(limit * 0.6)
}

function cornerFrameDepth(buffer: PixelBuffer, corner: Corner): number | null {
  const anchor = Math.floor(Math.min(buffer.width, buffer.height) * 0.26)
  const localBg = averagePatch(buffer, corner.x(anchor), corner.y(anchor), 5)
  if (!localBg || localBg.a < TRANSPARENT_ALPHA || localBg.variance > 22) {
    return null
  }

  const depth = Math.max(18, Math.floor(Math.min(buffer.width, buffer.height) * 0.24))
  let total = 0
  let framed = 0
  let farthest = 0

  for (let y = 0; y < depth; y += 1) {
    for (let x = 0; x < depth; x += 1) {
      if (x + y > depth * 1.25) continue
      const sample = pixelAt(buffer, corner.x(x), corner.y(y))
      total += 1
      if (sample.a >= TRANSPARENT_ALPHA && colorDistance(sample, localBg) > EDGE_FRAME_DISTANCE) {
        framed += 1
        farthest = Math.max(farthest, x, y)
      }
    }
  }

  return total > 0 && framed / total > 0.08 ? farthest + 6 : null
}

function scaleFromInset(
  inset: number,
  buffer: PixelBuffer,
  minScale: number,
  maxScale: number,
): number {
  const dimension = Math.min(buffer.width, buffer.height)
  const paddedInset = Math.max(0, inset + 2)
  const cropRatio = Math.min(0.22, paddedInset / dimension)
  const scale = 1 / (1 - cropRatio * 2)
  return clamp(roundScale(scale), minScale, maxScale)
}

function repairInsetRatioFromInset(inset: number, buffer: PixelBuffer): number {
  const dimension = Math.min(buffer.width, buffer.height)
  return roundRatio(clamp((inset + 3) / dimension, 0.035, 0.22))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function roundScale(value: number): number {
  return Math.round(value * 1000) / 1000
}

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000
}
