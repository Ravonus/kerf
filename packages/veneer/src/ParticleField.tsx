import { Canvas, type Frame } from './Canvas'
import { derived } from '@kerf-js/core'
import {
  particleInks,
  particleSamples,
  paintParticleField,
  type ParticleOrigin,
} from '@kerf-js/veneer-core/visuals'
import '@kerf-js/veneer-core/styles/components/particle-field.css'

/** Options for a decorative, looping particle field. */
export interface ParticleFieldProps {
  seed?: string | number | undefined
  /** Particle count in the field, capped at 512. */
  density?: number | undefined
  /** Motion in canvas widths and heights per second. */
  velocity?: ParticleOrigin | undefined
  palette?: readonly string[] | undefined
  paused?: boolean | undefined
  reducedMotion?: boolean | undefined
  [attr: string]: unknown
}

const DRIFT = { x: 0.025, y: -0.08 }

/** A seeded canvas background that pauses off screen and composes a still frame for reduced motion. */
export function ParticleField({
  seed = 0,
  density = 36,
  velocity = DRIFT,
  palette,
  paused,
  reducedMotion,
  ...rest
}: ParticleFieldProps) {
  const samples = derived(() => particleSamples(seed, density))
  let inks: string[] | undefined
  const painter = derived(() => {
    const values = samples.value
    const motion = velocity
    const colors = palette
    return (frame: Frame) => {
      inks ??= particleInks(frame.ctx.canvas)
      paintParticleField(frame, values, {
        time: frame.time,
        velocity: motion,
        palette: colors?.length ? colors : inks,
      })
    }
  })
  return (
    <div {...rest} data-scope="particle-field" aria-hidden="true">
      <Canvas
        draw={painter.value}
        animate={!paused && !reducedMotion}
        onTheme={() => {
          inks = undefined
        }}
      />
    </div>
  )
}
