import { fireEvent } from '@testing-library/dom'
import { flush } from '@kerf/core/test'

export const NOW = '2026-10-28T14:02:00Z'

export const tick = async () => {
  await flush()
  await new Promise((r) => {
    setTimeout(r)
  })
  await flush()
}

export const byText = (root: ParentNode, t: string) =>
  [...root.querySelectorAll<HTMLElement>('button, a')].find(
    (b) =>
      (b.querySelector('[data-part="sweep-label"]') ?? b).textContent?.trim() === t ||
      b.getAttribute('aria-label') === t,
  )!

export const dialog = () => document.querySelector<HTMLDialogElement>('dialog[open]')!

export const toasts = () =>
  [...document.querySelectorAll('[data-scope="toast"][data-part="root"]')].map(
    (t) => t.querySelector('[data-part="title"]')!.textContent,
  )

export const type = (el: HTMLInputElement, v: string) => {
  el.value = v
  fireEvent.input(el)
}

export const field = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('[data-scope="field"]')]
    .find((f) => f.querySelector('[data-part="label-text"]')?.textContent === label)!
    .querySelector<HTMLInputElement>('input, select')!

export const pick = (trigger: HTMLElement, label: string) => {
  trigger.click()
  ;[...trigger.parentElement!.querySelectorAll<HTMLElement>('[role="option"]')]
    .find((o) => o.textContent.startsWith(label))!
    .click()
}
