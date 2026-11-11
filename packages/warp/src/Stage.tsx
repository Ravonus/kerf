// @weft-js/warp/scenes: one WebGL canvas pinned behind the whole page, and a scene per section drawn on it. The
// stage reads each section's scroll position, keeps the active scene and its neighbours built, hands over from one
// scene to the next, and owns the pixel ratio and frame rate. Scenes come from a renderer's bridge.
import { onCleanup, onMount, untrack } from '@weft-js/core'
import { defineSurface, Surface } from '@weft-js/core/surface'
import { progress } from '@weft-js/scroll/timeline'
import { attach, director, handleOf, type Director, type Entry } from './Stage-director'
import type { SceneProps, StageProps } from './Stage-types'

export type * from './Stage-types'

/** The key of a stage's `StageHandle` on its root element, `[data-stage]`: `root[Symbol.for('weft.stage')]`. */
export const STAGE = Symbol.for('weft.stage')

/** Each stage by its root element: a scene finds its stage by walking up the document. */
const STAGES = new WeakMap<Element, Director>()
const PINNED = 'position:sticky;top:0;height:100lvh;margin-bottom:-100lvh'
const COLOUR = /^(#|rgba?\(|hsla?\(|oklch\(|color\(|[a-z-]+-gradient\()/i

/** A poster's background: a colour or gradient as it is, anything else as an image URL. */
const backdrop = (poster = '') =>
  COLOUR.test(poster) ? poster : `center/cover no-repeat url("${poster.replaceAll('"', '%22')}")`

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

function root(d: Director, el: HTMLElement) {
  STAGES.set((d.root = el), d)
  Object.defineProperty(el, STAGE, { value: handleOf(d), configurable: true })
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
    <div ref={(el: HTMLElement) => root(d, el)} data-stage class={props.class}>
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
 * A section with a scene, inside a `<Stage>`. Its poster is pinned behind it while on screen: the page's first paint,
 * and what shows before the scene is built or without WebGL2. Its `--scene-position` is its scene's position.
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
      onChange: (value) => {
        el.style.setProperty('--scene-position', String(Math.round(value * 1e4) / 1e4))
        d.s?.invalidate()
      },
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
