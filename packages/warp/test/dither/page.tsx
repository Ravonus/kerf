// The dither family on one page, for scripts/dither.mjs and for looking at. ?only=<id> renders one section by itself, so a
// measurement sees that surface alone.
import { render } from '@weft-js/core/dom'
import { Canvas, Dither, DitherField, DitherGlyph } from '../../src/index'
import './page.css'

const only = new URLSearchParams(location.search).get('only')
const WEFT = 'M5 3v18M10 3v18M15 3v18M20 3v18M2 9h20M2 15h20'

// A lit sphere on a floor, drawn here so the page needs no asset and the picture has real tonal range.
function photo() {
  const c = document.createElement('canvas')
  c.width = 900
  c.height = 600
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, 600)
  sky.addColorStop(0, '#223'); sky.addColorStop(0.62, '#778'); sky.addColorStop(0.63, '#332'); sky.addColorStop(1, '#998')
  g.fillStyle = sky
  g.fillRect(0, 0, 900, 600)
  const shadow = g.createRadialGradient(520, 500, 10, 520, 500, 240)
  shadow.addColorStop(0, 'rgba(0,0,0,.8)'); shadow.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = shadow
  g.fillRect(0, 300, 900, 300)
  const ball = g.createRadialGradient(350, 200, 16, 430, 300, 220)
  ball.addColorStop(0, '#fff'); ball.addColorStop(0.3, '#bbb'); ball.addColorStop(0.75, '#333'); ball.addColorStop(1, '#0a0a0a')
  g.fillStyle = ball
  g.beginPath(); g.arc(430, 300, 200, 0, 7); g.fill()
  return c.toDataURL('image/png')
}
const picture = photo()

function spiral({ ctx, width, height, time }: { ctx: CanvasRenderingContext2D; width: number; height: number; time: number }) {
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = getComputedStyle(ctx.canvas).color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let a = 0; a < 40; a += 0.08) ctx.lineTo(width / 2 + Math.cos(a + time) * a * 3, height / 2 + Math.sin(a + time) * a * 3)
  ctx.stroke()
}

const SECTIONS: Record<string, () => unknown> = {
  hero: () => (
    <section data-demo="hero">
      <DitherField fill pointer={['pull', 'ripple', 'shockwave']} spark="caution" cell={7} fade="left" />
      <h1>One line of TSX.</h1>
      <p>A field in warp's own inks that follows theme and tier, and stops when no one is looking.</p>
    </section>
  ),
  fields: () => (
    <div data-demo="grid">
      {(['weave', 'flow', 'rings', 'aurora', 'drift'] as const).map(f => <figure><DitherField kind={f} cell={5} ratio="4 / 3" /><figcaption>{f}</figcaption></figure>)}
      <figure><DitherField kind="flow" cell={3} pattern="halftone" ratio="4 / 3" /><figcaption>flow, halftone</figcaption></figure>
    </div>
  ),
  patterns: () => (
    <div data-demo="grid">
      {(['bayer2', 'bayer4', 'bayer8', 'blue', 'halftone', 'atkinson', 'floyd'] as const).map(a => <figure><Dither algorithm={a} gradient={{ angle: 20 }} cell={3} ratio="4 / 3" /><figcaption>{a}</figcaption></figure>)}
    </div>
  ),
  photo: () => (
    <div data-demo="grid">
      {(['atkinson', 'floyd', 'bayer8', 'blue', 'halftone'] as const).map(a => <figure><Dither src={picture} alt="A lit sphere on a floor" algorithm={a} cell={2} ramp="neutral" inks={4} ratio="3 / 2" /><figcaption>{a}</figcaption></figure>)}
    </div>
  ),
  glyphs: () => (
    <div data-demo="stack">
      <DitherGlyph text="warp" ratio="4 / 1" cell={5} pointer="pull" reveal={1.4} />
      <div data-demo="grid">
        <DitherGlyph path={WEFT} box={[24, 24]} label="weft" ratio="1" cell={3} kind="drift" fit={0.74} stroke={2.4} />
        <DitherGlyph text="42" ratio="1" cell={4} ramp="critical" kind="rings" />
        <DitherGlyph text="dither" ratio="2 / 1" cell={3} ramp="info" kind="aurora" />
      </div>
    </div>
  ),
  raw: () => <div data-demo="raw"><Canvas draw={spiral} animate label="A turning spiral" /></div>,
}

const Tier = ({ name }: { name: string }) => <div data-demo="tier" data-expression={name}><h2>{name}</h2><DitherField data-probe={name} kind="flow" cell={6} seed={7} ratio="3 / 2" pointer="pull" /></div>

render(() => (
  <main>
    {only ? SECTIONS[only]!() : Object.values(SECTIONS).map(s => s())}
    {!only && <div data-demo="grid">{['quiet', 'balanced', 'vivid'].map(n => <Tier name={n} />)}</div>}
  </main>
), document.getElementById('app')!)
