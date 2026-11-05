export const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
  )

export const out = (c: Element) => c.querySelector('[data-out]')!.textContent

export const type = (el: HTMLInputElement | HTMLTextAreaElement, v: string, caret = v.length) => {
  el.value = v
  el.setSelectionRange(caret, caret)
  el.dispatchEvent(new InputEvent('input', { bubbles: true }))
}
