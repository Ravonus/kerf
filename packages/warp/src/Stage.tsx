// @weft-js/warp/scenes: one WebGL canvas pinned behind the whole page, and a scene per section drawn on it. The
// stage reads each section's scroll position, keeps the active scene and its neighbours built, hands over from one
// scene to the next, and owns the pixel ratio and frame rate. Scenes come from a renderer's bridge.
import { onCleanup, onMount, state, untrack, type State } from '@weft-js/core'
import { defineSurface, Surface, type SurfaceBase } from '@weft-js/core/surface'
import { progress, type Progress } from '@weft-js/scroll/timeline'
import { FULL, handover, sceneWindow, type Handover, type Levers } from '@weft-js/warp-core/scenes'
import type {
  ActiveScene,
  StageBlend,
  StageGovernor,
  StagePointer,
  StageScene,
  StageSceneDef,
} from './Stage-types'

export type * from './Stage-types'

/** `<Stage>`'s props. */
export interface StageProps {
  /** What the scenes show, for assistive tech. */
  label: string
  /** The surface kind the scenes draw on. Default `keel-lit`. */
  kind?: string
  /** Device tier, render scale, pixel ratio and fps cap. Without one: full levers, 60 fps, ratio up to 2. */
  governor?: StageGovernor
  /** The hand-over blend, made once the surface is up. Without one the stage cuts at the switch. */
  blend?: (surface: SurfaceBase) => StageBlend | Promise<StageBlend>
  /** Called when the active scene, its position or the hand-over moves. */
  onActive?: (active: ActiveScene) => void
  class?: string
  children?: unknown
}

/** `<Scene>`'s props. */
export interface SceneProps {
  use: StageSceneDef
  /** A colour or an image URL, shown until the scene draws, and where it can't. */
  poster?: string
  /** How many viewports the blend into this scene lasts. Default 1. */
  hero?: number
  /** How many viewports before the section enters its position starts. Default 0.2. */
  early?: number
  seed?: number
  /** How the hand-over into this scene looks. Default `noise`. */
  mode?: 'noise' | 'radial'
  id?: string
  class?: string
  label?: string
  children?: unknown
}

interface Entry {
  /** Its place among the stage's scenes, in document order. */
  index: number
  readonly props: SceneProps
  readonly el: HTMLElement
  readonly scroll: Progress
  live: StageScene | null
  building: boolean
}

interface Director {
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
  /** Whether the canvas shows, so a still frame writes nothing. */
  shown: boolean | null
  root?: HTMLElement
}

/** Each stage by its root element: a scene finds its stage by walking up the document. */
const STAGES = new WeakMap<Element, Director>()
const PINNED = 'position:sticky;top:0;height:100lvh;margin-bottom:-100lvh'
const COLOUR = /^(#|rgba?\(|hsla?\(|oklch\(|color\(|[a-z-]+-gradient\()/i

/** A poster's background: a colour or gradient as it is, anything else as an image URL. */
const backdrop = (poster = '') =>
  COLOUR.test(poster) ? poster : `center/cover no-repeat url("${poster.replaceAll('"', '%22')}")`

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

function draw(d: Director, h: Handover, positions: readonly number[]) {
  const frame = {
    pointer: d.pointer,
    velocity: (d.entries[h.active]?.scroll.velocity ?? 0) * 1000,
    time: d.s!.clock.seconds,
  }
  const a = d.entries[h.from]!.live
  const b = d.entries[h.to]!.live
  const cut = h.t < 0.5 ? h.from : h.to
  if (h.from !== h.to && a && b && d.blend) {
    a.at(positions[h.from]!, frame)
    b.at(positions[h.to]!, frame)
    const mode = d.reduced ? 'fade' : (d.entries[h.to]!.props.mode ?? 'noise')
    d.blend.draw(a, b, h.t, { mode, pointer: d.pointer, lines: !d.reduced })
    return show(d, true)
  }
  const one = d.entries[cut]!.live
  one?.at(positions[cut]!, frame)
  one?.render()
  show(d, !!one)
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
function attach(d: Director, s: SurfaceBase) {
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

function follow(d: Director) {
  const move = (e: PointerEvent) => {
    d.pointer = { x: (e.clientX / innerWidth) * 2 - 1, y: 1 - (e.clientY / innerHeight) * 2 }
  }
  const away = () => (d.pointer = null)
  addEventListener('pointermove', move, { passive: true })
  document.documentElement.addEventListener('pointerleave', away)
  void d.props.governor?.start().then(() => d.s?.invalidate())
  onCleanup(() => {
    removeEventListener('pointermove', move)
    document.documentElement.removeEventListener('pointerleave', away)
  })
}

/** The stage's one surface. Its kind is read once: a stage keeps its surface for life. */
function surfaceOf(d: Director) {
  return defineSurface({
    name: 'stage',
    kind: d.props.kind ?? 'keel-lit',
    maxDpr: d.dpr,
    setup: (s) => attach(d, s),
  })
}

function director(props: StageProps): Director {
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
    shown: null,
  }
}

/**
 * One canvas pinned behind the page for every `<Scene>` inside it. Sections scroll over it at full speed; the
 * active section's scene draws, and the next one blends in as its section arrives.
 */
export function Stage(props: StageProps) {
  // The director keeps the live props and reads each where it is used.
  const d = untrack(() => director(props))
  const def = surfaceOf(d)
  onMount(() => follow(d))
  return (
    <div ref={(el: HTMLElement) => STAGES.set((d.root = el), d)} data-stage class={props.class}>
      <div data-stage-viewport style={`${PINNED};overflow:hidden;z-index:0`}>
        <Surface
          use={def}
          label={props.label}
          style="position:absolute;inset:0;aspect-ratio:auto;transition:opacity .3s"
        />
      </div>
      <div style="position:relative">{props.children}</div>
    </div>
  )
}

/** Adds a scene to its stage, keeping the stage's scenes in document order. */
function enter(d: Director, entry: Entry) {
  d.entries.push(entry)
  d.entries.sort((a, b) => (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1))
  d.entries.forEach((each, i) => {
    each.index = i
    each.el.dataset.scene = String(i)
  })
  d.s?.invalidate()
  onCleanup(() => {
    d.entries.splice(d.entries.indexOf(entry), 1)
    entry.live?.dispose()
    entry.scroll.destroy()
  })
}

/**
 * A section with a scene, inside a `<Stage>`. Its poster is pinned behind it while it is on screen: the page's
 * first paint, and what shows without WebGL2 or before the scene is built.
 */
export function Scene(props: SceneProps) {
  let el!: HTMLElement
  onMount(() => {
    const d = STAGES.get(el.closest('[data-stage]')!)
    if (!d) throw new Error('weft: <Scene> must be inside a <Stage>.')
    const scroll = progress(el, {
      range: 'scene',
      early: props.early ?? 0.2,
      damp: 0.5,
      touch: 'raw',
      onChange: () => d.s?.invalidate(),
    })
    // The entry keeps the live props: the stage reads `use`, `hero` and `mode` where it needs them.
    enter(
      d,
      untrack(() => ({ index: 0, props, el, scroll, live: null, building: false })),
    )
  })
  return (
    <section
      ref={(e: HTMLElement) => (el = e)}
      id={props.id}
      class={props.class}
      aria-label={props.label}
    >
      {props.poster ? (
        <div
          data-scene-poster
          aria-hidden="true"
          style={`${PINNED};z-index:-1;background:${backdrop(props.poster)}`}
        ></div>
      ) : null}
      {props.children}
    </section>
  )
}
