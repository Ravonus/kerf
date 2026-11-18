import { derived, omit, onMount, state, watch } from '@kerf-js/core'
import {
  particleInks,
  particleSamples,
  paintBurst,
  visualCount,
  type ParticleOrigin,
  type ParticleShape,
  type ParticleSprite,
} from '@kerf-js/veneer-core/visuals'
import { For } from '@kerf-js/core/dom'
import { Canvas, type Frame } from './Canvas'
import '@kerf-js/veneer-core/styles/components/particle-burst.css'

/** A finite, decorative burst. Other attributes land on its wrapper. */
export interface ParticleBurstProps {
  seed?: string | number | undefined
  count?: number | undefined
  palette?: readonly string[] | undefined
  /** Fractions of the canvas width and height from its top left. */
  origin?: ParticleOrigin | undefined
  /** Lifetime of each volley in milliseconds. */
  duration?: number | undefined
  /** Total count is distributed across these volleys. */
  volleys?: number | undefined
  volleyGap?: number | undefined
  /** Initial speed in CSS pixels per second. */
  speed?: number | undefined
  gravity?: number | undefined
  /** Emission angle in radians, centered on the upward direction. */
  spread?: number | undefined
  /** Center angle in radians. Negative pi over two points upward. */
  direction?: number | undefined
  /** Changing this key restarts a mounted burst. */
  replayKey?: string | number | undefined
  particle?: ParticleShape | undefined
  sprites?: readonly ParticleSprite[] | undefined
  /** Set to false and back to true to replay. */
  active?: boolean | undefined
  reducedMotion?: boolean | undefined
  [attr: string]: unknown
}

const BOTTOM = { x: 0.5, y: 0.98 }

/** Seeded confetti, disks or sprites with optional staggered volleys. */
export function ParticleBurst({ active = true, replayKey = 0, ...rest }: ParticleBurstProps) {
  return (
    <div data-scope="particle-burst" aria-hidden="true" {...omit(rest, KEYS)}>
      <For each={active ? [replayKey] : []} by={(key) => key}>
        {() => <Burst {...rest} />}
      </For>
    </div>
  )
}

const KEYS = [
  'seed',
  'count',
  'palette',
  'origin',
  'duration',
  'volleys',
  'volleyGap',
  'speed',
  'gravity',
  'spread',
  'direction',
  'particle',
  'sprites',
  'reducedMotion',
]

function finiteSeconds(value: number | undefined, fallback: number) {
  return (value !== undefined && Number.isFinite(value) ? value : fallback) / 1000
}

function Burst(props: ParticleBurstProps) {
  const done = state(false)
  const pictures = state<HTMLImageElement[]>([])
  let inks: string[] | undefined
  onMount(() =>
    watch(
      () => props.sprites,
      (sprites) => {
        const images = (sprites?.slice(0, 64) ?? []).map(({ src }) => {
          const image = new Image()
          image.decoding = 'async'
          image.onload = () => {
            pictures.value = [...images]
          }
          image.src = src
          return image
        })
        pictures.value = images
        return () => {
          for (const image of images) {
            image.onload = null
            image.removeAttribute('src')
          }
        }
      },
    ),
  )
  const painter = derived(() => {
    const samples = particleSamples(props.seed ?? 0, props.count ?? 48)
    const duration = Math.max(0.001, finiteSeconds(props.duration, 2400))
    const reduced = props.reducedMotion
    const palette = props.palette
    const options: Omit<Parameters<typeof paintBurst>[3], 'palette'> = {
      origin: props.origin ?? BOTTOM,
      duration,
      volleys: Math.max(1, visualCount(props.volleys ?? 1, Math.min(samples.length, 16))),
      gap: Math.max(0, finiteSeconds(props.volleyGap, 620)),
      speed: props.speed ?? 460,
      gravity: props.gravity ?? 460,
      spread: props.spread ?? Math.PI * 0.85,
      direction: props.direction ?? -Math.PI / 2,
      shape: props.particle ?? (props.sprites?.length ? 'sprite' : 'confetti'),
      sprites: pictures.value,
    }
    return (frame: Frame) => {
      if (done.value) return
      if (!samples.length) {
        frame.ctx.clearRect(0, 0, frame.width, frame.height)
        done.value = true
        return
      }
      inks ??= particleInks(frame.ctx.canvas)
      const remaining = paintBurst(
        frame,
        samples,
        frame.still || reduced ? Math.min(0.18, duration / 2) : frame.time,
        {
          ...options,
          palette: palette?.length ? palette : inks,
        },
      )
      if (!remaining) done.value = true
    }
  })
  return (
    <Canvas
      draw={painter.value}
      animate={!done.value && !props.reducedMotion}
      onTheme={() => {
        inks = undefined
      }}
    />
  )
}
