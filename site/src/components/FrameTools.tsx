import { getDial } from '@kerf/veneer'
import { onMount } from '@kerf/core'
import { on } from '@kerf/core/browser'
import { PALETTE_NAMES } from '../lib/palettes'

const EXPRESSIONS = ['quiet', 'balanced', 'vivid']
const WIDTHS = ['full', 'tablet', 'phone']
const next = (list: string[], at: string | null) =>
  list[(list.indexOf(at ?? list[0]!) + 1) % list.length]!

/** The theme an element shows: its nearest `data-theme`, or the system's. */
function shownTheme(el: Element) {
  const set = el.closest('[data-theme]')?.getAttribute('data-theme')
  if (set === 'light' || set === 'dark') return set
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Sets one stage's width, which Veneer's scope attributes carry. */
function width(stage: HTMLElement, v: string) {
  if (v === 'full') {
    stage.removeAttribute('data-form')
    stage.removeAttribute('data-width')
  } else {
    stage.setAttribute('data-form', v)
    stage.setAttribute('data-width', v)
  }
}

/** One listener for every frame's corner buttons and its code fold, so a page of twenty frames runs no code per frame. */
export function FrameTools() {
  const click = (e: Event) => {
    const button = (e.target as Element).closest?.<HTMLElement>('[data-act^="stage-"]')
    const frame = button?.closest<HTMLElement>('[data-site="frame"]')
    if (!button || !frame) return
    const stage = frame.querySelector<HTMLElement>('[data-part="stage"]')!
    const act = button.getAttribute('data-act')
    if (act === 'stage-expression')
      stage.setAttribute(
        'data-expression',
        next(EXPRESSIONS, stage.getAttribute('data-expression') ?? getDial('expression')),
      )
    if (act === 'stage-theme') {
      // Always the other one of what the stage shows; the page's own one is the page again, so it follows the page.
      const t = shownTheme(stage) === 'dark' ? 'light' : 'dark'
      t === shownTheme(document.documentElement)
        ? stage.removeAttribute('data-theme')
        : stage.setAttribute('data-theme', t)
    }
    if (act === 'stage-palette') {
      // The next named theme; back round to the page's own, which is no attribute, so it follows the page again.
      const at = stage.getAttribute('data-palette') ?? 'kerf'
      const to = next(PALETTE_NAMES, at)
      to === 'kerf' ? stage.removeAttribute('data-palette') : stage.setAttribute('data-palette', to)
      button.setAttribute('title', `Palette: ${to}`)
    }
    if (act === 'stage-width')
      width(stage, next(WIDTHS, stage.getAttribute('data-width') ?? 'full'))
    if (act === 'stage-replay')
      frame.querySelector('[data-part="mount"]')?.dispatchEvent(new Event('stage:replay'))
    if (act === 'stage-view') {
      frame.toggleAttribute('data-code', button.getAttribute('data-view') === 'code')
      for (const b of frame.querySelectorAll('[data-act="stage-view"]'))
        b.setAttribute('aria-pressed', String(b === button))
    }
    if (act === 'stage-code')
      button.textContent = frame.toggleAttribute('data-open') ? 'Hide code' : 'View code'
  }
  onMount(() => on(document, 'click', click))
  return null
}
