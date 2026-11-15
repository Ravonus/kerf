import { warmMediaStarts, type MediaWarmTarget } from './media-warm'

const entries = new Map<HTMLElement, MediaWarmTarget>()
const completed = new Set<string>()
let active: ReturnType<typeof warmMediaStarts> | undefined,
  timer: ReturnType<typeof setTimeout> | undefined
function update() {
  clearTimeout(timer)
  active?.cancel()
  timer = setTimeout(() => {
    const pending = [...entries.values()].filter((target) => !completed.has(target.url))
    active = pending.length ? warmMediaStarts(pending) : undefined
  }, 0)
}
/** One route-owned background queue for every standard Media placement, disposed with its last owner. */
export function registerMediaStart(element: HTMLElement, target: MediaWarmTarget) {
  entries.set(element, {
    ...target,
    onComplete: () => {
      completed.add(target.url)
      if (completed.size > 256) completed.delete(completed.values().next().value!)
      target.onComplete?.()
    },
    priority: () => {
      const box = element.getBoundingClientRect()
      return box.bottom < 0 ? -box.bottom : Math.max(0, box.top - innerHeight)
    },
  })
  update()
  return () => {
    entries.delete(element)
    update()
  }
}
