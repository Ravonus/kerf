import type { Frame } from '../canvas'
import { visualCount, visualRandom } from './random'

/** Unit coordinates within an effect's canvas. */
export type ParticleOrigin = { x: number; y: number }

/** Particle shapes, including disks for rain and images for sprite bursts. */
export type ParticleShape = 'confetti' | 'dot' | 'disk' | 'sprite'

/** An image supplied by the caller as a particle sprite. */
export interface ParticleSprite {
  src: string
}

/** A seeded sample that can paint at any time or viewport size. */
export interface ParticleSample {
  x: number
  y: number
  speed: number
  size: number
  angle: number
  spin: number
  kind: number
  ink: number
}

/** Make a bounded particle sequence. Resizing never changes its identities. */
export function particleSamples(seed: string | number, count: number): ParticleSample[] {
  const random = visualRandom(seed)
  return Array.from({ length: visualCount(count, 512) }, () => ({
    x: random(),
    y: random(),
    speed: random(),
    size: random(),
    angle: random(),
    spin: random() * 2 - 1,
    kind: Math.floor(random() * 3),
    ink: Math.floor(random() * 65536),
  }))
}

const FALLBACK = ['#595c68', '#7d818e', '#a4a7b1']

/** Resolve frame colors once per theme, using the canvas's own theme scope. */
export function particleInks(canvas: HTMLCanvasElement) {
  return [getComputedStyle(canvas).color || FALLBACK[0]!]
}

interface BurstPaint {
  origin: ParticleOrigin
  duration: number
  volleys: number
  gap: number
  speed: number
  gravity: number
  spread: number
  direction: number
  shape: ParticleShape
  palette: readonly string[]
  sprites: readonly HTMLImageElement[]
}

/** Paint a finite burst and report whether its final volley has finished. */
export function paintBurst(
  frame: Frame,
  samples: ParticleSample[],
  time: number,
  options: BurstPaint,
) {
  const { ctx, width, height } = frame
  ctx.clearRect(0, 0, width, height)
  const remaining = time < options.duration + options.gap * (options.volleys - 1)
  if (!remaining) return false
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!
    const age = time - Math.floor((i * options.volleys) / samples.length) * options.gap
    if (age < 0 || age >= options.duration) continue
    paintBurstParticle(frame, sample, age, options)
  }
  return true
}

function paintBurstParticle(
  frame: Frame,
  sample: ParticleSample,
  age: number,
  options: BurstPaint,
) {
  const { ctx, width, height } = frame
  const angle = options.direction + (sample.angle - 0.5) * options.spread
  const speed = options.speed * (0.65 + sample.speed * 0.55)
  const x = width * options.origin.x + (sample.x - 0.5) * 24 + Math.cos(angle) * speed * age
  const y =
    height * options.origin.y + Math.sin(angle) * speed * age + (options.gravity * age * age) / 2
  const size = 3 + sample.size * 7
  const ink = options.palette[sample.ink % options.palette.length] ?? FALLBACK[0]!
  const sprite = options.sprites[sample.ink % options.sprites.length]
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(sample.angle * Math.PI * 2 + sample.spin * 8 * age)
  ctx.globalAlpha = Math.min(1, (1 - age / options.duration) * 3)
  ctx.fillStyle = ink
  drawParticle(ctx, options.shape, { sample, size, sprite })
  ctx.restore()
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  shape: ParticleShape,
  part: { sample: ParticleSample; size: number; sprite?: HTMLImageElement | undefined },
) {
  const { sample, size, sprite } = part
  if (shape === 'sprite' && sprite?.complete && sprite.naturalWidth) {
    const scale = (size * 3) / Math.max(sprite.naturalWidth, sprite.naturalHeight)
    const width = sprite.naturalWidth * scale,
      height = sprite.naturalHeight * scale
    ctx.drawImage(sprite, -width / 2, -height / 2, width, height)
  } else if (shape === 'disk' || shape === 'dot' || sample.kind === 1) {
    ctx.beginPath()
    const width =
      shape === 'disk' ? size * (0.3 + 0.7 * Math.abs(Math.cos(sample.spin * 6))) : size / 2
    ctx.ellipse(0, 0, width, shape === 'disk' ? size : size / 2, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillRect(-size / 2, -size / 2, size, sample.kind === 2 ? size / 3 : size * 0.7)
  }
}

const wrap = (value: number) => value - Math.floor(value)

/** Paint a looping field with velocity given in canvas widths and heights per second. */
export function paintParticleField(
  frame: Frame,
  samples: ParticleSample[],
  options: {
    time: number
    velocity: ParticleOrigin
    palette: readonly string[]
  },
) {
  const { ctx, width, height } = frame
  const { time, velocity, palette } = options
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  for (const sample of samples) {
    const speed = 0.3 + sample.speed
    const x = wrap(sample.x + velocity.x * time * speed) * width
    const y = wrap(sample.y + velocity.y * time * speed) * height
    ctx.globalAlpha = 0.25 + sample.size * 0.45
    ctx.fillStyle = palette[sample.ink % palette.length] ?? FALLBACK[0]!
    ctx.beginPath()
    ctx.arc(x, y, 1 + sample.size * 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
