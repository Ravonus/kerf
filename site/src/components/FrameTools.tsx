import { getDial } from '@weft/warp'
import { onCleanup, onMount } from 'weft'
import { on } from 'weft/browser'

const EXPRESSIONS = ['quiet', 'balanced', 'vivid']
const THEMES = ['page', 'light', 'dark']
const WIDTHS = ['full', 'tablet', 'phone']
const next = (list: string[], at: string | null) => list[(list.indexOf(at ?? list[0]) + 1) % list.length]

/** Sets one stage's width, which warp's scope attributes carry. */
function width(stage: HTMLElement, v: string) {
  if (v === 'full') { stage.removeAttribute('data-form'); stage.removeAttribute('data-width') } else { stage.setAttribute('data-form', v); stage.setAttribute('data-width', v) }
}

/** The page's chrome stays neutral, so the reader's expression goes on each stage that hasn't been given its own. */
function follow() {
  const dial = getDial('expression')
  for (const stage of document.querySelectorAll<HTMLElement>('[data-site="frame"] [data-part="stage"]:not([data-pinned], [data-own])')) stage.setAttribute('data-expression', dial)
}

/** One listener for every frame's corner buttons and its code fold, so a page of twenty frames runs no code per frame. */
export function FrameTools() {
  const click = (e: Event) => {
    const button = (e.target as Element).closest?.<HTMLElement>('[data-act^="stage-"]')
    const frame = button?.closest<HTMLElement>('[data-site="frame"]')
    if (!button || !frame) return
    const stage = frame.querySelector<HTMLElement>('[data-part="stage"]')!
    const act = button.getAttribute('data-act')
    if (act === 'stage-expression') { stage.setAttribute('data-expression', next(EXPRESSIONS, stage.getAttribute('data-expression'))); stage.setAttribute('data-own', '') }
    if (act === 'stage-theme') { const t = next(THEMES, stage.getAttribute('data-theme') ?? 'page'); t === 'page' ? stage.removeAttribute('data-theme') : stage.setAttribute('data-theme', t) }
    if (act === 'stage-width') width(stage, next(WIDTHS, stage.getAttribute('data-width') ?? 'full'))
    if (act === 'stage-replay') frame.querySelector('[data-part="mount"]')?.dispatchEvent(new Event('stage:replay'))
    if (act === 'stage-code') button.textContent = frame.toggleAttribute('data-open') ? 'Hide code' : 'View code'
  }
  onMount(() => {
    follow()
    on(document, 'click', click)
    const seen = new MutationObserver(follow)
    seen.observe(document.documentElement, { attributes: true, attributeFilter: ['data-expression'] })
    const page = new MutationObserver(follow)
    page.observe(document.querySelector('main')!, { childList: true, subtree: true })
    onCleanup(() => { seen.disconnect(); page.disconnect() })
  })
  return null
}
