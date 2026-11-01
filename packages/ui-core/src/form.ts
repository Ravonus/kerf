// A form's reset, for state the browser's reset can't reach: one document listener, whatever the number of fields, so a
// field needs no form yet when it mounts and a form can be swapped around it.
type Entry = { el: Element; fn: () => void }

const entries = new WeakMap<Document, Set<Entry>>()

/**
 * Call `fn` after the form holding `el` resets: after the native reset (a macrotask later, since the event fires before
 * it), and not at all if a handler cancelled it. An action, for `use`; the option is `fn`.
 */
export function formReset(el: Element, fn: () => void) {
  const doc = el.ownerDocument
  let set = entries.get(doc)
  if (!set) {
    entries.set(doc, (set = new Set()))
    const all = set
    doc.addEventListener('reset', e => {
      const form = e.target as Element
      setTimeout(() => { if (!e.defaultPrevented) for (const x of [...all]) if (form.contains(x.el)) x.fn() })
    }, true)
  }
  const entry = { el, fn }
  set.add(entry)
  return { update(next: () => void) { entry.fn = next }, destroy() { set!.delete(entry) } }
}

/**
 * An `invalid` on a composite's hidden required input: the field draws the message itself, so no bubble, and the first
 * invalid control of the form takes focus on the field's first real control. Returns the browser's message.
 */
export function reportMissing(e: Event) {
  e.preventDefault()
  const input = e.target as HTMLInputElement
  if (input.form?.querySelector(':invalid') === input) input.closest('[data-part="body"]')?.querySelector<HTMLElement>('[tabindex="0"], button:not(:disabled)')?.focus()
  return input.validationMessage
}
