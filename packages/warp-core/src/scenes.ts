// @weft-js/warp-core/scenes: the arithmetic of a page whose sections share one pinned scene canvas: which scene is
// on, which two blend and how far, and which to keep built. Pure, so it is tested without a page.

/** What a page lets its scenes spend. The page owns them and hands them to each scene. */
export interface Levers {
  /** Pixels drawn, as a share of the canvas's width and height. */
  readonly renderScale: number
  readonly bloom: boolean
  /** The share of particles drawn, 0 to 1. */
  readonly motes: number
  /** The outgoing scene's render scale during a hand-over. */
  readonly blendScale: number
  readonly taa: boolean
  /** The share of instanced detail drawn, 0 to 1. */
  readonly density: number
}

/** Everything at full: the levers before a governor answers, or without one. */
export const FULL: Levers = {
  renderScale: 1,
  bloom: true,
  motes: 1,
  blendScale: 1,
  taa: true,
  density: 1,
}

/** Where the page stands among its scenes. */
export interface Handover {
  /** The scene that owns the page: theme, pointer and navigation. It moves to the incoming at `t` = 0.5. */
  readonly active: number
  /** The outgoing scene, or the one shown when nothing blends. */
  readonly from: number
  /** The incoming scene; equal to `from` when nothing blends. */
  readonly to: number
  /** How far the hand-over has gone, 0 to 1; 1 when nothing blends. */
  readonly t: number
}

/**
 * The hand-over at these positions: each scene's position in viewports since its section began to enter (0
 * until then), in page order, and each one's hero height in viewports (1 where left out): `t = position / hero`.
 */
export function handover(positions: readonly number[], heroes: readonly number[] = []): Handover {
  let to = 0
  for (let i = positions.length - 1; i > 0; i--)
    if (positions[i]! > 0) {
      to = i
      break
    }
  const t = to === 0 ? 1 : Math.min(1, positions[to]! / (heroes[to] ?? 1))
  return { active: t >= 0.5 ? to : to - 1, from: t < 1 ? to - 1 : to, to, t }
}

/**
 * The scenes to keep built, nearest first: the active one, its neighbour `ahead` (1 scrolling down, -1 up), then
 * the other. A scene left out, two or more away, is disposed.
 */
export function sceneWindow(active: number, count: number, ahead: 1 | -1 = 1): number[] {
  return [active, active + ahead, active - ahead].filter((i) => i >= 0 && i < count)
}
