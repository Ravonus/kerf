import { fireEvent } from '@testing-library/dom'

export const said = (c: Element, urgent = false) =>
  document.querySelector(`[data-scope="announcer"][aria-live="${urgent ? 'assertive' : 'polite'}"]`)
    ?.textContent ?? c.textContent

export const button = (c: Element, name: string) =>
  [...c.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent)?.trim() === name,
  ) as HTMLButtonElement

export const key = (el: Element, k: string, o: object = {}) =>
  fireEvent.keyDown(el, { key: k, ...o })

export const type = (el: HTMLTextAreaElement, v: string) => {
  el.value = v
  el.setSelectionRange(v.length, v.length)
  fireEvent.input(el)
}
