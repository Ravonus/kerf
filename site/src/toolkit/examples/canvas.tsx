import { Button, Canvas, Dither, DitherField, DitherGlyph, Grid, Heading, Inset, Row, Stack, Text } from '@weft-js/warp'
import type { CanvasFrame, DitherFieldProps, DitherGlyphProps, DitherProps } from '@weft-js/warp'
import { TRAFFIC } from '../world'

const STAGE = 'block-size:240px'
// A token can hold light-dark(), which a canvas can't read, so let CSS resolve it first.
const token = (ctx: CanvasRenderingContext2D, name: string) => {
  ctx.canvas.style.color = `var(${name})`
  return getComputedStyle(ctx.canvas).color
}

// -- Canvas

function drawRequests({ ctx, width, height, time, still }: CanvasFrame) {
  const bar = width / TRAFFIC.length, grow = still ? 1 : Math.min(1, time / 0.8)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = token(ctx, '--warp-color-accent-solid')
  TRAFFIC.forEach((t, i) => {
    const h = (t.requests / 90) * height * grow
    ctx.fillRect(i * bar + 3, height - h, bar - 6, h)
  })
  return grow < 1
}

export const CanvasBars = () => <Canvas draw={drawRequests} label="Requests a month, rising from 41 to 86 million" style={STAGE} />

function drawWave({ ctx, width, height, time }: CanvasFrame) {
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = token(ctx, '--warp-color-accent-solid')
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 0; x <= width; x += 4) ctx.lineTo(x, height / 2 + Math.sin(x / 40 + time * 2) * Math.sin(x / 160 - time / 2) * height * 0.35)
  ctx.stroke()
}

export const CanvasWave = () => <Canvas draw={drawWave} animate style={STAGE} />

function drawSpotlight({ ctx, width, height, pointer }: CanvasFrame) {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = token(ctx, '--warp-color-text-subtle')
  for (let x = 12; x < width; x += 24) {
    for (let y = 12; y < height; y += 24) {
      const near = pointer.in ? Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / 120) : 0
      ctx.beginPath()
      ctx.arc(x, y, 1.5 + near * 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export const CanvasPointer = () => <Canvas draw={drawSpotlight} pointer style={STAGE} />

function drawCells({ ctx, width, height, time }: CanvasFrame) {
  ctx.fillStyle = token(ctx, '--warp-color-surface-hover')
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = token(ctx, '--warp-color-accent-solid')
  for (let x = 0; x < width; x++) {
    const top = Math.floor(height / 2 + Math.sin(x / 6 + time) * height * 0.3)
    ctx.fillRect(x, top, 1, height - top)
  }
}

export const CanvasCells = () => <Canvas draw={drawCells} animate fps={12} cell={8} style={STAGE} />

// The pointer's recent path, fading as it ages: `pointer` repaints on every move, and `animate` finishes the fade.
function drawTrail({ ctx, width, height, time, pointer }: CanvasFrame, trail: { x: number; y: number; at: number }[]) {
  if (pointer.in) trail.push({ x: pointer.x, y: pointer.y, at: time })
  while (trail.length && (time - trail[0]!.at > 1.2 || trail.length > 120)) trail.shift()
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = token(ctx, '--warp-color-accent-solid')
  ctx.lineCap = 'round'
  for (let i = 1; i < trail.length; i++) {
    const age = (time - trail[i]!.at) / 1.2
    ctx.globalAlpha = 1 - age
    ctx.lineWidth = 2 + (1 - age) * 10
    ctx.beginPath()
    ctx.moveTo(trail[i - 1]!.x, trail[i - 1]!.y)
    ctx.lineTo(trail[i]!.x, trail[i]!.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = token(ctx, '--warp-color-text-subtle')
  ctx.font = `13px ${getComputedStyle(ctx.canvas).fontFamily}`
  if (!trail.length) ctx.fillText('Move the pointer across', 16, 28)
}

export const CanvasTrail = () => {
  const trail: { x: number; y: number; at: number }[] = []
  return <Canvas draw={f => drawTrail(f, trail)} animate pointer style={STAGE} />
}

// Rings that spread from wherever the pointer presses.
function drawRipples({ ctx, width, height, time, pointer }: CanvasFrame, rings: { x: number; y: number; at: number }[], held: { down: boolean }) {
  if (pointer.down && !held.down) rings.push({ x: pointer.x, y: pointer.y, at: time })
  held.down = pointer.down
  while (rings.length && (time - rings[0]!.at > 1.6 || rings.length > 8)) rings.shift()
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = token(ctx, '--warp-color-info-solid')
  ctx.lineWidth = 2
  for (const r of rings) {
    const t = (time - r.at) / 1.6
    ctx.globalAlpha = 1 - t
    for (const lag of [0, 0.15, 0.3]) {
      ctx.beginPath()
      ctx.arc(r.x, r.y, Math.max(0, t - lag) * 160, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = token(ctx, '--warp-color-text-subtle')
  ctx.font = `13px ${getComputedStyle(ctx.canvas).fontFamily}`
  if (!rings.length) ctx.fillText('Press anywhere', 16, 28)
}

export const CanvasRipples = () => {
  const rings: { x: number; y: number; at: number }[] = []
  const held = { down: false }
  return <Canvas draw={f => drawRipples(f, rings, held)} animate pointer style={STAGE} />
}

// A live latency line with gridlines and a label: text on a canvas takes the page's font through CSS.
const latency = (t: number) => 120 + Math.sin(t * 1.3) * 30 + Math.sin(t * 3.7) * 14 + Math.max(0, Math.sin(t * 0.4) * 60 - 40)

function drawLive({ ctx, width, height, time }: CanvasFrame) {
  const pad = 28, span = 12, max = 240, y = (v: number) => height - pad - (v / max) * (height - pad * 2)
  ctx.clearRect(0, 0, width, height)
  ctx.font = `12px ${getComputedStyle(ctx.canvas).fontFamily}`
  ctx.strokeStyle = token(ctx, '--warp-color-border')
  ctx.fillStyle = token(ctx, '--warp-color-text-subtle')
  ctx.lineWidth = 1
  for (const v of [0, 80, 160, 240]) {
    ctx.beginPath()
    ctx.moveTo(pad + 24, Math.round(y(v)) + 0.5)
    ctx.lineTo(width, Math.round(y(v)) + 0.5)
    ctx.stroke()
    ctx.fillText(`${v}`, 4, y(v) + 4)
  }
  ctx.strokeStyle = token(ctx, '--warp-color-accent-solid')
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = pad + 24; x <= width; x += 3) ctx.lineTo(x, y(latency(time - span + ((x - pad - 24) / (width - pad - 24)) * span)))
  ctx.stroke()
  ctx.fillStyle = token(ctx, '--warp-color-text')
  ctx.textAlign = 'right'
  ctx.fillText(`p95 ${Math.round(latency(time))} ms`, width - 8, 16)
  ctx.textAlign = 'left'
}

export const CanvasLive = () => <Canvas draw={drawLive} animate fps={30} label="p95 latency over the last twelve seconds" style={STAGE} />

// Colours read once and kept, then read again only when the theme changes: `onTheme` drops the cache.
const TONES_DRAWN = ['--warp-color-accent-solid', '--warp-color-positive-solid', '--warp-color-caution-solid', '--warp-color-critical-solid', '--warp-color-info-solid']

export const CanvasThemed = () => {
  let inks: string[] | undefined
  const draw = ({ ctx, width, height }: CanvasFrame) => {
    inks ??= TONES_DRAWN.map(name => token(ctx, name))
    ctx.clearRect(0, 0, width, height)
    const r = Math.min(width, height) / 2 - 16
    inks.forEach((ink, i) => {
      ctx.strokeStyle = ink
      ctx.lineWidth = 14
      ctx.beginPath()
      ctx.arc(width / 2, height / 2, r - i * 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (0.9 - i * 0.14))
      ctx.stroke()
    })
  }
  return <Canvas draw={draw} onTheme={() => (inks = undefined)} label="Five rings in warp's tones" style={STAGE} />
}

// The expression dial where the canvas sits: `frame.tier` says how much to move and how far to reach.
function drawOrbits({ ctx, width, height, time, tier }: CanvasFrame) {
  const count = Math.round(4 + tier.reach * 14), cx = width / 2, cy = height / 2
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = token(ctx, '--warp-color-accent-solid')
  for (let i = 0; i < count; i++) {
    const ring = 30 + (i % 4) * 22, a = time * (0.3 + tier.speed) * (i % 2 ? 1 : -0.7) + (i / count) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * ring * 1.8, cy + Math.sin(a) * ring, 3 + (i % 3), 0, Math.PI * 2)
    ctx.fill()
  }
}

export const CanvasOrbits = () => <Canvas draw={drawOrbits} animate style={STAGE} />

// A needle that eases toward the pointer and stops asking for frames once it arrives: no `animate` needed.
function drawNeedle({ ctx, width, height, pointer, dt }: CanvasFrame, needle: { at: number }) {
  const goal = pointer.in ? Math.min(1, Math.max(0, pointer.x / width)) : 0.35
  needle.at += (goal - needle.at) * Math.min(1, dt * 8)
  const cx = width / 2, cy = height - 24, r = Math.min(width / 2, height) - 40
  ctx.clearRect(0, 0, width, height)
  ctx.lineWidth = 12
  ctx.strokeStyle = token(ctx, '--warp-color-surface-sunken')
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI, 0)
  ctx.stroke()
  ctx.strokeStyle = token(ctx, needle.at > 0.8 ? '--warp-color-critical-solid' : '--warp-color-accent-solid')
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI, Math.PI + needle.at * Math.PI)
  ctx.stroke()
  const a = Math.PI + needle.at * Math.PI
  ctx.lineWidth = 3
  ctx.strokeStyle = token(ctx, '--warp-color-text')
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18))
  ctx.stroke()
  return Math.abs(goal - needle.at) > 0.002
}

export const CanvasNeedle = () => {
  const needle = { at: 0 }
  return <Canvas draw={f => drawNeedle(f, needle)} pointer label="A gauge that follows the pointer across it" style={STAGE} />
}

// A still picture that covers every pixel: an opaque context skips blending with the page.
function drawNight({ ctx, width, height }: CanvasFrame) {
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, token(ctx, '--warp-color-info-solid'))
  sky.addColorStop(1, token(ctx, '--warp-color-accent-solid'))
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  ctx.fillStyle = '#fff'
  for (let i = 0; i < 160; i++) {
    ctx.globalAlpha = 0.3 + rand() * 0.7
    ctx.fillRect(rand() * width, rand() * height * 0.75, rand() < 0.1 ? 2 : 1, rand() < 0.1 ? 2 : 1)
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = token(ctx, '--warp-color-surface')
  ctx.beginPath()
  ctx.moveTo(0, height)
  for (let x = 0; x <= width; x += 8) ctx.lineTo(x, height - 40 - Math.sin(x / 70) * 18 - Math.sin(x / 23) * 6)
  ctx.lineTo(width, height)
  ctx.fill()
}

export const CanvasNight = () => <Canvas draw={drawNight} context={{ alpha: false }} label="Stars over a ridge" style={STAGE} />

// Conway's Life in whole cells, stepped eight times a second; the board starts again when it resizes or dies out.
function drawLife({ ctx, width, height }: CanvasFrame, life: { cells: Uint8Array; w: number; h: number; seed: number }) {
  if (life.w !== width || life.h !== height || !life.cells.includes(1)) {
    life.w = width
    life.h = height
    life.cells = Uint8Array.from({ length: width * height }, (_, i) => ((Math.imul(i + life.seed++, 2654435761) >>> 0) % 7 < 2 ? 1 : 0))
  }
  const next = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let n = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += life.cells[((y + dy + height) % height) * width + ((x + dx + width) % width)]!
      next[y * width + x] = n === 3 || (n === 2 && life.cells[y * width + x]) ? 1 : 0
    }
  }
  life.cells = next
  ctx.fillStyle = token(ctx, '--warp-color-surface-sunken')
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = token(ctx, '--warp-color-positive-solid')
  for (let i = 0; i < next.length; i++) if (next[i]) ctx.fillRect(i % width, Math.floor(i / width), 1, 1)
}

export const CanvasLife = () => {
  const life = { cells: new Uint8Array(0), w: 0, h: 0, seed: 1 }
  return <Canvas draw={f => drawLife(f, life)} animate fps={8} cell={6} label="Conway's Game of Life" style={STAGE} />
}

// -- DitherField

export const DitherFieldPlay = (p: DitherFieldProps) => <DitherField {...p} />

const KINDS = ['weave', 'flow', 'rings', 'aurora', 'drift'] as const
const TONES = ['accent', 'neutral', 'positive', 'caution', 'info', 'highlight'] as const
const stripes = (x: number, y: number, t: number) => Math.sin((x + y) * 9 + t) / 2 + 0.5

export const DitherFieldKinds = () => (
  <Grid min="sm" cols={3} gap="related">
    {KINDS.map(kind => <DitherField key={kind} kind={kind} ratio="16 / 10" />)}
    <DitherField kind={stripes} ratio="16 / 10" />
  </Grid>
)

export const DitherFieldRamps = () => (
  <Grid min="sm" cols={3} gap="related">
    {TONES.map(ramp => <DitherField key={ramp} ramp={ramp} ratio="16 / 10" />)}
  </Grid>
)

export const DitherFieldPointer = () => (
  <DitherField kind="flow" pointer="ripple" spark="highlight" ratio="21 / 9" label="A field that ripples under the pointer" />
)

export const DitherFieldHero = () => (
  <DitherField kind="weave" fade="left" ratio="21 / 9">
    <Inset pad="section">
      <Stack gap="group" align="start">
        <Heading>Deploys that stay out of the way</Heading>
        <Text subtle>Push to main. Tessel builds, tests and ships it.</Text>
        <Button icon="rocket">Start a project</Button>
      </Stack>
    </Inset>
  </DitherField>
)

export const DitherFieldStill = () => <DitherField kind="aurora" speed={0} seed={12} ramp="info" ratio="21 / 9" />

// -- Dither

export const DitherPlay = (p: DitherProps) => <Dither gradient={{ angle: 35 }} {...p} />

const ALGORITHMS = ['bayer2', 'bayer8', 'blue', 'halftone', 'floyd', 'atkinson'] as const
const SOFT = { angle: 30 }
const GLOW = { radial: true, from: 1, to: 0 }

export const DitherImage = () => <Dither src="/art/field.png" alt="A green and white landscape of soft shapes" ratio="16 / 10" cell={3} />

export const DitherGradient = () => <Dither gradient={SOFT} ramp="accent" ratio="21 / 9" />

export const DitherRadial = () => <Dither gradient={GLOW} ramp="info" ratio="21 / 9" label="A soft blue glow" />

export const DitherAlgorithms = () => (
  <Grid min="sm" cols={3} gap="related">
    {ALGORITHMS.map(algorithm => (
      <Stack key={algorithm} gap="tight">
        <Dither gradient={SOFT} algorithm={algorithm} ratio="16 / 10" />
        <Text subtle role="caption">{algorithm}</Text>
      </Stack>
    ))}
  </Grid>
)

export const DitherBanner = () => (
  <Stack gap="group">
    <Dither gradient={SOFT} ramp="positive" ratio="5 / 1" />
    <Row gap="related" justify="between">
      <Stack gap="tight">
        <Text role="heading">storefront is live</Text>
        <Text subtle>Deployed by Priya Raman in 2 minutes.</Text>
      </Stack>
      <Button emphasis="outline" tone="neutral">View logs</Button>
    </Row>
  </Stack>
)

// -- DitherGlyph

export const DitherGlyphPlay = (p: DitherGlyphProps) => <DitherGlyph {...p} />

export const DitherGlyphWord = () => <DitherGlyph text="Tessel" ratio="4 / 1" />

const BOLT = 'M13 2 4 14h7l-1 8 9-12h-7z'

export const DitherGlyphLogo = () => <DitherGlyph path={BOLT} box={[24, 24]} fit={0.9} label="Tessel's bolt" ratio="3 / 1" kind="rings" />

const drawDiamond = (ctx: CanvasRenderingContext2D, cols: number, rows: number) => {
  const size = rows * 0.42
  ctx.beginPath()
  ctx.moveTo(cols / 2, rows / 2 - size)
  ctx.lineTo(cols / 2 + size, rows / 2)
  ctx.lineTo(cols / 2, rows / 2 + size)
  ctx.lineTo(cols / 2 - size, rows / 2)
  ctx.fill()
}

export const DitherGlyphDrawn = () => <DitherGlyph draw={drawDiamond} label="A diamond" ratio="3 / 1" ramp="highlight" />

export const DitherGlyphReveal = () => <DitherGlyph text="Shipped" reveal={1.6} ramp="positive" ratio="4 / 1" />
