import { fireEvent } from '@testing-library/dom'
import { flush } from '@kerf/core/test'

export const button = (c: ParentNode, name: string | RegExp) =>
  [...c.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    typeof name === 'string'
      ? (b.getAttribute('aria-label') ?? b.textContent) === name ||
        b.querySelector('[data-part="sweep-label"]')?.textContent === name
      : name.test(b.textContent),
  )!
export const said = () =>
  [...document.querySelectorAll('[data-scope="announcer"]')]
    .map((a) => a.textContent)
    .filter(Boolean)
    .join(' | ')
export const type = (i: HTMLInputElement, v: string) => {
  i.value = v
  fireEvent.input(i)
}
export const named = (c: ParentNode, n: string) =>
  c.querySelector<HTMLInputElement>(`input[name="${n}"]`)!
export const tick = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms)
  await flush()
}
