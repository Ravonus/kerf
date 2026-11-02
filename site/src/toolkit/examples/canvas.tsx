import { Button, Canvas, Dither, DitherField, DitherGlyph, Grid, Heading, Inset, Row, Stack, Text } from '@weft/warp'
import type { CanvasFrame, DitherFieldProps, DitherGlyphProps, DitherProps } from '@weft/warp'
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
