import { Segmented } from '@weft/warp'
import { onMount, state } from 'weft'
import { on } from 'weft/browser'

type Scope = { expression: string; theme: string; width: string }
const KEY = 'weft:stages'
const EXPRESSIONS = ['quiet', 'balanced', 'vivid']
const THEMES = ['page', 'light', 'dark']
const WIDTHS = ['full', 'tablet', 'phone']
const titled = (v: string) => v[0].toUpperCase() + v.slice(1)
const opts = (list: string[]) => list.map(value => ({ value, label: titled(value) }))
const EXPRESSION_OPTIONS = opts(EXPRESSIONS)
const THEME_OPTIONS = opts(THEMES)
const WIDTH_OPTIONS = opts(WIDTHS)

const read = (): Partial<Scope> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

/** Writes warp's scope attributes on one stage. No component re-renders: the tokens and icons read the nearest attribute. */
function apply(stage: HTMLElement, s: Partial<Scope>) {
  if (s.expression) stage.setAttribute('data-expression', s.expression)
  if (s.theme) s.theme === 'page' ? stage.removeAttribute('data-theme') : stage.setAttribute('data-theme', s.theme)
  if (s.width) {
    if (s.width === 'full') { stage.removeAttribute('data-form'); stage.removeAttribute('data-width') } else { stage.setAttribute('data-form', s.width); stage.setAttribute('data-width', s.width) }
  }
}

const next = (list: string[], at: string | null) => list[(list.indexOf(at ?? list[0]) + 1) % list.length]

/**
 * The bar over a page's stages: expression, theme and width, for all of them at once and remembered between pages, under
 * its own key so a stage's setting never re-themes the site. It also handles each frame's own buttons, by one listener.
 */
export function StageBar() {
  const scope = state<Scope>({ expression: 'vivid', theme: 'page', width: 'full' })
  const all = () => document.querySelectorAll<HTMLElement>('[data-site="frame"] [data-part="stage"]:not([data-pinned])')
  const set = (patch: Partial<Scope>) => {
    scope.value = { ...scope.value, ...patch }
    try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })) } catch {}
    for (const stage of all()) apply(stage, patch)
  }
  const click = (e: Event) => {
    const button = (e.target as Element).closest?.<HTMLElement>('[data-act^="stage-"]')
    const frame = button?.closest<HTMLElement>('[data-site="frame"]')
    if (!button || !frame) return
    const stage = frame.querySelector<HTMLElement>('[data-part="stage"]')!
    const act = button.getAttribute('data-act')
    if (act === 'stage-expression') apply(stage, { expression: next(EXPRESSIONS, stage.getAttribute('data-expression') ?? scope.value.expression) })
    if (act === 'stage-theme') apply(stage, { theme: next(THEMES, stage.getAttribute('data-theme') ?? 'page') })
    if (act === 'stage-width') apply(stage, { width: next(WIDTHS, stage.getAttribute('data-width') ?? 'full') })
    if (act === 'stage-replay') frame.querySelector('[data-part="mount"]')?.dispatchEvent(new Event('stage:replay'))
    if (act === 'stage-code') {
      const open = frame.toggleAttribute('data-open')
      button.textContent = open ? 'Hide code' : 'Show code'
    }
  }
  onMount(() => {
    const saved = read()
    const root = document.documentElement.getAttribute('data-expression') ?? 'vivid'
    scope.value = { expression: saved.expression ?? root, theme: saved.theme ?? 'page', width: saved.width ?? 'full' }
    for (const stage of all()) apply(stage, saved)
    on(document, 'click', click)
  })
  return (
    <div data-site="stage-bar" role="group" aria-label="Show every example as">
      <Segmented size="sm" label="Expression" value={scope.value.expression} options={EXPRESSION_OPTIONS} onChange={(v: string) => set({ expression: v })} />
      <Segmented size="sm" label="Theme" value={scope.value.theme} options={THEME_OPTIONS} onChange={(v: string) => set({ theme: v })} />
      <Segmented size="sm" label="Width" value={scope.value.width} options={WIDTH_OPTIONS} onChange={(v: string) => set({ width: v })} />
    </div>
  )
}
