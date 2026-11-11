// What a stage frame looks like, apart from the page: the reduced-motion dissolve into a new active scene, the active
// section's pass, a held scene's position, and the hand-over's look as the incoming scene asks for it.
import type { Handover, Levers } from '@kerf-js/veneer-core/scenes'
import type { BlendOptions, SceneLook, StagePointer, StagePost, StageScene } from './Stage-types'

/** How long the reduced-motion dissolve into a new active scene lasts, in ms. */
export const DISSOLVE = 300

/** A dissolve from one active scene to the next, started at `start` ms. */
export interface Fade {
  readonly from: number
  readonly to: number
  readonly start: number
}

/**
 * Under reduced motion the scroll moves no hand-over: the active scene shows, and a change of active scene dissolves
 * into it over `DISSOLVE` ms while the one before is still `built`. `fade` is the last call's, null at first.
 */
export function dissolve(
  fade: Fade | null,
  h: Handover,
  now: number,
  built: (i: number) => boolean,
) {
  const next =
    fade?.to === h.active ? fade : { from: fade?.to ?? h.active, to: h.active, start: now }
  const t = (now - next.start) / DISSOLVE
  const alone = { ...h, from: h.active, to: h.active, t: 1 }
  if (t >= 1 || next.from === next.to || !built(next.from))
    return { fade: next, shown: alone, moving: false }
  return { fade: next, shown: { ...h, from: next.from, t }, moving: true }
}

/** The active section's pass: its `post` values, under what its scene's tracks give. */
export function postOf(
  look: SceneLook,
  live: StageScene | null,
  position: number,
): StagePost | null {
  const values = typeof look.post === 'function' ? look.post(position) : look.post
  const tracked = live?.post
  return values || tracked ? { ...values, ...tracked } : null
}

/** Where a scene is posed: its `hold` when the page holds scenes still and it has one, else its scroll position. */
export function heldAt(
  look: SceneLook,
  live: StageScene | null,
  position: number,
  holding: boolean,
) {
  const hold = look.hold ?? live?.hold
  return holding && hold !== undefined ? hold : position
}

/** The page's side of a frame's look. */
export interface Page {
  readonly reduced: boolean
  readonly pointer: StagePointer | null
  readonly levers: Levers
  readonly post: StagePost | null
}

/** A frame's look: the incoming scene's hand-over, plain under reduced motion, and the page's levers and pass. */
export function lookOf(incoming: SceneLook, page: Page): BlendOptions {
  return {
    mode: page.reduced ? 'fade' : (incoming.mode ?? 'noise'),
    pointer: page.pointer,
    centre: incoming.centre ?? null,
    lines: !page.reduced && incoming.lines !== false,
    levers: page.levers,
    post: page.post,
  }
}
