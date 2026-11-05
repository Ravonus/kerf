import type { Frame } from '../canvas'
import { reducedMotion } from '../motion'
import { FIELDS, sample, stepFor } from './fields'
import { quantize } from './quantize'
import { composeField, igniteField } from './field-compose'
import type { FieldState } from './field-state'

type FieldDrawContext = {
  v: FieldState
  host: HTMLElement
  grow: (w: number, h: number) => void
  retheme: () => void
  speedOf: () => number
  moves: () => boolean
  reveal: (time: number) => boolean
}

export function drawField({ ctx, width, height, time, dt }: Frame, c: FieldDrawContext) {
  const { v, host, grow, retheme, speedOf, moves, reveal } = c
  if (width !== v.cols || height !== v.rows) grow(width, height)
  if (!v.inks.length) retheme()
  if (!v.cells || !v.image) return
  const speed = speedOf(),
    moving = speed > 0 && !reducedMotion(host)
  v.clock += (time - v.seen) * speed * 2 // a change of speed carries on from here, with no jump
  v.seen = time
  if (moving || !v.fresh) {
    const f = v.o.kind ?? 'weave',
      own = typeof f === 'function'
    sample(
      own ? f : FIELDS[f],
      v.cols,
      v.rows,
      (v.o.seed ?? 12) + v.clock,
      v.tones,
      own && !v.o.smooth ? 1 : stepFor(v.cells),
    )
    v.fresh = true
  }
  const active = v.push?.step(dt) ?? false
  v.hot = composeField(
    time,
    active,
    v.o,
    v.dials,
    v.mask,
    v.push,
    v.ground,
    moves,
    host,
    v.rows,
    v.cols,
    v.tones,
    v.shown,
    v.heat,
  )
  let changed = quantize(v.shown, v.cols, v.rows, v.pattern, v.inks, v.out, v.o.spread ?? 0.9)
  if (v.sparks && (v.hot || active)) {
    igniteField(v.inks, v.pattern, v.o.spread, v.rows, v.cols, v.heat, v.shown, v.out, v.sparks)
    changed = 1
  }
  if (changed || !v.painted) {
    ctx.putImageData(v.image, 0, 0)
    v.painted = true
  }
  if (host.getAttribute('data-state') !== 'live') host.setAttribute('data-state', 'live')
  return active || (reveal(time) && moves())
}
