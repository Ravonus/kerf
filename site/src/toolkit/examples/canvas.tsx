import { state, untrack } from '@weft-js/core'
import { Badge, Button, Canvas, CanvasStage, Card, Dither, DitherField, DitherGlyph, DitherStage, Grid, Heading, Inset, LEVEL, Row, Split, Stack, StageSelect, Text } from '@weft-js/warp'
import type { CanvasFrame, DitherFieldProps, DitherGlyphProps, DitherPainter, DitherProps, Scene, StagePainter, StagePiece } from '@weft-js/warp'
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
        <Text subtle>Push to main. weft builds, tests and ships it.</Text>
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

export const DitherGlyphWord = () => <DitherGlyph text="weft" ratio="4 / 1" />

const BOLT = 'M13 2 4 14h7l-1 8 9-12h-7z'

export const DitherGlyphLogo = () => <DitherGlyph path={BOLT} box={[24, 24]} fit={0.9} label="weft's bolt" ratio="3 / 1" kind="rings" />

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

// -- CanvasStage

// Skinned elements are plain HTML. The stage's CSS gives each skin its padding, radius and size from `--stage-*`
// properties, so markup needs no styles of its own; set those properties anywhere above to restyle every skin.

// The smallest stage: two painters, drawn with the plain 2D context, at each piece's box and in its states.
const PLAIN: Record<string, StagePainter> = {
  button(p, s) {
    s.ctx.fillStyle = s.color(p.hover ? '--warp-color-accent-solid-hover' : '--warp-color-accent-solid')
    s.ctx.beginPath()
    s.ctx.roundRect(p.x, p.y + p.press * 2, p.w, p.h, p.r)
    s.ctx.fill()
  },
  card(p, s) {
    s.ctx.shadowColor = 'rgb(0 0 0 / 0.18)'
    s.ctx.shadowBlur = 12 + p.hover * 12
    s.ctx.shadowOffsetY = 4 + p.hover * 4
    s.ctx.fillStyle = s.color('--warp-color-surface')
    s.ctx.beginPath()
    s.ctx.roundRect(p.x, p.y, p.w, p.h, p.r)
    s.ctx.fill()
  },
}

export const CanvasStagePlain = () => (
  <CanvasStage painters={PLAIN} style="padding:32px">
    <a href="#" data-skin="card" style="max-inline-size:340px" onClick={(e: MouseEvent) => e.preventDefault()}>
      <strong>storefront</strong>
      <span>Every border, shadow and fill here is painted on one canvas. The text, the link and the button are HTML.</span>
      <button data-skin="button" >Deploy</button>
    </a>
  </CanvasStage>
)

// A look is a set of painters plus a background and an overlay. This kit makes three from one set of shapes: clean
// vector, pencil on paper, and neon. Only how a line and a fill are drawn changes between them.
type LookName = 'flat' | 'sketch' | 'neon'
type Style = {
  ink: string
  paper: string
  accent: string
  soft: string
  /** Text on a filled button or chip. */
  onFill: string
  /** Pixels of wobble: 0 draws clean lines. */
  rough: number
  /** Glow, in pixels of blur. */
  glow: number
  /** Fills as pencil hatching instead of solid. */
  hatch: boolean
  shadow: 'soft' | 'offset' | 'none'
  ground: (s: Scene) => void
  art: (p: StagePiece, s: Scene) => void
  type: (p: StagePiece, s: Scene) => void
}

// Seeded per element, so a sketchy line wobbles the same way every frame instead of boiling.
const seeds = new WeakMap<Element, number>()
let seedNext = 1
const seedOf = (el: Element) => { let v = seeds.get(el); if (v === undefined) seeds.set(el, (v = seedNext++ * 7919)); return v }
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5 }

function outline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, st: Style, seed: number) {
  ctx.beginPath()
  if (!st.rough) { ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2)); return }
  const j = rng(seed), k = st.rough, pts: [number, number][] = []
  const edge = (ax: number, ay: number, bx: number, by: number) => { const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 28)); for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n + j() * k, ay + ((by - ay) * i) / n + j() * k]) }
  edge(x, y, x + w, y); edge(x + w, y, x + w, y + h); edge(x + w, y + h, x, y + h); edge(x, y + h, x, y)
  ctx.moveTo(pts[0]![0], pts[0]![1])
  for (let i = 1; i <= pts.length; i++) { const [px, py] = pts[i % pts.length]!; ctx.lineTo(px, py) }
  ctx.lineTo(pts[0]![0] + j() * k, pts[0]![1] + j() * k)
}

function stroke(ctx: CanvasRenderingContext2D, color: string, width: number, st: Style) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = ctx.lineCap = 'round'
  if (st.glow) { ctx.shadowColor = color; ctx.shadowBlur = st.glow }
  ctx.stroke()
  ctx.shadowBlur = 0
}

function paint(ctx: CanvasRenderingContext2D, color: string, st: Style, box: [number, number, number, number], density = 1) {
  if (!st.hatch) { ctx.fillStyle = color; ctx.fill(); return }
  // Pencil hatching: the shape clips a run of diagonal strokes.
  const [x, y, w, h] = box, gap = 7 / density
  ctx.save()
  ctx.clip()
  ctx.beginPath()
  for (let d = -h; d < w; d += gap) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y) }
  ctx.strokeStyle = color
  ctx.lineWidth = 1.6
  ctx.globalAlpha = 0.55
  ctx.stroke()
  ctx.restore()
}

function lookKit(st: Style) {
  const c = (s: Scene, name: string) => s.color(name)
  const ring = (p: StagePiece, s: Scene) => {
    if (p.focus < 0.5) return
    const ctx = s.ctx
    ctx.setLineDash([6, 5])
    ctx.lineDashOffset = -s.time * 24
    outline(ctx, p.x - 4, p.y - 4, p.w + 8, p.h + 8, p.r + 4, st, seedOf(p.el) + 3)
    stroke(ctx, c(s, st.accent), 2, st)
    ctx.setLineDash([])
  }
  const lift = (p: StagePiece, s: Scene, depth: number) => {
    const ctx = s.ctx
    if (st.shadow === 'soft') { ctx.shadowColor = 'rgb(0 0 0 / 0.2)'; ctx.shadowBlur = depth * 3; ctx.shadowOffsetY = depth; outline(ctx, p.x, p.y, p.w, p.h, p.r, st, seedOf(p.el)); ctx.fillStyle = c(s, st.paper); ctx.fill(); ctx.shadowColor = 'transparent' }
    if (st.shadow === 'offset') { outline(ctx, p.x + depth, p.y + depth, p.w, p.h, p.r, st, seedOf(p.el) + 1); paint(ctx, c(s, st.soft), st, [p.x + depth, p.y + depth, p.w, p.h], 0.7) }
  }
  // `solid` keeps a surface's paper whole: a panel or a list floats over the page, and a field's words need clean ground.
  const body = (p: StagePiece, s: Scene, fill: string, line: string, width = 1.5, solid = false) => {
    const ctx = s.ctx
    outline(ctx, p.x, p.y, p.w, p.h, p.r, st, seedOf(p.el))
    paint(ctx, fill, solid ? { ...st, hatch: false } : st, [p.x, p.y, p.w, p.h])
    outline(ctx, p.x, p.y, p.w, p.h, p.r, st, seedOf(p.el))
    stroke(ctx, line, width, st)
  }
  const painters: Record<string, StagePainter> = {
    button(p, s) {
      const outlineOnly = p.el.dataset.look === 'outline', y = p.press * 2
      lift({ ...p, y: p.y + y }, s, 4 - p.press * 3)
      const at = { ...p, y: p.y + y }
      body(at, s, outlineOnly ? c(s, p.hover ? st.soft : st.paper) : c(s, p.disabled ? st.soft : st.accent), c(s, outlineOnly || st.rough ? st.ink : st.accent), outlineOnly ? 1.5 : 1)
      if (p.hover && !st.hatch && !outlineOnly) {
        const g = s.ctx.createRadialGradient(p.x + p.px, p.y + p.py, 0, p.x + p.px, p.y + p.py, p.w * 0.7)
        g.addColorStop(0, `rgb(255 255 255 / ${0.28 * p.hover})`)
        g.addColorStop(1, 'rgb(255 255 255 / 0)')
        outline(s.ctx, at.x, at.y, at.w, at.h, at.r, st, seedOf(p.el))
        s.ctx.fillStyle = g
        s.ctx.fill()
      }
      ring(p, s)
    },
    card(p, s) {
      const live = p.el.matches('a[href], button'), chosen = p.on > 0.5
      lift(p, s, 6 + (live ? p.hover * 6 : 0))
      body(p, s, c(s, st.paper), c(s, chosen ? st.accent : st.rough ? st.ink : st.soft), chosen ? 3 : 1.5)
      ring(p, s)
    },
    panel(p, s) { lift(p, s, 14); body(p, s, c(s, st.paper), c(s, st.ink), 1.5, true) },
    bar(p, s) {
      const ctx = s.ctx
      ctx.beginPath()
      for (let y = p.y + 3; y < p.y + p.h - 2; y += 4) { ctx.moveTo(p.x + 6, y); ctx.lineTo(p.x + p.w - 6, y) }
      stroke(ctx, c(s, st.soft), 1, st)
    },
    field(p, s) {
      const line = p.invalid ? c(s, '--warp-color-critical-solid') : c(s, p.focus > 0.5 ? st.accent : st.soft)
      body(p, s, c(s, st.paper), line, 1.5 + p.focus, true)
      if (p.el.tagName === 'SELECT' || p.el.getAttribute('aria-haspopup') === 'listbox') {
        const ctx = s.ctx, x = p.x + p.w - 18, y = p.y + p.h / 2, d = p.on > 0.5 ? -3 : 3
        ctx.beginPath(); ctx.moveTo(x - 5, y - d); ctx.lineTo(x, y + d); ctx.lineTo(x + 5, y - d); stroke(ctx, c(s, st.ink), 1.6, st)
      }
    },
    // A StageSelect's list, in a stage of its own: a panel on a short lift, and the row under the keys or pointer filled.
    menu(p, s) { lift(p, s, 6); body(p, s, c(s, st.paper), c(s, st.rough ? st.ink : st.soft), 1.5, true) },
    option(p, s) {
      if (p.hover > 0.5) body(p, s, c(s, st.accent), c(s, st.accent), 1)
      else if (p.on > 0.5) { const ctx = s.ctx; ctx.beginPath(); ctx.moveTo(p.x + 3, p.y + 8); ctx.lineTo(p.x + 3, p.y + p.h - 8); stroke(ctx, c(s, st.accent), 3, st) }
    },
    check(p, s) {
      const ctx = s.ctx, radio = (p.el as HTMLInputElement).type === 'radio', round = radio ? p.w / 2 : 5
      body({ ...p, r: round }, s, c(s, p.hover ? st.soft : st.paper), c(s, st.rough ? st.ink : p.on > 0.5 ? st.accent : st.soft), 1.6)
      if (p.on > 0) {
        if (radio) { ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h / 2, (p.w / 4) * p.on, 0, Math.PI * 2); paint(ctx, c(s, st.accent), { ...st, hatch: false }, [p.x, p.y, p.w, p.h]) }
        else {
          // The tick draws itself on as `on` eases in.
          ctx.beginPath(); ctx.moveTo(p.x + p.w * 0.22, p.y + p.h * 0.52); ctx.lineTo(p.x + p.w * 0.42, p.y + p.h * 0.72); ctx.lineTo(p.x + p.w * 0.8, p.y + p.h * 0.28)
          ctx.setLineDash([40 * p.on, 40]); stroke(ctx, c(s, st.accent), 2.6, st); ctx.setLineDash([])
        }
      }
      ring({ ...p, r: round }, s)
    },
    switch(p, s) {
      const ctx = s.ctx, d = p.h - 6, kx = p.x + 3 + (p.w - p.h) * p.on
      body({ ...p, r: p.h / 2 }, s, p.on > 0.5 ? c(s, st.accent) : c(s, st.soft), c(s, st.rough ? st.ink : st.soft), 1.4)
      ctx.beginPath(); ctx.arc(kx + d / 2, p.y + 3 + d / 2, d / 2, 0, Math.PI * 2)
      ctx.fillStyle = c(s, st.paper); ctx.fill(); stroke(ctx, c(s, st.ink), 1.2, st)
      ring({ ...p, r: p.h / 2 }, s)
    },
    range(p, s) {
      const ctx = s.ctx, y = p.y + p.h / 2, kx = p.x + 8 + (p.w - 16) * p.value
      ctx.beginPath(); ctx.moveTo(p.x + 2, y); ctx.lineTo(p.x + p.w - 2, y); stroke(ctx, c(s, st.soft), 4, st)
      ctx.beginPath(); ctx.moveTo(p.x + 2, y); ctx.lineTo(kx, y); stroke(ctx, c(s, st.accent), 4, st)
      ctx.beginPath(); ctx.arc(kx, y, 8 + p.hover * 2, 0, Math.PI * 2); ctx.fillStyle = c(s, st.paper); ctx.fill(); stroke(ctx, c(s, st.accent), 2.5, st)
      if (p.focus > 0.5) ring({ ...p, x: kx - 10, y: y - 10, w: 20, h: 20, r: 10 }, s)
    },
    meter(p, s) {
      body({ ...p, r: p.h / 2 }, s, c(s, st.paper), c(s, st.soft), 1.2)
      const ctx = s.ctx
      outline(ctx, p.x, p.y, Math.max(p.h, p.w * p.value), p.h, p.h / 2, st, seedOf(p.el) + 5)
      paint(ctx, c(s, st.accent), st, [p.x, p.y, p.w * p.value, p.h])
    },
    chip(p, s) {
      body({ ...p, r: p.h / 2 }, s, c(s, p.on > 0.5 ? st.accent : p.hover ? st.soft : st.paper), c(s, p.on > 0.5 ? st.accent : st.soft), 1.2)
      ring({ ...p, r: p.h / 2 }, s)
    },
    rule(p, s) {
      const ctx = s.ctx, y = p.y + p.h / 2, j = rng(seedOf(p.el))
      ctx.beginPath(); ctx.moveTo(p.x, y)
      for (let x = p.x; x <= p.x + p.w; x += 24) ctx.lineTo(x, y + j() * st.rough * 1.5)
      stroke(ctx, c(s, st.soft), 1.5, st)
    },
    clear(p, s) { const ctx = s.ctx; ctx.beginPath(); ctx.roundRect(p.x - 4, p.y - 4, p.w + 8, p.h + 8, 8); ctx.globalAlpha = 0.86; ctx.fillStyle = c(s, st.paper); ctx.fill() },
    type: st.type,
    art: st.art,
  }
  const overlay = (s: Scene) => {
    const ctx = s.ctx
    for (const press of s.presses) {
      ctx.globalAlpha = 1 - press.age
      ctx.beginPath(); ctx.arc(press.x, press.y, 6 + press.age * 60, 0, Math.PI * 2)
      stroke(ctx, c(s, st.accent), 2, st)
    }
    ctx.globalAlpha = 1
    if (s.rail) { ctx.beginPath(); ctx.roundRect(s.rail.x, s.rail.top, s.rail.w, s.rail.len, s.rail.w / 2); ctx.fillStyle = c(s, s.rail.drag ? st.accent : st.soft); ctx.fill() }
  }
  const plain = (s: Scene) => { s.ctx.fillStyle = c(s, st.paper); s.ctx.fillRect(0, 0, s.width, s.height) }
  // A modal's stage covers the page with a wash that fades in each time it opens.
  const veil = (s: Scene) => { s.ctx.globalAlpha = Math.min(1, s.live ? s.shown / 0.2 : 1) * 0.5; s.ctx.fillStyle = '#000'; s.ctx.fillRect(0, 0, s.width, s.height); s.ctx.globalAlpha = 1 }
  return { stage: { painters, overlay, background: st.ground }, plain, veil, style: st }
}

// Words where the DOM set them, painted by the look: the page keeps them as text for selection and screen readers.
const words = (p: StagePiece, s: Scene, fill: (ctx: CanvasRenderingContext2D) => void, tilt = 0) => {
  const ctx = s.ctx, j = rng(seedOf(p.el))
  fill(ctx)
  for (const w of s.words(p.el)) {
    ctx.font = w.font
    ctx.letterSpacing = `${w.spacing}px`
    ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(j() * tilt); ctx.fillText(w.text, 0, 0); ctx.restore()
  }
}

// The colours a look starts from: an app's --stage-* if it set one, else warp's tokens, which follow light and dark.
const TOKENS = { ink: 'var(--stage-ink, var(--warp-color-text))', paper: 'var(--stage-paper, var(--warp-color-surface))', accent: 'var(--stage-accent, var(--warp-color-accent-solid))' }

const LOOKS = {
  flat: lookKit({
    ...TOKENS, soft: 'var(--stage-soft, var(--warp-color-border))', onFill: 'var(--warp-color-accent-on-solid)',
    rough: 0, glow: 0, hatch: false, shadow: 'soft',
    ground(s) {
      // Dots that scroll with the page, painted under everything.
      const ctx = s.ctx, gap = 28, off = (s.scroll?.top ?? 0) % gap
      ctx.fillStyle = s.color('--warp-color-surface-sunken'); ctx.fillRect(0, 0, s.width, s.height)
      ctx.fillStyle = s.color('--warp-color-border')
      for (let y = -off; y < s.height; y += gap) for (let x = gap / 2; x < s.width; x += gap) ctx.fillRect(x, y, 2, 2)
    },
    art(p, s) {
      const ctx = s.ctx, t = s.time * 0.4
      ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, p.r); ctx.clip()
      ctx.fillStyle = s.color('--warp-color-accent-soft'); ctx.fillRect(p.x, p.y, p.w, p.h)
      for (const [i, tone] of ['--warp-color-accent-solid', '--warp-color-info-solid', '--warp-color-highlight-solid'].entries()) {
        const cx = p.x + p.w * (0.5 + Math.sin(t + i * 2.1) * 0.3), cy = p.y + p.h * (0.5 + Math.cos(t * 1.3 + i) * 0.3), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, p.w * 0.45)
        g.addColorStop(0, s.color(tone)); g.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.75; ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h)
      }
    },
    type(p, s) { words(p, s, ctx => { const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h); g.addColorStop(0, s.color(TOKENS.accent)); g.addColorStop(1, s.color('--warp-color-info-solid')); ctx.fillStyle = g }) },
  }),
  sketch: lookKit({
    ...TOKENS, soft: 'var(--stage-soft, var(--warp-color-text-subtle))', onFill: 'var(--warp-color-text)',
    rough: 2.2, glow: 0, hatch: true, shadow: 'offset',
    ground(s) {
      // Ruled paper: the lines are fixed to the page, so they scroll with it, and a margin rule runs down the side.
      const ctx = s.ctx, gap = 30, off = (s.scroll?.top ?? 0) % gap
      ctx.fillStyle = s.color(TOKENS.paper); ctx.fillRect(0, 0, s.width, s.height)
      ctx.strokeStyle = s.color('--warp-color-info-border'); ctx.lineWidth = 1
      ctx.beginPath(); for (let y = gap - off; y < s.height; y += gap) { ctx.moveTo(0, y + 0.5); ctx.lineTo(s.width, y + 0.5) } ctx.stroke()
      ctx.strokeStyle = s.color('--warp-color-critical-border'); ctx.beginPath(); ctx.moveTo(18.5, 0); ctx.lineTo(18.5, s.height); ctx.stroke()
    },
    art(p, s) {
      const ctx = s.ctx, j = rng(seedOf(p.el)), cx = p.x + p.w / 2, cy = p.y + p.h / 2
      ctx.strokeStyle = s.color(TOKENS.ink); ctx.lineWidth = 1.4
      for (let r = 8; r < Math.min(p.w, p.h) / 2; r += 9) { ctx.beginPath(); for (let a = 0; a <= Math.PI * 2.05; a += 0.3) ctx.lineTo(cx + Math.cos(a) * (r + j() * 3), cy + Math.sin(a) * (r + j() * 3)); ctx.stroke() }
      outline(ctx, p.x, p.y, p.w, p.h, 0, LOOKS.sketch.style, seedOf(p.el)); stroke(ctx, s.color(TOKENS.ink), 1.5, LOOKS.sketch.style)
    },
    type(p, s) { words(p, s, ctx => (ctx.fillStyle = s.color(TOKENS.ink)), 0.04) },
  }),
  neon: lookKit({
    // Its own colours, a pair for each theme: an app's --stage-* still wins over them.
    ink: 'var(--stage-ink, light-dark(#3a1060, #f4ecff))', paper: 'var(--stage-paper, light-dark(#fff2fa, #120a24))', accent: 'var(--stage-accent, light-dark(#d81b78, #ff3ea5))', soft: 'var(--stage-soft, light-dark(#e3b8ef, #4a3a7a))', onFill: '#fff',
    rough: 0, glow: 14, hatch: false, shadow: 'none',
    ground(s) {
      // A horizon and a floor grid that rolls toward you as the page scrolls and time passes.
      const ctx = s.ctx, w = s.width, h = s.height, hz = h * 0.42, sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, s.color('light-dark(#fff2fa, #07021a)')); sky.addColorStop(0.42, s.color('light-dark(#ffd1ec, #2a0b4a)')); sky.addColorStop(1, s.color('light-dark(#fff2fa, #07021a)'))
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = ctx.shadowColor = s.color('light-dark(#c86bff, #7b2cff)'); ctx.lineWidth = 1; ctx.shadowBlur = 8
      const roll = ((s.scroll?.top ?? 0) / 40 + s.time * 0.6) % 1
      ctx.beginPath()
      for (let i = 0; i < 14; i++) { const z = (i + roll) / 14, y = hz + (h - hz) * z * z; ctx.moveTo(0, y); ctx.lineTo(w, y) }
      for (let i = -12; i <= 12; i++) { ctx.moveTo(w / 2 + i * 12, hz); ctx.lineTo(w / 2 + i * w * 0.18, h) }
      ctx.stroke(); ctx.shadowBlur = 0
    },
    art(p, s) {
      // A striped sun setting into the floor.
      const ctx = s.ctx, cx = p.x + p.w / 2, cy = p.y + p.h * 0.62, r = Math.min(p.w, p.h) * 0.38, g = ctx.createLinearGradient(0, cy - r, 0, cy + r)
      ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, p.r); ctx.clip()
      g.addColorStop(0, '#ffd23f'); g.addColorStop(1, s.color(LOOKS.neon.style.accent))
      ctx.shadowColor = s.color(LOOKS.neon.style.accent); ctx.shadowBlur = 30; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * (1 + p.hover * 0.06), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
      ctx.fillStyle = s.color(LOOKS.neon.style.paper)
      for (let i = 0; i < 6; i++) { const y = cy + r * (0.1 + i * 0.16) - ((s.time * 6) % (r * 0.16)); ctx.fillRect(p.x, y, p.w, 2 + i * 1.2) }
    },
    type(p, s) {
      s.ctx.shadowColor = s.color(LOOKS.neon.style.accent); s.ctx.shadowBlur = 18
      words(p, s, ctx => { const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h); g.addColorStop(0, s.color('light-dark(#0aa6c9, #28e7ff)')); g.addColorStop(1, s.color(LOOKS.neon.style.accent)); ctx.fillStyle = g })
    },
  }),
} satisfies Record<LookName, ReturnType<typeof lookKit>>

// Every built-in skin on one stage; the same markup takes whichever look paints it.
function Skins(props: { group: string }) {
  return (
    <Grid min="md" cols={2} gap="group">
      <Stack gap="related" data-skin="card">
        <Row gap="related" wrap>
          <button data-skin="button">Deploy</button>
          <button data-skin="button" data-look="outline">Preview</button>
          <button data-skin="button" disabled>Paused</button>
        </Row>
        <label data-part="label">Project<input data-skin="field" value="storefront" /></label>
        <label data-part="label">Region<StageSelect options={['eu-west', 'us-east']} /></label>
      </Stack>
      <Stack gap="related" data-skin="card">
        <label data-part="option"><input type="checkbox" data-skin="check" checked />Preview every push</label>
        <Row gap="group">
          <label data-part="option"><input type="radio" name={props.group} data-skin="check" checked />Node</label>
          <label data-part="option"><input type="radio" name={props.group} data-skin="check" />Bun</label>
        </Row>
        <label data-part="option"><input type="checkbox" role="switch" data-skin="switch" checked />Deploy on push</label>
        <label data-part="label">Build minutes<input type="range" data-skin="range" value="60" /></label>
        <Row gap="tight" wrap>
          <button data-skin="chip" aria-pressed="true">Live</button>
          <button data-skin="chip" aria-pressed="false">Building</button>
        </Row>
      </Stack>
    </Grid>
  )
}

const lookStyle = (name: LookName, rest = '') => `${rest};--stage-on-fill:${LOOKS[name].style.onFill}`
const FLAT_STYLE = lookStyle('flat', 'padding:28px')
const SKETCH_STYLE = lookStyle('sketch', 'padding:28px 28px 28px 40px')
const FLAT_CHOOSE = lookStyle('flat', 'padding:28px;min-block-size:300px')
const SKETCH_CHOOSE = lookStyle('sketch', 'padding:28px 28px 28px 40px;min-block-size:300px')
const NEON_STYLE = lookStyle('neon', 'padding:28px')

export const CanvasStageFlat = () => (
  <CanvasStage {...LOOKS.flat.stage} style={FLAT_STYLE}><Skins group="look-flat" /></CanvasStage>
)

// A select the stage draws, list and all. Its list floats in the top layer as a stage of its own, in the look it opened
// from, so it is never clipped and nothing under it shows through.
const Choose = () => (
  <div data-skin="card" style="display:grid;gap:14px;inline-size:min(340px, 100%)">
    <label data-part="label">Region<StageSelect name="region" options={['eu-west', 'us-east', 'ap-south', 'sa-east']} /></label>
    <label data-part="label">Plan<StageSelect name="plan" value="team" options={[{ value: 'hobby', label: 'Hobby' }, { value: 'team', label: 'Team' }, { value: 'scale', label: 'Scale (talk to us)', disabled: true }]} /></label>
  </div>
)

export const StageSelectDither = () => <DitherStage ground={0.3} style="padding:28px;min-block-size:300px"><Choose /></DitherStage>

export const StageSelectFlat = () => <CanvasStage {...LOOKS.flat.stage} style={FLAT_CHOOSE}><Choose /></CanvasStage>

export const StageSelectSketch = () => <CanvasStage {...LOOKS.sketch.stage} style={SKETCH_CHOOSE}><Choose /></CanvasStage>

export const CanvasStageSketch = () => (
  <CanvasStage {...LOOKS.sketch.stage} style={SKETCH_STYLE}><Skins group="look-sketch" /></CanvasStage>
)

export const CanvasStageNeon = () => (
  <CanvasStage {...LOOKS.neon.stage} animate style={NEON_STYLE}><Skins group="look-neon" /></CanvasStage>
)

// -- DitherStage

export const StageSkins = () => (
  <DitherStage kind="drift" ground={0.35} style="padding:28px"><Skins group="look-dither" /></DitherStage>
)

// Ordinary warp components sit on the stage and paint themselves; only the skinned parts are drawn in cells.
export const StageHybrid = () => (
  <DitherStage kind="flow" ramp="info" style="padding:28px">
    <Split side="end" width="list" gap="group">
      <Card title="storefront" eyebrow="Live in eu-west">
        <Stack gap="related">
          <Text subtle>412 deploys, 99.98% uptime, 84 ms at p95.</Text>
          <Row gap="related"><Button>Open</Button><Button emphasis="outline" tone="neutral">Logs</Button><Badge tone="positive">Healthy</Badge></Row>
        </Stack>
      </Card>
      <Stack gap="related" data-skin="card">
        <h3 data-skin="type" style="font-size:28px">Drawn in cells</h3>
        <div data-skin="art" data-kind="rings" role="img" aria-label="Rings spreading over a dithered field"></div>
        <button data-skin="button">Promote</button>
      </Stack>
    </Split>
  </DitherStage>
)

// A skin of your own: a battery whose cells fill to the meter's value. Painters get the piece's box and states, in cells.
const battery: DitherPainter = (p, b) => {
  const nub = Math.max(2, Math.round(p.h / 4)), body = p.w - nub - 1, bars = 5, gap = 1, inner = body - 4, bar = (inner - gap * (bars - 1)) / bars
  b.ring(p.x, p.y, body, p.h, 2, 1, LEVEL.ink)
  b.fill(p.x + body, p.y + nub, nub, p.h - nub * 2, 0, LEVEL.ink)
  for (let i = 0; i < bars; i++) {
    const lit = p.value * bars - i
    b.fill(p.x + 2 + i * (bar + gap), p.y + 2, bar, p.h - 4, 0, lit >= 1 ? LEVEL.tone : lit > 0 ? lit * LEVEL.tone : LEVEL.soft * p.hover)
  }
}
const PAINT_BATTERY = { battery }

export const StageOwnSkin = () => {
  const charge = state(64)
  return (
    <DitherStage ground={0.25} painters={PAINT_BATTERY} style="padding:28px">
      <Stack gap="related" align="start">
        <meter data-skin="battery" data-ramp="positive" min="0" max="100" value={charge.value} aria-label={`Battery at ${charge.value}%`} style="inline-size:180px;block-size:72px"></meter>
        <label data-part="label">Charge {charge.value}%<input type="range" data-skin="range" data-ramp="positive" value={charge.value} onInput={(e: Event) => (charge.value = +(e.currentTarget as HTMLInputElement).value)} style="inline-size:240px" /></label>
      </Stack>
    </DitherStage>
  )
}

// A modal is a native <dialog> with a stage of its own: the veil dithers over the page and the panel dissolves in.
export const StageModal = () => {
  let dialog: HTMLDialogElement | undefined
  return (
    <DitherStage ground={0.3} style="padding:28px">
      <button data-skin="button" onClick={() => dialog?.showModal()}>Rename project</button>
      <dialog ref={n => (dialog = n)} aria-label="Rename project">
        <DitherStage layout="page" veil={0.5} ground={0} onClick={(e: MouseEvent) => e.target === e.currentTarget && dialog?.close()}>
          <form method="dialog" data-skin="panel">
            <div data-skin="bar"><span>Rename project</span></div>
            <Stack gap="related">
              <label data-part="label">Name<input data-skin="field" value="storefront" autofocus /></label>
              <Row gap="related" justify="end">
                <button data-skin="button" data-look="outline" value="cancel">Cancel</button>
                <button data-skin="button" value="save">Save</button>
              </Row>
            </Stack>
          </form>
        </DitherStage>
      </dialog>
    </DitherStage>
  )
}

// The landing page: everything you see is painted by the stage, in whichever look, and it still reflows, scrolls,
// focuses and reads as HTML. The look switch remounts the same markup under a different set of painters.
type Look = 'dither' | LookName
const LAND_WRAP = 'padding-inline:clamp(16px,5cqi,56px);max-inline-size:1120px;margin-inline:auto'
const LAND_SECTION = `${LAND_WRAP};padding-block:clamp(40px,8cqi,88px)`
// The site's own h1-h3 rule outranks the stage's layered defaults, so the headings name the stage's resolved face.
const DISPLAY = 'margin:0;line-height:0.95;font-family:var(--stage-type-face);font-weight:var(--stage-type-heft);letter-spacing:var(--stage-type-track)'
const LEDE = 'margin:0;font-size:clamp(16px,2cqi,19px);line-height:1.5;max-inline-size:52ch;padding:10px 12px;border-radius:6px'
const H2 = `${DISPLAY};font-size:clamp(32px,5cqi,52px)`

const LAND_FEATURES = [
  { kind: 'weave', title: 'Previews on every push', body: 'Each branch gets its own URL in about forty seconds, torn down when it merges.' },
  { kind: 'flow', title: 'Rollbacks in one press', body: 'Every deploy is kept. Go back to any of them without a rebuild.' },
  { kind: 'drift', title: 'Edge cache, tuned', body: 'Static work is cached near your readers, and purged the moment you ship.' },
] as const

const LAND_PLANS = [
  { name: 'Hobby', monthly: 0, blurb: 'One project, previews, a shared build queue.' },
  { name: 'Team', monthly: 24, blurb: 'Unlimited projects, rollbacks, five seats.' },
  { name: 'Scale', monthly: 89, blurb: 'Edge cache, audit log, priority builds.' },
] as const

const LAND_FAQ = [
  { q: 'Is any of this really a canvas?', a: 'Every border, fill, shadow, field, check and heading you see is painted on one canvas. The DOM underneath keeps the layout, the text, focus and the accessibility tree.' },
  { q: 'Does it have to be dithered?', a: 'No. Dithering is one look. A look is a set of painters, so the same page can be flat vector, pencil, neon or anything a 2D context can draw. Switch looks above.' },
  { q: 'What happens on a phone?', a: 'The page reflows like any other: the grids stack, the hero wraps, and the stage paints wherever the boxes land.' },
  { q: 'And with reduced motion?', a: 'Backgrounds hold still, pieces appear without their entrance, and every state still shows.' },
]

const jump = (e: MouseEvent, to?: string) => {
  e.preventDefault()
  const page = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-layout="scroll"]'), target = to ? page?.querySelector<HTMLElement>(`[data-land="${to}"]`) : undefined
  page?.scrollTo({ top: target ? target.offsetTop - 64 : 0, behavior: 'smooth' })
}

// One stage in the chosen look: `role` says which of the page's three stages it is. The look is fixed for its life.
function LookStage({ look, role, children, ...rest }: { look: Look; role: 'page' | 'header' | 'modal'; children?: unknown; [attr: string]: unknown }) {
  const name = untrack(() => look), part = untrack(() => role)
  if (name === 'dither') {
    if (part === 'page') return <DitherStage {...rest} layout="scroll" rail kind="weave" ground={0.42} drift={0.4} style="block-size:720px">{children}</DitherStage>
    if (part === 'header') return <DitherStage {...rest} ground={0} style="background:var(--warp-color-surface)">{children}</DitherStage>
    return <DitherStage {...rest} layout="page" veil={0.5} ground={0}>{children}</DitherStage>
  }
  const kit = LOOKS[name], page = lookStyle(name, 'block-size:720px'), plain = lookStyle(name)
  if (part === 'page') return <CanvasStage {...rest} {...kit.stage} layout="scroll" rail animate={name === 'neon'} style={page}>{children}</CanvasStage>
  if (part === 'header') return <CanvasStage {...rest} {...kit.stage} background={kit.plain} style={plain}>{children}</CanvasStage>
  return <CanvasStage {...rest} {...kit.stage} layout="page" veil background={kit.veil} style={plain}>{children}</CanvasStage>
}

function Landing({ look }: { look: Look }) {
  const yearly = state(false)
  const plan = state('Team')
  const minutes = state(1800)
  const joined = state(false)
  const signedUp = state(false)
  const name = untrack(() => look)
  let dialog: HTMLDialogElement | undefined
  const price = (monthly: number) => (yearly.value ? Math.round(monthly * 10) : monthly)
  const open = () => dialog?.showModal()
  return (
    <LookStage look={name} role="page" aria-label="weft, a landing page painted on one canvas">
      <header style="position:sticky;top:0;z-index:2">
        <LookStage look={name} role="header">
          <Row justify="between" gap="related" style={`${LAND_WRAP};padding-block:12px`}>
            <a href="#top" data-skin="type" data-ramp="accent" style="font-size:30px;color:inherit" onClick={(e: MouseEvent) => jump(e)}>weft</a>
            <Row gap="tight" wrap>
              <a href="#features" data-skin="chip"  onClick={(e: MouseEvent) => jump(e, 'features')}>Features</a>
              <a href="#pricing" data-skin="chip"  onClick={(e: MouseEvent) => jump(e, 'pricing')}>Pricing</a>
              <a href="#faq" data-skin="chip"  onClick={(e: MouseEvent) => jump(e, 'faq')}>FAQ</a>
              <button data-skin="button" onClick={open}>Start free</button>
            </Row>
          </Row>
          <div data-skin="rule"></div>
        </LookStage>
      </header>

      <section style={LAND_SECTION}>
        <Split side="end" width="half" gap="section">
          <Stack gap="group" align="start">
            <span data-skin="chip" data-ramp="highlight">New: edge cache in 14 regions</span>
            <h1 data-skin="type" data-ramp="accent" style={`${DISPLAY};font-size:clamp(44px,9cqi,96px)`}>Ship it on canvas.</h1>
            <p data-skin="clear" style={LEDE}>weft builds, previews and ships every push. This page is one canvas: every surface on it is painted, and every control is still real HTML.</p>
            <Row gap="related" wrap>
              <button data-skin="button" onClick={open}>Start a project</button>
              <a href="#pricing" data-skin="button" data-look="outline"  onClick={(e: MouseEvent) => jump(e, 'pricing')}>See pricing</a>
            </Row>
          </Stack>
          <div data-skin="art" data-kind="rings" data-ramp="accent" role="img" aria-label="An animated picture" style="--stage-art-ratio:4/3;min-block-size:220px"></div>
        </Split>
      </section>

      <section data-land="features" style={LAND_SECTION}>
        <Stack gap="group">
          <h2 data-skin="type" style={H2}>Less to look after</h2>
          <Grid min="md" cols={3} gap="group">
            {LAND_FEATURES.map(f => (
              <article key={f.title} data-skin="card" style="--stage-pad-card:0.875rem">
                <div data-skin="art" data-kind={f.kind} style="--stage-art-ratio:16/7"></div>
                <h3 style="margin:0;font-size:19px">{f.title}</h3>
                <p style="margin:0;line-height:1.5">{f.body}</p>
              </article>
            ))}
          </Grid>
        </Stack>
      </section>

      <section style={LAND_SECTION}>
        <Split side="start" width="half" gap="section">
          <Stack gap="related" align="start">
            <h2 data-skin="type" style={H2}>Try the knobs</h2>
            <p data-skin="clear" style={LEDE}>Fields, checks, a switch and a slider, all painted by the stage. Tab through them: focus is drawn round whatever has it.</p>
          </Stack>
          <form data-skin="card" style="--stage-gap-card:1rem" onSubmit={(e: Event) => { e.preventDefault(); open() }}>
            <label data-part="label">Project name<input data-skin="field" required value="storefront" /></label>
            <label data-part="label">Region<StageSelect name="region" options={['eu-west', 'us-east', 'ap-south']} /></label>
            <fieldset style="border:0;padding:0;margin:0;display:flex;gap:18px;flex-wrap:wrap">
              <legend style="font-size:14px;font-weight:600;margin-block-end:8px">Runtime</legend>
              <label data-part="option"><input type="radio" name={`land-${name}`} data-skin="check" checked />Node</label>
              <label data-part="option"><input type="radio" name={`land-${name}`} data-skin="check" />Bun</label>
              <label data-part="option"><input type="radio" name={`land-${name}`} data-skin="check" />Deno</label>
            </fieldset>
            <label data-part="option"><input type="checkbox" data-skin="check" checked />Preview every pull request</label>
            <label data-part="option"><input type="checkbox" role="switch" data-skin="switch" checked />Deploy on push to main</label>
            <label data-part="label">Build minutes: {minutes.value.toLocaleString('en')}<input type="range" data-skin="range" min="0" max="6000" step="100" value={minutes.value} onInput={(e: Event) => (minutes.value = +(e.currentTarget as HTMLInputElement).value)} /></label>
            <label data-part="label">Of the Team plan's 6,000<meter data-skin="meter" min="0" max="6000" value={minutes.value}></meter></label>
            <button data-skin="button" >Create project</button>
          </form>
        </Split>
      </section>

      <section data-land="pricing" style={LAND_SECTION}>
        <Stack gap="group">
          <Row justify="between" gap="related" wrap>
            <h2 data-skin="type" style={H2}>Pricing</h2>
            <Row gap="tight" role="group" aria-label="Billing period">
              <button data-skin="chip" aria-pressed={yearly.value ? 'false' : 'true'} onClick={() => (yearly.value = false)}>Monthly</button>
              <button data-skin="chip" aria-pressed={yearly.value ? 'true' : 'false'} onClick={() => (yearly.value = true)}>Yearly, two months free</button>
            </Row>
          </Row>
          <Grid min="md" cols={3} gap="group">
            {LAND_PLANS.map(p => (
              <button key={p.name} data-skin="card" data-ramp={p.name === 'Team' ? 'accent' : undefined} aria-pressed={plan.value === p.name ? 'true' : 'false'} onClick={() => (plan.value = p.name)}>
                <span style="font-weight:700;font-size:18px">{p.name}</span>
                <span style="font-family:var(--warp-font-display);font-size:44px;font-weight:800;line-height:1">${price(p.monthly)}<span style="font-size:15px;font-weight:500">{yearly.value ? ' a year' : ' a month'}</span></span>
                <span style="line-height:1.5">{p.blurb}</span>
              </button>
            ))}
          </Grid>
        </Stack>
      </section>

      <section data-land="faq" style={LAND_SECTION}>
        <Stack gap="group">
          <h2 data-skin="type" style={H2}>Questions</h2>
          {LAND_FAQ.map(f => (
            <details key={f.q} data-skin="card">
              <summary>{f.q}</summary>
              <p style="line-height:1.55">{f.a}</p>
            </details>
          ))}
        </Stack>
      </section>

      <footer style={`${LAND_SECTION};display:grid;gap:24px`}>
        <form data-skin="card" onSubmit={(e: Event) => { e.preventDefault(); joined.value = true }}>
          <h2 data-skin="type" data-ramp="accent" style={`${DISPLAY};font-size:clamp(26px,4cqi,40px)`}>{joined.value ? 'You are on the list.' : 'Get the changelog'}</h2>
          <Row gap="related" wrap>
            <input type="email" required placeholder="you@company.com" aria-label="Email" data-skin="field" style="inline-size:auto;flex:1 1 220px" />
            <button data-skin="button">Subscribe</button>
          </Row>
        </form>
        <div data-skin="rule"></div>
        <Row justify="between" wrap gap="related"><span data-skin="clear">© 2026 weft</span><span data-skin="clear">Painted on one canvas.</span></Row>
      </footer>

      <dialog ref={n => (dialog = n)} aria-label="Start a project" onClose={() => (signedUp.value = false)}>
        <LookStage look={name} role="modal" onClick={(e: MouseEvent) => e.target === e.currentTarget && dialog?.close()}>
          <form data-skin="panel" onSubmit={(e: Event) => { e.preventDefault(); signedUp.value = true }}>
            <div data-skin="bar"><span>Start a project</span></div>
            <Stack gap="related">
              {signedUp.value
                ? <p style="margin:0;line-height:1.5">Done. Your first preview builds as soon as you push.</p>
                : <>
                    <label data-part="label">Email<input type="email" required autofocus placeholder="you@company.com" data-skin="field" /></label>
                    <label data-part="label">Plan<StageSelect name="plan" options={LAND_PLANS.map(p => p.name)} value={plan.value} onChange={(v: string) => (plan.value = v)} /></label>
                    <label data-part="option"><input type="checkbox" data-skin="check" checked />Send me the changelog</label>
                  </>}
              <Row gap="related" justify="end">
                <button type="button" data-skin="button" data-look="outline" onClick={() => dialog?.close()}>{signedUp.value ? 'Close' : 'Cancel'}</button>
                {!signedUp.value && <button data-skin="button">Create</button>}
              </Row>
            </Stack>
          </form>
        </LookStage>
      </dialog>
    </LookStage>
  )
}

const LOOK_NAMES: [Look, string][] = [['dither', 'Dither'], ['flat', 'Flat'], ['sketch', 'Sketch'], ['neon', 'Neon']]

export const StageLanding = () => {
  const look = state<Look>('dither')
  return (
    <Stack gap="related">
      <Row gap="tight" role="group" aria-label="Look">
        {LOOK_NAMES.map(([id, label]) => <Button key={id} size="sm" tone="neutral" emphasis={look.value === id ? 'solid' : 'outline'} aria-pressed={look.value === id ? 'true' : 'false'} onClick={() => (look.value = id)}>{label}</Button>)}
      </Row>
      {look.value === 'dither' && <Landing look="dither" />}
      {look.value === 'flat' && <Landing look="flat" />}
      {look.value === 'sketch' && <Landing look="sketch" />}
      {look.value === 'neon' && <Landing look="neon" />}
    </Stack>
  )
}
