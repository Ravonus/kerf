import type { NavigateOptions } from '../router'
import { sharedFrames, sharedMarks, type SharedMark } from './shared-geometry'
let owner: symbol | undefined
/** A handoff's source is captured before currentPath changes, not at the later data commit. */
export function captureSharedElements(options: NavigateOptions['shared']) {
  if (
    options === false ||
    typeof Element.prototype.animate !== 'function' ||
    document.hidden ||
    !document.querySelector('[data-kerf-shared]') ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return
  const sources = new Map<string, SharedMark>(
    [...sharedMarks()].map(([name, value]) => [name, value.mark]),
  )
  if (!sources.size) return
  return new SharedElements(sources, options)
}
class SharedElements {
  readonly id = Symbol('shared-navigation')
  readonly animations = new Set<Animation>()
  readonly started = performance.now()
  readonly timing: KeyframeAnimationOptions
  constructor(
    readonly sources: Map<string, SharedMark>,
    options: NavigateOptions['shared'],
  ) {
    const duration = options && options.duration
    const easing = options && options.easing
    this.timing = {
      duration:
        duration !== undefined && duration !== false && Number.isFinite(duration)
          ? Math.max(0, Math.min(2000, duration))
          : 480,
      easing:
        easing && CSS.supports('animation-timing-function', easing)
          ? easing
          : 'cubic-bezier(.22,.8,.22,1)',
    }
    owner = this.id
    document.documentElement.dataset.kerfSharedActive = ''
    window.addEventListener('resize', this.cancel)
    document.addEventListener('visibilitychange', this.hidden)
  }
  get active() {
    return !!(this.sources.size || this.animations.size)
  }
  arrive() {
    if (performance.now() - this.started > 800) {
      this.finish()
      return
    }
    for (const [name, target] of sharedMarks()) {
      const source = this.sources.get(name)
      if (!source) continue
      this.sources.delete(name)
      const frames = sharedFrames(source, target.mark, getComputedStyle(target.element).transform)
      if (!frames) continue
      const animation = target.element.animate(frames, this.timing)
      this.animations.add(animation)
      void animation.finished
        .catch(() => {})
        .then(() => {
          this.animations.delete(animation)
          this.clean()
        })
    }
    this.clean()
  }
  finish() {
    this.sources.clear()
    this.clean()
  }
  hidden = () => {
    if (document.hidden) this.cancel()
  }
  cancel = () => {
    this.sources.clear()
    for (const animation of this.animations) animation.cancel()
    this.animations.clear()
    this.clean()
  }
  clean() {
    if (this.active) return
    window.removeEventListener('resize', this.cancel)
    document.removeEventListener('visibilitychange', this.hidden)
    if (owner === this.id) delete document.documentElement.dataset.kerfSharedActive
  }
}
