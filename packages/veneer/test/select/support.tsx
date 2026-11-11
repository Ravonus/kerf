import { flush, render } from '@kerf/core/test'

export const tick = async () => {
  await new Promise((r) => {
    setTimeout(r)
  })
  await flush()
}

export const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
  )

export const fruit = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Bean', disabled: true },
  { value: 'c', label: 'Corn' },
  { value: 'd', label: 'Cress' },
]

export const parts = (c: Element) => ({
  trigger: c.querySelector<HTMLButtonElement>('[role="combobox"]')!,
  carrier: c.querySelector<HTMLSelectElement>('select')!,
  value: c.querySelector('[data-part="value"]')!,
})

export const list = (c: Element) => c.querySelector('[role="listbox"]')!

export const active = (t: Element) =>
  document.getElementById(t.getAttribute('aria-activedescendant') ?? '')?.textContent

export async function mount(ui: () => unknown) {
  const { container: c } = render(ui)
  document.body.append(c)
  await tick()
  return { c, ...parts(c) }
}
