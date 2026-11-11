// The state behind one `<Stage>`, and the handle a driver outside the page reaches it by. What the stage does each
// frame is Stage-director's, which loads with the stage's surface once its tier is `live`.
import { state, type State } from '@weft-js/core'
import { clock, type SurfaceBase } from '@weft-js/core/surface'
import { progressOf, type Progress } from '@weft-js/scroll/timeline'
import { FULL, type Levers } from '@weft-js/warp-core/scenes'
import type { Fade } from './Stage-look'
import type {
  ActiveScene,
  SceneProps,
  StageBlend,
  StageHandle,
  StagePointer,
  StageProps,
  StageScene,
} from './Stage-types'

export interface Entry {
  /** Its place among the stage's scenes, in document order. */
  index: number
  readonly props: SceneProps
  readonly el: HTMLElement
  readonly scroll: Progress
  live: StageScene | null
  building: boolean
}

export interface Director {
  readonly props: StageProps
  readonly entries: Entry[]
  readonly dpr: State<number>
  readonly reduced: boolean
  s: SurfaceBase | null
  blend: StageBlend | null
  /** The levers in force: the governor's, without TAA once a driver has frozen the stage. */
  levers: Levers
  /** The governor's levers, as given. */
  given: Levers
  /** Set once a driver freezes the clock: each frame from then on depends on nothing drawn before it. */
  frozen: boolean
  pointer: StagePointer | null
  /** Bumped when the surface goes, so a build that finishes after it is thrown away. */
  generation: number
  queue: Promise<void>
  /** The clock frame and the time it was last drawn, for the fps cap and the governor's frame times. */
  frame: number
  last: number
  active: ActiveScene | null
  /** Under reduced motion, the timed dissolve into the active scene. */
  fade: Fade | null
  /** Whether the canvas shows, so a still frame writes nothing. */
  shown: boolean | null
  /** A still being made: it replaces the scroll's scenes until it is drawn. */
  hold: Hold | null
  /** Which tier the stage draws on; null until `auto` decides. */
  tier: 'live' | 'poster' | null
  /** The governor's `start`, once asked. */
  started?: Promise<void> | undefined
  /** The scroll offset of the last settled frame, written as `data-stage-ready`; null while moving. */
  ready: string | null
  root?: HTMLElement
}

/** One scene drawn alone at a position and clock time, and who waits for its pixels. */
export interface Hold {
  readonly index: number
  readonly position: number | undefined
  readonly seconds: number
  readonly done: (png: string) => void
}

/** A scene's position when its section's top meets the viewport's top. */
export function restOf(entry: Entry) {
  const height = entry.el.getBoundingClientRect().height
  return progressOf({ top: 0, height }, innerHeight, 'scene', entry.props.early ?? 0.2)
}

/** Puts the governor's levers in force, with TAA off on a frozen stage: its history would carry earlier frames over. */
export function lever(d: Director, given: Levers) {
  d.given = given
  d.levers = d.frozen && given.taa ? { ...given, taa: false } : given
  for (const entry of d.entries) entry.live?.setQuality(d.levers)
}

/** Stops the shared clock at `seconds` for a driver, and redraws: the same scroll now draws the same frame. */
function freeze(d: Director, seconds: number) {
  clock.pause()
  clock.seek(seconds)
  if (!d.frozen) {
    d.frozen = true
    lever(d, d.given)
  }
  d.s?.invalidate()
}

/** Freezes the stage at `seconds` and draws scene `index` alone: a poster's pixels. */
export function still(d: Director, index: number, position: number | undefined, seconds: number) {
  if (!d.s) return Promise.reject(new Error('weft: the stage draws no scenes on this tier.'))
  if (!d.entries[index]) return Promise.reject(new Error(`weft: the stage has no scene ${index}.`))
  return new Promise<string>((done) => {
    freeze(d, seconds)
    d.ready = null
    d.root?.removeAttribute('data-stage-ready')
    d.hold = { index, position, seconds, done }
    d.dpr.value = devicePixelRatio
    d.s!.invalidate()
  })
}

export function director(props: StageProps): Director {
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const device = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
  return {
    props,
    entries: [],
    dpr: state(Math.min(device, 2)),
    reduced,
    s: null,
    blend: null,
    levers: FULL,
    given: FULL,
    frozen: false,
    pointer: null,
    generation: 0,
    queue: Promise.resolve(),
    frame: -1e9,
    last: 0,
    active: null,
    fade: null,
    shown: null,
    hold: null,
    tier: props.tier === 'auto' ? null : (props.tier ?? 'live'),
    ready: null,
  }
}

/** What a driver outside the page reaches the stage by: its scenes, a frozen clock and stills. */
export function handleOf(d: Director): StageHandle {
  return {
    get tier() {
      return d.tier
    },
    scenes: () =>
      d.entries.map((entry) => ({
        index: entry.index,
        id: entry.props.id ?? null,
        bake: entry.props.poster === 'bake',
        rest: restOf(entry),
      })),
    freeze: (seconds) => freeze(d, seconds),
    still: (index, position, seconds = 0) => still(d, index, position, seconds),
  }
}
