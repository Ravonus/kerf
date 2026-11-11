// The stage's director: the state behind one `<Stage>` and what it does each frame. It reads each section's
// position, keeps the active scene and its neighbours built, draws them and hands the governor its frame times.
import { state, untrack, type State } from '@weft-js/core'
import type { SurfaceBase } from '@weft-js/core/surface'
import type { Progress } from '@weft-js/scroll/timeline'
import { FULL, handover, sceneWindow, type Handover, type Levers } from '@weft-js/warp-core/scenes'
import { dissolve, heldAt, lookOf, postOf, type Fade } from './Stage-look'
import type {
  ActiveScene,
  SceneProps,
  StageBlend,
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
  levers: Levers
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
  root?: HTMLElement
}

function build(d: Director, entry: Entry) {
  entry.building = true
  const generation = d.generation
  d.queue = d.queue.then(async () => {
    try {
      if (!d.s || generation !== d.generation) return
      const live = await entry.props.use.build({
        surface: d.s,
        seed: entry.props.seed ?? entry.index,
        quality: d.levers,
      })
      const near = !d.active || Math.abs(entry.index - d.active.active) < 2
      if (generation !== d.generation || !near) return live.dispose()
      live.setQuality(d.levers)
      entry.live = live
      d.s.invalidate()
    } catch (error) {
      console.error(error)
    } finally {
      entry.building = false
    }
  })
}

/** Builds the active scene and its neighbours, nearest first, fetches one more ahead, and frees the rest. */
function keep(d: Director, h: Handover) {
  const ahead = (d.entries[h.active]?.scroll.velocity ?? 0) < 0 ? -1 : 1
  const want = sceneWindow(h.active, d.entries.length, ahead)
  for (const entry of d.entries)
    if (entry.live && !want.includes(entry.index)) {
      entry.live.dispose()
      entry.live = null
    }
  for (const i of want) if (!d.entries[i]!.live && !d.entries[i]!.building) build(d, d.entries[i]!)
  void d.entries[h.active + 2 * ahead]?.props.use.load?.()
}

/** Fades the canvas in over the posters once a scene has drawn, and out while the scene it wants is not built. */
function show(d: Director, drawn: boolean) {
  if (d.shown === drawn || !d.s) return
  d.shown = drawn
  d.s.el.style.opacity = drawn ? '1' : '0'
}

function look(d: Director, p: Handover, positions: readonly number[]) {
  const active = d.entries[p.active]!
  const post = postOf(active.props, active.live, positions[p.active]!)
  return lookOf(d.entries[p.to]!.props, {
    reduced: d.reduced,
    pointer: d.pointer,
    levers: d.levers,
    post,
  })
}

function draw(d: Director, h: Handover, positions: readonly number[]) {
  const frame = {
    pointer: d.pointer,
    velocity: (d.entries[h.active]?.scroll.velocity ?? 0) * 1000,
    time: d.s!.clock.seconds,
  }
  let p = h
  if (d.reduced) {
    const fade = dissolve(d.fade, h, performance.now(), (i) => !!d.entries[i]?.live)
    d.fade = fade.fade
    if (fade.moving) d.s!.invalidate()
    p = fade.shown
  }
  const holding = d.reduced || !!d.props.governor?.hold
  const pose = (i: number) => {
    const { live, props } = d.entries[i]!
    live?.at(heldAt(props, live, positions[i]!, holding), frame)
    return live
  }
  const a = pose(p.from)
  const b = p.to === p.from ? a : pose(p.to)
  const one = p.t < 0.5 ? a : b
  if (!d.blend) one?.render()
  // With a blend every frame goes through it, so a scene looks the same alone as in a hand-over.
  else if (a && b) d.blend.draw(a, b, p.t, look(d, p, positions))
  else if (one) d.blend.draw(one, one, 1, look(d, p, positions))
  show(d, !!one || !!(d.blend && a && b))
}

/** Writes where the page stands: `data-active` on the active section, and `onActive` when anything moved. */
function report(d: Director, h: Handover, positions: readonly number[]) {
  const was = d.active
  const now = { ...h, position: positions[h.active]! }
  if (was && was.active === now.active && was.t === now.t && was.position === now.position) return
  if (was?.active !== now.active) {
    d.entries[was?.active ?? -1]?.el.removeAttribute('data-active')
    d.entries[now.active]?.el.setAttribute('data-active', '')
    d.root?.setAttribute('data-active-scene', String(now.active))
  }
  d.active = now
  d.props.onActive?.(now)
}

/**
 * The governor's turn: frame times in, levers and pixel ratio out. A new clock frame inside the fps cap is skipped;
 * a repaint of the same frame (a scroll, a build, a seek) always draws.
 */
function govern(d: Director, frame: number) {
  const governor = d.props.governor
  if (!governor) return true
  if (frame !== d.frame) {
    if (frame - d.frame < 60 / governor.fps - 0.5) return false
    d.frame = frame
    const now = performance.now()
    if (d.last && now - d.last < 250) governor.frame(now - d.last)
    d.last = now
  }
  if (governor.levers !== d.levers) {
    d.levers = governor.levers
    for (const entry of d.entries) entry.live?.setQuality(d.levers)
  }
  const ratio = governor.pixelRatio(d.s!.size.value.width) * d.levers.renderScale
  if (Math.abs(ratio - d.dpr.value) >= 0.05) d.dpr.value = Math.round(ratio * 100) / 100
  return true
}

function tick(d: Director, frame: number) {
  if (!d.entries.length || !govern(d, frame)) return
  const positions = d.entries.map((entry) => entry.scroll.value)
  const h = handover(
    positions,
    d.entries.map((entry) => entry.props.hero ?? 1),
  )
  keep(d, h)
  report(d, h, positions)
  draw(d, h, positions)
}

/** The surface's setup: draw every frame; when the surface goes (unmount, lost context) free every scene. */
export function attach(d: Director, s: SurfaceBase) {
  d.s = s
  s.el.style.opacity = '0'
  void Promise.resolve(d.props.blend?.(s)).then((made) => {
    if (d.s === s && made) d.blend = made
    else made?.dispose?.()
  })
  // Untracked: the stage repaints on its own schedule, not when a box it reads changes.
  s.frame((time) => untrack(() => tick(d, time.frame)))
  s.invalidate()
  return () => {
    d.generation++
    d.s = null
    d.shown = null
    d.blend?.dispose?.()
    d.blend = null
    for (const entry of d.entries) {
      entry.live?.dispose()
      entry.live = null
      entry.building = false
    }
  }
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
    pointer: null,
    generation: 0,
    queue: Promise.resolve(),
    frame: -1e9,
    last: 0,
    active: null,
    fade: null,
    shown: null,
  }
}
