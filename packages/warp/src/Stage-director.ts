// The stage's director: what one `<Stage>` does each frame. It reads each section's position, keeps the active scene
// and its neighbours built, draws them and hands the governor its frame times. It loads with the stage's surface, once
// the stage's tier is `live`; Stage-state holds what the page needs before then.
import { untrack } from '@weft-js/core'
import type { SurfaceBase } from '@weft-js/core/surface'
import { handover, sceneWindow, type Handover } from '@weft-js/warp-core/scenes'
import { dissolve, heldAt, lookOf, postOf } from './Stage-look'
import { lever, restOf, type Director, type Entry, type Hold } from './Stage-state'

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
      const centre = d.hold?.index ?? d.active?.active
      const near = centre === undefined || Math.abs(entry.index - centre) < 2
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

/** Draws the scenes the hand-over wants; false while one of them is not built or a dissolve is under way. */
function draw(d: Director, h: Handover, positions: readonly number[]) {
  const frame = {
    pointer: d.pointer,
    velocity: (d.entries[h.active]?.scroll.velocity ?? 0) * 1000,
    time: d.s!.clock.seconds,
  }
  let p = h
  let moving = false
  if (d.reduced) {
    const fade = dissolve(d.fade, h, performance.now(), (i) => !!d.entries[i]?.live)
    d.fade = fade.fade
    moving = fade.moving
    if (moving) d.s!.invalidate()
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
  // With a blend, a hand-over drawn with one scene is not the frame it wants: the other is still building.
  return !moving && !!(d.blend ? a && b : one)
}

/**
 * The ready signal: once every section's position has caught up with the scroll and the scenes it wants have
 * drawn, `data-stage-ready` on the root holds the scroll offset they were drawn at, and `onReady` is told.
 */
function settle(d: Director, drawn: boolean) {
  const calm = drawn && d.entries.every((entry) => entry.scroll.value === entry.scroll.target)
  const mark = calm ? String(Math.round(scrollY)) : null
  if (mark === d.ready) return
  d.ready = mark
  if (mark === null) return d.root?.removeAttribute('data-stage-ready')
  d.root?.setAttribute('data-stage-ready', mark)
  if (d.active) d.props.onReady?.(d.active)
}

/**
 * Draws the held scene alone once it is built and the canvas has its pixel ratio, through the blend as every live
 * frame is, and hands over its pixels. Without a position it stands at its `hold`, else at its rest.
 */
function hold(d: Director, held: Hold) {
  const s = d.s!
  keep(d, { active: held.index, from: held.index, to: held.index, t: 1 })
  const entry = d.entries[held.index]!
  const live = entry.live
  if (!live || s.dpr.value !== Math.min(devicePixelRatio, d.dpr.value)) return
  const position = held.position ?? heldAt(entry.props, live, restOf(entry), true)
  live.at(position, { pointer: null, velocity: 0, time: held.seconds })
  if (!d.blend) live.render()
  else {
    const post = postOf(entry.props, live, position)
    const page = { reduced: d.reduced, pointer: null, levers: d.levers, post }
    d.blend.draw(live, live, 1, lookOf(entry.props, page))
  }
  show(d, true)
  d.hold = null
  // Read in the task that drew it: the drawing buffer is cleared once the frame is shown.
  held.done(s.canvas.toDataURL('image/png'))
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
    // A seek can move the clock back: only a frame that moved forward inside the cap is skipped.
    if (frame > d.frame && frame - d.frame < 60 / governor.fps - 0.5) return false
    d.frame = frame
    const now = performance.now()
    if (d.last && now - d.last < 250) governor.frame(now - d.last)
    d.last = now
  }
  if (governor.levers !== d.given) lever(d, governor.levers)
  const ratio = governor.pixelRatio(d.s!.size.value.width) * d.levers.renderScale
  if (Math.abs(ratio - d.dpr.value) >= 0.05) d.dpr.value = Math.round(ratio * 100) / 100
  return true
}

function tick(d: Director, frame: number) {
  if (d.hold) return hold(d, d.hold)
  if (!d.entries.length || !govern(d, frame)) return
  const positions = d.entries.map((entry) => entry.scroll.value)
  const h = handover(
    positions,
    d.entries.map((entry) => entry.props.hero ?? 1),
  )
  keep(d, h)
  report(d, h, positions)
  settle(d, draw(d, h, positions))
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
