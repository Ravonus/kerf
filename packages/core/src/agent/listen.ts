import type { Step, Query } from './types'

// What people (or an agent's own browser tool) do on the page, as steps. Typing coalesces into one `fill`.
export function listen(
  recording: { on: boolean; steps: Step[] },
  isQuiet: () => boolean,
  log: (step: Step) => void,
  describeFor: (el: Element) => Query,
) {
  const target = (e: Event) =>
    e.target instanceof Element && !e.target.closest('[data-weft-devtools]') ? e.target : null
  addEventListener(
    'click',
    (e) => {
      const el = target(e)
      if (isQuiet() || !el || !recording.on) return
      const control = el.closest('button, a, input, select, textarea, [role], label, summary') ?? el
      if (
        control instanceof HTMLInputElement &&
        !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(control.type)
      )
        return
      if (control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) return
      log({ kind: 'act', target: describeFor(control), action: 'click' })
    },
    true,
  )
  addEventListener(
    'input',
    (e) => {
      const el = target(e)
      if (
        isQuiet() ||
        !el ||
        !recording.on ||
        !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ||
        ['checkbox', 'radio'].includes((el as HTMLInputElement).type)
      )
        return
      const q = describeFor(el)
      const prev = recording.steps.at(-1)
      if (
        prev?.kind === 'act' &&
        prev.action === 'fill' &&
        JSON.stringify(prev.target) === JSON.stringify(q)
      )
        prev.value = el.value
      else log({ kind: 'act', target: q, action: 'fill', value: el.value })
    },
    true,
  )
  addEventListener(
    'change',
    (e) => {
      const el = target(e)
      if (isQuiet() || !el || !recording.on || !(el instanceof HTMLSelectElement)) return
      log({ kind: 'act', target: describeFor(el), action: 'select', value: el.value })
    },
    true,
  )
  addEventListener(
    'keydown',
    (e) => {
      const el = target(e)
      if (
        isQuiet() ||
        !el ||
        !recording.on ||
        !['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.key)
      )
        return
      log({ kind: 'act', target: describeFor(el), action: 'press', value: `{${e.key}}` })
    },
    true,
  )
}
