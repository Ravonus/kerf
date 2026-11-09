// @weft-js/warp-core/motion: enter/exit presets on WAAPI, timed from warp's motion tokens and always honouring reduced
// motion (PLAN §6.1, 00 §8). Exits are 70% of the enter, travel half the distance, and continue the entry's direction.

/** The entrance presets. */
export type Preset =
  | 'fade'
  | 'rise'
  | 'pop'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'

/** True under `prefers-reduced-motion` or a `data-motion="reduce"` scope (and false under `data-motion="full"`). */
export function reducedMotion(el?: Element | null): boolean {
  const scope = el?.closest('[data-motion]')?.getAttribute('data-motion')
  if (scope) return scope === 'reduce'
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

const token = (el: Element, name: string, fallback: number) => {
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return v.endsWith('ms')
    ? parseFloat(v)
    : v.endsWith('px')
      ? parseFloat(v)
      : v
        ? parseFloat(v) * (v.endsWith('s') ? 1000 : 1)
        : fallback
}

function frames(preset: Preset, d: number, scale: number): Keyframe[] {
  const t = (x: number, y: number) => `translate(${x}px, ${y}px)`
  switch (preset) {
    case 'fade':
      return [{ opacity: 0 }, { opacity: 1 }]
    case 'rise':
      return [
        { opacity: 0, transform: t(0, d) },
        { opacity: 1, transform: 'none' },
      ]
    case 'pop':
      return [
        { opacity: 0, transform: `scale(${scale})` },
        { opacity: 1, transform: 'none' },
      ]
    case 'slide-left':
      return [{ transform: 'translateX(-100%)' }, { transform: 'none' }]
    case 'slide-right':
      return [{ transform: 'translateX(100%)' }, { transform: 'none' }]
    case 'slide-up':
      return [{ transform: 'translateY(100%)' }, { transform: 'none' }]
    case 'slide-down':
      return [{ transform: 'translateY(-100%)' }, { transform: 'none' }]
  }
}

/** Animate `el` in. Resolves when done; under reduced motion it is a 120 ms fade with no travel. */
export function enter(el: HTMLElement, preset: Preset = 'rise'): Promise<void> {
  if (typeof el.animate !== 'function') return Promise.resolve()
  const reduce = reducedMotion(el)
  const ms = reduce
    ? 120
    : token(el, preset.startsWith('slide') ? '--warp-duration-slow' : '--warp-duration-base', 200)
  const kf = reduce
    ? frames('fade', 0, 1)
    : frames(preset, token(el, '--warp-motion-distance', 8), 0.97)
  return el
    .animate(kf, { duration: ms, easing: reduce ? 'linear' : 'cubic-bezier(.16,1,.3,1)' })
    .finished.then(
      () => {},
      () => {},
    )
}

/** Animate `el` out (70% of the enter, ease-in, half the travel, same direction as it came in). */
export function exit(el: HTMLElement, preset: Preset = 'rise'): Promise<void> {
  if (typeof el.animate !== 'function') return Promise.resolve()
  const reduce = reducedMotion(el)
  const ms =
    (reduce
      ? 120
      : token(
          el,
          preset.startsWith('slide') ? '--warp-duration-slow' : '--warp-duration-base',
          200,
        )) * 0.7
  let kf: Keyframe[]
  if (reduce) kf = [{ opacity: 1 }, { opacity: 0 }]
  else if (preset === 'rise')
    kf = [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: `translateY(${-token(el, '--warp-motion-distance', 8) / 2}px)` },
    ]
  else kf = frames(preset, token(el, '--warp-motion-distance', 8) / 2, 0.97).reverse()
  return el
    .animate(kf, { duration: ms, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' })
    .finished.then(
      () => {},
      () => {},
    )
}

/** Stagger delay for the nth entering item: `stagger × min(index, 6)` so a list never takes more than ~300 ms. */
export const stagger = (el: Element, index: number) =>
  reducedMotion(el) ? 0 : token(el, '--warp-stagger', 32) * Math.min(index, 6)

const leaving = new WeakMap<Element, () => void>()

/**
 * The close contract every warp overlay keeps, and the hook for your own exits: `data-state="closed"` goes on, the
 * animation or transition the CSS gives that state plays out, and only then does `done` hide the element. With
 * nothing to play (no rule, reduced motion with none, a test DOM) `done` runs at once. `stay()` cancels a pending
 * leave when the element opens again before it finishes.
 */
export function leave(el: HTMLElement, done: () => void): void {
  stay(el)
  el.dataset.state = 'closed'
  const playing = el.getAnimations?.() ?? []
  let live = true
  let cap: ReturnType<typeof setTimeout> | undefined
  const finish = () => {
    if (!live) return
    live = false
    clearTimeout(cap)
    leaving.delete(el)
    if (el.dataset.state === 'closed') delete el.dataset.state
    done()
  }
  if (playing.length === 0) return finish()
  // a cap at the longest exit plus a frame or two, so a paused timeline (a hidden tab) or an endless animation can
  // never hold an overlay open
  const end = Math.max(...playing.map((a) => Number(a.effect?.getComputedTiming().endTime) || 0))
  cap = setTimeout(finish, Math.min(Number.isFinite(end) ? end + 50 : 1000, 1000))
  leaving.set(el, () => {
    live = false
    clearTimeout(cap)
  })
  void Promise.allSettled(playing.map((a) => a.finished)).then(finish)
}

/** Cancels a pending `leave()`: the element stays as it is, still open. True if one was pending. */
export function stay(el: Element): boolean {
  const cancel = leaving.get(el)
  if (!cancel) return false
  cancel()
  leaving.delete(el)
  return true
}
