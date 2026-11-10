// For pages without a framework: turn an element into a scroll area in place.
import { scroller } from './scroller'
import type { ScrollOptions, Scroller } from './types'

/**
 * Make `el` a scroll area without writing the markup: its children move into a viewport and content wrapper, `el`
 * becomes the root. `destroy` puts them back.
 */
export function wrap(el: HTMLElement, options: ScrollOptions = {}): Scroller {
  const viewport = document.createElement('div')
  viewport.dataset.part = 'viewport'
  const content = document.createElement('div')
  content.dataset.part = 'content'
  content.append(...el.childNodes)
  viewport.append(content)
  el.append(viewport)
  const s = scroller(el, options)
  return {
    ...s,
    destroy() {
      s.destroy()
      el.append(...content.childNodes)
      viewport.remove()
      delete el.dataset.scroll
    },
  }
}
