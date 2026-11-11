// @weft-js/warp/scenes: one WebGL canvas pinned behind the whole page, and a scene per section drawn on it. The
// stage reads each section's scroll position, keeps the active scene and its neighbours built, hands over from one
// scene to the next, and owns the pixel ratio and frame rate. Scenes come from a renderer's bridge.
import { onCleanup, onMount, state, untrack, type State } from '@weft-js/core'
import { progress } from '@weft-js/scroll/timeline'
import { isMobileDevice } from '@weft-js/warp-core'
import { PINNED, posterLayer, posterOf } from './Stage-poster'
import { director, handleOf, type Director, type Entry } from './Stage-state'
import type { SceneProps, StageProps } from './Stage-types'

export type * from './Stage-types'
export { bakedPosters } from './Stage-poster'

/** The key of a stage's `StageHandle` on its root element, `[data-stage]`: `root[Symbol.for('weft.stage')]`. */
export const STAGE = Symbol.for('weft.stage')

const STAGES = new WeakMap<Element, Director>()
/** The surface and its frames (Stage-live), once a stage on this page is live. */
let Live: (typeof import('./Stage-live'))['LiveSurface'] | undefined

/** `auto`'s answer: posters on a phone or tablet, or where the governor rates the device `low`. */
async function tierOf(d: Director) {
  const asked = d.props.tier ?? 'live'
  if (asked !== 'auto') return asked
  if (isMobileDevice()) return 'poster'
  await (d.started ??= d.props.governor?.start())
  return d.props.governor?.tier === 'low' ? 'poster' : 'live'
}

async function decide(d: Director, live: State<boolean>) {
  const tier = await tierOf(d)
  d.tier = tier
  d.root?.setAttribute('data-stage-tier', tier)
  if (tier === 'poster') return d.root?.setAttribute('data-stage-ready', 'poster')
  void (d.started ??= d.props.governor?.start())?.then(() => d.s?.invalidate())
  Live ??= (await import('./Stage-live')).LiveSurface
  live.value = true
}

function follow(d: Director) {
  const move = (e: PointerEvent) => {
    d.pointer = { x: (e.clientX / innerWidth) * 2 - 1, y: 1 - (e.clientY / innerHeight) * 2 }
  }
  const away = () => (d.pointer = null)
  addEventListener('pointermove', move, { passive: true })
  document.documentElement.addEventListener('pointerleave', away)
  onCleanup(() => {
    removeEventListener('pointermove', move)
    document.documentElement.removeEventListener('pointerleave', away)
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
  const d = untrack(() => director(props))
  // The surface comes once the page is up: it shows nothing before a scene has drawn, and on posters it never loads.
  const live = state(false)
  onMount(() => {
    follow(d)
    void decide(d, live)
  })
  return (
    <div ref={(el: HTMLElement) => root(d, el)} data-stage class={props.class}>
      <div data-stage-viewport style={`${PINNED};overflow:hidden;z-index:0`}>
        {live.value && Live ? <Live d={d} label={props.label} /> : null}
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
      {posterLayer(posterOf(props.poster, props.id))}
      {props.children}
    </section>
  )
}
